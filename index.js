// ╔══════════════════════════════════════════════╗
// ║                  𝗦𝗠𝗪 𝗜𝗢𝗦                     ║
// ║         Multi-Bot WhatsApp Manager           ║
// ╚══════════════════════════════════════════════╝

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
// PRIMARY BOT / OWNER NUMBER (YAHAN APNA INDIAN YA KOI BHI NUMBER DALO)
// Example: "+919876543210" ya "+9647882064284"
// =========================================================================
const BOT_NUMBER = process.env.BOT_NUMBER || "+9647882064284";

// RENDER KEEP-ALIVE INTERVAL IN MINUTES
const PING_MINUTES = 4;

// ANTI-BAN & USER-CONTROLLED LOOP TIMING LIMITS (IN MILLISECONDS)
const MIN_SAFE_DELAY_MS  = 1500;
const DEFAULT_LOOP_MS    = 2800;
const ANTI_BAN_JITTER_MS = 450;

// AUTO-READ, MASSIVE EMOJI POOL & PER-CHAT AUTO-REPLY SETTINGS
const AUTO_READ_MESSAGES     = true;
const AUTO_REPLY_COOLDOWN_MS = 2200;
const PAIR_COOLDOWN_MS       = 15000;
const MAX_WARNS_BEFORE_KICK  = 3;
// =========================================================================

