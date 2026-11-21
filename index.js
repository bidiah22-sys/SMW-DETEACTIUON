// ╔══════════════════════════════════════════════╗
// ║                  𝗦𝗠𝗪 𝗜𝗢𝗦                     ║
// ║         Multi-Bot WhatsApp Manager           ║
// ╚══════════════════════════════════════════════╝

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
import { GoogleGenerativeAI } from '@google/generative-ai';
import express from 'express';

// =========================================================================
// SET YOUR NUMBER HERE (WITH OR WITHOUT '+', e.g. "919876543210" or "+12025550199")
// =========================================================================
const BOT_NUMBER = "+9647882064284";

// RENDER KEEP-ALIVE INTERVAL IN MINUTES
const PING_MINUTES = 5;

// USER-CONTROLLED LOOP TIMING LIMITS (IN MILLISECONDS)
const MIN_SAFE_DELAY_MS = 1200;
const DEFAULT_LOOP_MS   = 2500;

// AUTO-READ, REACT & FAST SMART/FUN AUTO-REPLY SETTINGS
const AUTO_READ_MESSAGES     = true;
const AUTO_REACT_EMOJI       = "⚡";
const AUTO_FUN_REPLY_ENABLED = true;
const FUN_REPLY_COOLDOWN_MS  = 15000;
// =========================================================================

function normalizePhoneNumber(rawInput) {
    if (!rawInput) return '';
    const digits = String(rawInput).replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return digits;
}

const CONFIGURED_BOT_NUMBER = normalizePhoneNumber(BOT_NUMBER);
const PRIMARY_OWNER_JID = CONFIGURED_BOT_NUMBER ? `${CONFIGURED_BOT_NUMBER}@s.whatsapp.net` : null;
const ADMIN_NUMBERS = CONFIGURED_BOT_NUMBER ? [PRIMARY_OWNER_JID] : [];

// ─────────────────────────────────────────────
//  STORAGE PATHS & CONFIG
// ─────────────────────────────────────────────
const PATH_AUTH   = (id) => `./sessions/smw_session_${id}`;
const PATH_USERS  = './store/users.json';
const PATH_TIMING = './store/timing.json';
const PATH_PREFIX = './store/prefix.json';
const PATH_BOTS   = './store/bots.json';

try {
    fs.mkdirSync('./store', { recursive: true });
    if (!fs.existsSync('./store/cookies.txt')) {
        const b64 = "IyBOZXRzY2FwZSmvQ29va2llIEZpbGUh";
        fs.writeFileSync('./store/cookies.txt', Buffer.from(b64, 'base64').toString('utf8'));
    }
} catch {}

// ─────────────────────────────────────────────
//  GEMINI AI CONFIG & SMART FUN/INTRO ENGINE
// ─────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyBd3S8mbO_EYpERC_LMfkxMzTs0LLVZoeg";
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

const FALLBACK_FUN_REPLIES = [
    "System online and sharp. Tell me what we are building or teasing next.",
    "Intro asked, mode locked in. Ask anything and let's roll.",
    "Fast engine active—keep it sharp or bring the jokes.",
    "Message received loud and clear. What's the next move?"
];

async function generateSmartReply(userText) {
    try {
        const prompt =
            `You are SMW IOS, a fast, witty, confident automated assistant. ` +
            `Reply quickly in 1-2 crisp lines matching the user's tone with subtle humor. ` +
            `If asked for an intro or identity, give a clean, sharp, memorable intro as SMW IOS. ` +
            `User message: "${userText}"`;
        const res = await geminiModel.generateContent(prompt);
        const text = res?.response?.text()?.trim();
        if (text) return text.slice(0, 400);
    } catch {}
    return FALLBACK_FUN_REPLIES[Math.floor(Math.random() * FALLBACK_FUN_REPLIES.length)];
}

// ─────────────────────────────────────────────
//  EXPRESS SERVER + 5-MINUTE KEEP-ALIVE
// ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'SMW IOS Manager',
        pingMinutes: PING_MINUTES,
        uptimeSec: Math.floor(process.uptime())
    });
});

