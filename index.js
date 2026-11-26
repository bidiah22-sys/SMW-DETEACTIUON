// ╔══════════════════════════════════════════════════════════════╗
// ║      𝗦𝗠𝗪 𝗜𝗢𝗦 — DIRECT SET ACCESS + FULL AI RENDER ENGINE   ║
// ╚══════════════════════════════════════════════════════════════╝

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    delay,
    fetchLatestBaileysVersion,
    Browsers,
    extractMessageContent
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import express from 'express';

// =========================================================================
// 1. CONFIGURATION
// =========================================================================
const BOT_NUMBER = process.env.BOT_NUMBER || "+9647882064284";
const PING_MINUTES = 4;

const MIN_SAFE_DELAY_MS    = 350;
const DEFAULT_LOOP_MS      = 900;
const ANTI_BAN_JITTER_MS   = 90;
const PAIR_LOGIN_WATCH_MS  = 45000;
const PAIR_WAIT_SECONDS    = 8;

const AUTO_READ_MESSAGES     = true;
const AUTO_REPLY_COOLDOWN_MS = 350;
const MAX_WARNS_BEFORE_KICK  = 3;
const MAX_RECONNECT_ATTEMPTS = 10;

const PATH_AUTH   = (phone) => `./sessions/smw_session_${phone}`;
const PATH_TIMING = './store/timing.json';
const PATH_BOTS   = './store/bots.json';
const PATH_GC     = './store/gc_settings.json';
// =========================================================================

// =========================================================================
// 2. DIRECT IN-MEMORY ACCESS SET & HELPERS
// =========================================================================
try {
    fs.mkdirSync('./store', { recursive: true });
    fs.mkdirSync('./sessions', { recursive: true });
} catch {}

const ensureDir = p => {
    const d = p.includes('/') ? p.substring(0, p.lastIndexOf('/')) : '.';
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
};

const readJson = (p, def) => {
    try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return JSON.parse(JSON.stringify(def));
};

const writeJson = (p, d) => {
    try {
        ensureDir(p);
        fs.writeFileSync(p, JSON.stringify(d, null, 2));
    } catch {}
};

function removeDirSafe(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } catch {}
}

function cleanDigits(input = '') {
    let d = String(input).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10) d = '91' + d;
    return d;
}

const PREFIX = '!';
const CONFIGURED_BOT_NUMBER = cleanDigits(BOT_NUMBER);
const ALLOWED_NUMBERS = new Set();

let botPaused = true;
const autoReplyChats = new Set();

let GLOBAL_EPOCH = 1;
let cachedBaileysVersion = null;
const BOOT_TS = Date.now();

let timingMap = readJson(PATH_TIMING, {
    anc1: DEFAULT_LOOP_MS, anc2: DEFAULT_LOOP_MS, anc3: DEFAULT_LOOP_MS,
    anc4: DEFAULT_LOOP_MS, anc5: DEFAULT_LOOP_MS, anc6: DEFAULT_LOOP_MS, anc7: DEFAULT_LOOP_MS
});
let gcSettings = readJson(PATH_GC, { antiLink: {}, welcome: {}, warns: {} });
if (!gcSettings.antiLink) gcSettings.antiLink = {};
if (!gcSettings.welcome) gcSettings.welcome = {};
if (!gcSettings.warns) gcSettings.warns = {};

const saveGcSettings = () => writeJson(PATH_GC, gcSettings);

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    const jitter = Math.floor(Math.random() * ANTI_BAN_JITTER_MS);
    return Math.max(MIN_SAFE_DELAY_MS, parsed) + jitter;
}

function getReplyKey(sessionPhone, chatJid) {
    return `${sessionPhone}::${String(chatJid || '').trim()}`;
}

function isMasterMsg(raw, sender) {
    if (Boolean(raw?.key?.fromMe)) return true;
    const d = cleanDigits(sender);
    return Boolean(CONFIGURED_BOT_NUMBER && d === CONFIGURED_BOT_NUMBER);
}

function isAllowedMsg(raw, sender) {
    if (isMasterMsg(raw, sender)) return true;
    if (botPaused) return false;
    const d = cleanDigits(sender);
    return Boolean(d && ALLOWED_NUMBERS.has(d));
}
// =========================================================================

// =========================================================================
// 3. EMOJIS, CARDS & GEMINI AI
// =========================================================================
const RAW_EMOJI_STRING = "😀😃😄😁😆😅😂🤣🥲🥹😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😶‍🌫️😱😨😰😥😓🤗🤔🫣🤭🫢🫡🤫🫠🤥😶🫥😐🫤😑🫨😬🙄😯😦😧😮😲🥱😴🤤😪😮‍💨😵😵‍💫🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃❤️🔥⚡👑💀🎯💣🌀🎭🪬🧿💎🗡️🐉☠️";
const REACTION_POOL = Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(RAW_EMOJI_STRING))
    .map(s => s.segment.trim())
    .filter(e => e.length > 0 && !/^[a-zA-Z0-9]$/.test(e));

let lastReactionIdx = -1;
function pickRandomReaction() {
    if (!REACTION_POOL.length) return "⚡";
    let idx = Math.floor(Math.random() * REACTION_POOL.length);
    if (idx === lastReactionIdx && REACTION_POOL.length > 1) {
        idx = (idx + 1) % REACTION_POOL.length;
    }
    lastReactionIdx = idx;
    return REACTION_POOL[idx];
}