const RAW_EMOJI_STRING =
    "😀😃😄😁😆😅😂🤣🥲🥹😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😶‍🌫️😱😨😰😥😓🤗🤔🫣🤭🫢🫡🤫🫠🤥😶🫥😐🫤😑🫨😬🙄😯😦😧😮😲🥱😴🤤😪😮‍💨😵😵‍💫🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃" +
    "😺😸😹😻😼😽🙀😿😾💋💌💘💝💖💗💓💞💕💟❣️💔❤️‍🔥❤️‍🩹❤️🩷🧡💛💚💙🩵💜🤎🖤🩶🤍💯💢💥💫💦💨🕳️💬👁️‍🗨️🗨️🗯️💭💤" +
    "👋🤚🖐️✋🖖🫱🫲🫳🫴🫷🫸👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄🫦" +
    "🐵🐒🦍🦧🐶🐕🦮🐕‍🦺🐩🐺🦊🦝🐱🐈🐈‍⬛🦁🐯🐅🐆🐴🫎🫏🐎🦄🦓🦌🦬🐮🐂🐃🐄🐷🐖🐗🐽🐏🐑🐐🐪🐫🦙🦒🐘🦣🦏🦛🐭🐁🐀🐹🐰🐇🐿️🦫🦔🦇🐻🐻‍❄️🐨🐼🦥🦦🦨🦘🦡🐾🦃🐔🐓🐣🐤🐥🐦🐧🕊️🦅🦆🦢🦉🦤🪶🦩🦚🦜🪽🐦‍⬛🪿🐸🐊🐢🦎🐍🐲🐉🦕🦖🐳🐋🐬🦭🐟🐠🐡🦈🐙🐚🪸🪼🐌🦋🐛🐜🐝🪲🐞🦗🪳🕷️🕸️🦂🦟🪰🪱🦠" +
    "💐🌸💮🪷🏵️🌹🥀🌺🌻🌼🌷🪻🌱🪴🌲🌳🌴🌵🌾🌿☘️🍀🍁🍂🍃🪹🪺🍄🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🫐🥝🍅🫒🥥🥑🍆🥔🥕🌽🌶️🫑🥒🥬🥦🧄🧅🥜🫘🌰🫚🫛🍞🥐🥖🫓🥨🥯🥞🧇🧀🍖🍗🥩🥓🍔🍟🍕🌭🥪🌮🌯🫔🥙🧆🥚🍳🥘🍲🫕🥣🥗🍿🧈🧂🥫🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🍤🍥🥮🍡🥟🥠🥡🦀🦞🦐🦑🦪🍦🍧🍨🍩🍪🎂🍰🧁🥧🍫🍬🍭🍮🍯🍼🥛☕🫖🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃🗗🥤🧋🧃🧉🧊" +
    "🌍🌎🌏🌐🗺️🧭🏔️⛰️🌋🗻🏕️🏖️🏜️🏝️🏞️🏟️🏛️🏗️🧱🪨🪵🛖🏘️🏚️🏠🏡🏢🏣🏤🏥🏦🏨🏩🏪🏫🏬🏭🏯🏰💒🗼🗽⛪🕌🛕🕍⛩️🕋⛲⛺🌁🌃🏙️🌄🌅🌆🌇🌉♨️🎠🛝🎡🎢💈🎪🚂🚃🚄🚅🚆🚇🚈🚉🚊🚝🚞🚋🚌🚍🚎🚐🚑🚒🚓🚔🚕🚖🚗🚘🚙🛻🚚🚛🚜🏎️🏍️🛵🦽🦼🛺🚲🛴🛹🛼🚏🛣️🛤️🛢️⛽🛞🚨🚥🚦🛑🚧⚓🛟⛵🛶🚤🛳️⛴️🛥️🚢✈️🛩️🛫🛬🪂💺🚁🚟🚠🚡🛰️🚀🛸" +
    "🛎️🧳⌛⏳⌚⏰⏱️⏲️🕰️🕛🕧🕐🕜🕑🕝🕒🕞🕓🕟🕔🕠🕕🕡🕖🕢🕗🕣🕘🕤🕙🕥十一🕦🌑🌒🌓🌔🌕🌖🌗🌘🌙🌚🌛🌜🌡️☀️🌝🌞🪐⭐🌟🌠🌌☁️⛅⛈️🌤️🌥️🌦️🌧️🌨️🌩️🌪️🌫️🌬️🌀🌈🌂☂️☔⛱️⚡❄️☃️⛄☄️🔥💧🌊" +
    "🎃🎄🎆🎇🧨✨🎈🎉🎊🎋🎍🎎🎏🎐🎑🧧🎀🎁🎗️🎟️🎫🎖️🏆🏅🥇🥈🥉⚽⚾🥎🏀🏐🏈🏉🎾🥏🎳🏏🏑🏒🥍🏓🏸🥊🥋🥅⛳⛸️🎣🤿🎽🎿🛷🥌🎯🪀🪁🔫🎱🔮🪄🎮🕹️🎰🎲🧩🧸🪅🪩🪆♠️♥️♦️♣️♟️🃏🀄🎴🎭🖼️🎨🧵🪡🧶🪢" +
    "👓🕶️🥽🥼🦺👔👕👖🧣🧤🧥🧦👗👘🥻🩱🩲🩳👙👚👛👜👝🛍️🎒🩴👞👟🥾🥿👠👡🩰👢👑👒🎩🎓🧢🪖⛑️📿💄💍💎🔇🔈🔉🔊📢📣📯🔔🔕🎼🎵🎶🎙️🎚️🎛️🎤🎧📻🎷🪗🎸🎹🎺🎻🪕🥁🪘🪇🪈📱📲☎️📞📟📠🔋🪫🔌💻🖥️🖨️⌨️🖱️🖲️💽💾💿📀🧮🎥🎞️📽️🎬📺📷📸📹📼🔍🔎🕯️💡🔦🏮🪔📔📕📖📗📘📙📚📓📒📃📜📄📰🗞️📑🔖🏷️💰🪙💴💵💶💷💸💳🧾💹✉️📧📨📩📤📥📦📫📪📬📭📮🗳️✏️✒️🖋️🖊️🖌️🖍️📝💼📁📂🗂️📅📆🗒️🗓️📇📈📉📊📋📌📍📎🖇️📏📐✂️🗃️🗄️🗑️🔒🔓🔏🔐🔑🗝️🔨🪓⛏️⚒️🛠️🗡️⚔️💣🪃🏹🛡️🪚🔧🪛🔩⚙️🗜️⚖️🦯🔗⛓️🪝🧰🧲🪜⚗️🧪🧫🧬🔬🔭📡💉🩸💊🩹🩼🩺🩻🚪🛗🪞🪟🛏️🛋️🪑🚽🪠🚿🛁🪤🪒🧴🧷🧹🧺🧻🪣🧼🫧🪥🧽🧯🛒🚬⚰️🪦⚱️🧿🪬🗿🪧🪪" +
    "🏧🚮🚰♿🚹🚺🚻🚼🚾🛂🛃🛄🛅⚠️🚸⛔🚫🚳🚭🚯🚱🚷📵🔞☢️☣️⬆️↗️➡️↘️⬇️↙️⬅️↖️↕️↔️↩️↪️⤴️⤵️🔃🔄🔙🔚🔛🔜🔝🛐⚛️🕉️✡️☸️☯️✝️☦️☪️☮️🕎🔯🪯♈♉♊♋♌♍♎♏♐♑♒♓⛎🔀🔁🔂▶️⏩⏭️⏯️◀️⏪⏮️🔼⏫🔽⏬⏸️⏹️⏺️⏏️🎦🔅🔆📶🛜📳📴♀️♂️⚧️✖️➕➖➗🟰♾️‼️⁉️❓❔❕❗〰️💱💲⚕️♻️⚜️🔱📛🔰⭕✅☑️✔️❌❎➰➿〽️✳️✴️❇️©️®️™️🚩🏴🏳️";

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

// Supports Indian (+91 / 91 / 091 / 10-digit) and any international E.164 number
function normalizeStrictPhone(rawInput) {
    if (!rawInput) return '';
    let digits = String(rawInput).replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10) {
        digits = `91${digits}`;
    }
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
const PATH_GC     = './store/gc_settings.json';

