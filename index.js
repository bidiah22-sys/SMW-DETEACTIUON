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
// PRIMARY BOT / OWNER NUMBER (WITH OR WITHOUT '+')
// =========================================================================
const BOT_NUMBER = "+9647882064284";

// RENDER KEEP-ALIVE INTERVAL IN MINUTES
const PING_MINUTES = 5;

// USER-CONTROLLED LOOP TIMING LIMITS (IN MILLISECONDS)
const MIN_SAFE_DELAY_MS = 1200;
const DEFAULT_LOOP_MS   = 2500;

// AUTO-READ, MULTI-REACTION & PER-CHAT AUTO-REPLY SETTINGS
const AUTO_READ_MESSAGES    = true;
const REACTION_POOL         = ["⚡", "🔥", "✨", "💫", "🎯", "👑", "🖤", "🙌", "🤝", "🚀", "💎", "🌟"];
const AUTO_REPLY_COOLDOWN_MS = 2500;
const PAIR_COOLDOWN_MS      = 35000;
// =========================================================================

function normalizeStrictPhone(rawInput) {
    if (!rawInput) return '';
    let digits = String(rawInput).replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return digits;
}

const CONFIGURED_BOT_NUMBER = normalizeStrictPhone(BOT_NUMBER);
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
const PATH_STATE  = './store/state.json';

try {
    fs.mkdirSync('./store', { recursive: true });
    fs.mkdirSync('./sessions', { recursive: true });
    if (!fs.existsSync('./store/cookies.txt')) {
        const b64 = "IyBOZXRzY2FwZSmvQ29va2llIEZpbGUh";
        fs.writeFileSync('./store/cookies.txt', Buffer.from(b64, 'base64').toString('utf8'));
    }
} catch {}

function removeDirSafe(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } catch {}
}

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

let GLOBAL_EPOCH = 1;
const GLOBAL_ISSUED_CODES = new Set();

let runtimeState = readJson(PATH_STATE, {
    botPaused: false,
    autoReplyChats: {}
});

if (!runtimeState.autoReplyChats || typeof runtimeState.autoReplyChats !== 'object') {
    runtimeState.autoReplyChats = {};
}

function saveRuntimeState() {
    writeJson(PATH_STATE, runtimeState);
}

function isChatAutoReplyOn(sessionPhone, chatJid) {
    if (runtimeState.botPaused) return false;
    return Boolean(runtimeState.autoReplyChats[`${sessionPhone}::${chatJid}`]);
}

function setChatAutoReply(sessionPhone, chatJid, enabled) {
    const key = `${sessionPhone}::${chatJid}`;
    if (enabled) {
        runtimeState.autoReplyChats[key] = true;
    } else {
        delete runtimeState.autoReplyChats[key];
    }
    saveRuntimeState();
}

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    return Math.max(MIN_SAFE_DELAY_MS, parsed);
}

function pickRandomReaction() {
    return REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)];
}

// ─────────────────────────────────────────────
//  GEMINI AI ENGINE (WITH API KEY & FALLBACKS)
// ─────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyBd3S8mbO_EYpERC_LMfkxMzTs0LLVZoeg";
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

async function callGeminiWithFallback(promptText) {
    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const res = await model.generateContent(promptText);
            const text = res?.response?.text()?.trim();
            if (text) return text;
        } catch {}
    }
    return null;
}

async function generateMatchingLanguageReply(userText) {
    const prompt =
        `Act as a normal, friendly person chatting on WhatsApp. ` +
        `Reply in the exact same language and script as the user's message (Hindi, Hinglish, English, etc.). ` +
        `Keep it natural, helpful, and brief (1-3 lines).\n\n` +
        `Message: ${userText}`;
    const reply = await callGeminiWithFallback(prompt);
    return reply ? reply.slice(0, 600) : null;
}

async function generateDirectAI(userPrompt) {
    const prompt =
        `Reply naturally in the same language as the user's question. Be clear and helpful.\n\n` +
        `Question: ${userPrompt}`;
    const reply = await callGeminiWithFallback(prompt);
    return (reply || 'Unable to respond right now. Please try again.').slice(0, 1500);
}