const SETS = {
    faces:   ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    hearts:  ['🖤','❤️','🤍','🤎','🩷','🧡','💛','💚','💙','💜','🩵','🖤','❤️','🤍','🤎'],
    hands:   ['🔥','🚩','⚡','👑','💀','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    flowers: ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    sky:     ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    animals: ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
    fruits:  ['🚩','🔥','⚡','💀','👑','🎯','💣','🌀','🎭','🪬','🧿','💎','🗡️','🐉','☠️'],
};

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

const TAG = `🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 🚩`;
const sanitizeBoardLine = line => String(line ?? '').replace(/\r?\n+/g, ' / ').trim();

const boxCard = (header, rows) => {
    const cleanHeader = sanitizeBoardLine(header);
    const cleanRows = (Array.isArray(rows) ? rows : [rows]).map(sanitizeBoardLine).filter(Boolean);
    return [
        `╭─ ${cleanHeader} ─╮`,
        ...cleanRows.map(r => `│ ▸ ${r}`),
        `╰─────────────────────────╯`,
        `💗 *${TAG}*`
    ].join('\n');
};

const MENU_TEXT = () => boxCard(`🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 🚩`, [
    `▶️ ${PREFIX}start / 🛑 ${PREFIX}killall`,
    `⚡ ${PREFIX}allow +num / ${PREFIX}revoke +num / ${PREFIX}accesslist`,
    `🤖 ${PREFIX}autoreply on / off`,
    `🎯 ${PREFIX}anc1-7 [text] [ms] / ${PREFIX}ancstop`,
    `💬 ${PREFIX}txt [text] [ms] / ${PREFIX}stoptxt`,
    `🧠 ${PREFIX}ai [message]`,
    `📱 ${PREFIX}addbot +num / ${PREFIX}unpair +num / ${PREFIX}bots`,
    `👥 ${PREFIX}lockgc / ${PREFIX}unlockgc / ${PREFIX}kick / ${PREFIX}tagall`
]);

const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyBd3S8mbO_EYpERC_LMfkxMzTs0LLVZoeg";
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function withTimeout(promise, ms = 9000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Gemini timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callGemini(promptText, temperature = 0.95) {
    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature } });
            const res = await withTimeout(model.generateContent(promptText), 9000);
            const text = res?.response?.text()?.trim();
            if (text) return text;
        } catch {}
    }
    return null;
}

function fallbackChatReply(userText) {
    const clean = String(userText || '').trim().toLowerCase();
    const hasHindi = /[\u0900-\u097F]/.test(userText || '');
    if (/(kaise ho|kaisa hai|how are you|kya haal)/i.test(clean)) {
        return hasHindi
            ? "हाँ मैं बिल्कुल ठीक हूँ, आप बताओ कैसे हो?"
            : "Haan main bilkul badhiya hoon, aap batao kaise ho?";
    }
    return hasHindi
        ? "हाँ भाई, बताओ क्या बात करनी है?"
        : "Haan bhai, bolo kya chal raha hai?";
}

async function generateChatReply(userText) {
    const prompt =
        `You are a friendly, natural human on WhatsApp. Reply naturally to the user in their language (Hindi, Hinglish, or English). ` +
        `If they ask "hi kaise ho" or "how are you", reply warmly like "Haan main bilkul badhiya hoon, aap batao kaise ho?". Keep it natural and concise.\n\nUser: ${userText}`;
    const aiText = await callGemini(prompt, 0.95);
    return (aiText || fallbackChatReply(userText)).slice(0, 600);
}

async function generateDirectReply(userPrompt) {
    const prompt =
        `Answer directly and naturally in the user's language.\n\nMessage: ${userPrompt}`;
    const aiText = await callGemini(prompt, 0.9);
    return (aiText || fallbackChatReply(userPrompt)).slice(0, 1600);
}
// =========================================================================

// =========================================================================
// 4. MESSAGE & GROUP HELPERS
// =========================================================================
const SET_KEYS = {
    anc1: 'faces', anc2: 'hearts', anc3: 'hands', anc4: 'flowers',
    anc5: 'sky', anc6: 'animals', anc7: 'fruits'
};

function extractText(rawMsg) {
    const content = extractMessageContent(rawMsg) || rawMsg;
    if (!content) return '';
    return (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        ''
    ).trim();
}

function getTargets(raw, content, argsText) {
    const mentioned = content?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned;
    const participant = content?.extendedTextMessage?.contextInfo?.participant;
    if (participant) return [participant];
    const d = cleanDigits(argsText);
    if (d) return [`${d}@s.whatsapp.net`];
    return [];
}

function hasLink(text) {
    return /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/|instagram\.com\/|youtube\.com\/|youtu\.be\/)/i.test(text || '');
}

async function getFastVersion() {
    if (cachedBaileysVersion) return cachedBaileysVersion;
    try {
        const p = fetchLatestBaileysVersion();
        const t = new Promise(resolve => setTimeout(() => resolve(null), 2500));
        const res = await Promise.race([p, t]);
        if (res?.version && Array.isArray(res.version) && res.version.length === 3) {
            cachedBaileysVersion = res.version;
            return res.version;
        }
    } catch {}
    cachedBaileysVersion = [2, 3000, 1015901307];
    return cachedBaileysVersion;
}
// =========================================================================