try {
    fs.mkdirSync('./store', { recursive: true });
    fs.mkdirSync('./sessions', { recursive: true });
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
    return JSON.parse(JSON.stringify(def));
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
let gcSettings = readJson(PATH_GC, { antiLink: {}, welcome: {}, warns: {} });

if (!gcSettings.antiLink) gcSettings.antiLink = {};
if (!gcSettings.welcome) gcSettings.welcome = {};
if (!gcSettings.warns) gcSettings.warns = {};

let GLOBAL_EPOCH = 1;
const GLOBAL_ISSUED_CODES = new Set();
let latestPairingInfo = null;

let runtimeState = readJson(PATH_STATE, {
    botPaused: false,
    autoReplyChats: {}
});

if (!runtimeState.autoReplyChats || typeof runtimeState.autoReplyChats !== 'object') {
    runtimeState.autoReplyChats = {};
}

function saveRuntimeState() {
    try {
        writeJson(PATH_STATE, runtimeState);
    } catch {}
}

function saveGcSettings() {
    try {
        writeJson(PATH_GC, gcSettings);
    } catch {}
}

function normalizeChatKey(chatJid) {
    if (!chatJid) return '';
    return String(chatJid).split(':')[0].trim();
}

function isChatAutoReplyOn(sessionPhone, chatJid) {
    if (runtimeState.botPaused) return false;
    const cleanChat = normalizeChatKey(chatJid);
    return Boolean(
        runtimeState.autoReplyChats[`${sessionPhone}::${cleanChat}`] ||
        runtimeState.autoReplyChats[`${sessionPhone}::${chatJid}`]
    );
}

function setChatAutoReply(sessionPhone, chatJid, enabled) {
    const cleanChat = normalizeChatKey(chatJid);
    const key1 = `${sessionPhone}::${cleanChat}`;
    const key2 = `${sessionPhone}::${chatJid}`;
    if (enabled) {
        runtimeState.autoReplyChats[key1] = true;
        runtimeState.autoReplyChats[key2] = true;
    } else {
        delete runtimeState.autoReplyChats[key1];
        delete runtimeState.autoReplyChats[key2];
    }
    saveRuntimeState();
}

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    const jitter = Math.floor(Math.random() * ANTI_BAN_JITTER_MS);
    return Math.max(MIN_SAFE_DELAY_MS, parsed) + jitter;
}

