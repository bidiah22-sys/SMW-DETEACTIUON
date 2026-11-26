// ╔══════════════════════════════════════════════════════════════╗
// ║        𝗦𝗠𝗪 𝗜𝗢𝗦 — RENDER LOGS + WHATSAPP PAIRING ENGINE     ║
// ║     !addbot <num> -> Render Logs Code -> Sends Same Code WA  ║
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

const MIN_SAFE_DELAY_MS   = 500;
const DEFAULT_LOOP_MS     = 1200;
const ANTI_BAN_JITTER_MS  = 120;
const PAIR_LOGIN_WATCH_MS = 45000;

const AUTO_READ_MESSAGES     = true;
const AUTO_REPLY_COOLDOWN_MS = 600;
const MAX_WARNS_BEFORE_KICK  = 3;
const MAX_RECONNECT_ATTEMPTS = 12;

const PATH_AUTH      = (phone) => `./sessions/smw_session_${phone}`;
const PATH_USERS     = './store/users.json';
const PATH_TIMING    = './store/timing.json';
const PATH_PREFIX    = './store/prefix.json';
const PATH_BOTS      = './store/bots.json';
const PATH_STATE     = './store/state.json';
const PATH_GC        = './store/gc_settings.json';
// =========================================================================

// =========================================================================
// 2. STORAGE & PHONE NORMALIZATION
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

function normalizeStrictPhone(rawInput) {
    if (!rawInput) return '';
    let digits = String(rawInput).trim().replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 10) {
        digits = `91${digits}`;
    } else if (digits.length > 10 && digits.startsWith('0')) {
        digits = digits.replace(/^0+/, '');
    }
    if (!/^[1-9]\d{6,14}$/.test(digits)) return '';
    return digits;
}

const CONFIGURED_BOT_NUMBER = normalizeStrictPhone(BOT_NUMBER);
const PRIMARY_OWNER_JID = CONFIGURED_BOT_NUMBER ? `${CONFIGURED_BOT_NUMBER}@s.whatsapp.net` : null;
const ADMIN_NUMBERS = CONFIGURED_BOT_NUMBER ? [PRIMARY_OWNER_JID] : [];

let userData   = readJson(PATH_USERS, { owners: [], subs: {} });
let timingMap  = readJson(PATH_TIMING, {
    anc1: DEFAULT_LOOP_MS, anc2: DEFAULT_LOOP_MS, anc3: DEFAULT_LOOP_MS,
    anc4: DEFAULT_LOOP_MS, anc5: DEFAULT_LOOP_MS, anc6: DEFAULT_LOOP_MS, anc7: DEFAULT_LOOP_MS
});
let prefixData = readJson(PATH_PREFIX, { prefix: '!' });
let PREFIX     = prefixData.prefix || '!';
let gcSettings = readJson(PATH_GC, { antiLink: {}, welcome: {}, warns: {} });

if (!gcSettings.antiLink) gcSettings.antiLink = {};
if (!gcSettings.welcome) gcSettings.welcome = {};
if (!gcSettings.warns) gcSettings.warns = {};

let GLOBAL_EPOCH = 1;
let cachedBaileysVersion = null;
const BOOT_TS = Date.now();

let runtimeState = readJson(PATH_STATE, {
    botPaused: true,
    autoReplyChats: {}
});
runtimeState.botPaused = true;
if (!runtimeState.autoReplyChats || typeof runtimeState.autoReplyChats !== 'object') {
    runtimeState.autoReplyChats = {};
}

const saveUsers = () => writeJson(PATH_USERS, userData);
const saveRuntimeState = () => writeJson(PATH_STATE, runtimeState);
const saveGcSettings = () => writeJson(PATH_GC, gcSettings);

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    const jitter = Math.floor(Math.random() * ANTI_BAN_JITTER_MS);
    return Math.max(MIN_SAFE_DELAY_MS, parsed) + jitter;
}

function isChatAutoReplyOn(sessionPhone, chatJid) {
    if (runtimeState.botPaused) return false;
    return Boolean(runtimeState.autoReplyChats[`${sessionPhone}::${String(chatJid || '').trim()}`]);
}

function setChatAutoReply(sessionPhone, chatJid, enabled) {
    const key = `${sessionPhone}::${String(chatJid || '').trim()}`;
    if (enabled) runtimeState.autoReplyChats[key] = true;
    else delete runtimeState.autoReplyChats[key];
    saveRuntimeState();
}