// =========================================================================
// 5. SESSION & COMMAND ENGINE
// =========================================================================
class Session {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false, logOtpOnce = false, isPrimary = false) {
        this.id = id;
        this.phone = cleanDigits(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.logOtpOnce = logOtpOnce;
        this.isPrimary = isPrimary;

        this.socket = null;
        this.online = false;
        this.otpPrinted = false;
        this.pairingBusy = false;
        this.connecting = false;
        this.sessionReady = false;
        this.reconnectAttempts = 0;

        this.reconnectTimer = null;
        this.pairingWatchTimer = null;
        this.dedupeTimer = null;
        this.stopped = false;
        this.sendQueue = Promise.resolve();

        this.processedMsgs = new Map();
        this.msgCache = new Map();
        this.sentByBotIds = new Set();
        this.nameLoops = new Map();
        this.txtLoop = new Map();
        this.lastAutoReplyAt = new Map();

        this.dedupeTimer = setInterval(() => {
            if (this.stopped) return;
            const now = Date.now();
            for (const [k, v] of this.processedMsgs) {
                if (now - v > 90000) this.processedMsgs.delete(k);
            }
            if (this.msgCache.size > 250) this.msgCache.clear();
            if (this.sentByBotIds.size > 350) this.sentByBotIds.clear();
        }, 90000);
    }

    getAuthDir() {
        return PATH_AUTH(this.phone);
    }