// ─────────────────────────────────────────────
//  EXPRESS SERVER + 5-MINUTE KEEP-ALIVE
// ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.status(200).json({
        status: runtimeState.botPaused ? 'paused' : 'active',
        service: 'SMW IOS Manager',
        primaryNumber: CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : null,
        pingMinutes: PING_MINUTES,
        uptimeSec: Math.floor(process.uptime())
    });
});

app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});

function startKeepAlive() {
    const intervalMs = PING_MINUTES * 60 * 1000;
    const pingUrl = process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/health`
        : `http://127.0.0.1:${PORT}/health`;

    setInterval(async () => {
        try {
            await fetch(pingUrl);
        } catch {}
    }, intervalMs);
}

// ─────────────────────────────────────────────
//  EMOJI BANKS & FONT CONVERTER
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
//  MENUS
// ─────────────────────────────────────────────
const MENU_TEXT = () => `
  ┌─────────────────────────────────────────┐
  │  🎀  𝗦𝗠𝗪  𝗜𝗢𝗦  𝗠𝗔𝗡𝗔𝗚𝗘𝗥  v10  🚩      │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix     : ${PREFIX}                      │
  │  🛡️ Safe Floor : ${MIN_SAFE_DELAY_MS}ms           │
  └─────────────────────────────────────────┘

  📂  *${g('CORE COMMAND MENUS')}*

  > 🤖  ${PREFIX}autoreply on / off
         ↳ ${g('chat reply and reactions')}

  > 🎯  ${PREFIX}targetmenu
         ↳ ${g('name change and text commands')}

  > 🧠  ${PREFIX}ai [question]
         ↳ ${g('ai assistant')}

  > 📱  ${PREFIX}addbot [number] | ${PREFIX}relink [number]
         ↳ ${g('link number')}

  > 👥  ${PREFIX}grpmenu
         ↳ ${g('group commands')}

  > 🎮  ${PREFIX}games
         ↳ ${g('utility commands')}

  ┌─────────────────────────────────────────┐
  │  ⚙️  *${g('CONTROLS')}*                    │
  ├─────────────────────────────────────────┤
  │  👑  ${PREFIX}admin    ➔ ${g('Owner')}          │
  │  ▶️  ${PREFIX}start    ➔ ${g('Start')}          │
  │  🛑  ${PREFIX}killall  ➔ ${g('Stop')}           │
  └─────────────────────────────────────────┘`;