app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`[SERVER] Listening on port ${PORT}`);

    const intervalMs = PING_MINUTES * 60 * 1000;
    const pingUrl = process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/health`
        : `http://127.0.0.1:${PORT}/health`;

    console.log(`[KEEP-ALIVE] Pinging every ${PING_MINUTES} minutes -> ${pingUrl}`);

    setInterval(async () => {
        try {
            const resp = await fetch(pingUrl);
            console.log(`[KEEP-ALIVE] Status ${resp.status} at ${new Date().toISOString()}`);
        } catch (err) {
            console.log(`[KEEP-ALIVE] Retry failed: ${err.message}`);
        }
    }, intervalMs);
});

// ─────────────────────────────────────────────
//  EMOJI BANKS
// ─────────────────────────────────────────────
const SETS = {
    faces:   ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    hearts:  ['🖤','❤️','🤍','🤎','🩷','🧡','💛','💚','💙','💜','🩵','🖤','❤️','🤍','🤎'],
    hands:   ['🔥','🚩','⚡','👑','💀','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    flowers: ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    sky:     ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    animals: ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    fruits:  ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
};

// ─────────────────────────────────────────────
//  FONT CONVERTER
// ─────────────────────────────────────────────
const GLYPH = {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',
    m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
    A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',
    M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭'
};
const g = str => String(str).split('').map(c => GLYPH[c] ?? c).join('');

const ITALIC_GLYPH = {
    a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻'
};
const iFnt = str => String(str).split('').map(c => ITALIC_GLYPH[c] ?? c).join('');

// ─────────────────────────────────────────────
//  PERSISTENCE HELPERS
// ─────────────────────────────────────────────
const ensureDir = p => {
    const d = p.includes('/') ? p.substring(0, p.lastIndexOf('/')) : '.';
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
};
const readJson = (p, def) => {
    try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return { ...def };
};
const writeJson = (p, d) => {
    try {
        ensureDir(p);
        fs.writeFileSync(p, JSON.stringify(d, null, 2));
    } catch {}
};

let userData   = readJson(PATH_USERS, { owners: [], subs: {} });
let timingMap  = readJson(PATH_TIMING, {
    anc1: DEFAULT_LOOP_MS, anc2: DEFAULT_LOOP_MS, anc3: DEFAULT_LOOP_MS,
    anc4: DEFAULT_LOOP_MS, anc5: DEFAULT_LOOP_MS, anc6: DEFAULT_LOOP_MS, anc7: DEFAULT_LOOP_MS
});
let prefixData = readJson(PATH_PREFIX, { prefix: '!' });
let PREFIX     = prefixData.prefix || '!';

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    return Math.max(MIN_SAFE_DELAY_MS, parsed);
}

// ─────────────────────────────────────────────
//  MENUS
// ─────────────────────────────────────────────
const MENU_TEXT = () => `
  ┌─────────────────────────────────────────┐
  │  🎀  𝗦𝗠𝗪  𝗜𝗢𝗦  𝗠𝗔𝗡𝗔𝗚𝗘𝗥  v10  🚩      │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix    : ${PREFIX}                      │
  │  ⏱️ KeepAlive : ${PING_MINUTES}m (Min ${MIN_SAFE_DELAY_MS}ms)  │
  └─────────────────────────────────────────┘

  📂  *${g('CORE COMMAND MENUS')}*

  > 🎯  ${PREFIX}targetmenu
         ↳ ${g('custom speed name change and text loops')}

  > 🤖  ${PREFIX}ai [question]
         ↳ ${g('fast gemini ai assistant')}

  > 📱  ${PREFIX}addbot [number] | ${PREFIX}bots
         ↳ ${g('link any country number with isolated session')}

  > 👥  ${PREFIX}grpmenu
         ↳ ${g('group moderation commands')}

  > 🎮  ${PREFIX}games
         ↳ ${g('utility commands')}

  ┌─────────────────────────────────────────┐
  │  ⚙️  *${g('SYSTEM CONTROLS')}*              │
  ├─────────────────────────────────────────┤
  │  👑  ${PREFIX}admin    ➔ ${g('Claim Owner')}    │
  │  🛑  ${PREFIX}killall  ➔ ${g('Stop All Loops')} │
  └─────────────────────────────────────────┘`;