const isOwner = (j, sessionSelf = null, sessionLid = null) => {
    if (!j) return false;
    const cleanJid = String(j).split('@')[0].split(':')[0];
    if (!cleanJid) return false;
    if (sessionSelf && String(sessionSelf).split('@')[0].split(':')[0] === cleanJid) return true;
    if (sessionLid && String(sessionLid).split('@')[0].split(':')[0] === cleanJid) return true;
    if (CONFIGURED_BOT_NUMBER && cleanJid === CONFIGURED_BOT_NUMBER) return true;
    return userData.owners.some(o => String(o).split('@')[0].split(':')[0] === cleanJid) ||
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
// =========================================================================

// =========================================================================
// 3. EMOJIS, STYLING & GEMINI AI
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

const pairingCodeCard = (title, cleanNum, formattedCode) => {
    const rawCode = String(formattedCode || '').replace(/[^A-Z0-9]/gi, '');
    return boxCard(title, [
        `*${g('NUMBER')}* : +${cleanNum}`,
        `*${g('CODE')}*   : \`${formattedCode}\``,
        `*${g('PLAIN')}*  : \`${rawCode}\``,
        `*${g('STEPS')}*  : ${g('WHATSAPP > LINKED DEVICES')}`,
        `*${g('LOGS')}*   : ${g('ALSO IN RENDER LOGS')}`
    ]);
};

const GRAND_START_BANNER = () => boxCard(`⚡ 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗦𝗧𝗔𝗥𝗧𝗘𝗗 ⚡`, [
    `*${g('STATUS')}*      : 🟢 ${g('LIVE & FULL POWER')}`,
    `*${g('AUTO REPLY')}*  : 🤖 ${g('CHAT SPECIFIC READY')}`,
    `*${g('LOOP ENGINE')}* : 🔥 ${g('ANC1-7 & TXT LIVE')}`,
    `*${g('AI CORE')}*     : 🧠 ${g('GEMINI ACTIVE')}`
]);

const KILL_ALL_BANNER = () => boxCard(`🛑 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗞𝗜𝗟𝗟𝗘𝗗 🛑`, [
    `*${g('LOOPS & REPLY')}* : ⏸️ ${g('STOPPED')}`,
    `*${g('SESSION')}*       : 🔗 ${g('STILL LIVE & SAFE')}`,
    `*${g('START AGAIN')}*   : ▶️ ${g('USE')} ${PREFIX}start`
]);

const AUTO_REPLY_BANNER = (enabled) => boxCard(
    enabled ? `🤖 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗡 🤖` : `⛔ 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗙𝗙 ⛔`,
    [
        `*${g('THIS CHAT')}* : ${enabled ? `🟢 ${g('ACTIVE')}` : `🔴 ${g('DISABLED')}`}`,
        `*${g('REACTIONS')}* : ⚡ ${g('RANDOM EMOJI POOL')}`,
        `*${g('AI ENGINE')}* : 🧠 ${g('GEMINI CHAT REPLY')}`
    ]
);

const BOTS_LIST_BANNER = (list) => boxCard(
    `📱 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧𝗦 (${list.length}) 📱`,
    list.map((s, idx) => `*${idx + 1}.* +${s.phone} ➔ ${s.online ? `🟢 ${g('ONLINE')}` : s.pairingBusy ? `⚡ ${g('PAIRING')}` : `🟡 ${g('STANDBY')}`}`)
);

const MENU_TEXT = () => boxCard(`🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 🚩`, [
    `*${g('PREFIX')}*     : ${PREFIX}  |  *${g('SAFE')}* : ${MIN_SAFE_DELAY_MS}ms`,
    `▶️ ${PREFIX}start / 🛑 ${PREFIX}killall ➔ ${g('control engine')}`,
    `⚡ ${PREFIX}ping / 📊 ${PREFIX}status ➔ ${g('live telemetry')}`,
    `🤖 ${PREFIX}autoreply on / off / status ➔ ${g('chat reply')}`,
    `🎯 ${PREFIX}targetmenu ➔ ${g('name change & text loops')}`,
    `🧠 ${PREFIX}ai [question] ➔ ${g('gemini ai')}`,
    `📱 ${PREFIX}addbot / ${PREFIX}relink / ${PREFIX}unpair / ${PREFIX}bots`,
    `👥 ${PREFIX}grpmenu / 🎮 ${PREFIX}games ➔ ${g('tools')}`
]);

const TARGET_MENU = () => boxCard(`🎯 𝗧𝗔𝗥𝗚𝗘𝗧 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 🔥`, [
    `*${g('NAME LOOPS')}* : ${PREFIX}anc1-7 [text] [ms]`,
    `*${g('STOP NAME')}*  : ${PREFIX}ancstop`,
    `*${g('TEXT LOOP')}*  : ${PREFIX}txt [text] [ms]`,
    `*${g('STOP TEXT')}*  : ${PREFIX}stoptxt`
]);

const GRP_MENU = () => boxCard(`👥 𝗚𝗥𝗢𝗨𝗣 𝗣𝗢𝗪𝗘𝗥 🛡️`, [
    `*${g('LOCK / UNLOCK')}* : ${PREFIX}lockgc / ${PREFIX}unlockgc`,
    `*${g('KICK / ADD')}*    : ${PREFIX}kick @user / ${PREFIX}add [num]`,
    `*${g('WARNS')}*         : ${PREFIX}warn @user / ${PREFIX}unwarn @user`,
    `*${g('ROLES')}*         : ${PREFIX}promote / ${PREFIX}demote`,
    `*${g('GROUP INFO')}*    : ${PREFIX}setname / ${PREFIX}setdesc / ${PREFIX}groupinfo / ${PREFIX}admins`,
    `*${g('GUARDS')}*        : ${PREFIX}antilink on/off / ${PREFIX}welcome on/off / ${PREFIX}tagall`
]);

const GAMES_MENU = () => boxCard(`🎮 𝗚𝗔𝗠𝗘𝗦 & 𝗧𝗢𝗢𝗟𝗦 🎲`, [
    `*${g('COIN')}* : ${PREFIX}flip`,
    `*${g('DICE')}* : ${PREFIX}roll`,
    `*${g('RPS')}*  : ${PREFIX}rps [rock/paper/scissors]`
]);

const loopStartLayout = (title, detail) => boxCard(`🔥 ${title.toUpperCase()} ${g('STARTED')} 🔥`, [
    `*${g('ENGINE')}* : ⚡ ${g('RUNNING LIVE')}`,
    `*${g('CONFIG')}* : ${detail}`,
    `*${g('STOP')}*   : 🛑 ${PREFIX}ancstop / ${PREFIX}stoptxt / ${PREFIX}killall`
]);

const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyBd3S8mbO_EYpERC_LMfkxMzTs0LLVZoeg";
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const recentRepliesSet = new Set();

function withTimeout(promise, ms = 9000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Gemini timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callGeminiWithFallback(promptText, temperature = 0.92) {
    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature } });
            const res = await withTimeout(model.generateContent(promptText), 9000);
            const text = res?.response?.text()?.trim();
            if (text && !recentRepliesSet.has(text)) {
                recentRepliesSet.add(text);
                if (recentRepliesSet.size > 80) {
                    const first = recentRepliesSet.values().next().value;
                    recentRepliesSet.delete(first);
                }
                return text;
            }
            if (text) return text;
        } catch {}
    }
    return null;
}

