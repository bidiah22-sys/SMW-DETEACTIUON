import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    delay,
    fetchLatestBaileysVersion,
    Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import express from 'express';

const BRAND = '𝗠𝗔𝗥𝗞 𝗦𝗜𝗥';
const DEFAULT_NUMBER = '917488917344';
const BOT_NUMBER = '+9647882064284';
const PING_MINUTES = 5;
const PREFIX = '!';

const app = express();
app.use(express.json());

function normalizeStrictPhone(rawInput) {
    if (!rawInput) return '';
    const digits = String(rawInput).replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return digits;
}

const PRIMARY_NUMBER = normalizeStrictPhone(BOT_NUMBER) || DEFAULT_NUMBER;
const PRIMARY_OWNER_JID = `${PRIMARY_NUMBER}@s.whatsapp.net`;

const PATH_USERS = './store/users.json';
const PATH_BOTS = './store/bots.json';

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function removeDirSafe(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } catch {}
}

function readJson(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch {}
    return { ...fallback };
}

function writeJson(filePath, data) {
    try {
        ensureDir('./store');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {}
}

ensureDir('./store');
ensureDir('./sessions');

let userData = readJson(PATH_USERS, { owners: [PRIMARY_OWNER_JID] });
if (!Array.isArray(userData.owners)) userData.owners = [PRIMARY_OWNER_JID];
if (!userData.owners.includes(PRIMARY_OWNER_JID)) {
    userData.owners.push(PRIMARY_OWNER_JID);
    writeJson(PATH_USERS, userData);
}

function isAuthorizedOwner(jid, fromMe = false) {
    if (fromMe) return true;
    if (!jid) return false;
    const cleanNum = jid.split('@')[0].split(':')[0];
    return userData.owners.some((o) => o.split('@')[0].split(':')[0] === cleanNum);
}

class PairingSession {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false) {
        this.id = id;
        this.phone = normalizeStrictPhone(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.authDir = `./sessions/mark_sir_${this.id}_${this.phone}`;
        this.sock = null;
        this.online = false;
        this.codeRequested = false;
        this.pairInFlight = false;
        this.stopped = false;
        this.seenMsgIds = new Map();
    }

    async cleanup() {
        this.stopped = true;
        this.online = false;
        try {
            if (this.sock?.ws?.close) this.sock.ws.close();
            if (this.sock?.end) this.sock.end(undefined);
        } catch {}
        removeDirSafe(this.authDir);
    }

    isDuplicate(msgId) {
        if (!msgId) return false;
        const now = Date.now();
        for (const [k, ts] of this.seenMsgIds.entries()) {
            if (now - ts > 90000) this.seenMsgIds.delete(k);
        }
        if (this.seenMsgIds.has(msgId)) return true;
        this.seenMsgIds.set(msgId, now);
        return false;
    }

    async triggerPairingCode(sock) {
        if (!sock || this.stopped || this.online || this.codeRequested || this.pairInFlight) return;
        if (sock.authState?.creds?.registered) {
            this.codeRequested = true;
            return;
        }

        this.pairInFlight = true;
        try {
            await delay(1500);
            const rawCode = await sock.requestPairingCode(this.phone);
            const cleanCode = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (!cleanCode) throw new Error('Empty pairing code');

            this.codeRequested = true;
            const formattedCode = cleanCode.match(/.{1,4}/g)?.join('-') || cleanCode;

            console.log(`\n╔══════════════════════════════════════════╗`);
            console.log(`║  ${BRAND} PAIRING CODE [${this.id}]          ║`);
            console.log(`║  Number : +${this.phone}                 ║`);
            console.log(`║  Code   : ${formattedCode}               ║`);
            console.log(`╚══════════════════════════════════════════╝\n`);

            const msgText =
                `👑 *${BRAND} PAIRING CODE*\n\n` +
                `📱 Number : *+${this.phone}*\n` +
                `🔑 Code   : *${formattedCode}*\n\n` +
                `फ़ोन में: *WhatsApp > Linked Devices > Link a Device > Link with phone number instead*`;

            await this.hub.sendCodeToRequester(msgText, this.requesterJid);
        } catch (err) {
            this.codeRequested = false;
            console.error(`[${this.id}] Pairing error (+${this.phone}):`, err.message);
            const errText =
                `❌ *${BRAND}* Pairing failed for *+${this.phone}*\n` +
                `Reason: ${err.message}\n` +
                `Try: *${PREFIX}relink ${this.phone}*`;
            await this.hub.sendCodeToRequester(errText, this.requesterJid);
        } finally {
            this.pairInFlight = false;
        }
    }

    async start() {
        if (!this.phone) {
            console.log(`[${this.id}] Invalid phone number.`);
            return;
        }

        if (this.freshAuth) {
            removeDirSafe(this.authDir);
            this.freshAuth = false;
        }
        ensureDir(this.authDir);

        const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            auth: state,
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: false
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;

            if ((qr || connection === 'connecting') && !state.creds.registered && !this.codeRequested) {
                await this.triggerPairingCode(this.sock);
            }

            if (connection === 'open') {
                this.online = true;
                this.codeRequested = true;
                console.log(`✅ [${this.id}] ${BRAND} Connected: +${this.phone}`);
            } else if (connection === 'close') {
                this.online = false;
                if (this.stopped) return;

                const statusCode = lastDisconnect?.error instanceof Boom
                    ? lastDisconnect.error.output.statusCode
                    : 500;

                if (statusCode === DisconnectReason.loggedOut) {
                    removeDirSafe(this.authDir);
                    this.codeRequested = false;
                    return;
                }

                await delay(5000);
                if (!this.stopped) this.start();
            }
        });

        this.sock.ev.on('messages.upsert', (m) => this.onMessages(m));
    }

    async onMessages({ messages, type }) {
        try {
            if (type !== 'notify') return;
            const raw = messages?.[0];
            if (!raw?.message) return;
            if (this.isDuplicate(raw.key.id)) return;

            const chat = raw.key.remoteJid;
            const sender = raw.key.participant || chat;
            if (!isAuthorizedOwner(sender, raw.key.fromMe)) return;

            const text = (
                raw.message.conversation ||
                raw.message.extendedTextMessage?.text ||
                raw.message.imageMessage?.caption ||
                ''
            ).trim();
            const lower = text.toLowerCase();

            if (lower.startsWith(`${PREFIX}addbot `) || lower.startsWith('+pair ')) {
                const rawNum = text.slice(lower.startsWith(`${PREFIX}addbot `) ? PREFIX.length + 7 : 6).trim();
                const cleanNum = normalizeStrictPhone(rawNum);
                if (!cleanNum) {
                    await this.sendText(chat, `❌ सही नंबर डालें (country code + number, बिना + के)।\nउदाहरण: *${PREFIX}addbot 9647882064284* या *+pair 917488917344*`);
                    return;
                }
                const reply = await this.hub.addSession(cleanNum, sender, false);
                await this.sendText(chat, reply);
                return;
            }

            if (lower.startsWith(`${PREFIX}relink `) || lower.startsWith('+relink ')) {
                const rawNum = text.slice(lower.startsWith(`${PREFIX}relink `) ? PREFIX.length + 8 : 8).trim();
                const cleanNum = normalizeStrictPhone(rawNum);
                if (!cleanNum) {
                    await this.sendText(chat, `❌ सही नंबर डालें। उदाहरण: *${PREFIX}relink 9647882064284*`);
                    return;
                }
                const reply = await this.hub.addSession(cleanNum, sender, true);
                await this.sendText(chat, reply);
                return;
            }

            if (lower === `${PREFIX}bots` || lower === '+bots') {
                const active = [...this.hub.sessions.values()].filter((s) => !s.stopped);
                if (!active.length) {
                    await this.sendText(chat, `👑 *${BRAND}* — कोई सेशन नहीं मिला।`);
                    return;
                }
                const list = active.map((s, i) => `${i + 1}. +${s.phone} — ${s.online ? '🟢 Online' : '⏳ Pairing/Waiting'}`);
                await this.sendText(chat, `👑 *${BRAND} SESSIONS*\n\n${list.join('\n')}`);
                return;
            }

            if (lower === `${PREFIX}menu` || lower === '+menu') {
                await this.sendText(
                    chat,
                    `👑 *${BRAND} PAIRING MANAGER*\n\n` +
                    `• *${PREFIX}addbot <number>* / *+pair <number>* — नया नंबर जोड़ें और कोड पाएं\n` +
                    `• *${PREFIX}relink <number>* — पुराना auth साफ़ करके नया कोड पाएं\n` +
                    `• *${PREFIX}bots* — सभी नंबरों की स्थिति देखें`
                );
            }
        } catch (err) {
            console.error(`[${this.id}] Message handler error:`, err.message);
        }
    }

    async sendText(jid, text) {
        if (!this.sock || !this.online) return;
        try {
            await this.sock.sendMessage(jid, { text });
        } catch {}
    }
}