    clearTimers() {
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }
        if (this.dedupeTimer) { clearInterval(this.dedupeTimer); this.dedupeTimer = null; }
    }

    stopAllLoops() {
        for (const entry of this.nameLoops.values()) {
            entry.active = false;
            entry.epoch += 1;
        }
        this.nameLoops.clear();

        for (const entry of this.txtLoop.values()) {
            entry.active = false;
            entry.epoch += 1;
        }
        this.txtLoop.clear();
        this.lastAutoReplyAt.clear();
    }

    async closeSocketCleanly() {
        const currentSock = this.socket;
        this.socket = null;
        if (!currentSock) return;
        try {
            if (currentSock.ev?.removeAllListeners) currentSock.ev.removeAllListeners();
            if (typeof currentSock.end === 'function') currentSock.end(undefined);
            else if (currentSock.ws?.close) currentSock.ws.close();
        } catch {}
    }

    async destroySession(keepAuth = false) {
        this.stopped = true;
        this.online = false;
        this.connecting = false;
        this.pairingBusy = false;
        this.sessionReady = false;
        this.clearTimers();
        this.stopAllLoops();
        await this.closeSocketCleanly();
        if (!keepAuth) removeDirSafe(this.getAuthDir());
    }

    dedupeLocal(msgId) {
        if (!msgId) return true;
        if (this.sentByBotIds.has(msgId)) return false;
        if (this.processedMsgs.has(msgId)) return false;
        this.processedMsgs.set(msgId, Date.now());
        return true;
    }

    scheduleReconnect(reasonLabel = 'disconnect', customDelayMs = null) {
        if (this.stopped || this.reconnectTimer) return;
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        this.reconnectAttempts += 1;
        const backoffMs = customDelayMs ?? Math.min(12000, 1200 * Math.pow(1.35, this.reconnectAttempts - 1));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.stopped) {
                this.pairingBusy = false;
                this.init();
            }
        }, backoffMs);
    }

    async requestRealSocketCode(sock, sourceTag = 'ADDBOT') {
        let lastErr = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await delay(1200 * attempt);
                if (this.stopped || this.socket !== sock) throw new Error('Socket closed');
                if (!sock || typeof sock.requestPairingCode !== 'function') throw new Error('requestPairingCode missing');
                const rawCode = await sock.requestPairingCode(this.phone);
                const clean = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
                if (clean.length >= 6) {
                    const formatted = clean.match(/.{1,4}/g)?.join('-') || clean;
                    console.log(`\n[PAIRING CODE] +${this.phone} (${sourceTag}) => ${formatted}\n`);
                    return formatted;
                }
                lastErr = new Error('Empty pairing code');
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('Failed to generate pairing code');
    }

    armPairingWatchdog() {
        if (this.pairingWatchTimer) clearTimeout(this.pairingWatchTimer);
        this.pairingWatchTimer = setTimeout(() => {
            this.pairingWatchTimer = null;
            if (this.stopped || this.online) return;
            if (this.pairingBusy && !this.sessionReady) {
                this.pairingBusy = false;
                this.connecting = false;
            }
        }, PAIR_LOGIN_WATCH_MS);
    }

    async createSocket(authDir) {
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const version = await getFastVersion();

        const sock = makeWASocket({
            auth: state,
            version,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            msgRetryCounterCache: new Map(),
            getMessage: async (key) => this.msgCache.get(key?.id)?.message || undefined
        });

        this.socket = sock;
        sock.ev.on("creds.update", async (...args) => {
            try { await saveCreds(...args); } catch {}
        });

        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (this.stopped || this.socket !== sock) return;
            if (connection === "connecting") {
                this.connecting = true;
            } else if (connection === "open") {
                if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }
                this.online = true;
                this.connecting = false;
                this.pairingBusy = false;
                this.sessionReady = true;
                this.reconnectAttempts = 0;
                console.log(`[ONLINE] +${this.phone}`);
                if (this.requesterJid) {
                    await this.sendInstant(this.requesterJid, boxCard(`✅ 𝗕𝗢𝗧 𝗟𝗜𝗡𝗞𝗘𝗗 ✅`, [
                        `*${g('NUMBER')}* : +${this.phone}`,
                        `*${g('STATUS')}* : 🟢 ${g('CONNECTED')}`
                    ]));
                }
            } else if (connection === "close") {
                this.online = false;
                this.connecting = false;
                this.sessionReady = false;
                if (this.stopped) return;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    this.pairingBusy = false;
                    removeDirSafe(authDir);
                    return;
                }
                this.pairingBusy = false;
                if (!this.isPrimary && !this.sessionReady) return;
                this.scheduleReconnect('close', 1000);
            }
        });

        sockSafeBind(this, sock);
        return { sock, state };
    }

    async pairFreshInChat() {
        if (!this.phone) throw new Error('Invalid phone number');
        if (this.pairingBusy) throw new Error('Pairing already in progress');

        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }

        const authDir = this.getAuthDir();
        removeDirSafe(authDir);
        ensureDir(authDir);
        await this.closeSocketCleanly();

        this.pairingBusy = true;
        this.connecting = true;
        this.sessionReady = false;
        this.reconnectAttempts = 0;
        this.otpPrinted = true;
        this.armPairingWatchdog();

        try {
            const { sock } = await this.createSocket(authDir);
            return await this.requestRealSocketCode(sock, 'ADDBOT');
        } catch (err) {
            this.pairingBusy = false;
            this.connecting = false;
            throw err;
        }
    }

    async tryLogPrimaryCodeOnce(sock) {
        if (!this.logOtpOnce || this.otpPrinted || this.pairingBusy || this.stopped || this.online) return;
        if (sock?.authState?.creds?.registered) return;
        this.otpPrinted = true;
        this.pairingBusy = true;
        try {
            await this.requestRealSocketCode(sock, 'BOOT');
        } catch {} finally {
            this.pairingBusy = false;
        }
    }

    async init() {
        try {
            if (!this.phone || this.stopped || this.pairingBusy) return;
            if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
            await this.closeSocketCleanly();

            const authDir = this.getAuthDir();
            if (this.freshAuth) {
                removeDirSafe(authDir);
                this.freshAuth = false;
            }
            ensureDir(authDir);
            this.connecting = true;

            const { sock } = await this.createSocket(authDir);
            if (this.logOtpOnce && !sock.authState?.creds?.registered && !this.otpPrinted) {
                this.tryLogPrimaryCodeOnce(sock).catch(() => {});
            }
        } catch (e) {
            this.connecting = false;
            console.error(`[${this.id}] Init error:`, e.message);
        }
    }

    async onGroupParticipantsUpdate(ev) {
        if (this.stopped || botPaused || !this.online || !this.socket) return;
        const groupJid = ev?.id;
        if (!groupJid || !groupJid.endsWith('@g.us')) return;
        if (ev.action === 'add' && gcSettings.welcome?.[groupJid]) {
            const participants = ev.participants || [];
            const names = participants.map(j => `@${cleanDigits(j)}`).join(', ');
            if (names) {
                await this.sendInstant(groupJid, boxCard(`👋 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 👋`, [`*${g('MEMBERS')}* : ${names}`]), participants);
            }
        }
    }

    async receive({ messages, type }) {
        try {
            if (this.stopped) return;
            if ((type !== 'notify' && type !== 'append') || !Array.isArray(messages)) return;

            for (const raw of messages) {
                if (!raw?.message || !raw?.key?.remoteJid) continue;
                const chat = raw.key.remoteJid;
                if (chat === 'status@broadcast') continue;

                if (raw.key.id) this.msgCache.set(raw.key.id, raw);
                if (!this.dedupeLocal(raw.key.id)) continue;

                const content = extractMessageContent(raw.message) || raw.message;
                const body = extractText(raw.message);
                if (!body) continue;

                const isGroup = chat.endsWith('@g.us');
                const isFromMe = Boolean(raw.key.fromMe);
                const sender = raw.key.participant || raw.participant || chat;
                const cmd = body.toLowerCase().trim();

                const master = isMasterMsg(raw, sender);
                const allowed = isAllowedMsg(raw, sender);

                if (master && cmd === `${PREFIX}start`) {
                    this.hub.resumeAllBots();
                    await this.sendInstant(chat, boxCard(`⚡ 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗦𝗧𝗔𝗥𝗧𝗘𝗗 ⚡`, [
                        `*${g('STATUS')}* : 🟢 ${g('ACTIVE')}`,
                        `*${g('SHARED')}* : ${ALLOWED_NUMBERS.size} ${g('USERS')}`
                    ]));
                    continue;
                }

                if (master && cmd === `${PREFIX}killall`) {
                    this.hub.pauseAllBotsKeepSessionAlive();
                    await this.sendInstant(chat, boxCard(`🛑 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗞𝗜𝗟𝗟𝗘𝗗 🛑`, [
                        `*${g('STATUS')}* : ⏸️ ${g('STOPPED FOR ALL')}`
                    ]));
                    continue;
                }

                if (master && (cmd === `${PREFIX}allow` || cmd.startsWith(`${PREFIX}allow `))) {
                    const argPart = body.slice(PREFIX.length + 5).trim();
                    const targets = getTargets(raw, content, argPart);
                    const targetDigits = cleanDigits(targets[0] || argPart);
                    if (!targetDigits) {
                        await this.sendInstant(chat, boxCard(`⚠️ 𝗡𝗨𝗠𝗕𝗘𝗥 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}allow +919876543210`]));
                        continue;
                    }
                    ALLOWED_NUMBERS.add(targetDigits);
                    await this.sendInstant(chat, boxCard(`⚡ 𝗔𝗖𝗖𝗘𝗦𝗦 𝗧𝗥𝗔𝗡𝗦𝗙𝗘𝗥𝗥𝗘𝗗 ⚡`, [
                        `*${g('USER')}*   : +${targetDigits}`,
                        `*${g('ACCESS')}* : 🔥 ${g('UNLOCKED')}`
                    ]));
                    continue;
                }

                if (master && (cmd === `${PREFIX}revoke` || cmd.startsWith(`${PREFIX}revoke `))) {
                    const argPart = body.slice(PREFIX.length + 6).trim();
                    const targets = getTargets(raw, content, argPart);
                    const targetDigits = cleanDigits(targets[0] || argPart);
                    if (!targetDigits) {
                        await this.sendInstant(chat, boxCard(`⚠️ 𝗡𝗨𝗠𝗕𝗘𝗥 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}revoke +919876543210`]));
                        continue;
                    }
                    const existed = ALLOWED_NUMBERS.delete(targetDigits);
                    await this.sendInstant(chat, boxCard(`🛑 𝗔𝗖𝗖𝗘𝗦𝗦 𝗥𝗘𝗩𝗢𝗞𝗘𝗗 🛑`, [
                        `*${g('USER')}*   : +${targetDigits}`,
                        `*${g('STATUS')}* : ${existed ? `🔴 ${g('REVOKED')}` : `⚠️ ${g('NOT IN LIST')}`}`
                    ]));
                    continue;
                }

                if (master && cmd === `${PREFIX}accesslist`) {
                    const list = [...ALLOWED_NUMBERS];
                    await this.sendInstant(chat, boxCard(`🔑 𝗔𝗖𝗖𝗘𝗦𝗦 𝗟𝗜𝗦𝗧 (${list.length}) 🔑`,
                        list.length ? list.map((n, i) => `*${i + 1}.* +${n}`) : [g('NO SHARED USERS')]
                    ));
                    continue;
                }

                if (botPaused) continue;

                if (AUTO_READ_MESSAGES && !isFromMe) {
                    this.socket?.readMessages([raw.key]).catch(() => {});
                }

                if (isGroup && !allowed && gcSettings.antiLink?.[chat] && hasLink(body)) {
                    try {
                        await this.socket.sendMessage(chat, { delete: raw.key });
                        await this.sendInstant(chat, boxCard(`🚫 𝗔𝗡𝗧𝗜 𝗟𝗜𝗡𝗞 🛡️`, [`*${g('USER')}* : @${cleanDigits(sender)}`]), [sender]);
                    } catch {}
                    continue;
                }

                const isCommandText = body.startsWith(PREFIX);

                if (allowed && isCommandText) {
                    if (cmd === `${PREFIX}menu`) {
                        await this.sendInstant(chat, MENU_TEXT());
                        continue;
                    }

                    if (cmd === `${PREFIX}ping`) {
                        await this.sendInstant(chat, boxCard(`⚡ 𝗣𝗜𝗡𝗚 ⚡`, [
                            `*${g('UPTIME')}* : ${Math.floor((Date.now() - BOOT_TS) / 1000)}s`,
                            `*${g('SHARED')}* : ${ALLOWED_NUMBERS.size}`
                        ]));
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply on`) {
                        autoReplyChats.add(getReplyKey(this.phone, chat));
                        await this.sendInstant(chat, boxCard(`🤖 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗡 🤖`, [`*${g('AI & REACTION')}* : 🟢 ${g('ACTIVE')}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply off`) {
                        autoReplyChats.delete(getReplyKey(this.phone, chat));
                        await this.sendInstant(chat, boxCard(`⛔ 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗙𝗙 ⛔`, [`*${g('AI & REACTION')}* : 🔴 ${g('OFF')}`]));
                        continue;
                    }

                    if (master && cmd.startsWith(`${PREFIX}addbot `)) {
                        const cleanNum = cleanDigits(body.slice(PREFIX.length + 8).trim());
                        if (!cleanNum) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ❌`, [`*${g('USAGE')}* : ${PREFIX}addbot +9647882064284`]));
                            continue;
                        }
                        await this.sendInstant(chat, boxCard(`⏳ 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 ⏳`, [`*${g('NUMBER')}* : +${cleanNum}`, `*${g('WAIT')}* : ~${PAIR_WAIT_SECONDS}s`]));
                        try {
                            const code = await this.hub.addNumberInChat(cleanNum, chat);
                            await this.sendInstant(chat, boxCard(`🔑 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘 🔑`, [`*${g('NUMBER')}* : +${cleanNum}`, `*${g('CODE')}* : \`${code}\``]));
                        } catch (err) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗘𝗥𝗥𝗢𝗥 ❌`, [`*${g('REASON')}* : ${err.message}`]));
                        }
                        continue;
                    }

                    if (master && cmd.startsWith(`${PREFIX}unpair `)) {
                        const cleanNum = cleanDigits(body.slice(PREFIX.length + 7).trim());
                        const ok = await this.hub.unpairNumber(cleanNum);
                        await this.sendInstant(chat, boxCard(`🗑️ 𝗨𝗡𝗣𝗔𝗜𝗥 🗑️`, [`*${g('NUMBER')}* : +${cleanNum}`, `*${g('STATUS')}* : ${ok ? g('REMOVED') : g('NOT FOUND')}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}bots`) {
                        const list = [...this.hub.sessions.values()].filter(s => !s.stopped);
                        await this.sendInstant(chat, boxCard(`📱 𝗕𝗢𝗧𝗦 (${list.length}) 📱`,
                            list.length ? list.map((s, i) => `*${i + 1}.* +${s.phone} ➔ ${s.online ? `🟢 ${g('ONLINE')}` : `🟡 ${g('STANDBY')}`}`) : [g('NONE')]
                        ));
                        continue;
                    }

                    if (cmd === `${PREFIX}lockgc` || cmd === `${PREFIX}unlockgc`) {
                        if (!isGroup) continue;
                        try {
                            await this.socket.groupSettingUpdate(chat, cmd === `${PREFIX}lockgc` ? 'announcement' : 'not_announcement');
                            await this.sendInstant(chat, boxCard(`🔒 𝗚𝗥𝗢𝗨𝗣 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 🔒`, [`*${g('STATUS')}* : ${g('DONE')}`]));
                        } catch {}
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}kick`) || cmd.startsWith(`${PREFIX}promote`) || cmd.startsWith(`${PREFIX}demote`)) {
                        if (!isGroup) continue;
                        const argPart = body.replace(new RegExp(`^\\${PREFIX}(kick|promote|demote)\\s*`, 'i'), '').trim();
                        const targets = getTargets(raw, content, argPart);
                        if (!targets.length) continue;
                        try {
                            const action = cmd.startsWith(`${PREFIX}promote`) ? 'promote' : (cmd.startsWith(`${PREFIX}demote`) ? 'demote' : 'remove');
                            await this.socket.groupParticipantsUpdate(chat, targets, action);
                            await this.sendInstant(chat, boxCard(`✅ 𝗗𝗢𝗡𝗘 ✅`, [`*${g('ACTION')}* : ${g(action)}`]));
                        } catch {}
                        continue;
                    }

                    if (cmd === `${PREFIX}tagall` || cmd.startsWith(`${PREFIX}tagall `)) {
                        if (!isGroup) continue;
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const members = (meta.participants || []).map(p => p.id).filter(Boolean);
                            const note = body.slice(PREFIX.length + 6).trim() || 'Hello!';
                            for (let i = 0; i < members.length; i += 20) {
                                if (botPaused || this.stopped) break;
                                const slice = members.slice(i, i + 20);
                                await this.sendInstant(chat, boxCard(`📣 𝗧𝗔𝗚 𝗔𝗟𝗟 📣`, [`*${g('NOTE')}* : ${note}`, slice.map(j => `@${cleanDigits(j)}`).join(' ')]), slice);
                                if (i + 20 < members.length) await delay(650);
                            }
                        } catch {}
                        continue;
                    }

                    if (cmd === `${PREFIX}ancstop` || cmd === `${PREFIX}stoptxt`) {
                        this.stopAllLoops();
                        await this.sendInstant(chat, boxCard(`🛑 𝗟𝗢𝗢𝗣𝗦 𝗦𝗧𝗢𝗣𝗣𝗘𝗗 🛑`, [`*${g('STATUS')}* : ${g('STOPPED')}`]));
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}ai `)) {
                        const prompt = body.slice(PREFIX.length + 3).trim();
                        if (!prompt) continue;
                        const reqEpoch = GLOBAL_EPOCH;
                        const reply = await generateDirectReply(prompt);
                        if (!botPaused && reqEpoch === GLOBAL_EPOCH && isAllowedMsg(raw, sender)) {
                            await this.sendInstant(chat, boxCard(`🧠 𝗦𝗠𝗪 𝗔𝗜 🧠`, [reply]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}txt `)) {
                        const parts = body.slice(PREFIX.length + 4).trim().split(/\s+/);
                        const maybeMs = Number(parts[parts.length - 1]);
                        let ms = DEFAULT_LOOP_MS;
                        let txt = parts.join(' ');
                        if (parts.length > 1 && Number.isFinite(maybeMs) && maybeMs > 0) {
                            ms = getSafeDelay(maybeMs);
                            parts.pop();
                            txt = parts.join(' ');
                        }
                        if (txt) await this.handle('txt_start', { chat, txt, ms }, true);
                        continue;
                    }

                    let matchedAnc = false;
                    for (const [key, setName] of Object.entries(SET_KEYS)) {
                        if (cmd.startsWith(`${PREFIX}${key} `)) {
                            matchedAnc = true;
                            if (!isGroup) break;
                            const rawArgs = body.slice(PREFIX.length + key.length + 1).trim();
                            if (!rawArgs) break;
                            const parts = rawArgs.split(/\s+/);
                            const maybeMs = Number(parts[parts.length - 1]);
                            let ms = getSafeDelay(timingMap[key] || DEFAULT_LOOP_MS);
                            let txt = rawArgs;
                            if (parts.length > 1 && Number.isFinite(maybeMs) && maybeMs > 0) {
                                ms = getSafeDelay(maybeMs);
                                parts.pop();
                                txt = parts.join(' ');
                            }
                            if (!txt) break;
                            timingMap[key] = ms;
                            writeJson(PATH_TIMING, timingMap);
                            await this.handle('nc_start', { chat, txt: iFnt(txt), key, setName, ms }, true);
                            break;
                        }
                    }
                    if (matchedAnc) continue;
                }

                if (!botPaused && autoReplyChats.has(getReplyKey(this.phone, chat)) && !isFromMe && body && !isCommandText) {
                    const reqEpoch = GLOBAL_EPOCH;
                    const chosenEmoji = pickRandomReaction();
                    this.enqueueSend(async () => {
                        if (!this.stopped && !botPaused && this.socket && autoReplyChats.has(getReplyKey(this.phone, chat))) {
                            await this.socket.sendMessage(chat, { react: { text: chosenEmoji, key: raw.key } });
                        }
                    });

                    const replyKey = `${String(chat).trim()}__${cleanDigits(sender)}`;
                    const lastTs = this.lastAutoReplyAt.get(replyKey) || 0;
                    if (Date.now() - lastTs >= AUTO_REPLY_COOLDOWN_MS) {
                        this.lastAutoReplyAt.set(replyKey, Date.now());
                        (async () => {
                            try {
                                const replyText = await generateChatReply(body);
                                if (replyText && !botPaused && reqEpoch === GLOBAL_EPOCH && autoReplyChats.has(getReplyKey(this.phone, chat)) && !this.stopped) {
                                    await this.sendQuoted(chat, replyText, raw);
                                }
                            } catch {}
                        })();
                    }
                }
            }
        } catch (err) {
            console.log('[RECEIVE ERR]', err?.message || err);
        }
    }

    async handle(cmd, payload, notify = true) {
        if (this.stopped || botPaused) return;
        const { chat } = payload;
        const startEpoch = GLOBAL_EPOCH;
        try {
            if (cmd === 'nc_start') {
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
                    while (!this.stopped && !botPaused && startEpoch === GLOBAL_EPOCH && stateObj.active && this.nameLoops.get(tid) === stateObj) {
                        if (this.socket) {
                            const emo1 = emojis[idx % emojis.length];
                            const emo2 = emojis[(idx + 3) % emojis.length];
                            idx += 1;
                            try { await this.socket.groupUpdateSubject(chat, `${emo1} ⚡ ${txt} ⚡ ${emo2}`); } catch {}
                        }
                        let elapsed = 0;
                        while (elapsed < safeDelay) {
                            if (this.stopped || botPaused || startEpoch !== GLOBAL_EPOCH || !stateObj.active || this.nameLoops.get(tid) !== stateObj) return;
                            await delay(Math.min(100, safeDelay - elapsed));
                            elapsed += 100;
                        }
                    }
                })();
                if (notify) await this.sendInstant(chat, boxCard(`🔥 ${key.toUpperCase()} STARTED 🔥`, [`*${g('DELAY')}* : ${safeDelay}ms`]));
            } else if (cmd === 'txt_start') {
                const { txt, ms } = payload;
                const safeDelay = getSafeDelay(ms ?? DEFAULT_LOOP_MS);
                const txtKey = `${chat}__txt`;
                const prev = this.txtLoop.get(txtKey);
                const nextEpoch = (prev?.epoch || 0) + 1;
                if (prev) prev.active = false;
                const loopObj = { active: true, epoch: nextEpoch };
                this.txtLoop.set(txtKey, loopObj);

                (async () => {
                    while (!this.stopped && !botPaused && startEpoch === GLOBAL_EPOCH && loopObj.active && this.txtLoop.get(txtKey) === loopObj) {
                        if (this.socket) {
                            try {
                                const sent = await this.socket.sendMessage(chat, { text: txt });
                                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
                            } catch {}
                        }
                        let elapsed = 0;
                        while (elapsed < safeDelay) {
                            if (this.stopped || botPaused || startEpoch !== GLOBAL_EPOCH || !loopObj.active || this.txtLoop.get(txtKey) !== loopObj) return;
                            await delay(Math.min(100, safeDelay - elapsed));
                            elapsed += 100;
                        }
                    }
                })();
                if (notify) await this.sendInstant(chat, boxCard(`🔥 TEXT LOOP STARTED 🔥`, [`*${g('DELAY')}* : ${safeDelay}ms`]));
            }
        } catch {}
    }

    enqueueSend(taskFn) {
        this.sendQueue = this.sendQueue.then(async () => {
            await taskFn();
            await delay(60 + Math.floor(Math.random() * 50));
        }).catch(() => {});
        return this.sendQueue;
    }

    async sendInstant(jid, text, mentions = undefined) {
        if (this.stopped || !this.socket) return;
        try {
            const payload = mentions ? { text, mentions } : { text };
            const sent = await this.socket.sendMessage(jid, payload);
            if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
        } catch {}
    }

    async sendQuoted(jid, text, quotedMsg) {
        if (this.stopped || !this.socket) return;
        await this.enqueueSend(async () => {
            try {
                const sent = await this.socket.sendMessage(jid, { text }, { quoted: quotedMsg });
                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
            } catch {}
        });
    }
}