const TARGET_MENU = () => `
  ┌─────────────────────────────────────────┐
  │  🎯  𝗧𝗔𝗥𝗚𝗘𝗧  𝗖𝗢𝗡𝗧𝗥𝗢𝗟  𝗖𝗘𝗡𝗧𝗘𝗥  🔥  │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix     : ${PREFIX}                      │
  │  🛡️ Safe Floor : ${MIN_SAFE_DELAY_MS}ms           │
  └─────────────────────────────────────────┘

  🔥  *${g('NAME COMMANDS')}*
  • ${PREFIX}anc1-7 [text] [ms]  • ${PREFIX}ancstop

  💣  *${g('TEXT COMMANDS')}*
  • ${PREFIX}txt [text] [ms]     • ${PREFIX}stoptxt

  ⚡  *${g('CONTROLS')}*
  • ${PREFIX}killall  • ${PREFIX}start
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
  │  ✨ STARTED             │
  └─────────────────────────┘
  ▶ ${g(what)}
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
//  SESSION MANAGER (STRICTLY ISOLATED PER NUMBER)
// ═════════════════════════════════════════════
class Session {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false) {
        this.id = id;
        this.phone = normalizeStrictPhone(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.socket = null;
        this.online = false;
        this.self = null;

        this.pairingInProgress = false;
        this.pairingDone = false;
        this.lastPairAttemptAt = 0;
        this.pairTimer = null;
        this.reconnectTimer = null;
        this.dedupeTimer = null;
        this.stopped = false;

        this.processedMsgs = new Map();
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
            if (this.sentByBotIds.size > 500) {
                this.sentByBotIds.clear();
            }
        }, 90000);
    }

    getAuthDir() {
        return PATH_AUTH(`${this.id}_${this.phone}`);
    }

    clearTimers() {
        if (this.pairTimer) {
            clearTimeout(this.pairTimer);
            this.pairTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.dedupeTimer) {
            clearInterval(this.dedupeTimer);
            this.dedupeTimer = null;
        }
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

    async destroySession() {
        this.stopped = true;
        this.online = false;
        this.clearTimers();
        this.stopAllLoops();
        try {
            if (this.socket?.ev?.removeAllListeners) {
                this.socket.ev.removeAllListeners('connection.update');
                this.socket.ev.removeAllListeners('messages.upsert');
                this.socket.ev.removeAllListeners('creds.update');
            }
        } catch {}
        try {
            if (this.socket?.ws?.close) this.socket.ws.close();
            if (this.socket?.end) this.socket.end(undefined);
        } catch {}
        this.socket = null;
        removeDirSafe(this.getAuthDir());
    }

    dedupeLocal(msgId) {
        if (!msgId) return true;
        if (this.sentByBotIds.has(msgId)) return false;
        if (this.processedMsgs.has(msgId)) return false;
        this.processedMsgs.set(msgId, Date.now());
        return true;
    }

    triggerSingleCodeOnce(sock) {
        if (
            this.stopped ||
            !sock ||
            this.online ||
            this.pairingDone ||
            this.pairingInProgress ||
            this.pairTimer
        ) return;

        if (sock.authState?.creds?.registered) {
            this.pairingDone = true;
            return;
        }

        const now = Date.now();
        if (now - this.lastPairAttemptAt < PAIR_COOLDOWN_MS) return;

        this.pairingInProgress = true;
        this.pairTimer = setTimeout(async () => {
            this.pairTimer = null;
            if (this.stopped || this.online || this.pairingDone) {
                this.pairingInProgress = false;
                return;
            }
            this.lastPairAttemptAt = Date.now();
            try {
                if (sock.authState?.creds?.registered) {
                    this.pairingDone = true;
                    return;
                }
                const rawCode = await sock.requestPairingCode(this.phone);
                const cleanCode = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                if (!cleanCode) throw new Error('Empty pairing code');

                const formatted = cleanCode.match(/.{1,4}/g)?.join('-') || cleanCode;
                const uniqueKey = `${this.phone}__${formatted}`;
                if (GLOBAL_ISSUED_CODES.has(uniqueKey)) {
                    this.pairingDone = true;
                    return;
                }

                GLOBAL_ISSUED_CODES.add(uniqueKey);
                this.pairingDone = true;

                console.log(`\n========================================`);
                console.log(`PAIRING CODE (+${this.phone}): ${formatted}`);
                console.log(`========================================\n`);

                const labelMsg = `${TAG}\n\nPairing code for +${this.phone}:`;
                await this.hub.sendSingleCodeMessages(labelMsg, formatted, this.requesterJid);
            } catch (e) {
                this.pairingDone = false;
                console.log(`[PAIR ERR] +${this.phone}:`, e.message);
            } finally {
                this.pairingInProgress = false;
            }
        }, 3500);
    }

    async init() {
        try {
            if (!this.phone) return;

            if (this.socket) {
                try {
                    this.socket.ev.removeAllListeners('connection.update');
                    this.socket.ev.removeAllListeners('messages.upsert');
                    this.socket.ev.removeAllListeners('creds.update');
                    if (this.socket.ws?.close) this.socket.ws.close();
                } catch {}
                this.socket = null;
            }

            const authDir = this.getAuthDir();
            if (this.freshAuth) {
                removeDirSafe(authDir);
                this.freshAuth = false;
            }
            ensureDir(authDir);

            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();

            if (this.stopped) return;

            this.socket = makeWASocket({
                auth: state,
                version,
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu("Chrome"),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false
            });

            this.socket.ev.on("creds.update", saveCreds);

            this.socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
                if (this.stopped) return;

                if (connection === "open") {
                    this.online = true;
                    this.pairingDone = true;
                    this.pairingInProgress = false;
                    if (this.pairTimer) {
                        clearTimeout(this.pairTimer);
                        this.pairTimer = null;
                    }
                    this.self = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    console.log(`[${this.id}] Connected: +${this.phone}`);
                } else if (connection === "connecting" && !this.socket.authState?.creds?.registered && !this.pairingDone) {
                    this.triggerSingleCodeOnce(this.socket);
                } else if (connection === "close") {
                    this.online = false;
                    if (this.pairTimer) {
                        clearTimeout(this.pairTimer);
                        this.pairTimer = null;
                    }
                    this.pairingInProgress = false;
                    if (this.stopped) return;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        removeDirSafe(authDir);
                        this.pairingDone = false;
                    }
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    if (shouldReconnect && !this.reconnectTimer) {
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (!this.stopped) this.init();
                        }, 5500);
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
            if (this.stopped) return;
            if (type !== 'notify') return;
            const raw = messages[0];
            if (!raw?.message) return;

            const chat = raw.key.remoteJid;
            const isGroup = chat.endsWith('@g.us');
            const sender = raw.key.participant || chat;

            if (!this.dedupeLocal(raw.key.id)) return;

            const body = (raw.message.conversation
                        || raw.message.extendedTextMessage?.text
                        || raw.message.imageMessage?.caption || '').trim();
            const cmd = body.toLowerCase();

            const isDM = !isGroup;
            const isOwn = isOwner(sender) || raw.key.fromMe;
            const allowed = isOwn || isSub(sender, chat);

            if (allowed && (cmd === `${PREFIX}start` || cmd === '+start')) {
                this.hub.resumeAllBots();
                await this.send(chat, `${TAG}\n\n✅ Started.`);
                return;
            }

            if (allowed && (cmd === `${PREFIX}killall` || cmd === '-all')) {
                this.hub.pauseAllBotsWithoutLogout();
                await this.send(chat, `${TAG}\n\n🛑 Stopped.`);
                return;
            }

            if (runtimeState.botPaused) return;

            if (AUTO_READ_MESSAGES && !raw.key.fromMe) {
                try {
                    await this.socket.readMessages([raw.key]);
                } catch {}
            }

            const isCommandText = body.startsWith(PREFIX) || body.startsWith('+') || body.startsWith('-');

            if (allowed) {
                if (cmd === `${PREFIX}autoreply on` || cmd === '+autoreply on') {
                    setChatAutoReply(this.phone, chat, true);
                    await this.send(chat, `${TAG}\n\n✅ Auto reply enabled.`);
                    return;
                }

                if (cmd === `${PREFIX}autoreply off` || cmd === '+autoreply off') {
                    setChatAutoReply(this.phone, chat, false);
                    await this.send(chat, `${TAG}\n\n⛔ Auto reply disabled.`);
                    return;
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

                if (cmd.startsWith(`${PREFIX}addbot `) || cmd.startsWith('+pair ')) {
                    const rawNum = body.slice(cmd.startsWith(`${PREFIX}addbot `) ? PREFIX.length + 7 : 6).trim();
                    const cleanNum = normalizeStrictPhone(rawNum);
                    if (!cleanNum) {
                        await this.send(chat, `❌ Enter a valid number with country code.`);
                        return;
                    }
                    const statusMsg = await this.hub.addNumber(cleanNum, chat, false);
                    await this.send(chat, statusMsg);
                    return;
                }

                if (cmd.startsWith(`${PREFIX}relink `) || cmd.startsWith('+relink ')) {
                    const rawNum = body.slice(cmd.startsWith(`${PREFIX}relink `) ? PREFIX.length + 8 : 8).trim();
                    const cleanNum = normalizeStrictPhone(rawNum);
                    if (!cleanNum) {
                        await this.send(chat, `❌ Enter a valid number with country code.`);
                        return;
                    }
                    const statusMsg = await this.hub.addNumber(cleanNum, chat, true);
                    await this.send(chat, statusMsg);
                    return;
                }

                if (cmd === `${PREFIX}bots` || cmd === '+bots') {
                    const list = [...this.hub.sessions.values()].filter(s => !s.stopped);
                    if (list.length === 0) {
                        await this.send(chat, `${TAG}\n\nNo numbers added.`);
                        return;
                    }
                    const lines = list.map((s, idx) => `${idx + 1}. +${s.phone} — ${s.online ? 'Connected' : 'Waiting'}`);
                    await this.send(chat, `${TAG}\n\n${lines.join('\n')}`);
                    return;
                }

                if (cmd === `${PREFIX}menu` || cmd === '+menu') {
                    await this.send(chat, MENU_TEXT());
                    return;
                }
                if (cmd === `${PREFIX}targetmenu`) { await this.send(chat, TARGET_MENU()); return; }
                if (cmd === `${PREFIX}grpmenu`) { await this.send(chat, GRP_MENU()); return; }
                if (cmd === `${PREFIX}games`) { await this.send(chat, GAMES_MENU()); return; }

                if (cmd === `${PREFIX}ancstop`) {
                    this.stopAllLoops();
                    await this.send(chat, `${TAG}\n\n🛑 Stopped.`);
                    return;
                }

                if (cmd === `${PREFIX}stoptxt`) {
                    this.stopAllLoops();
                    await this.send(chat, `${TAG}\n\n🛑 Stopped.`);
                    return;
                }

                if (cmd.startsWith('+ai ') || cmd.startsWith(`${PREFIX}ai `)) {
                    const prompt = body.slice(body.startsWith('+ai ') ? 4 : PREFIX.length + 3).trim();
                    if (!prompt) {
                        await this.send(chat, `❌ Usage: ${PREFIX}ai <question>`);
                        return;
                    }
                    const reqEpoch = GLOBAL_EPOCH;
                    const reply = await generateDirectAI(prompt);
                    if (!runtimeState.botPaused && reqEpoch === GLOBAL_EPOCH) {
                        await this.send(chat, reply);
                    }
                    return;
                }

                if (cmd.startsWith(`${PREFIX}txt `)) {
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
            }

            // Per-chat Auto-Reply: varied reactions + matching-language Gemini reply ONLY when ON
            if (
                !runtimeState.botPaused &&
                isChatAutoReplyOn(this.phone, chat) &&
                !raw.key.fromMe &&
                body &&
                !isCommandText
            ) {
                const reqEpoch = GLOBAL_EPOCH;
                try {
                    await this.socket.sendMessage(chat, { react: { text: pickRandomReaction(), key: raw.key } });
                } catch {}

                const replyKey = `${chat}__${sender}`;
                const lastTs = this.lastAutoReplyAt.get(replyKey) || 0;
                if (Date.now() - lastTs >= AUTO_REPLY_COOLDOWN_MS) {
                    this.lastAutoReplyAt.set(replyKey, Date.now());
                    const replyText = await generateMatchingLanguageReply(body);
                    if (
                        replyText &&
                        !runtimeState.botPaused &&
                        reqEpoch === GLOBAL_EPOCH &&
                        isChatAutoReplyOn(this.phone, chat) &&
                        !this.stopped
                    ) {
                        await this.sendQuoted(chat, replyText, raw);
                    }
                }
            }

        } catch {}
    }

    async handle(cmd, payload, notify = true) {
        if (this.stopped || runtimeState.botPaused) return;
        const { chat } = payload;
        const startEpoch = GLOBAL_EPOCH;
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
                            !this.stopped &&
                            !runtimeState.botPaused &&
                            startEpoch === GLOBAL_EPOCH &&
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
                                if (
                                    this.stopped ||
                                    runtimeState.botPaused ||
                                    startEpoch !== GLOBAL_EPOCH ||
                                    !stateObj.active ||
                                    this.nameLoops.get(tid) !== stateObj
                                ) return;
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
                            !this.stopped &&
                            !runtimeState.botPaused &&
                            startEpoch === GLOBAL_EPOCH &&
                            loopObj.active &&
                            this.txtLoop.get(txtKey) === loopObj &&
                            loopObj.epoch === nextEpoch
                        ) {
                            if (!this.socket || !this.online) {
                                await delay(1500);
                                continue;
                            }
                            try {
                                const sent = await this.socket.sendMessage(chat, { text: txt });
                                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
                            } catch {}

                            const step = 250;
                            let elapsed = 0;
                            while (elapsed < safeDelay) {
                                if (
                                    this.stopped ||
                                    runtimeState.botPaused ||
                                    startEpoch !== GLOBAL_EPOCH ||
                                    !loopObj.active ||
                                    this.txtLoop.get(txtKey) !== loopObj
                                ) return;
                                await delay(Math.min(step, safeDelay - elapsed));
                                elapsed += step;
                            }
                        }
                    })();

                    if (notify) await this.send(chat, win(`text loop (${safeDelay}ms)`));
                    break;
                }
            }
        } catch {}
    }

    async send(jid, text) {
        if (this.stopped || !this.socket || !this.online) return;
        try {
            const sent = await this.socket.sendMessage(jid, { text });
            if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
        } catch {}
    }

    async sendQuoted(jid, text, quotedMsg) {
        if (this.stopped || !this.socket || !this.online) return;
        try {
            const sent = await this.socket.sendMessage(jid, { text }, { quoted: quotedMsg });
            if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
        } catch {}
    }
}

// ═════════════════════════════════════════════
//  HUB INITIALIZATION & SILENT PAUSE CONTROL
// ═════════════════════════════════════════════
class Hub {
    constructor() {
        this.sessions = new Map();
        this.counter = 1;
    }

    getPrimarySession() {
        if (CONFIGURED_BOT_NUMBER) {
            const mainSess = [...this.sessions.values()].find(
                s => s.phone === CONFIGURED_BOT_NUMBER && s.online && !s.stopped
            );
            if (mainSess) return mainSess;
        }
        return [...this.sessions.values()].find(s => s.online && !s.stopped) || null;
    }

    async sendSingleCodeMessages(labelMsg, cleanCodeOnly, requesterJid = null) {
        const senderSession = this.getPrimarySession();
        if (!senderSession) return;

        if (PRIMARY_OWNER_JID) {
            await senderSession.send(PRIMARY_OWNER_JID, labelMsg);
            await delay(400);
            await senderSession.send(PRIMARY_OWNER_JID, cleanCodeOnly);
        }

        if (requesterJid && requesterJid !== PRIMARY_OWNER_JID) {
            await senderSession.send(requesterJid, labelMsg);
            await delay(400);
            await senderSession.send(requesterJid, cleanCodeOnly);
        }
    }

    loadSavedNumbers() {
        const saved = readJson(PATH_BOTS, { numbers: [] });
        const list = Array.isArray(saved.numbers) ? saved.numbers : [];
        const cleanList = list.map(normalizeStrictPhone).filter(Boolean);
        if (CONFIGURED_BOT_NUMBER && !cleanList.includes(CONFIGURED_BOT_NUMBER)) {
            cleanList.unshift(CONFIGURED_BOT_NUMBER);
        }
        return [...new Set(cleanList)];
    }

    saveNumbers(numbers) {
        writeJson(PATH_BOTS, { numbers: [...new Set(numbers)] });
    }

    async addNumber(phone, requesterJid = null, forceFresh = false) {
        const clean = normalizeStrictPhone(phone);
        if (!clean) return `❌ Invalid number.`;

        const existingEntries = [...this.sessions.entries()].filter(([, s]) => s.phone === clean && !s.stopped);
        if (existingEntries.length > 0) {
            if (!forceFresh) {
                return `⚠️ +${clean} already exists. Use ${PREFIX}relink ${clean} for a new code.`;
            }
            for (const [key, oldSess] of existingEntries) {
                await oldSess.destroySession();
                this.sessions.delete(key);
            }
        }

        const id = String(this.counter++);
        const session = new Session(id, clean, this, requesterJid, forceFresh);
        this.sessions.set(id, session);

        const allNums = [...this.sessions.values()].filter(x => !x.stopped && x.phone).map(x => x.phone);
        this.saveNumbers(allNums);

        await session.init();
        return `${TAG}\n\nPairing requested for +${clean}.`;
    }

    pauseAllBotsWithoutLogout() {
        GLOBAL_EPOCH += 1;
        runtimeState.botPaused = true;
        runtimeState.autoReplyChats = {};
        saveRuntimeState();

        for (const sess of this.sessions.values()) {
            sess.stopAllLoops();
        }
    }

    resumeAllBots() {
        GLOBAL_EPOCH += 1;
        runtimeState.botPaused = false;
        saveRuntimeState();
    }

    async boot() {
        const numbers = this.loadSavedNumbers();
        if (numbers.length === 0) return;
        for (const num of numbers) {
            const id = String(this.counter++);
            const session = new Session(id, num, this, null, false);
            this.sessions.set(id, session);
            await session.init();
            await delay(1500);
        }
    }
}

console.log(`
◈  𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧 v10  ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary Number    : ${CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : 'NOT SET'}
  Port              : ${PORT}
  Safe Delay Floor  : ${MIN_SAFE_DELAY_MS}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const hub = new Hub();

app.listen(PORT, async () => {
    console.log(`[SERVER] Listening on port ${PORT}`);
    startKeepAlive();
    await hub.boot();
});