function buildDynamicFallbackReply(userText) {
    const clean = String(userText || '').trim().toLowerCase();
    const hasHindi = /[\u0900-\u097F]/.test(userText || '');
    if (/^(hi+|hello+|hey+|yo+|sup)\b/i.test(clean)) {
        return hasHindi ? "हाँ भाई, बोलो क्या चल रहा है?" : "Haan bhai, bolo kya chal raha hai?";
    }
    if (/(kya haal|kaise ho|kaisa hai|kya kar rahe|kya kr rhe)/i.test(clean)) {
        return hasHindi ? "सब बढ़िया है भाई, तुम बताओ कैसे हो?" : "Sab badhiya hai bhai, tum batao kaise ho?";
    }
    return hasHindi ? "हाँ भाई, समझ गया — आगे क्या करना है बताओ?" : "Haan bhai, samajh gaya — aage kya karna hai batao?";
}

async function generateMatchingLanguageReply(userText) {
    const uniqueTag = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const prompt =
        `Talk like a normal, natural human friend on WhatsApp. ` +
        `Reply directly to what the user said in the exact same language and style (Hindi, Hinglish, or English). ` +
        `Keep it short (1-2 lines), casual, and natural. [ctx:${uniqueTag}]\n\nUser: ${userText}`;
    const reply = await callGeminiWithFallback(prompt, 0.95);
    return (reply || buildDynamicFallbackReply(userText)).slice(0, 500);
}

async function generateDirectAI(userPrompt) {
    const uniqueTag = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const prompt =
        `Answer the user's question directly, clearly, and naturally in the same language as the question. [ctx:${uniqueTag}]\n\nQuestion: ${userPrompt}`;
    const reply = await callGeminiWithFallback(prompt, 0.88);
    return (reply || buildDynamicFallbackReply(userPrompt)).slice(0, 1600);
}
// =========================================================================

// =========================================================================
// 4. MESSAGE & GROUP HELPERS
// =========================================================================
const SET_KEYS = {
    anc1: 'faces', anc2: 'hearts', anc3: 'hands', anc4: 'flowers',
    anc5: 'sky', anc6: 'animals', anc7: 'fruits'
};

function extractTextFromMessage(rawMsg) {
    const content = extractMessageContent(rawMsg) || rawMsg;
    if (!content) return '';
    return (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        content.buttonsResponseMessage?.selectedDisplayText ||
        content.listResponseMessage?.title ||
        ''
    ).trim();
}