function sockSafeBind(session, targetSock = session.socket) {
    if (!targetSock) return;
    targetSock.ev.on('messages.upsert', m => {
        if (session.socket !== targetSock) return;
        session.receive(m).catch(err => console.log('[UPSERT ERR]', err?.message || err));
    });
    targetSock.ev.on('group-participants.update', ev => {
        if (session.socket !== targetSock) return;
        session.onGroupParticipantsUpdate(ev).catch(() => {});
    });
}
// =========================================================================

// =========================================================================
// 6. HUB & SERVER
// =========================================================================
class Hub {
    constructor() {
        this.sessions = new Map();
        this.counter = 1;
        this.pairQueue = Promise.resolve();
    }

    loadSavedNumbers() {
        const saved = readJson(PATH_BOTS, { numbers: [] });
        const list = Array.isArray(saved.numbers) ? saved.numbers : [];
        const cleanList = list.map(cleanDigits).filter(Boolean);
        if (CONFIGURED_BOT_NUMBER && !cleanList.includes(CONFIGURED_BOT_NUMBER)) {
            cleanList.unshift(CONFIGURED_BOT_NUMBER);
        }
        return [...new Set(cleanList)];
    }

    saveNumbers(numbers) {
        writeJson(PATH_BOTS, { numbers: [...new Set(numbers)] });
    }