// ─────────────────────────────────────────────
//  GEMINI AI ENGINE (WITH TIMEOUT GUARD & FALLBACKS)
// ─────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyBd3S8mbO_EYpERC_LMfkxMzTs0LLVZoeg";
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function withTimeout(promise, ms = 10000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Gemini timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callGeminiWithFallback(promptText) {
    let lastErr = null;
    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const res = await withTimeout(model.generateContent(promptText), 10000);
            const text = res?.response?.text()?.trim();
            if (text) return text;
        } catch (err) {
            lastErr = err;
        }
    }
    if (lastErr) {
        console.log('[GEMINI WARN]', lastErr.message || lastErr);
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
//  RENDER KEEP-ALIVE SERVER (NO WEB PANEL UI)
// ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

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
  │  🎀  𝗦𝗠𝗪  𝗜𝗢𝗦  𝗠𝗔𝗡𝗔𝗚𝗘𝗥  v16  🚩      │
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

  > 📱  ${PREFIX}addbot [number] | ${PREFIX}relink [number] | ${PREFIX}bots
         ↳ ${g('direct login or view numbers')}

  > 👥  ${PREFIX}grpmenu
         ↳ ${g('group and gc power commands')}

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

  🛡️  *${g('MODERATION & GC POWER')}*
  • ${PREFIX}lockgc          • ${PREFIX}unlockgc
  • ${PREFIX}mute @user      • ${PREFIX}unmute @user
  • ${PREFIX}kick @user      • ${PREFIX}add [number]
  • ${PREFIX}warn @user      • ${PREFIX}unwarn @user
  • ${PREFIX}promote @user   • ${PREFIX}demote @user
  • ${PREFIX}tagall [msg]    • ${PREFIX}everyone [msg]
  • ${PREFIX}setname [name]  • ${PREFIX}setdesc [text]
  • ${PREFIX}antilink on/off • ${PREFIX}welcome on/off
  • ${PREFIX}groupinfo       • ${PREFIX}admins
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const GAMES_MENU = () => `
  ┌─────────────────────────────────────────┐
  │  🎮  𝗚𝗔𝗠𝗘𝗦  &  𝗨𝗧𝗜𝗟𝗜𝗧𝗜𝗘𝗦  🎲  │
  ├─────────────────────────────────────────┤
  │  ✨ Prefix : ${PREFIX}                      │
  └─────────────────────────────────────────┘

  🎮  *${g('UTILITIES')}*
  • ${PREFIX}flip  • ${PREFIX}roll  • ${PREFIX}rps [rock/paper/scissors]
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const TAG = `🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 🚩`;
const win = what => `
  ┌─────────────────────────┐
  │  ✨ STARTED             │
  └─────────────────────────┘
  ▶ ${g(what)}
  💗 *${TAG}*`;

const saveUsers = () => writeJson(PATH_USERS, userData);

const isOwner = (j, sessionSelf = null, sessionLid = null) => {
    if (!j) return false;
    const cleanJid = String(j).split('@')[0].split(':')[0];
    if (!cleanJid) return false;
    if (sessionSelf && String(sessionSelf).split('@')[0].split(':')[0] === cleanJid) return true;
    if (sessionLid && String(sessionLid).split('@')[0].split(':')[0] === cleanJid) return true;
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

// ═════════════════════════════════════════════
//  SESSION MANAGER (STRICTLY ISOLATED PER NUMBER)
// ═════════════════════════════════════════════
class Session {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false, autoPairOnInit = true) {
        this.id = id;
        this.phone = normalizeStrictPhone(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.autoPairOnInit = autoPairOnInit;
        this.socket = null;
        this.online = false;
        this.self = null;
        this.selfLid = null;

        this.pairingInProgress = false;
        this.pairingDone = false;
        this.lastPairAttemptAt = 0;
        this.pairTimer = null;
        this.reconnectTimer = null;
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
            if (this.msgCache.size > 400) {
                this.msgCache.clear();
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
                this.socket.ev.removeAllListeners();
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

    async requestCodeWithRetry(sock) {
        let lastError = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                await delay(1200 * attempt);
                const rawCode = await sock.requestPairingCode(this.phone);
                const cleanCode = String(rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                if (cleanCode && cleanCode.length >= 6) return cleanCode;
                lastError = new Error('Invalid pairing code returned');
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error('Pairing failed');
    }

    async generateFreshPairingCodeNow() {
        if (!this.phone) throw new Error('Invalid phone number');
        if (this.pairingDone || this.pairingInProgress) {
            if (latestPairingInfo?.code && latestPairingInfo?.phone === `+${this.phone}`) {
                return latestPairingInfo.code;
            }
        }

        const authDir = this.getAuthDir();
        removeDirSafe(authDir);
        ensureDir(authDir);

        if (this.socket) {
            try {
                this.socket.ev.removeAllListeners();
                if (this.socket.ws?.close) this.socket.ws.close();
            } catch {}
            this.socket = null;
        }

        this.autoPairOnInit = false;
        this.pairingDone = false;
        this.pairingInProgress = true;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();

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
                getMessage: async (key) => this.msgCache.get(key?.id)?.message || undefined
            });

            this.socket = sock;
            sock.ev.on("creds.update", saveCreds);

            sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
                if (this.stopped) return;
                if (connection === "open") {
                    this.online = true;
                    this.pairingDone = true;
                    this.pairingInProgress = false;
                    this.self = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (sock.user.lid) {
                        this.selfLid = sock.user.lid.split(':')[0] + '@lid';
                    }
                    console.log(`[${this.id}] Paired & Connected: +${this.phone}`);
                } else if (connection === "close") {
                    this.online = false;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        removeDirSafe(authDir);
                        this.pairingDone = false;
                    } else if (!this.stopped && this.pairingDone && !this.reconnectTimer) {
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (!this.stopped) this.init();
                        }, 4000);
                    }
                }
            });

            sock.ev.on('messages.upsert', m => {
                this.receive(m).catch(err => {
                    console.log('[UPSERT SAFE ERR]', err?.message || err);
                });
            });

            sock.ev.on('group-participants.update', ev => {
                this.onGroupParticipantsUpdate(ev).catch(() => {});
            });

            const cleanCode = await this.requestCodeWithRetry(sock);
            const formatted = cleanCode.match(/.{1,4}/g)?.join('-') || cleanCode;
            this.pairingDone = true;
            latestPairingInfo = { phone: `+${this.phone}`, code: formatted, updatedAt: Date.now() };
            this.lastPairAttemptAt = Date.now();

            console.log(`\n========================================`);
            console.log(`SINGLE PAIRING CODE (+${this.phone}): ${formatted}`);
            console.log(`========================================\n`);

            return formatted;
        } finally {
            this.pairingInProgress = false;
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
                await this.sendInstant(
                    groupJid,
                    `${TAG}\n\n👋 Welcome ${names}!`,
                    mentions
                );
            }
        }
    }

    triggerSingleCodeOnce(sock) {
        if (
            !this.autoPairOnInit ||
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
                const cleanCode = await this.requestCodeWithRetry(sock);
                const formatted = cleanCode.match(/.{1,4}/g)?.join('-') || cleanCode;
                const uniqueKey = `${this.phone}__${formatted}`;
                if (GLOBAL_ISSUED_CODES.has(uniqueKey)) {
                    this.pairingDone = true;
                    return;
                }

                GLOBAL_ISSUED_CODES.add(uniqueKey);
                this.pairingDone = true;
                latestPairingInfo = { phone: `+${this.phone}`, code: formatted, updatedAt: Date.now() };

                console.log(`\n========================================`);
                console.log(`SINGLE PAIRING CODE (+${this.phone}): ${formatted}`);
                console.log(`========================================\n`);

                const labelMsg = `${TAG}\n\nPairing code for +${this.phone}:`;
                await this.hub.sendSingleCodeMessages(labelMsg, formatted, this.requesterJid);
            } catch (e) {
                this.pairingDone = false;
                console.log(`[PAIR ERR] +${this.phone}:`, e?.message || e);
            } finally {
                this.pairingInProgress = false;
            }
        }, 2500);
    }

    async init() {
        try {
            if (!this.phone) return;

            if (this.socket) {
                try {
                    this.socket.ev.removeAllListeners();
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
                browser: Browsers.macOS("Safari"),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                getMessage: async (key) => this.msgCache.get(key?.id)?.message || undefined
            });

            this.socket.ev.on("creds.update", saveCreds);

            if (this.autoPairOnInit && !this.socket.authState?.creds?.registered && !this.pairingDone) {
                this.triggerSingleCodeOnce(this.socket);
            }

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
                    if (this.socket.user.lid) {
                        this.selfLid = this.socket.user.lid.split(':')[0] + '@lid';
                    }
                    console.log(`[${this.id}] Connected: +${this.phone}`);
                } else if (connection === "connecting" && this.autoPairOnInit && !this.socket.authState?.creds?.registered && !this.pairingDone) {
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
                        }, 3500);
                    }
                }
            });

            sockSafeBind(this);
        } catch (e) {
            console.error(`[${this.id}] Init error:`, e.message);
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

                if (raw.key.id) {
                    this.msgCache.set(raw.key.id, raw);
                }

                if (!this.dedupeLocal(raw.key.id)) continue;

                const content = extractMessageContent(raw.message) || raw.message;
                const body = extractTextFromMessage(raw.message);
                if (!body) continue;

                const isGroup = chat.endsWith('@g.us');
                const sender = raw.key.participant || raw.participant || chat;
                const cmd = body.toLowerCase();

                const isDM = !isGroup;
                const isOwn = isOwner(sender, this.self, this.selfLid) || Boolean(raw.key.fromMe);
                const allowed = isOwn || isSub(sender, chat);

                if (allowed && (cmd === `${PREFIX}start` || cmd === '+start')) {
                    this.hub.resumeAllBots();
                    await this.sendInstant(chat, `${TAG}\n\n✅ Started.`);
                    continue;
                }

                if (allowed && (cmd === `${PREFIX}killall` || cmd === '-all')) {
                    this.hub.pauseAllBotsWithoutLogout();
                    await this.sendInstant(chat, `${TAG}\n\n🛑 Stopped.`);
                    continue;
                }

                // Strictly silent/idle when KILL ALL is active; pairing remains connected
                if (runtimeState.botPaused) continue;

                if (AUTO_READ_MESSAGES && !raw.key.fromMe) {
                    this.socket?.readMessages([raw.key]).catch(() => {});
                }

                // Anti-link guard in groups when enabled
                if (isGroup && !isOwn && gcSettings.antiLink?.[chat] && hasLink(body)) {
                    try {
                        await this.socket.sendMessage(chat, { delete: raw.key });
                        await this.sendInstant(chat, `${TAG}\n\n🚫 Links are not allowed here, @${sender.split('@')[0]}.`, [sender]);
                    } catch {}
                    continue;
                }

                const isCommandText = body.startsWith(PREFIX) || body.startsWith('+') || body.startsWith('-');

                if (allowed && isCommandText) {
                    if (cmd === `${PREFIX}autoreply on` || cmd === '+autoreply on') {
                        setChatAutoReply(this.phone, chat, true);
                        await this.sendInstant(chat, `${TAG}\n\n✅ Auto reply enabled.`);
                        continue;
                    }

                    if (cmd === `${PREFIX}autoreply off` || cmd === '+autoreply off') {
                        setChatAutoReply(this.phone, chat, false);
                        await this.sendInstant(chat, `${TAG}\n\n⛔ Auto reply disabled.`);
                        continue;
                    }

                    if (isDM && (cmd === `${PREFIX}admin` || cmd === '+admin')) {
                        if (!userData.owners.length) {
                            grantOwner(sender);
                            await this.sendInstant(chat, `${TAG}\n\n👑 ${g('you are now the owner')}`);
                        } else if (isOwn) {
                            await this.sendInstant(chat, `⚠️ ${g('you already own this bot')}`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}addbot `) || cmd.startsWith('+pair ')) {
                        const rawNum = body.slice(cmd.startsWith(`${PREFIX}addbot `) ? PREFIX.length + 7 : 6).trim();
                        const cleanNum = normalizeStrictPhone(rawNum);
                        if (!cleanNum) {
                            await this.sendInstant(chat, `❌ Enter a valid number with country code.`);
                            continue;
                        }
                        await this.sendInstant(chat, `${TAG}\n\n⏳ Generating pairing code for +${cleanNum}...`);
                        try {
                            const resPair = await this.hub.pairAndGetCode(cleanNum, chat, true);
                            await this.sendInstant(chat, `${TAG}\n\nPairing code for +${cleanNum}:`);
                            await this.sendInstant(chat, resPair.code);
                        } catch (err) {
                            await this.sendInstant(chat, `❌ Pairing failed for +${cleanNum}: ${err.message}`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}relink `) || cmd.startsWith('+relink ')) {
                        const rawNum = body.slice(cmd.startsWith(`${PREFIX}relink `) ? PREFIX.length + 8 : 8).trim();
                        const cleanNum = normalizeStrictPhone(rawNum);
                        if (!cleanNum) {
                            await this.sendInstant(chat, `❌ Enter a valid number with country code.`);
                            continue;
                        }
                        await this.sendInstant(chat, `${TAG}\n\n⏳ Generating fresh pairing code for +${cleanNum}...`);
                        try {
                            const resPair = await this.hub.pairAndGetCode(cleanNum, chat, true);
                            await this.sendInstant(chat, `${TAG}\n\nPairing code for +${cleanNum}:`);
                            await this.sendInstant(chat, resPair.code);
                        } catch (err) {
                            await this.sendInstant(chat, `❌ Relink failed for +${cleanNum}: ${err.message}`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}bots` || cmd === '+bots') {
                        const list = [...this.hub.sessions.values()].filter(s => !s.stopped);
                        if (list.length === 0) {
                            await this.sendInstant(chat, `${TAG}\n\nNo numbers added.`);
                            continue;
                        }
                        const lines = list.map((s, idx) => `${idx + 1}. +${s.phone} — ${s.online ? 'Connected' : 'Waiting'}`);
                        await this.sendInstant(chat, `${TAG}\n\n${lines.join('\n')}`);
                        continue;
                    }

                    if (cmd === `${PREFIX}menu` || cmd === '+menu') {
                        await this.sendInstant(chat, MENU_TEXT());
                        continue;
                    }
                    if (cmd === `${PREFIX}targetmenu`) { await this.sendInstant(chat, TARGET_MENU()); continue; }
                    if (cmd === `${PREFIX}grpmenu`) { await this.sendInstant(chat, GRP_MENU()); continue; }
                    if (cmd === `${PREFIX}games`) { await this.sendInstant(chat, GAMES_MENU()); continue; }

                    if (cmd === `${PREFIX}lockgc`) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        try {
                            await this.socket.groupSettingUpdate(chat, 'announcement');
                            await this.sendInstant(chat, `${TAG}\n\n🔒 Group locked.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}unlockgc`) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        try {
                            await this.socket.groupSettingUpdate(chat, 'not_announcement');
                            await this.sendInstant(chat, `${TAG}\n\n🔓 Group unlocked.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}promote`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 7).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'promote');
                            await this.sendInstant(chat, `${TAG}\n\n👑 Promoted.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}demote`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'demote');
                            await this.sendInstant(chat, `${TAG}\n\n⬇️ Demoted.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}mute`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 4).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'remove');
                            await this.sendInstant(chat, `${TAG}\n\n🔇 Removed from group.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unmute`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Enter number to add.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'add');
                            await this.sendInstant(chat, `${TAG}\n\n🔊 Added back to group.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}kick`) || cmd.startsWith(`${PREFIX}remove`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const argPart = body.slice(PREFIX.length + (cmd.startsWith(`${PREFIX}kick`) ? 4 : 6)).trim();
                        const targets = getTargetUsers(raw, content, argPart);
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'remove');
                            await this.sendInstant(chat, `${TAG}\n\n👢 Kicked from group.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}warn`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 4).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        const target = targets[0];
                        gcSettings.warns[chat] = gcSettings.warns[chat] || {};
                        const nextCount = (gcSettings.warns[chat][target] || 0) + 1;
                        gcSettings.warns[chat][target] = nextCount;
                        saveGcSettings();
                        if (nextCount >= MAX_WARNS_BEFORE_KICK) {
                            gcSettings.warns[chat][target] = 0;
                            saveGcSettings();
                            try {
                                await this.socket.groupParticipantsUpdate(chat, [target], 'remove');
                                await this.sendInstant(chat, `${TAG}\n\n👢 @${target.split('@')[0]} reached ${MAX_WARNS_BEFORE_KICK}/${MAX_WARNS_BEFORE_KICK} warns and was removed.`, [target]);
                            } catch {
                                await this.sendInstant(chat, `❌ Admin permission required to remove @${target.split('@')[0]}.`, [target]);
                            }
                        } else {
                            await this.sendInstant(chat, `${TAG}\n\n⚠️ Warned @${target.split('@')[0]} (${nextCount}/${MAX_WARNS_BEFORE_KICK}).`, [target]);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unwarn`)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, `❌ Tag or reply to a user.`); continue; }
                        const target = targets[0];
                        if (gcSettings.warns?.[chat]?.[target]) {
                            delete gcSettings.warns[chat][target];
                            saveGcSettings();
                        }
                        await this.sendInstant(chat, `${TAG}\n\n✅ Warns cleared for @${target.split('@')[0]}.`, [target]);
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}add `)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const num = normalizeStrictPhone(body.slice(PREFIX.length + 4).trim());
                        if (!num) { await this.sendInstant(chat, `❌ Enter valid number with country code.`); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, [`${num}@s.whatsapp.net`], 'add');
                            await this.sendInstant(chat, `${TAG}\n\n➕ Added +${num}.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Could not add +${num}.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}setname `)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const title = body.slice(PREFIX.length + 8).trim();
                        if (!title) { await this.sendInstant(chat, `❌ Usage: ${PREFIX}setname <new name>`); continue; }
                        try {
                            await this.socket.groupUpdateSubject(chat, title);
                            await this.sendInstant(chat, `${TAG}\n\n✏️ Group name updated.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}setdesc `)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const desc = body.slice(PREFIX.length + 8).trim();
                        if (!desc) { await this.sendInstant(chat, `❌ Usage: ${PREFIX}setdesc <description>`); continue; }
                        try {
                            await this.socket.groupUpdateDescription(chat, desc);
                            await this.sendInstant(chat, `${TAG}\n\n📝 Group description updated.`);
                        } catch {
                            await this.sendInstant(chat, `❌ Admin permission required.`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}antilink on` || cmd === `${PREFIX}antilink off`) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const enabled = cmd.endsWith(' on');
                        gcSettings.antiLink[chat] = enabled;
                        saveGcSettings();
                        await this.sendInstant(chat, `${TAG}\n\n${enabled ? '🛡️ Anti-link ON' : '🔓 Anti-link OFF'}`);
                        continue;
                    }

                    if (cmd === `${PREFIX}welcome on` || cmd === `${PREFIX}welcome off`) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        const enabled = cmd.endsWith(' on');
                        gcSettings.welcome[chat] = enabled;
                        saveGcSettings();
                        await this.sendInstant(chat, `${TAG}\n\n${enabled ? '👋 Welcome ON' : '🔕 Welcome OFF'}`);
                        continue;
                    }

                    if (cmd === `${PREFIX}groupinfo` || cmd === `${PREFIX}admins`) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const admins = (meta.participants || [])
                                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                                .map(p => `@${p.id.split('@')[0]}`);
                            const mentions = (meta.participants || [])
                                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                                .map(p => p.id);
                            if (cmd === `${PREFIX}admins`) {
                                await this.sendInstant(chat, `${TAG}\n\n👑 *Group Admins:*\n${admins.join('\n') || 'None'}`, mentions);
                            } else {
                                await this.sendInstant(
                                    chat,
                                    `${TAG}\n\n📌 *Name:* ${meta.subject}\n👥 *Members:* ${meta.participants?.length || 0}\n👑 *Admins:* ${admins.length}`,
                                    mentions
                                );
                            }
                        } catch {
                            await this.sendInstant(chat, `❌ Failed to load group info.`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}tagall` || cmd.startsWith(`${PREFIX}tagall `) || cmd === `${PREFIX}everyone` || cmd.startsWith(`${PREFIX}everyone `)) {
                        if (!isGroup) { await this.sendInstant(chat, `❌ Group command only.`); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const members = (meta.participants || []).map(p => p.id).filter(Boolean);
                            const customMsg = body.replace(new RegExp(`^\\${PREFIX}(tagall|everyone)\\s*`, 'i'), '').trim() || 'Attention everyone!';
                            const chunkSize = 20;
                            for (let i = 0; i < members.length; i += chunkSize) {
                                if (runtimeState.botPaused || this.stopped) break;
                                const slice = members.slice(i, i + chunkSize);
                                const tagsText = slice.map(j => `@${j.split('@')[0]}`).join(' ');
                                await this.sendInstant(chat, `${TAG}\n\n📣 ${customMsg}\n\n${tagsText}`, slice);
                                if (i + chunkSize < members.length) {
                                    await delay(1400);
                                }
                            }
                        } catch {
                            await this.sendInstant(chat, `❌ Tagall failed.`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}flip`) {
                        const side = Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
                        await this.sendInstant(chat, `${TAG}\n\n${side}`);
                        continue;
                    }

                    if (cmd === `${PREFIX}roll`) {
                        const num = Math.floor(Math.random() * 6) + 1;
                        await this.sendInstant(chat, `${TAG}\n\n🎲 Rolled: *${num}*`);
                        continue;
                    }

                    if (cmd === `${PREFIX}rps` || cmd.startsWith(`${PREFIX}rps `)) {
                        const choices = ['rock', 'paper', 'scissors'];
                        const botPick = choices[Math.floor(Math.random() * choices.length)];
                        const userPick = body.slice(PREFIX.length + 3).trim().toLowerCase();
                        if (!userPick) {
                            await this.sendInstant(chat, `${TAG}\n\n🎮 Bot picked: *${botPick.toUpperCase()}*`);
                        } else {
                            await this.sendInstant(chat, `${TAG}\n\nYou: *${userPick}* | Bot: *${botPick}*`);
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}ancstop` || cmd === `${PREFIX}stoptxt`) {
                        this.stopAllLoops();
                        await this.sendInstant(chat, `${TAG}\n\n🛑 Stopped.`);
                        continue;
                    }

                    if (cmd.startsWith('+ai ') || cmd.startsWith(`${PREFIX}ai `)) {
                        const prompt = body.slice(body.startsWith('+ai ') ? 4 : PREFIX.length + 3).trim();
                        if (!prompt) {
                            await this.sendInstant(chat, `❌ Usage: ${PREFIX}ai <question>`);
                            continue;
                        }
                        const reqEpoch = GLOBAL_EPOCH;
                        const reply = await generateDirectAI(prompt);
                        if (!runtimeState.botPaused && reqEpoch === GLOBAL_EPOCH) {
                            await this.sendInstant(chat, reply);
                        }
                        continue;
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
                        if (!txt) continue;

                        await this.handle('txt_start', { chat, txt, ms }, true);
                        continue;
                    }

                    let matchedAnc = false;
                    for (const [key, setName] of Object.entries(SET_KEYS)) {
                        if (cmd.startsWith(`${PREFIX}${key} `)) {
                            matchedAnc = true;
                            const rawArgs = body.slice(PREFIX.length + key.length + 1).trim();
                            if (!rawArgs || !isGroup) {
                                if (!isGroup) await this.sendInstant(chat, `❌ Group command only.`);
                                break;
                            }

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
                            if (!txt) break;

                            timingMap[key] = ms;
                            writeJson(PATH_TIMING, timingMap);

                            await this.handle('nc_start', { chat, txt: iFnt(txt), key, setName, ms }, true);
                            break;
                        }
                    }
                    if (matchedAnc) continue;
                }

                // Isolated Auto-Reply + Massive Varied Emoji Reactions
                if (
                    !runtimeState.botPaused &&
                    isChatAutoReplyOn(this.phone, chat) &&
                    !raw.key.fromMe &&
                    body &&
                    !isCommandText
                ) {
                    const reqEpoch = GLOBAL_EPOCH;
                    const chosenEmoji = pickRandomReaction();

                    this.enqueueSend(async () => {
                        if (!this.stopped && !runtimeState.botPaused && this.socket && this.online) {
                            await this.socket.sendMessage(chat, { react: { text: chosenEmoji, key: raw.key } });
                        }
                    });

                    const replyKey = `${normalizeChatKey(chat)}__${sender}`;
                    const lastTs = this.lastAutoReplyAt.get(replyKey) || 0;
                    if (Date.now() - lastTs >= AUTO_REPLY_COOLDOWN_MS) {
                        this.lastAutoReplyAt.set(replyKey, Date.now());
                        (async () => {
                            try {
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
                            } catch (e) {
                                console.log('[AUTOREPLY SAFE ERR]', e?.message || e);
                            }
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

                    if (notify) await this.sendInstant(chat, win(`${key} (${safeDelay}ms)`));
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

                    if (notify) await this.sendInstant(chat, win(`text loop (${safeDelay}ms)`));
                    break;
                }
            }
        } catch {}
    }

    enqueueSend(taskFn) {
        this.sendQueue = this.sendQueue
            .then(async () => {
                await taskFn();
                await delay(200 + Math.floor(Math.random() * 150));
            })
            .catch(() => {});
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

    async send(jid, text, mentions = undefined) {
        if (this.stopped || !this.socket || !this.online) return;
        await this.enqueueSend(async () => {
            await this.sendInstant(jid, text, mentions);
        });
    }

    async sendQuoted(jid, text, quotedMsg) {
        if (this.stopped || !this.socket || !this.online) return;
        await this.enqueueSend(async () => {
            try {
                const sent = await this.socket.sendMessage(jid, { text }, { quoted: quotedMsg });
                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
            } catch {}
        });
    }
}

function sockSafeBind(session) {
    session.socket.ev.on('messages.upsert', m => {
        session.receive(m).catch(err => {
            console.log('[UPSERT SAFE ERR]', err?.message || err);
        });
    });

    session.socket.ev.on('group-participants.update', ev => {
        session.onGroupParticipantsUpdate(ev).catch(() => {});
    });
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
                s => s.phone === CONFIGURED_BOT_NUMBER && !s.stopped && s.socket
            );
            if (mainSess) return mainSess;
        }
        return [...this.sessions.values()].find(s => !s.stopped && s.socket) || null;
    }

    async sendSingleCodeMessages(labelMsg, cleanCodeOnly, requesterJid = null) {
        const senderSession = this.getPrimarySession();
        if (!senderSession) return;

        if (PRIMARY_OWNER_JID) {
            await senderSession.sendInstant(PRIMARY_OWNER_JID, labelMsg);
            await delay(300);
            await senderSession.sendInstant(PRIMARY_OWNER_JID, cleanCodeOnly);
        }

        if (requesterJid && requesterJid !== PRIMARY_OWNER_JID) {
            await senderSession.sendInstant(requesterJid, labelMsg);
            await delay(300);
            await senderSession.sendInstant(requesterJid, cleanCodeOnly);
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

    async pairAndGetCode(phone, requesterJid = null, forceFresh = true) {
        const clean = normalizeStrictPhone(phone);
        if (!clean) throw new Error('Invalid phone number');

        const existingEntries = [...this.sessions.entries()].filter(([, s]) => s.phone === clean && !s.stopped);
        for (const [key, oldSess] of existingEntries) {
            await oldSess.destroySession();
            this.sessions.delete(key);
        }

        const id = String(this.counter++);
        const session = new Session(id, clean, this, requesterJid, forceFresh, false);
        this.sessions.set(id, session);

        const allNums = [...this.sessions.values()].filter(x => !x.stopped && x.phone).map(x => x.phone);
        this.saveNumbers(allNums);

        const code = await session.generateFreshPairingCodeNow();
        return { phone: clean, code };
    }

    async addNumber(phone, requesterJid = null, forceFresh = true) {
        const res = await this.pairAndGetCode(phone, requesterJid, forceFresh);
        return `${TAG}\n\nPairing code for +${res.phone}: ${res.code}`;
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
            const session = new Session(id, num, this, null, false, true);
            this.sessions.set(id, session);
            await session.init();
            await delay(1200);
        }
    }
}

console.log(`
◈  𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧 v16  ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary Number    : ${CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : 'NOT SET'}
  Emoji Pool Loaded : ${REACTION_POOL.length} Emojis
  Port              : ${PORT}
  Safe Delay Floor  : ${MIN_SAFE_DELAY_MS}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

process.on('uncaughtException', err => {
    console.log('[SAFE UNCAUGHT]', err?.message || err);
});
process.on('unhandledRejection', err => {
    console.log('[SAFE REJECTION]', err?.message || err);
});

const hub = new Hub();

app.listen(PORT, async () => {
    console.log(`[SERVER] Listening on port ${PORT}`);
    startKeepAlive();
    await hub.boot();
});