function getTargetUsers(raw, content, argsText) {
    const mentioned = content?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned;
    const participant = content?.extendedTextMessage?.contextInfo?.participant;
    if (participant) return [participant];
    const num = normalizeStrictPhone(argsText);
    if (num) return [`${num}@s.whatsapp.net`];
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
// 5. SESSION & PAIRING WORKER (RENDER LOGS -> WHATSAPP CHAT)
// =========================================================================
class Session {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false, logOtpOnce = false, isPrimary = false) {
        this.id = id;
        this.phone = normalizeStrictPhone(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.logOtpOnce = logOtpOnce;
        this.isPrimary = isPrimary;

        this.socket = null;
        this.online = false;
        this.self = null;
        this.selfLid = null;
        this.otpPrinted = false;
        this.lastRealCode = null;

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
        if (!keepAuth) {
            removeDirSafe(this.getAuthDir());
        }
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
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log(`[RECONNECT MAX] +${this.phone} (${reasonLabel})`);
            return;
        }
        this.reconnectAttempts += 1;
        const backoffMs = customDelayMs ?? Math.min(12000, 1200 * Math.pow(1.4, this.reconnectAttempts - 1));
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
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                await delay(1000 * attempt);
                if (this.stopped || this.socket !== sock) {
                    throw new Error('Socket replaced or stopped during pairing');
                }
                if (!sock || typeof sock.requestPairingCode !== 'function') {
                    throw new Error('requestPairingCode not available on socket');
                }
                console.log(`[RENDER ${sourceTag} ATTEMPT ${attempt}] +${this.phone} requesting pairing code...`);
                const rawCode = await sock.requestPairingCode(this.phone);
                const clean = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
                if (clean.length >= 6) {
                    const formatted = clean.match(/.{1,4}/g)?.join('-') || clean;
                    this.lastRealCode = formatted;
                    console.log(`\n╔══════════════════════════════════════════════════╗`);
                    console.log(`║ [RENDER LOGS PAIRING CODE] +${this.phone} => ${formatted}`);
                    console.log(`╚══════════════════════════════════════════════════╝\n`);
                    return formatted;
                }
                lastErr = new Error('Socket returned empty/short code');
            } catch (err) {
                lastErr = err;
                console.log(`[RENDER ${sourceTag} ERR ${attempt}] +${this.phone}:`, err?.message || err);
            }
        }
        throw lastErr || new Error('Failed to fetch real pairing code from WhatsApp socket');
    }

    armPairingWatchdog() {
        if (this.pairingWatchTimer) clearTimeout(this.pairingWatchTimer);
        this.pairingWatchTimer = setTimeout(() => {
            this.pairingWatchTimer = null;
            if (this.stopped || this.online) return;
            if (this.pairingBusy && !this.sessionReady) {
                this.pairingBusy = false;
                this.connecting = false;
                console.log(`[PAIR WATCHDOG] +${this.phone} reconnecting socket`);
                this.scheduleReconnect('pairing_watchdog', 900);
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
                console.log(`[RENDER SOCKET CONNECTING] +${this.phone}`);
            } else if (connection === "open") {
                if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }
                this.online = true;
                this.connecting = false;
                this.pairingBusy = false;
                this.sessionReady = true;
                this.reconnectAttempts = 0;
                if (sock.user?.id) this.self = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                if (sock.user?.lid) this.selfLid = sock.user.lid.split(':')[0] + '@lid';
                console.log(`[RENDER ONLINE] +${this.phone} linked & ready`);
                if (this.requesterJid) {
                    await this.sendInstant(this.requesterJid, boxCard(`✅ 𝗕𝗢𝗧 𝗟𝗜𝗡𝗞𝗘𝗗 ✅`, [
                        `*${g('NUMBER')}* : +${this.phone}`,
                        `*${g('STATUS')}* : 🟢 ${g('CONNECTED & READY')}`
                    ]));
                }
            } else if (connection === "close") {
                this.online = false;
                this.connecting = false;
                this.sessionReady = false;
                if (this.stopped) return;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errMsg = lastDisconnect?.error?.message || '';
                console.log(`[RENDER CONN CLOSE] +${this.phone} code=${statusCode || 'unknown'} ${errMsg}`);

                if (statusCode === DisconnectReason.loggedOut) {
                    if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }
                    this.pairingBusy = false;
                    removeDirSafe(authDir);
                    return;
                }

                this.pairingBusy = false;
                this.scheduleReconnect(statusCode === DisconnectReason.restartRequired ? 'restartRequired' : 'close', 700);
            }
        });

        sockSafeBind(this, sock);
        return { sock, state };
    }

    async pairFreshInChat() {
        if (!this.phone) throw new Error('Invalid phone number');
        if (this.pairingBusy) throw new Error('Pairing already in progress');

        console.log(`[RENDER ADDBOT SETUP] +${this.phone} -> running fresh socket & printing code in Render logs...`);

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
        this.lastRealCode = null;
        this.armPairingWatchdog();

        try {
            const { sock } = await this.createSocket(authDir);
            const realCode = await this.requestRealSocketCode(sock, 'ADDBOT');
            return realCode;
        } catch (err) {
            if (this.pairingWatchTimer) { clearTimeout(this.pairingWatchTimer); this.pairingWatchTimer = null; }
            this.pairingBusy = false;
            this.connecting = false;
            console.log(`[RENDER ADDBOT FAILED] +${this.phone}:`, err?.message || err);
            throw err;
        }
    }

    async tryLogPrimaryCodeOnce(sock) {
        if (!this.logOtpOnce || this.otpPrinted || this.pairingBusy || this.stopped || this.online) return;
        if (sock?.authState?.creds?.registered) return;

        this.otpPrinted = true;
        this.pairingBusy = true;
        console.log(`[RENDER PRIMARY BOOT] +${this.phone} -> printing pairing code in Render logs...`);
        try {
            await this.requestRealSocketCode(sock, 'BOOT');
        } catch (err) {
            console.log(`[RENDER PRIMARY FAILED] +${this.phone}:`, err?.message || err);
        } finally {
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
        if (this.stopped || runtimeState.botPaused || !this.online || !this.socket) return;
        const groupJid = ev?.id;
        if (!groupJid || !groupJid.endsWith('@g.us')) return;
        if (ev.action === 'add' && gcSettings.welcome?.[groupJid]) {
            const participants = ev.participants || [];
            const mentions = participants.filter(Boolean);
            const names = mentions.map(j => `@${j.split('@')[0]}`).join(', ');
            if (names) {
                await this.sendInstant(groupJid, boxCard(`👋 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 👋`, [`*${g('MEMBERS')}* : ${names}`]), mentions);
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
                const body = extractTextFromMessage(raw.message);
                if (!body) continue;

                const isGroup = chat.endsWith('@g.us');
                const sender = raw.key.fromMe
                    ? (this.self || this.selfLid || `${this.phone}@s.whatsapp.net`)
                    : (raw.key.participant || raw.participant || chat);
                const cmd = body.toLowerCase().trim();

                const isDM = !isGroup;
                const isFromMe = Boolean(raw.key.fromMe);
                const isOwn = isFromMe || isOwner(sender, this.self, this.selfLid);
                const allowed = isFromMe || isOwn || isSub(sender, chat);

                if (allowed && (cmd === `${PREFIX}start` || cmd === '+start')) {
                    console.log(`[RENDER CMD] ${cmd} from ${sender} in ${chat}`);
                    this.hub.resumeAllBots();
                    await this.sendInstant(chat, GRAND_START_BANNER());
                    continue;
                }

                if (allowed && (cmd === `${PREFIX}killall` || cmd === '-all')) {
                    console.log(`[RENDER CMD] ${cmd} from ${sender} in ${chat}`);
                    this.hub.pauseAllBotsKeepSessionAlive();
                    await this.sendInstant(chat, KILL_ALL_BANNER());
                    continue;
                }

                if (runtimeState.botPaused) continue;

                if (AUTO_READ_MESSAGES && !isFromMe) {
                    this.socket?.readMessages([raw.key]).catch(() => {});
                }

                if (isGroup && !isOwn && gcSettings.antiLink?.[chat] && hasLink(body)) {
                    try {
                        await this.socket.sendMessage(chat, { delete: raw.key });
                        await this.sendInstant(chat, boxCard(`🚫 𝗔𝗡𝗧𝗜 𝗟𝗜𝗡𝗞 🛡️`, [
                            `*${g('USER')}*   : @${sender.split('@')[0]}`,
                            `*${g('ACTION')}* : ${g('LINK DELETED')}`
                        ]), [sender]);
                    } catch {}
                    continue;
                }

                const isCommandText = body.startsWith(PREFIX) || body.startsWith('+') || body.startsWith('-');

                if (allowed && isCommandText) {
                    if (cmd === `${PREFIX}ping` || cmd === '+ping') {
                        const activeCnt = [...this.hub.sessions.values()].filter(s => !s.stopped && s.online).length;
                        await this.sendInstant(chat, boxCard(`⚡ 𝗦𝗠𝗪 𝗣𝗜𝗡𝗚 ⚡`, [
                            `*${g('ONLINE')}* : ${activeCnt} ${g('SESSIONS')}`,
                            `*${g('UPTIME')}* : ${Math.floor((Date.now() - BOOT_TS) / 1000)}s`
                        ]));
                        continue;
                    }

                    if (cmd === `${PREFIX}status` || cmd === '+status') {
                        const total = [...this.hub.sessions.values()].filter(s => !s.stopped).length;
                        const online = [...this.hub.sessions.values()].filter(s => !s.stopped && s.online).length;
                        const loops = this.nameLoops.size + this.txtLoop.size;
                        await this.sendInstant(chat, boxCard(`📊 𝗘𝗡𝗚𝗜𝗡𝗘 𝗦𝗧𝗔𝗧𝗨𝗦 📊`, [
                            `*${g('ENGINE')}* : ${runtimeState.botPaused ? `⏸️ ${g('PAUSED')}` : `🟢 ${g('ACTIVE')}`}`,
                            `*${g('BOTS')}*   : ${online}/${total} ${g('ONLINE')}`,
                            `*${g('LOOPS')}*  : ${loops} ${g('RUNNING')}`
                        ]));
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply status`) {
                        await this.sendInstant(chat, boxCard(`🤖 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗦𝗧𝗔𝗧𝗨𝗦 🤖`, [
                            `*${g('THIS CHAT')}* : ${isChatAutoReplyOn(this.phone, chat) ? `🟢 ${g('ON')}` : `🔴 ${g('OFF')}`}`
                        ]));
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply on` || cmd === '+autoreply on') {
                        setChatAutoReply(this.phone, chat, true);
                        await this.sendInstant(chat, AUTO_REPLY_BANNER(true));
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply off` || cmd === '+autoreply off') {
                        setChatAutoReply(this.phone, chat, false);
                        await this.sendInstant(chat, AUTO_REPLY_BANNER(false));
                        continue;
                    }

                    if (isDM && (cmd === `${PREFIX}admin` || cmd === '+admin')) {
                        if (!userData.owners.length) {
                            grantOwner(sender);
                            await this.sendInstant(chat, boxCard(`👑 𝗢𝗪𝗡𝗘𝗥 𝗦𝗘𝗧 👑`, [`*${g('STATUS')}* : ${g('you are now the owner')}`]));
                        } else if (isOwn) {
                            await this.sendInstant(chat, boxCard(`⚠️ 𝗢𝗪𝗡𝗘𝗥 𝗖𝗛𝗘𝗖𝗞 ⚠️`, [`*${g('STATUS')}* : ${g('you already own this bot')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unpair `)) {
                        const cleanNum = normalizeStrictPhone(body.slice(PREFIX.length + 7).trim());
                        if (!cleanNum) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ❌`, [`*${g('FORMAT')}* : ${PREFIX}unpair +9647882064284`]));
                            continue;
                        }
                        const removed = await this.hub.unpairNumber(cleanNum);
                        await this.sendInstant(chat, boxCard(`🗑️ 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗨𝗡𝗣𝗔𝗜𝗥𝗘𝗗 🗑️`, [
                            `*${g('NUMBER')}* : +${cleanNum}`,
                            `*${g('RESULT')}* : ${removed ? `✅ ${g('REMOVED')}` : `⚠️ ${g('NOT FOUND')}`}`
                        ]));
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}addbot `) || cmd.startsWith('+pair ') || cmd.startsWith(`${PREFIX}relink `) || cmd.startsWith('+relink ')) {
                        const rawNum = body.replace(new RegExp(`^(\\${PREFIX}(addbot|relink)|\\+(pair|relink))\\s+`, 'i'), '').trim();
                        const cleanNum = normalizeStrictPhone(rawNum);
                        console.log(`[RENDER ADDBOT CMD] raw="${rawNum}" clean="${cleanNum || 'INVALID'}" chat=${chat}`);
                        if (!cleanNum) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ❌`, [`*${g('FORMAT')}* : ${PREFIX}addbot +9647882064284`]));
                            continue;
                        }
                        try {
                            const realCode = await this.hub.addNumberInChat(cleanNum, chat);
                            await this.sendInstant(chat, pairingCodeCard(`🔑 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘 🔑`, cleanNum, realCode));
                        } catch (err) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗔𝗜𝗥 𝗘𝗥𝗥𝗢𝗥 ❌`, [
                                `*${g('NUMBER')}* : +${cleanNum}`,
                                `*${g('REASON')}* : ${err.message}`
                            ]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}bots` || cmd === '+bots') {
                        const list = [...this.hub.sessions.values()].filter(s => !s.stopped);
                        await this.sendInstant(chat, list.length
                            ? BOTS_LIST_BANNER(list)
                            : boxCard(`📱 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧𝗦 📱`, [`*${g('COUNT')}* : 0 ${g('NUMBERS ADDED')}`])
                        );
                        continue;
                    }

                    if (cmd === `${PREFIX}menu` || cmd === '+menu') { await this.sendInstant(chat, MENU_TEXT()); continue; }
                    if (cmd === `${PREFIX}targetmenu`) { await this.sendInstant(chat, TARGET_MENU()); continue; }
                    if (cmd === `${PREFIX}grpmenu`) { await this.sendInstant(chat, GRP_MENU()); continue; }
                    if (cmd === `${PREFIX}games`) { await this.sendInstant(chat, GAMES_MENU()); continue; }

                    if (cmd === `${PREFIX}lockgc` || cmd === `${PREFIX}unlockgc`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            await this.socket.groupSettingUpdate(chat, cmd === `${PREFIX}lockgc` ? 'announcement' : 'not_announcement');
                            await this.sendInstant(chat, boxCard(cmd === `${PREFIX}lockgc` ? `🔒 𝗚𝗥𝗢𝗨𝗣 𝗟𝗢𝗖𝗞𝗘𝗗 🔒` : `🔓 𝗚𝗥𝗢𝗨𝗣 𝗨𝗡𝗟𝗢𝗖𝗞𝗘𝗗 🔓`, [`*${g('STATUS')}* : ${g('UPDATED')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}promote`) || cmd.startsWith(`${PREFIX}demote`) || cmd.startsWith(`${PREFIX}mute`) || cmd.startsWith(`${PREFIX}kick`) || cmd.startsWith(`${PREFIX}remove`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const argPart = body.replace(new RegExp(`^\\${PREFIX}(promote|demote|mute|kick|remove)\\s*`, 'i'), '').trim();
                        const targets = getTargetUsers(raw, content, argPart);
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        try {
                            const action = cmd.startsWith(`${PREFIX}promote`) ? 'promote' : (cmd.startsWith(`${PREFIX}demote`) ? 'demote' : 'remove');
                            await this.socket.groupParticipantsUpdate(chat, targets, action);
                            await this.sendInstant(chat, boxCard(`✅ 𝗔𝗖𝗧𝗜𝗢𝗡 𝗗𝗢𝗡𝗘 ✅`, [`*${g('ACTION')}* : ${g(action)}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unmute`) || cmd.startsWith(`${PREFIX}add `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const rawTarget = body.replace(new RegExp(`^\\${PREFIX}(unmute|add)\\s*`, 'i'), '').trim();
                        const targets = getTargetUsers(raw, content, rawTarget);
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗡𝗨𝗠𝗕𝗘𝗥 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}add +919876543210`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'add');
                            await this.sendInstant(chat, boxCard(`➕ 𝗔𝗗𝗗𝗘𝗗 𝗕𝗔𝗖𝗞 ➕`, [`*${g('STATUS')}* : ${g('ADDED TO GC')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗔𝗗𝗗 𝗙𝗔𝗜𝗟𝗘𝗗 ❌`, [`*${g('REASON')}* : ${g('PRIVACY OR ADMIN LIMIT')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}warn`) || cmd.startsWith(`${PREFIX}unwarn`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const isUnwarn = cmd.startsWith(`${PREFIX}unwarn`);
                        const argPart = body.replace(new RegExp(`^\\${PREFIX}(unwarn|warn)\\s*`, 'i'), '').trim();
                        const targets = getTargetUsers(raw, content, argPart);
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        const target = targets[0];
                        gcSettings.warns[chat] = gcSettings.warns[chat] || {};
                        if (isUnwarn) {
                            delete gcSettings.warns[chat][target];
                            saveGcSettings();
                            await this.sendInstant(chat, boxCard(`✅ 𝗪𝗔𝗥𝗡𝗦 𝗖𝗟𝗘𝗔𝗥𝗘𝗗 ✅`, [`*${g('USER')}* : @${target.split('@')[0]}`]), [target]);
                        } else {
                            const nextCount = (gcSettings.warns[chat][target] || 0) + 1;
                            gcSettings.warns[chat][target] = nextCount;
                            saveGcSettings();
                            if (nextCount >= MAX_WARNS_BEFORE_KICK) {
                                gcSettings.warns[chat][target] = 0;
                                saveGcSettings();
                                try {
                                    await this.socket.groupParticipantsUpdate(chat, [target], 'remove');
                                    await this.sendInstant(chat, boxCard(`👢 𝗠𝗔𝗫 𝗪𝗔𝗥𝗡 𝗞𝗜𝗖𝗞 👢`, [`*${g('USER')}* : @${target.split('@')[0]}`]), [target]);
                                } catch {
                                    await this.sendInstant(chat, boxCard(`❌ 𝗞𝗜𝗖𝗞 𝗙𝗔𝗜𝗟𝗘𝗗 ❌`, [`*${g('USER')}* : @${target.split('@')[0]}`]), [target]);
                                }
                            } else {
                                await this.sendInstant(chat, boxCard(`⚠️ 𝗪𝗔𝗥𝗡𝗜𝗡𝗚 ⚠️`, [`*${g('USER')}* : @${target.split('@')[0]}`, `*${g('WARNS')}* : ${nextCount}/${MAX_WARNS_BEFORE_KICK}`]), [target]);
                            }
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}setname `) || cmd.startsWith(`${PREFIX}setdesc `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const isName = cmd.startsWith(`${PREFIX}setname `);
                        const val = body.slice(PREFIX.length + 8).trim();
                        if (!val) continue;
                        try {
                            if (isName) await this.socket.groupUpdateSubject(chat, val);
                            else await this.socket.groupUpdateDescription(chat, val);
                            await this.sendInstant(chat, boxCard(`✅ 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 ✅`, [`*${g('STATUS')}* : ${g('SAVED')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}antilink on` || cmd === `${PREFIX}antilink off` || cmd === `${PREFIX}welcome on` || cmd === `${PREFIX}welcome off`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const enabled = cmd.endsWith(' on');
                        if (cmd.startsWith(`${PREFIX}antilink`)) gcSettings.antiLink[chat] = enabled;
                        else gcSettings.welcome[chat] = enabled;
                        saveGcSettings();
                        await this.sendInstant(chat, boxCard(`🛡️ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 🛡️`, [`*${g('MODE')}* : ${enabled ? `🟢 ${g('ENABLED')}` : `🔴 ${g('DISABLED')}`}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}groupinfo` || cmd === `${PREFIX}admins`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const adminList = (meta.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin');
                            const mentions = adminList.map(p => p.id);
                            if (cmd === `${PREFIX}admins`) {
                                await this.sendInstant(chat, boxCard(`👑 𝗔𝗗𝗠𝗜𝗡𝗦 (${mentions.length}) 👑`, mentions.length ? mentions.map(j => `@${j.split('@')[0]}`) : [g('NONE')]), mentions);
                            } else {
                                await this.sendInstant(chat, boxCard(`📌 𝗚𝗥𝗢𝗨𝗣 𝗜𝗡𝗙𝗢 📌`, [
                                    `*${g('NAME')}*    : ${meta.subject}`,
                                    `*${g('MEMBERS')}* : ${meta.participants?.length || 0}`,
                                    `*${g('ADMINS')}*  : ${mentions.length}`
                                ]), mentions);
                            }
                        } catch {}
                        continue;
                    }

                    if (cmd === `${PREFIX}tagall` || cmd.startsWith(`${PREFIX}tagall `) || cmd === `${PREFIX}everyone` || cmd.startsWith(`${PREFIX}everyone `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const members = (meta.participants || []).map(p => p.id).filter(Boolean);
                            const note = body.replace(new RegExp(`^\\${PREFIX}(tagall|everyone)\\s*`, 'i'), '').trim() || 'Attention!';
                            for (let i = 0; i < members.length; i += 20) {
                                if (runtimeState.botPaused || this.stopped) break;
                                const slice = members.slice(i, i + 20);
                                await this.sendInstant(chat, boxCard(`📣 𝗧𝗔𝗚 𝗔𝗟𝗟 📣`, [`*${g('NOTE')}* : ${note}`, slice.map(j => `@${j.split('@')[0]}`).join(' ')]), slice);
                                if (i + 20 < members.length) await delay(800);
                            }
                        } catch {}
                        continue;
                    }

                    if (cmd === `${PREFIX}flip`) {
                        await this.sendInstant(chat, boxCard(`🪙 𝗖𝗢𝗜𝗡 𝗙𝗟𝗜𝗣 🪙`, [`*${g('RESULT')}* : ${Math.random() < 0.5 ? g('HEADS') : g('TAILS')}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}roll`) {
                        await this.sendInstant(chat, boxCard(`🎲 𝗗𝗜𝗖𝗘 𝗥𝗢𝗟𝗟 🎲`, [`*${g('NUMBER')}* : *${Math.floor(Math.random() * 6) + 1}*`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}rps` || cmd.startsWith(`${PREFIX}rps `)) {
                        const picks = ['rock', 'paper', 'scissors'];
                        await this.sendInstant(chat, boxCard(`🎮 𝗥𝗣𝗦 🎮`, [
                            `*${g('YOU')}* : ${g(body.slice(PREFIX.length + 3).trim().toLowerCase() || 'RANDOM')}`,
                            `*${g('BOT')}* : ${g(picks[Math.floor(Math.random() * picks.length)])}`
                        ]));
                        continue;
                    }

                    if (cmd === `${PREFIX}ancstop` || cmd === `${PREFIX}stoptxt`) {
                        this.stopAllLoops();
                        await this.sendInstant(chat, boxCard(`🛑 𝗟𝗢𝗢𝗣𝗦 𝗦𝗧𝗢𝗣𝗣𝗘𝗗 🛑`, [`*${g('STATUS')}* : ${g('ALL ACTIVE LOOPS HALTED')}`]));
                        continue;
                    }

                    if (cmd.startsWith('+ai ') || cmd.startsWith(`${PREFIX}ai `)) {
                        const prompt = body.slice(body.startsWith('+ai ') ? 4 : PREFIX.length + 3).trim();
                        if (!prompt) continue;
                        const reqEpoch = GLOBAL_EPOCH;
                        const reply = await generateDirectAI(prompt);
                        if (!runtimeState.botPaused && reqEpoch === GLOBAL_EPOCH) {
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
                            const rawArgs = body.slice(PREFIX.length + key.length + 1).trim();
                            if (!rawArgs || !isGroup) {
                                if (!isGroup) await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`]));
                                break;
                            }
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

                if (!runtimeState.botPaused && isChatAutoReplyOn(this.phone, chat) && !isFromMe && body && !isCommandText) {
                    const reqEpoch = GLOBAL_EPOCH;
                    const chosenEmoji = pickRandomReaction();
                    this.enqueueSend(async () => {
                        if (!this.stopped && !runtimeState.botPaused && this.socket && isChatAutoReplyOn(this.phone, chat)) {
                            await this.socket.sendMessage(chat, { react: { text: chosenEmoji, key: raw.key } });
                        }
                    });

                    const replyKey = `${String(chat).trim()}__${sender}`;
                    const lastTs = this.lastAutoReplyAt.get(replyKey) || 0;
                    if (Date.now() - lastTs >= AUTO_REPLY_COOLDOWN_MS) {
                        this.lastAutoReplyAt.set(replyKey, Date.now());
                        (async () => {
                            try {
                                const replyText = await generateMatchingLanguageReply(body);
                                if (replyText && !runtimeState.botPaused && reqEpoch === GLOBAL_EPOCH && isChatAutoReplyOn(this.phone, chat) && !this.stopped) {
                                    await this.sendQuoted(chat, replyText, raw);
                                }
                            } catch {}
                        })();
                    }
                }
            }
        } catch (err) {
            console.log('[RECEIVE SAFE ERR]', err?.message || err);
        }
    }

    async handle(cmd, payload, notify = true) {
        if (this.stopped || runtimeState.botPaused) return;
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
                    while (!this.stopped && !runtimeState.botPaused && startEpoch === GLOBAL_EPOCH && stateObj.active && this.nameLoops.get(tid) === stateObj) {
                        if (this.socket) {
                            const emo1 = emojis[idx % emojis.length];
                            const emo2 = emojis[(idx + 3) % emojis.length];
                            idx += 1;
                            try { await this.socket.groupUpdateSubject(chat, `${emo1} ⚡ ${txt} ⚡ ${emo2}`); } catch {}
                        }
                        let elapsed = 0;
                        while (elapsed < safeDelay) {
                            if (this.stopped || runtimeState.botPaused || startEpoch !== GLOBAL_EPOCH || !stateObj.active || this.nameLoops.get(tid) !== stateObj) return;
                            await delay(Math.min(120, safeDelay - elapsed));
                            elapsed += 120;
                        }
                    }
                })();
                if (notify) await this.sendInstant(chat, loopStartLayout(key, `DELAY: ${safeDelay}ms`));
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
                    while (!this.stopped && !runtimeState.botPaused && startEpoch === GLOBAL_EPOCH && loopObj.active && this.txtLoop.get(txtKey) === loopObj) {
                        if (this.socket) {
                            try {
                                const sent = await this.socket.sendMessage(chat, { text: txt });
                                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
                            } catch {}
                        }
                        let elapsed = 0;
                        while (elapsed < safeDelay) {
                            if (this.stopped || runtimeState.botPaused || startEpoch !== GLOBAL_EPOCH || !loopObj.active || this.txtLoop.get(txtKey) !== loopObj) return;
                            await delay(Math.min(120, safeDelay - elapsed));
                            elapsed += 120;
                        }
                    }
                })();
                if (notify) await this.sendInstant(chat, loopStartLayout('text loop', `DELAY: ${safeDelay}ms`));
            }
        } catch {}
    }

    enqueueSend(taskFn) {
        this.sendQueue = this.sendQueue.then(async () => {
            await taskFn();
            await delay(80 + Math.floor(Math.random() * 60));
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
        session.receive(m).catch(err => console.log('[UPSERT SAFE ERR]', err?.message || err));
    });
    targetSock.ev.on('group-participants.update', ev => {
        if (session.socket !== targetSock) return;
        session.onGroupParticipantsUpdate(ev).catch(() => {});
    });
}
// =========================================================================

// =========================================================================
// 6. HUB QUEUE & SERVER ENTRYPOINT
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
        const cleanList = list.map(normalizeStrictPhone).filter(Boolean);
        if (CONFIGURED_BOT_NUMBER && !cleanList.includes(CONFIGURED_BOT_NUMBER)) {
            cleanList.unshift(CONFIGURED_BOT_NUMBER);
        }
        return [...new Set(cleanList)];
    }

    saveNumbers(numbers) {
        writeJson(PATH_BOTS, { numbers: [...new Set(numbers)] });
    }

    async addNumberInChat(phone, requesterJid = null) {
        const clean = normalizeStrictPhone(phone);
        if (!clean) throw new Error('Invalid phone number');

        const runTask = async () => {
            console.log(`[RENDER QUEUE] Pairing +${clean} -> printing code in Render logs first...`);
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
        const clean = normalizeStrictPhone(phone);
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
        runtimeState.botPaused = true;
        runtimeState.autoReplyChats = {};
        saveRuntimeState();
        for (const sess of this.sessions.values()) sess.stopAllLoops();
    }

    resumeAllBots() {
        GLOBAL_EPOCH += 1;
        runtimeState.botPaused = false;
        saveRuntimeState();
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
            await delay(500);
        }
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'SMW Render Engine', paused: runtimeState.botPaused });
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

console.log(`
◈  𝗦𝗠𝗪 𝗜𝗢𝗦 — RENDER + WHATSAPP ENGINE ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary Bot       : ${CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : 'NOT SET'}
  Gemini AI         : ENABLED (${GEMINI_MODELS.join(', ')})
  Pairing Flow      : Render Logs -> WhatsApp Chat
  Initial State     : STANDBY (Send !start)
  Port              : ${PORT}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

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