    async addNumberInChat(phone, requesterJid = null) {
        const clean = cleanDigits(phone);
        if (!clean) throw new Error('Invalid phone number');

        const runTask = async () => {
            const isTargetPrimary = Boolean(CONFIGURED_BOT_NUMBER && clean === CONFIGURED_BOT_NUMBER);
            const existingEntries = [...this.sessions.entries()].filter(([, s]) => s.phone === clean && !s.stopped);
            for (const [key, oldSess] of existingEntries) {
                await oldSess.destroySession(false);
                this.sessions.delete(key);
            }

            const id = String(this.counter++);
            const session = new Session(id, clean, this, requesterJid, true, false, isTargetPrimary);
            this.sessions.set(id, session);

            const allNums = [...this.sessions.values()].filter(x => !x.stopped && x.phone).map(x => x.phone);
            this.saveNumbers(allNums);

            return await session.pairFreshInChat();
        };

        const queuedPromise = this.pairQueue.then(runTask, runTask);
        this.pairQueue = queuedPromise.catch(() => {});
        return await queuedPromise;
    }

    async unpairNumber(phone) {
        const clean = cleanDigits(phone);
        if (!clean) return false;
        let found = false;
        for (const [key, sess] of [...this.sessions.entries()]) {
            if (sess.phone === clean && !sess.stopped) {
                found = true;
                await sess.destroySession(false);
                this.sessions.delete(key);
            }
        }
        removeDirSafe(PATH_AUTH(clean));
        const remaining = [...this.sessions.values()].filter(x => !x.stopped && x.phone).map(x => x.phone);
        this.saveNumbers(remaining);
        return found;
    }