const TARGET_MENU = () => `
  ┌─────────────────────────────────────────┐
  │  🎯  𝗧𝗔𝗥𝗚𝗘𝗧  𝗖𝗢𝗡𝗧𝗥𝗢𝗟  𝗖𝗘𝗡𝗧𝗘𝗥  🔥  │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix     : ${PREFIX}                      │
  │  🛡️ Safe Floor : ${MIN_SAFE_DELAY_MS}ms           │
  └─────────────────────────────────────────┘

  🔥  *${g('NAME CHANGE LOOPS')}*
  • ${PREFIX}anc1-7 [text] [ms]  • ${PREFIX}ancstop

  💣  *${g('TEXT LOOPS')}*
  • ${PREFIX}txt [text] [ms]     • ${PREFIX}stoptxt

  ⚡  *${g('STOP ALL')}*
  • ${PREFIX}killall  ➔ ${g('Terminate every running loop immediately')}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const GRP_MENU = () => `
  ┌─────────────────────────────────────────┐
  │  👥  𝗚𝗥𝗢𝗨𝗣  𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧  🛡️  │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix : ${PREFIX}                      │
  └─────────────────────────────────────────┘

  🛡️  *${g('MODERATION')}*
  • ${PREFIX}lockgc        • ${PREFIX}unlockgc
  • ${PREFIX}mute @user    • ${PREFIX}unmute @user
  • ${PREFIX}promote @user • ${PREFIX}demote @user
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const GAMES_MENU = () => `
  ┌─────────────────────────────────────────┐
  │  🎮  𝗚𝗔𝗠𝗘𝗦  &  𝗨𝗧𝗜𝗟𝗜𝗧𝗜𝗘𝗦  🎲  │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix : ${PREFIX}                      │
  └─────────────────────────────────────────┘

  🎮  *${g('UTILITIES')}*
  • ${PREFIX}flip  • ${PREFIX}roll  • ${PREFIX}rps
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const TAG = `🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 🚩`;
const win = what => `
  ┌─────────────────────────┐
  │  ✨ ACTIVE              │
  └─────────────────────────┘
  ▶ ${g(what)} ${g('started.')}
  💗 *${TAG}*`;

const saveUsers = () => writeJson(PATH_USERS, userData);

const isOwner = j => {
    if (!j) return false;
    const cleanJid = j.split('@')[0].split(':')[0];
    return userData.owners.includes(j) ||
           ADMIN_NUMBERS.some(num => num && num.includes(cleanJid));
};

const isSub = (j, grp) => userData.subs[grp]?.includes(j) || false;
const grantOwner = j => {
    if (!userData.owners.includes(j)) {
        userData.owners.push(j);
        saveUsers();
        return true;
    }
    return false;
};

const SET_KEYS = {
    anc1: 'faces', anc2: 'hearts', anc3: 'hands', anc4: 'flowers',
    anc5: 'sky', anc6: 'animals', anc7: 'fruits'
};

// ═════════════════════════════════════════════
//  SESSION MANAGER (FULLY ISOLATED PER NUMBER)
// ═════════════════════════════════════════════
class Session {
    constructor(id, phone, hub, requesterJid = null) {
        this.id = id;
        this.phone = normalizePhoneNumber(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.socket = null;
        this.online = false;
        this.self = null;
        this.codeRequested = false;
        this.stopped = false;
        this.autoReplyPaused = false;

        // Strictly isolated per session so conversations, loops & cooldowns never mix
        this.processedMsgs = new Map();
        this.nameLoops = new Map();
        this.txtLoop = new Map();
        this.lastFunReplyAt = new Map();

        setInterval(() => {
            const now = Date.now();
            for (const [k, v] of this.processedMsgs) {
                if (now - v > 90000) this.processedMsgs.delete(k);
            }
        }, 90000);
    }

    dedupeLocal(msgId) {
        if (!msgId) return true;
        if (this.processedMsgs.has(msgId)) return false;
        this.processedMsgs.set(msgId, Date.now());
        return true;
    }

    stopAllLoopsForChat(chat) {
        this.autoReplyPaused = true;
        const prefix = `${chat}__nc_`;
        for (const [key, entry] of this.nameLoops.entries()) {
            if (key.startsWith(prefix)) {
                entry.active = false;
                entry.epoch += 1;
                this.nameLoops.delete(key);
            }
        }
        const txtKey = `${chat}__txt`;
        if (this.txtLoop.has(txtKey)) {
            const entry = this.txtLoop.get(txtKey);
            entry.active = false;
            entry.epoch += 1;
            this.txtLoop.delete(txtKey);
        }
    }

    async init() {
        try {
            if (!this.phone) {
                console.log(`[${this.id}] BOT_NUMBER is empty. Set BOT_NUMBER at the top or use !addbot <number>.`);
                return;
            }

            const authDir = PATH_AUTH(`${this.id}_${this.phone}`);
            ensureDir(authDir);

            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();

            this.socket = makeWASocket({
                auth: state,
                version,
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu("Chrome")
            });

            if (!this.socket.authState.creds.registered && !this.codeRequested) {
                this.codeRequested = true;
                setTimeout(async () => {
                    if (this.stopped || this.online) return;
                    try {
                        const rawCode = await this.socket.requestPairingCode(this.phone);
                        const formatted = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
                        console.log(`\n========================================`);
                        console.log(`PAIRING CODE [${this.id}] (+${this.phone}): ${formatted}`);
                        console.log(`========================================\n`);

                        const codeMsg = `${TAG}\n\nPairing Code for +${this.phone}: *${formatted}*`;

                        // Always deliver pairing code to the primary/configured owner number's WhatsApp
                        await this.hub.deliverPairingCodeToOwner(codeMsg, this.requesterJid);
                    } catch (e) {
                        this.codeRequested = false;
                        console.log(`[${this.id}] Pairing code error:`, e.message);
                    }
                }, 4000);
            }

            this.socket.ev.on("creds.update", saveCreds);

            this.socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
                if (connection === "open") {
                    this.online = true;
                    this.codeRequested = true;
                    this.self = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    console.log(`[${this.id}] Connected: +${this.phone}`);
                } else if (connection === "close") {
                    this.online = false;
                    if (this.stopped) return;
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (shouldReconnect) {
                        setTimeout(() => {
                            if (!this.stopped) this.init();
                        }, 5000);
                    }
                }
            });

            this.socket.ev.on('messages.upsert', m => this.receive(m));
        } catch (e) {
            console.error(`[${this.id}] Init error:`, e.message);
        }
    }

    async receive({ messages, type }) {
        try {
            if (type !== 'notify') return;
            const raw = messages[0];
            if (!raw?.message) return;

            const chat = raw.key.remoteJid;
            const isGroup = chat.endsWith('@g.us');
            const sender = raw.key.participant || chat;

            // Strictly handle messages on THIS session only (isolated per number)
            if (!this.dedupeLocal(raw.key.id)) return;

            if (AUTO_READ_MESSAGES && !raw.key.fromMe) {
                try {
                    await this.socket.readMessages([raw.key]);
                } catch {}
            }

            const body = (raw.message.conversation
                        || raw.message.extendedTextMessage?.text
                        || raw.message.imageMessage?.caption || '').trim();
            const cmd = body.toLowerCase();

            const isDM = !isGroup;
            const isOwn = isOwner(sender) || raw.key.fromMe;
            const allowed = isOwn || isSub(sender, chat);

            const isCommandText = body.startsWith(PREFIX) || body.startsWith('+');

            // Per-chat, per-session isolated auto-react & smart reply
            if (!raw.key.fromMe && body && !isCommandText && !this.autoReplyPaused) {
                try {
                    await this.socket.sendMessage(chat, { react: { text: AUTO_REACT_EMOJI, key: raw.key } });
                } catch {}

                const lastTs = this.lastFunReplyAt.get(chat) || 0;
                if (AUTO_FUN_REPLY_ENABLED && Date.now() - lastTs >= FUN_REPLY_COOLDOWN_MS) {
                    this.lastFunReplyAt.set(chat, Date.now());
                    const replyText = await generateSmartReply(body);
                    if (!this.autoReplyPaused) {
                        await this.send(chat, replyText);
                    }
                }
            }

            if (isDM && (cmd === `${PREFIX}admin` || cmd === '+admin')) {
                if (!userData.owners.length) {
                    grantOwner(sender);
                    await this.send(chat, `${TAG}\n\n👑 ${g('you are now the owner')}`);
                } else if (isOwn) {
                    await this.send(chat, `⚠️ ${g('you already own this bot')}`);
                }
                return;
            }

            if (!allowed) return;

            if (cmd.startsWith(`${PREFIX}addbot `) || cmd.startsWith('+pair ')) {
                const rawNum = body.slice(cmd.startsWith(`${PREFIX}addbot `) ? PREFIX.length + 7 : 6).trim();
                const cleanNum = normalizePhoneNumber(rawNum);
                if (!cleanNum) {
                    await this.send(chat, `❌ Provide a valid country code and phone number.`);
                    return;
                }
                const statusMsg = await this.hub.addNumber(cleanNum, chat);
                await this.send(chat, statusMsg);
                return;
            }

            if (cmd === `${PREFIX}bots` || cmd === '+bots') {
                const list = [...this.hub.sessions.values()];
                if (list.length === 0) {
                    await this.send(chat, `${TAG}\n\nNo numbers configured yet.`);
                    return;
                }
                const lines = list.map((s, idx) => `${idx + 1}. +${s.phone} — ${s.online ? 'Online' : 'Pending/Offline'}`);
                await this.send(chat, `${TAG}\n\nSessions (${list.length}):\n\n${lines.join('\n')}`);
                return;
            }

            if (cmd === `${PREFIX}menu` || cmd === '+menu') { await this.send(chat, MENU_TEXT()); return; }
            if (cmd === `${PREFIX}targetmenu`) { await this.send(chat, TARGET_MENU()); return; }
            if (cmd === `${PREFIX}grpmenu`) { await this.send(chat, GRP_MENU()); return; }
            if (cmd === `${PREFIX}games`) { await this.send(chat, GAMES_MENU()); return; }

            if (cmd === `${PREFIX}killall` || cmd === `${PREFIX}ancstop` || cmd === `${PREFIX}stoptxt` || cmd === '-all') {
                await this.handle('kill_all', { chat }, true);
                return;
            }

            if (cmd.startsWith('+ai ') || cmd.startsWith(`${PREFIX}ai `)) {
                const prompt = body.slice(4).trim();
                if (!prompt) {
                    await this.send(chat, `❌ Usage: +ai <question>`);
                    return;
                }
                try {
                    const result = await geminiModel.generateContent(prompt);
                    const reply = result.response.text();
                    await this.send(chat, reply);
                } catch (e) {
                    await this.send(chat, `❌ AI error: ${e.message}`);
                }
                return;
            }

            if (cmd.startsWith(`${PREFIX}txt `)) {
                this.autoReplyPaused = false;
                const parts = body.slice(PREFIX.length + 4).trim().split(/\s+/);
                const lastToken = parts[parts.length - 1];
                const maybeMs = Number(lastToken);
                let ms = DEFAULT_LOOP_MS;
                let txt = parts.join(' ');

                if (parts.length > 1 && Number.isFinite(maybeMs) && maybeMs > 0) {
                    ms = getSafeDelay(maybeMs);
                    parts.pop();
                    txt = parts.join(' ');
                }
                if (!txt) return;

                await this.handle('txt_start', { chat, txt, ms }, true);
                return;
            }

            for (const [key, setName] of Object.entries(SET_KEYS)) {
                if (cmd.startsWith(`${PREFIX}${key} `)) {
                    this.autoReplyPaused = false;
                    const rawArgs = body.slice(PREFIX.length + key.length + 1).trim();
                    if (!rawArgs || !isGroup) return;

                    const parts = rawArgs.split(/\s+/);
                    const lastToken = parts[parts.length - 1];
                    const maybeMs = Number(lastToken);
                    let ms = getSafeDelay(timingMap[key] || DEFAULT_LOOP_MS);
                    let txt = rawArgs;

                    if (parts.length > 1 && Number.isFinite(maybeMs) && maybeMs > 0) {
                        ms = getSafeDelay(maybeMs);
                        parts.pop();
                        txt = parts.join(' ');
                    }
                    if (!txt) return;

                    timingMap[key] = ms;
                    writeJson(PATH_TIMING, timingMap);

                    await this.handle('nc_start', { chat, txt: iFnt(txt), key, setName, ms }, true);
                    return;
                }
            }

        } catch {}
    }

    async handle(cmd, payload, notify = true) {
        const { chat } = payload;
        try {
            switch (cmd) {
                case 'nc_start': {
                    const { txt, key, setName, ms } = payload;
                    if (!chat.endsWith('@g.us')) return;
                    const emojis = SETS[setName] || SETS.faces;
                    const safeDelay = getSafeDelay(ms ?? timingMap[key] ?? DEFAULT_LOOP_MS);
                    const tid = `${chat}__nc_${key}`;

                    const prev = this.nameLoops.get(tid);
                    const nextEpoch = (prev?.epoch || 0) + 1;
                    if (prev) prev.active = false;

                    const stateObj = { active: true, epoch: nextEpoch };
                    this.nameLoops.set(tid, stateObj);

                    let idx = 0;
                    (async () => {
                        while (
                            stateObj.active &&
                            this.nameLoops.get(tid) === stateObj &&
                            stateObj.epoch === nextEpoch
                        ) {
                            if (!this.socket || !this.online) {
                                await delay(1500);
                                continue;
                            }
                            const emo = emojis[idx++ % emojis.length];
                            try {
                                await this.socket.groupUpdateSubject(chat, `${emo} ${txt} ${emo}`);
                            } catch {}

                            const step = 250;
                            let elapsed = 0;
                            while (elapsed < safeDelay) {
                                if (!stateObj.active || this.nameLoops.get(tid) !== stateObj) return;
                                await delay(Math.min(step, safeDelay - elapsed));
                                elapsed += step;
                            }
                        }
                    })();

                    if (notify) await this.send(chat, win(`${key} (${safeDelay}ms)`));
                    break;
                }
                case 'txt_start': {
                    const { txt, ms } = payload;
                    const safeDelay = getSafeDelay(ms ?? DEFAULT_LOOP_MS);
                    const txtKey = `${chat}__txt`;

                    const prev = this.txtLoop.get(txtKey);
                    const nextEpoch = (prev?.epoch || 0) + 1;
                    if (prev) prev.active = false;

                    const loopObj = { active: true, epoch: nextEpoch };
                    this.txtLoop.set(txtKey, loopObj);

                    (async () => {
                        while (
                            loopObj.active &&
                            this.txtLoop.get(txtKey) === loopObj &&
                            loopObj.epoch === nextEpoch
                        ) {
                            if (!this.socket || !this.online) {
                                await delay(1500);
                                continue;
                            }
                            try {
                                await this.socket.sendMessage(chat, { text: txt });
                            } catch {}

                            const step = 250;
                            let elapsed = 0;
                            while (elapsed < safeDelay) {
                                if (!loopObj.active || this.txtLoop.get(txtKey) !== loopObj) return;
                                await delay(Math.min(step, safeDelay - elapsed));
                                elapsed += step;
                            }
                        }
                    })();

                    if (notify) await this.send(chat, win(`text loop (${safeDelay}ms)`));
                    break;
                }
                case 'kill_all': {
                    this.stopAllLoopsForChat(chat);
                    if (notify) await this.send(chat, `${TAG}\n\n🛑 All active loops stopped.`);
                    break;
                }
            }
        } catch {}
    }

    async send(jid, text) {
        if (!this.socket || !this.online) return;
        try {
            await this.socket.sendMessage(jid, { text });
        } catch {}
    }
}

// ═════════════════════════════════════════════
//  HUB INITIALIZATION
// ═════════════════════════════════════════════
class Hub {
    constructor() {
        this.sessions = new Map();
        this.counter = 1;
    }

    getPrimarySession() {
        if (CONFIGURED_BOT_NUMBER) {
            const mainSess = [...this.sessions.values()].find(
                s => s.phone === CONFIGURED_BOT_NUMBER && s.online
            );
            if (mainSess) return mainSess;
        }
        return [...this.sessions.values()].find(s => s.online) || null;
    }

    async deliverPairingCodeToOwner(codeMsg, requesterJid = null) {
        const senderSession = this.getPrimarySession();
        if (!senderSession) return;

        // Send directly to the configured owner WhatsApp number (+9647882064284)
        if (PRIMARY_OWNER_JID) {
            await senderSession.send(PRIMARY_OWNER_JID, codeMsg);
        }

        // Also mirror to requester chat if command came from another chat
        if (requesterJid && requesterJid !== PRIMARY_OWNER_JID) {
            await senderSession.send(requesterJid, codeMsg);
        }
    }

    loadSavedNumbers() {
        const saved = readJson(PATH_BOTS, { numbers: [] });
        const list = Array.isArray(saved.numbers) ? saved.numbers : [];
        const cleanList = list.map(normalizePhoneNumber).filter(Boolean);
        if (CONFIGURED_BOT_NUMBER && !cleanList.includes(CONFIGURED_BOT_NUMBER)) {
            cleanList.unshift(CONFIGURED_BOT_NUMBER);
        }
        return [...new Set(cleanList)];
    }

    saveNumbers(numbers) {
        writeJson(PATH_BOTS, { numbers: [...new Set(numbers)] });
    }

    async addNumber(phone, requesterJid = null) {
        const clean = normalizePhoneNumber(phone);
        if (!clean) return `❌ Invalid number.`;

        const existing = [...this.sessions.values()].find(s => s.phone === clean);
        if (existing) {
            return `⚠️ +${clean} is already in session list.`;
        }

        const id = String(this.counter++);
        const session = new Session(id, clean, this, requesterJid);
        this.sessions.set(id, session);

        const allNums = [...this.sessions.values()].map(x => x.phone).filter(Boolean);
        this.saveNumbers(allNums);

        await session.init();
        return `${TAG}\n\nAdded +${clean}. Pairing code will be sent to your WhatsApp (+${CONFIGURED_BOT_NUMBER || 'owner'}).`;
    }

    async boot() {
        const numbers = this.loadSavedNumbers();
        if (numbers.length === 0) {
            console.log('[BOOT] BOT_NUMBER is empty. Set BOT_NUMBER at the top or use !addbot <number>.');
            return;
        }
        for (const num of numbers) {
            const id = String(this.counter++);
            const session = new Session(id, num, this);
            this.sessions.set(id, session);
            await session.init();
            await delay(1500);
        }
    }
}

console.log(`
◈  𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧 v10  ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Configured Number : ${CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : 'NOT SET'}
  Keep-Alive        : Every ${PING_MINUTES}m
  Safe Delay Floor  : ${MIN_SAFE_DELAY_MS}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const hub = new Hub();
await hub.boot();