class SessionHub {
    constructor() {
        this.sessions = new Map();
        this.counter = 1;
    }

    getSenderSocket() {
        const primaryOnline = [...this.sessions.values()].find(
            (s) => s.phone === PRIMARY_NUMBER && s.online && !s.stopped
        );
        if (primaryOnline) return primaryOnline;
        return [...this.sessions.values()].find((s) => s.online && !s.stopped) || null;
    }

    async sendCodeToRequester(msgText, requesterJid = null) {
        const sender = this.getSenderSocket();
        if (!sender) {
            console.log('[HUB] No online bot available yet to send WhatsApp code message.');
            return;
        }

        if (requesterJid) {
            await sender.sendText(requesterJid, msgText);
        }
        if (PRIMARY_OWNER_JID && requesterJid !== PRIMARY_OWNER_JID) {
            await sender.sendText(PRIMARY_OWNER_JID, msgText);
        }
    }

    loadSavedNumbers() {
        const saved = readJson(PATH_BOTS, { numbers: [] });
        const list = Array.isArray(saved.numbers) ? saved.numbers.map(normalizeStrictPhone).filter(Boolean) : [];
        if (!list.includes(PRIMARY_NUMBER)) {
            list.unshift(PRIMARY_NUMBER);
        }
        return [...new Set(list)];
    }