    pauseAllBotsKeepSessionAlive() {
        GLOBAL_EPOCH += 1;
        botPaused = true;
        autoReplyChats.clear();
        for (const sess of this.sessions.values()) sess.stopAllLoops();
    }

    resumeAllBots() {
        GLOBAL_EPOCH += 1;
        botPaused = false;
    }

    async shutdownAll() {
        for (const sess of this.sessions.values()) await sess.destroySession(true);
        this.sessions.clear();
    }

    async boot() {
        const numbers = this.loadSavedNumbers();
        if (numbers.length === 0) return;
        this.saveNumbers(numbers);
        for (const num of numbers) {
            const id = String(this.counter++);
            const isPrimary = Boolean(CONFIGURED_BOT_NUMBER && num === CONFIGURED_BOT_NUMBER);
            const session = new Session(id, num, this, null, false, isPrimary, isPrimary);
            this.sessions.set(id, session);
            await session.init();
            await delay(600);
        }
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, paused: botPaused });
});

function startKeepAlive() {
    const intervalMs = PING_MINUTES * 60 * 1000;
    const pingUrl = process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/health`
        : `http://127.0.0.1:${PORT}/health`;
    setInterval(async () => {
        try { await fetch(pingUrl); } catch {}
    }, intervalMs);
}

process.on('uncaughtException', err => console.log('[SAFE UNCAUGHT]', err?.message || err));
process.on('unhandledRejection', err => console.log('[SAFE REJECTION]', err?.message || err));

const hub = new Hub();

process.on('SIGTERM', async () => {
    await hub.shutdownAll();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await hub.shutdownAll();
    process.exit(0);
});

app.listen(PORT, async () => {
    console.log(`[SERVER] Listening on port ${PORT}`);
    startKeepAlive();
    await hub.boot();
});