    saveNumbers() {
        const nums = [...this.sessions.values()].filter((s) => !s.stopped && s.phone).map((s) => s.phone);
        writeJson(PATH_BOTS, { numbers: [...new Set(nums)] });
    }

    async addSession(phone, requesterJid = null, freshAuth = false) {
        const clean = normalizeStrictPhone(phone);
        if (!clean) return '❌ Invalid phone number.';

        const existing = [...this.sessions.entries()].filter(([, s]) => s.phone === clean && !s.stopped);
        if (existing.length > 0 && !freshAuth) {
            return `⚠️ *+${clean}* पहले से मौजूद है। नया कोड लेने के लिए *${PREFIX}relink ${clean}* भेजें।`;
        }

        for (const [key, oldSess] of existing) {
            await oldSess.cleanup();
            this.sessions.delete(key);
        }

        const id = String(this.counter++);
        const session = new PairingSession(id, clean, this, requesterJid, freshAuth);
        this.sessions.set(id, session);
        this.saveNumbers();

        await session.start();
        return `👑 *${BRAND}* — *+${clean}* के लिए पेयरिंग शुरू कर दी गई है। कोड सीधे आपको भेजा जाएगा।`;
    }

    async boot() {
        const numbers = this.loadSavedNumbers();
        for (const num of numbers) {
            const id = String(this.counter++);
            const session = new PairingSession(id, num, this, PRIMARY_OWNER_JID, false);
            this.sessions.set(id, session);
            await session.start();
            await delay(1500);
        }
    }
}

const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.status(200).send(`${BRAND} RUNNING (+${PRIMARY_NUMBER})`));
app.get('/health', (_req, res) => res.status(200).send('OK'));

function startKeepAlive() {
    const baseUrl = process.env.RENDER_EXTERNAL_URL
        ? process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')
        : `http://127.0.0.1:${PORT}`;
    const pingUrl = `${baseUrl}/health`;

    setInterval(async () => {
        try {
            const res = await fetch(pingUrl);
            console.log(`[${BRAND} PING] ${pingUrl} -> ${res.status}`);
        } catch (err) {
            console.log(`[${BRAND} PING] Failed:`, err.message);
        }
    }, PING_MINUTES * 60 * 1000);
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n👑 ${BRAND} SERVER STARTED ON PORT ${PORT} | PRIMARY: +${PRIMARY_NUMBER}\n`);
    startKeepAlive();
    const hub = new SessionHub();
    await hub.boot();
});
