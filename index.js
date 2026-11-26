// ╔══════════════════════════════════════════════════════════════╗
// ║                      𝗦𝗠𝗪 𝗜𝗢𝗦 v18.1                        ║
// ║          Multi-Bot WhatsApp Manager & Loop Engine            ║
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
// PRIMARY BOT / OWNER NUMBER
// =========================================================================
const BOT_NUMBER = process.env.BOT_NUMBER || "+9647882064284";
const PING_MINUTES = 4;

// LOOP & SAFETY TIMINGS (MS)
const MIN_SAFE_DELAY_MS  = 500;
const DEFAULT_LOOP_MS    = 1200;
const ANTI_BAN_JITTER_MS = 120;

const AUTO_READ_MESSAGES     = true;
const AUTO_REPLY_COOLDOWN_MS = 600;
const MAX_WARNS_BEFORE_KICK  = 3;
// =========================================================================

const RAW_EMOJI_STRING =
    "😀😃😄😁😆😅😂🤣🥲🥹😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😶‍🌫️😱😨😰😥😓🤗🤔🫣🤭🫢🫡🤫🫠🤥😶🫥😐🫤😑🫨😬🙄😯😦😧😮😲🥱😴🤤😪😮‍💨😵😵‍💫🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃" +
    "😺😸😹😻😼😽🙀😿😾💋💌💘💝💖💗💓💞💕💟❣️💔❤️‍🔥❤️‍🩹❤️🩷🧡💛💚💙🩵💜🤎🖤🩶🤍💯💢💥💫💦💨🕳️💬👁️‍🗨️🗨️🗯️💭💤" +
    "👋🤚🖐️✋🖖🫱🫲🫳🫴🫷🫸👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄🫦" +
    "🐵🐒🦍🦧🐶🐕🦮🐕‍🦺🐩🐺🦊🦝🐱🐈🐈‍⬛🦁🐯🐅🐆🐴🫎🫏🐎🦄🦓🦌🦬🐮🐂🐃🐄🐷🐖🐗🐽🐏🐑🐐🐪🐫🦙🦒🐘🦣🦏🦛🐭🐁🐀🐹🐰🐇🐿️🦫🦔🦇🐻🐻‍❄️🐨🐼🦥🦦🦨🦘🦡🐾🦃🐔🐓🐣🐤🐥🐦🐧🕊️🦅🦆🦢🦉🦤🪶🦩🦚🦜🪽🐦‍⬛🿿🐸🐊🐢🦎🐍🐲🐉🦕🦖🐳🐋🐬🦭🐟🐠🐡🦈🐙🐚🪸🪼🐌🦋🐛🐜🐝🪲🐞🦗🪳🕷️🕸️🦂🦟🪰🪱🦠" +
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

function normalizeStrictPhone(rawInput) {
    if (!rawInput) return '';
    let digits = String(rawInput).replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 10) {
        digits = `91${digits}`;
    } else if (digits.length > 10 && digits.startsWith('0')) {
        digits = digits.replace(/^0+/, '');
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
const PATH_AUTH   = (phone) => `./sessions/smw_session_${phone}`;
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
const PRINTED_LOG_OTPS = new Set();

// Bot starts PAUSED until user sends !start / +start
let runtimeState = readJson(PATH_STATE, {
    botPaused: true,
    autoReplyChats: {}
});

runtimeState.botPaused = true;
if (!runtimeState.autoReplyChats || typeof runtimeState.autoReplyChats !== 'object') {
    runtimeState.autoReplyChats = {};
}

function saveRuntimeState() {
    try { writeJson(PATH_STATE, runtimeState); } catch {}
}

function saveGcSettings() {
    try { writeJson(PATH_GC, gcSettings); } catch {}
}

function normalizeChatKey(chatJid) {
    if (!chatJid) return '';
    return String(chatJid).trim();
}

function isChatAutoReplyOn(sessionPhone, chatJid) {
    if (runtimeState.botPaused) return false;
    const cleanChat = normalizeChatKey(chatJid);
    return Boolean(runtimeState.autoReplyChats[`${sessionPhone}::${cleanChat}`]);
}

function setChatAutoReply(sessionPhone, chatJid, enabled) {
    const cleanChat = normalizeChatKey(chatJid);
    const key = `${sessionPhone}::${cleanChat}`;
    if (enabled) runtimeState.autoReplyChats[key] = true;
    else delete runtimeState.autoReplyChats[key];
    saveRuntimeState();
}

function getSafeDelay(inputMs) {
    const parsed = Number(inputMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOP_MS;
    const jitter = Math.floor(Math.random() * ANTI_BAN_JITTER_MS);
    return Math.max(MIN_SAFE_DELAY_MS, parsed) + jitter;
}

// ─────────────────────────────────────────────
//  GEMINI AI ENGINE (UNIQUE PER-PROMPT & NO STATIC REPEATS)
// ─────────────────────────────────────────────
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

async function callGeminiWithFallback(promptText, temperature = 0.85) {
    for (const modelName of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { temperature }
            });
            const res = await withTimeout(model.generateContent(promptText), 9000);
            const text = res?.response?.text()?.trim();
            if (text && !recentRepliesSet.has(text)) {
                recentRepliesSet.add(text);
                if (recentRepliesSet.size > 60) {
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
    const clean = String(userText || '').trim();
    const hasHindi = /[\u0900-\u097F]/.test(clean);
    const seed = Math.floor(Math.random() * 1000);

    if (hasHindi) {
        const hiOptions = [
            `"${clean.slice(0, 60)}" — इस पर क्या करना है, साफ बताओ (#${seed % 99 + 1})?`,
            `तुमने कहा "${clean.slice(0, 60)}" — आगे का प्लान क्या रखें?`,
            `"${clean.slice(0, 60)}" के बारे में और डिटेल दो, मैं सुन रहा हूँ।`
        ];
        return hiOptions[seed % hiOptions.length];
    }

    const enOptions = [
        `"${clean.slice(0, 60)}" — what's the next move on this?`,
        `Got your message: "${clean.slice(0, 60)}" — tell me how you want to handle it.`,
        `Reading "${clean.slice(0, 60)}" — give me more details if needed.`
    ];
    return enOptions[seed % enOptions.length];
}

async function generateMatchingLanguageReply(userText) {
    const uniqueTag = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const prompt =
        `You are a smart WhatsApp chat assistant. Reply directly and specifically to the user's message below. ` +
        `Match the exact language and script of the user's message (Hindi, Hinglish, English, etc.). ` +
        `Never give a generic repeated template; answer what was actually said. Keep it concise (1-2 lines). [ctx:${uniqueTag}]\n\n` +
        `User message: ${userText}`;
    const reply = await callGeminiWithFallback(prompt, 0.9);
    return (reply || buildDynamicFallbackReply(userText)).slice(0, 600);
}

async function generateDirectAI(userPrompt) {
    const uniqueTag = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const prompt =
        `Answer the user's question directly, accurately, and in the same language as the question. ` +
        `Do not repeat previous answers. [ctx:${uniqueTag}]\n\n` +
        `Question: ${userPrompt}`;
    const reply = await callGeminiWithFallback(prompt, 0.85);
    return (reply || buildDynamicFallbackReply(userPrompt)).slice(0, 1600);
}

// ─────────────────────────────────────────────
//  KEEP-ALIVE SERVER
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
        try { await fetch(pingUrl); } catch {}
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

const TAG = `🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 🚩`;

const boxCard = (header, rows) =>
`╭─ ${header} ─╮
${rows.map(r => `│ ▸ ${r}`).join('\n')}
╰─────────────────────────╯
💗 *${TAG}*`;

const GRAND_START_BANNER = () => boxCard(
    `⚡ 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗦𝗧𝗔𝗥𝗧𝗘𝗗 ⚡`,
    [
        `*${g('STATUS')}*      : 🟢 ${g('LIVE & FULL POWER')}`,
        `*${g('AUTO REPLY')}*  : 🤖 ${g('CHAT SPECIFIC READY')}`,
        `*${g('LOOP ENGINE')}* : 🔥 ${g('ANC1-7 & TXT LIVE')}`,
        `*${g('AI CORE')}*     : 🧠 ${g('GEMINI ACTIVE')}`,
        `*${g('PAIRING')}*     : 📱 ${g('DIRECT CHAT CODE READY')}`
    ]
);

const KILL_ALL_BANNER = () => boxCard(
    `🛑 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗞𝗜𝗟𝗟𝗘𝗗 🛑`,
    [
        `*${g('LOOPS & REPLY')}* : ⏸️ ${g('STOPPED')}`,
        `*${g('SESSION')}*       : 🔗 ${g('STILL LIVE & SAFE')}`,
        `*${g('START AGAIN')}*   : ▶️ ${g('USE')} ${PREFIX}start`
    ]
);

const AUTO_REPLY_BANNER = (enabled) => boxCard(
    enabled ? `🤖 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗡 🤖` : `⛔ 𝗔𝗨𝗧𝗢 𝗥𝗘𝗣𝗟𝗬 𝗢𝗙𝗙 ⛔`,
    [
        `*${g('THIS CHAT')}* : ${enabled ? `🟢 ${g('ACTIVE')}` : `🔴 ${g('DISABLED')}`}`,
        `*${g('REACTIONS')}* : ⚡ ${g('RANDOM EMOJI POOL')}`,
        `*${g('AI ENGINE')}* : 🧠 ${g('DYNAMIC SMART REPLY')}`
    ]
);

const BOTS_LIST_BANNER = (list) => boxCard(
    `📱 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧𝗦 (${list.length}) 📱`,
    list.map((s, idx) =>
        `*${idx + 1}.* +${s.phone} ➔ ${s.online ? `🟢 ${g('ONLINE')}` : `🟡 ${g('STANDBY')}`}`
    )
);

const MENU_TEXT = () => boxCard(
    `🎀 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 v18.1 🚩`,
    [
        `*${g('PREFIX')}*     : ${PREFIX}  |  *${g('SAFE')}* : ${MIN_SAFE_DELAY_MS}ms`,
        `▶️ ${PREFIX}start / 🛑 ${PREFIX}killall ➔ ${g('control engine')}`,
        `🤖 ${PREFIX}autoreply on / off ➔ ${g('chat reply & reactions')}`,
        `🎯 ${PREFIX}targetmenu ➔ ${g('name change & text loops')}`,
        `🧠 ${PREFIX}ai [question] ➔ ${g('ai assistant')}`,
        `📱 ${PREFIX}addbot / ${PREFIX}relink / ${PREFIX}bots ➔ ${g('pair in chat & list')}`,
        `👥 ${PREFIX}grpmenu ➔ ${g('group & gc controls')}`,
        `🎮 ${PREFIX}games ➔ ${g('fun & tools')}`
    ]
);

const TARGET_MENU = () => boxCard(
    `🎯 𝗧𝗔𝗥𝗚𝗘𝗧 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 🔥`,
    [
        `*${g('NAME LOOPS')}* : ${PREFIX}anc1-7 [text] [ms]`,
        `*${g('STOP NAME')}*  : ${PREFIX}ancstop`,
        `*${g('TEXT LOOP')}*  : ${PREFIX}txt [text] [ms]`,
        `*${g('STOP TEXT')}*  : ${PREFIX}stoptxt`
    ]
);

const GRP_MENU = () => boxCard(
    `👥 𝗚𝗥𝗢𝗨𝗣 𝗣𝗢𝗪𝗘𝗥 🛡️`,
    [
        `*${g('LOCK / UNLOCK')}* : ${PREFIX}lockgc / ${PREFIX}unlockgc`,
        `*${g('KICK / ADD')}*    : ${PREFIX}kick @user / ${PREFIX}add [num]`,
        `*${g('WARNS')}*         : ${PREFIX}warn @user / ${PREFIX}unwarn @user`,
        `*${g('ROLES')}*         : ${PREFIX}promote / ${PREFIX}demote`,
        `*${g('GROUP INFO')}*    : ${PREFIX}setname / ${PREFIX}setdesc / ${PREFIX}groupinfo / ${PREFIX}admins`,
        `*${g('GUARDS')}*        : ${PREFIX}antilink on/off / ${PREFIX}welcome on/off / ${PREFIX}tagall`
    ]
);

const GAMES_MENU = () => boxCard(
    `🎮 𝗚𝗔𝗠𝗘𝗦 & 𝗧𝗢𝗢𝗟𝗦 🎲`,
    [
        `*${g('COIN')}* : ${PREFIX}flip`,
        `*${g('DICE')}* : ${PREFIX}roll`,
        `*${g('RPS')}*  : ${PREFIX}rps [rock/paper/scissors]`
    ]
);

const loopStartLayout = (title, detail) => boxCard(
    `🔥 ${title.toUpperCase()} ${g('STARTED')} 🔥`,
    [
        `*${g('ENGINE')}* : ⚡ ${g('RUNNING LIVE')}`,
        `*${g('CONFIG')}* : ${detail}`,
        `*${g('STOP')}*   : 🛑 ${PREFIX}ancstop / ${PREFIX}stoptxt / ${PREFIX}killall`
    ]
);

const saveUsers = () => writeJson(PATH_USERS, userData);

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
//  SESSION MANAGER
// ═════════════════════════════════════════════
class Session {
    constructor(id, phone, hub, requesterJid = null, freshAuth = false, logOtpOnce = false) {
        this.id = id;
        this.phone = normalizeStrictPhone(phone);
        this.hub = hub;
        this.requesterJid = requesterJid;
        this.freshAuth = freshAuth;
        this.logOtpOnce = logOtpOnce;
        this.socket = null;
        this.online = false;
        this.self = null;
        this.selfLid = null;
        this.otpPrinted = false;
        this.pairingBusy = false;

        this.reconnectTimer = null;
        this.pairingWatchdog = null;
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
            if (this.msgCache.size > 400) this.msgCache.clear();
            if (this.sentByBotIds.size > 500) this.sentByBotIds.clear();
        }, 90000);
    }

    getAuthDir() {
        return PATH_AUTH(this.phone);
    }

    clearTimers() {
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.pairingWatchdog) { clearTimeout(this.pairingWatchdog); this.pairingWatchdog = null; }
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

    async destroySession() {
        this.stopped = true;
        this.online = false;
        this.clearTimers();
        this.stopAllLoops();
        try {
            if (this.socket?.ev?.removeAllListeners) this.socket.ev.removeAllListeners();
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

    async requestCleanCode(sock) {
        let lastErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                await delay(1500 * attempt);
                const rawCode = await sock.requestPairingCode(this.phone);
                const clean = String(rawCode || '')
                    .replace(/[^A-Z0-9]/gi, '')
                    .toUpperCase()
                    .slice(0, 8);
                if (clean.length >= 6) {
                    return clean.match(/.{1,4}/g)?.join('-') || clean;
                }
                lastErr = new Error('Empty pairing code');
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('Pairing code failed');
    }

    printCodeInLogsOnce(tagLabel, formattedCode) {
        const key = `${tagLabel}__${this.phone}__${formattedCode}`;
        if (PRINTED_LOG_OTPS.has(key)) return;
        PRINTED_LOG_OTPS.add(key);
        console.log(`\n╔══════════════════════════════════════════════╗`);
        console.log(`║ ${tagLabel} (+${this.phone}) => ${formattedCode}`);
        console.log(`╚══════════════════════════════════════════════╝\n`);
    }

    armPairingWatchdog(authDir) {
        if (this.pairingWatchdog) clearTimeout(this.pairingWatchdog);
        // If pairing stays stuck in login/pending for > 90s without opening, release lock cleanly
        this.pairingWatchdog = setTimeout(() => {
            if (this.stopped || this.online) return;
            this.pairingBusy = false;
            console.log(`[PAIR TIMEOUT] +${this.phone} did not finish login in 90s; resetting state.`);
        }, 90000);
    }

    async pairFreshInChat() {
        if (!this.phone) throw new Error('Invalid phone number');

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

        this.pairingBusy = true;
        this.otpPrinted = true;
        this.armPairingWatchdog(authDir);

        try {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                auth: state,
                version,
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                msgRetryCounterCache: new Map(),
                getMessage: async (key) => this.msgCache.get(key?.id)?.message || undefined
            });

            this.socket = sock;
            sock.ev.on("creds.update", saveCreds);

            sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
                if (this.stopped) return;
                if (connection === "open") {
                    if (this.pairingWatchdog) { clearTimeout(this.pairingWatchdog); this.pairingWatchdog = null; }
                    this.online = true;
                    this.pairingBusy = false;
                    if (this.socket?.user?.id) {
                        this.self = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    }
                    if (this.socket?.user?.lid) {
                        this.selfLid = this.socket.user.lid.split(':')[0] + '@lid';
                    }
                    console.log(`[ONLINE] +${this.phone} linked & active`);
                    if (this.requesterJid) {
                        await this.sendInstant(
                            this.requesterJid,
                            boxCard(`✅ 𝗕𝗢𝗧 𝗟𝗜𝗡𝗞𝗘𝗗 ✅`, [
                                `*${g('NUMBER')}* : +${this.phone}`,
                                `*${g('STATUS')}* : 🟢 ${g('CONNECTED & READY')}`
                            ])
                        );
                    }
                } else if (connection === "close") {
                    this.online = false;
                    if (this.stopped) return;
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code === DisconnectReason.loggedOut) {
                        this.pairingBusy = false;
                        removeDirSafe(authDir);
                        return;
                    }
                    // Allow reconnect once pairing code is already issued so login handshake completes
                    if (!this.reconnectTimer) {
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (!this.stopped) {
                                this.pairingBusy = false;
                                this.init();
                            }
                        }, 2000);
                    }
                }
            });

            sockSafeBind(this);

            const formattedCode = await this.requestCleanCode(sock);
            this.printCodeInLogsOnce('ADDED NUMBER CODE', formattedCode);
            return formattedCode;
        } catch (err) {
            this.pairingBusy = false;
            if (this.pairingWatchdog) { clearTimeout(this.pairingWatchdog); this.pairingWatchdog = null; }
            throw err;
        }
    }

    async tryLogPrimaryCodeOnce(sock) {
        if (!this.logOtpOnce || this.otpPrinted || this.pairingBusy || this.stopped || this.online) return;
        if (sock?.authState?.creds?.registered) return;

        this.otpPrinted = true;
        this.pairingBusy = true;
        try {
            const formattedCode = await this.requestCleanCode(sock);
            this.printCodeInLogsOnce('PRIMARY CODE', formattedCode);
        } catch (err) {
            console.log(`[PRIMARY LOG ERR] +${this.phone}:`, err?.message || err);
        } finally {
            this.pairingBusy = false;
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
                    boxCard(`👋 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 👋`, [`*${g('MEMBERS')}* : ${names}`]),
                    mentions
                );
            }
        }
    }

    async init() {
        try {
            if (!this.phone || this.pairingBusy) return;

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
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                msgRetryCounterCache: new Map(),
                getMessage: async (key) => this.msgCache.get(key?.id)?.message || undefined
            });

            this.socket.ev.on("creds.update", saveCreds);

            if (this.logOtpOnce && !this.socket.authState?.creds?.registered && !this.otpPrinted) {
                this.tryLogPrimaryCodeOnce(this.socket).catch(() => {});
            }

            this.socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
                if (this.stopped) return;

                if (connection === "open") {
                    if (this.pairingWatchdog) { clearTimeout(this.pairingWatchdog); this.pairingWatchdog = null; }
                    this.online = true;
                    this.pairingBusy = false;
                    if (this.socket?.user?.id) {
                        this.self = this.socket.user.id.split(':')[0] + '@s.whatsapp.net';
                    }
                    if (this.socket?.user?.lid) {
                        this.selfLid = this.socket.user.lid.split(':')[0] + '@lid';
                    }
                    console.log(`[ONLINE] +${this.phone} logged in`);
                } else if (connection === "close") {
                    this.online = false;
                    if (this.stopped) return;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        removeDirSafe(authDir);
                    }
                    if (statusCode !== DisconnectReason.loggedOut && !this.reconnectTimer) {
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (!this.stopped) this.init();
                        }, 2500);
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
                    this.hub.resumeAllBots();
                    await this.sendInstant(chat, GRAND_START_BANNER());
                    continue;
                }

                if (allowed && (cmd === `${PREFIX}killall` || cmd === '-all')) {
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
                        await this.sendInstant(
                            chat,
                            boxCard(`🚫 𝗔𝗡𝗧𝗜 𝗟𝗜𝗡𝗞 🛡️`, [`*${g('USER')}*   : @${sender.split('@')[0]}`, `*${g('ACTION')}* : ${g('LINK DELETED')}`]),
                            [sender]
                        );
                    } catch {}
                    continue;
                }

                const isCommandText = body.startsWith(PREFIX) || body.startsWith('+') || body.startsWith('-');

                if (allowed && isCommandText) {
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

                    if (cmd.startsWith(`${PREFIX}addbot `) || cmd.startsWith('+pair ')) {
                        const rawNum = body.slice(cmd.startsWith(`${PREFIX}addbot `) ? PREFIX.length + 7 : 6).trim();
                        const cleanNum = normalizeStrictPhone(rawNum);
                        if (!cleanNum) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ❌`, [`*${g('FORMAT')}* : ${PREFIX}addbot +919876543210`]));
                            continue;
                        }
                        try {
                            const code = await this.hub.addNumberInChat(cleanNum, chat);
                            await this.sendInstant(
                                chat,
                                boxCard(`🔑 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘 🔑`, [
                                    `*${g('NUMBER')}* : +${cleanNum}`,
                                    `*${g('CODE')}*   : *${code}*`,
                                    `*${g('STATUS')}* : ${g('LINK WITHIN 60S')}`
                                ])
                            );
                        } catch (err) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗔𝗜𝗥 𝗘𝗥𝗥𝗢𝗥 ❌`, [`*${g('NUMBER')}* : +${cleanNum}`, `*${g('INFO')}*   : ${err.message}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}relink `) || cmd.startsWith('+relink ')) {
                        const rawNum = body.slice(cmd.startsWith(`${PREFIX}relink `) ? PREFIX.length + 8 : 8).trim();
                        const cleanNum = normalizeStrictPhone(rawNum);
                        if (!cleanNum) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ❌`, [`*${g('FORMAT')}* : ${PREFIX}relink +919876543210`]));
                            continue;
                        }
                        try {
                            const code = await this.hub.addNumberInChat(cleanNum, chat);
                            await this.sendInstant(
                                chat,
                                boxCard(`🔑 𝗥𝗘𝗟𝗜𝗡𝗞 𝗖𝗢𝗗𝗘 🔑`, [
                                    `*${g('NUMBER')}* : +${cleanNum}`,
                                    `*${g('CODE')}*   : *${code}*`,
                                    `*${g('STATUS')}* : ${g('LINK WITHIN 60S')}`
                                ])
                            );
                        } catch (err) {
                            await this.sendInstant(chat, boxCard(`❌ 𝗥𝗘𝗟𝗜𝗡𝗞 𝗘𝗥𝗥𝗢𝗥 ❌`, [`*${g('NUMBER')}* : +${cleanNum}`, `*${g('INFO')}*   : ${err.message}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}bots` || cmd === '+bots') {
                        const list = [...this.hub.sessions.values()].filter(s => !s.stopped);
                        if (list.length === 0) {
                            await this.sendInstant(chat, boxCard(`📱 𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧𝗦 📱`, [`*${g('COUNT')}* : 0 ${g('NUMBERS ADDED')}`]));
                            continue;
                        }
                        await this.sendInstant(chat, BOTS_LIST_BANNER(list));
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
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            await this.socket.groupSettingUpdate(chat, 'announcement');
                            await this.sendInstant(chat, boxCard(`🔒 𝗚𝗥𝗢𝗨𝗣 𝗟𝗢𝗖𝗞𝗘𝗗 🔒`, [`*${g('STATUS')}* : ${g('ADMINS ONLY CAN SEND')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}unlockgc`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            await this.socket.groupSettingUpdate(chat, 'not_announcement');
                            await this.sendInstant(chat, boxCard(`🔓 𝗚𝗥𝗢𝗨𝗣 𝗨𝗡𝗟𝗢𝗖𝗞𝗘𝗗 🔓`, [`*${g('STATUS')}* : ${g('ALL MEMBERS CAN SEND')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}promote`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 7).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'promote');
                            await this.sendInstant(chat, boxCard(`👑 𝗣𝗥𝗢𝗠𝗢𝗧𝗘𝗗 👑`, [`*${g('STATUS')}* : ${g('ADMIN GRANTED')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}demote`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'demote');
                            await this.sendInstant(chat, boxCard(`⬇️ 𝗗𝗘𝗠𝗢𝗧𝗘𝗗 ⬇️`, [`*${g('STATUS')}* : ${g('ADMIN REMOVED')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}mute`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 4).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'remove');
                            await this.sendInstant(chat, boxCard(`🔇 𝗠𝗨𝗧𝗘 / 𝗥𝗘𝗠𝗢𝗩𝗘𝗗 🔇`, [`*${g('STATUS')}* : ${g('REMOVED FROM GC')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unmute`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗡𝗨𝗠𝗕𝗘𝗥 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}unmute +919876543210`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'add');
                            await this.sendInstant(chat, boxCard(`🔊 𝗔𝗗𝗗𝗘𝗗 𝗕𝗔𝗖𝗞 🔊`, [`*${g('STATUS')}* : ${g('RESTORED TO GC')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}kick`) || cmd.startsWith(`${PREFIX}remove`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const argPart = body.slice(PREFIX.length + (cmd.startsWith(`${PREFIX}kick`) ? 4 : 6)).trim();
                        const targets = getTargetUsers(raw, content, argPart);
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, targets, 'remove');
                            await this.sendInstant(chat, boxCard(`👢 𝗞𝗜𝗖𝗞𝗘𝗗 👢`, [`*${g('STATUS')}* : ${g('REMOVED FROM GROUP')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}warn`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 4).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
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
                                await this.sendInstant(
                                    chat,
                                    boxCard(`👢 𝗠𝗔𝗫 𝗪𝗔𝗥𝗡 𝗞𝗜𝗖𝗞 👢`, [`*${g('USER')}*  : @${target.split('@')[0]}`, `*${g('WARNS')}* : ${MAX_WARNS_BEFORE_KICK}/${MAX_WARNS_BEFORE_KICK}`]),
                                    [target]
                                );
                            } catch {
                                await this.sendInstant(
                                    chat,
                                    boxCard(`❌ 𝗞𝗜𝗖𝗞 𝗙𝗔𝗜𝗟𝗘𝗗 ❌`, [`*${g('USER')}* : @${target.split('@')[0]}`, `*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]),
                                    [target]
                                );
                            }
                        } else {
                            await this.sendInstant(
                                chat,
                                boxCard(`⚠️ 𝗪𝗔𝗥𝗡𝗜𝗡𝗚 𝗜𝗦𝗦𝗨𝗘𝗗 ⚠️`, [`*${g('USER')}*  : @${target.split('@')[0]}`, `*${g('WARNS')}* : ${nextCount}/${MAX_WARNS_BEFORE_KICK}`]),
                                [target]
                            );
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}unwarn`)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const targets = getTargetUsers(raw, content, body.slice(PREFIX.length + 6).trim());
                        if (!targets.length) { await this.sendInstant(chat, boxCard(`⚠️ 𝗧𝗔𝗥𝗚𝗘𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${g('TAG OR REPLY USER')}`])); continue; }
                        const target = targets[0];
                        if (gcSettings.warns?.[chat]?.[target]) {
                            delete gcSettings.warns[chat][target];
                            saveGcSettings();
                        }
                        await this.sendInstant(
                            chat,
                            boxCard(`✅ 𝗪𝗔𝗥𝗡𝗦 𝗖𝗟𝗘𝗔𝗥𝗘𝗗 ✅`, [`*${g('USER')}*  : @${target.split('@')[0]}`, `*${g('WARNS')}* : 0/${MAX_WARNS_BEFORE_KICK}`]),
                            [target]
                        );
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}add `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const num = normalizeStrictPhone(body.slice(PREFIX.length + 4).trim());
                        if (!num) { await this.sendInstant(chat, boxCard(`⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗡𝗨𝗠𝗕𝗘𝗥 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}add +919876543210`])); continue; }
                        try {
                            await this.socket.groupParticipantsUpdate(chat, [`${num}@s.whatsapp.net`], 'add');
                            await this.sendInstant(chat, boxCard(`➕ 𝗠𝗘𝗠𝗕𝗘𝗥 𝗔𝗗𝗗𝗘𝗗 ➕`, [`*${g('NUMBER')}* : +${num}`, `*${g('STATUS')}* : ${g('ADDED TO GC')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗔𝗗𝗗 𝗙𝗔𝗜𝗟𝗘𝗗 ❌`, [`*${g('NUMBER')}* : +${num}`, `*${g('REASON')}* : ${g('PRIVACY OR ADMIN LIMIT')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}setname `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const title = body.slice(PREFIX.length + 8).trim();
                        if (!title) { await this.sendInstant(chat, boxCard(`⚠️ 𝗡𝗔𝗠𝗘 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}setname New GC Name`])); continue; }
                        try {
                            await this.socket.groupUpdateSubject(chat, title);
                            await this.sendInstant(chat, boxCard(`✏️ 𝗡𝗔𝗠𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 ✏️`, [`*${g('NEW NAME')}* : ${title}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd.startsWith(`${PREFIX}setdesc `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const desc = body.slice(PREFIX.length + 8).trim();
                        if (!desc) { await this.sendInstant(chat, boxCard(`⚠️ 𝗗𝗘𝗦𝗖 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}setdesc New Description`])); continue; }
                        try {
                            await this.socket.groupUpdateDescription(chat, desc);
                            await this.sendInstant(chat, boxCard(`📝 𝗗𝗘𝗦𝗖 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 📝`, [`*${g('STATUS')}* : ${g('DESCRIPTION SAVED')}`]));
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗜𝗢𝗡 𝗗𝗘𝗡𝗜𝗘𝗗 ❌`, [`*${g('NEED')}* : ${g('BOT GROUP ADMIN')}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}antilink on` || cmd === `${PREFIX}antilink off`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const enabled = cmd.endsWith(' on');
                        gcSettings.antiLink[chat] = enabled;
                        saveGcSettings();
                        await this.sendInstant(chat, boxCard(`🛡️ 𝗔𝗡𝗧𝗜 𝗟𝗜𝗡𝗞 🛡️`, [`*${g('MODE')}* : ${enabled ? `🟢 ${g('ENABLED')}` : `🔴 ${g('DISABLED')}`}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}welcome on` || cmd === `${PREFIX}welcome off`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        const enabled = cmd.endsWith(' on');
                        gcSettings.welcome[chat] = enabled;
                        saveGcSettings();
                        await this.sendInstant(chat, boxCard(`👋 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗠𝗦𝗚 👋`, [`*${g('MODE')}* : ${enabled ? `🟢 ${g('ENABLED')}` : `🔴 ${g('DISABLED')}`}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}groupinfo` || cmd === `${PREFIX}admins`) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const adminList = (meta.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin');
                            const adminTags = adminList.map(p => `@${p.id.split('@')[0]}`);
                            const mentions = adminList.map(p => p.id);
                            if (cmd === `${PREFIX}admins`) {
                                await this.sendInstant(
                                    chat,
                                    boxCard(`👑 𝗚𝗥𝗢𝗨𝗣 𝗔𝗗𝗠𝗜𝗡𝗦 (${adminTags.length}) 👑`, adminTags.length ? adminTags : [g('NO ADMINS FOUND')]),
                                    mentions
                                );
                            } else {
                                await this.sendInstant(
                                    chat,
                                    boxCard(
                                        `📌 𝗚𝗥𝗢𝗨𝗣 𝗜𝗡𝗙𝗢 📌`,
                                        [
                                            `*${g('NAME')}*    : ${meta.subject}`,
                                            `*${g('MEMBERS')}* : ${meta.participants?.length || 0}`,
                                            `*${g('ADMINS')}*  : ${adminTags.length}`
                                        ]
                                    ),
                                    mentions
                                );
                            }
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗜𝗡𝗙𝗢 𝗘𝗥𝗥𝗢𝗥 ❌`, [`*${g('STATUS')}* : ${g('FAILED TO FETCH GC INFO')}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}tagall` || cmd.startsWith(`${PREFIX}tagall `) || cmd === `${PREFIX}everyone` || cmd.startsWith(`${PREFIX}everyone `)) {
                        if (!isGroup) { await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`])); continue; }
                        try {
                            const meta = await this.socket.groupMetadata(chat);
                            const members = (meta.participants || []).map(p => p.id).filter(Boolean);
                            const customMsg = body.replace(new RegExp(`^\\${PREFIX}(tagall|everyone)\\s*`, 'i'), '').trim() || 'Attention everyone!';
                            const chunkSize = 20;
                            for (let i = 0; i < members.length; i += chunkSize) {
                                if (runtimeState.botPaused || this.stopped) break;
                                const slice = members.slice(i, i + chunkSize);
                                const tagsText = slice.map(j => `@${j.split('@')[0]}`).join(' ');
                                await this.sendInstant(chat, boxCard(`📣 𝗧𝗔𝗚 𝗔𝗟𝗟 📣`, [`*${g('NOTE')}* : ${customMsg}`, tagsText]), slice);
                                if (i + chunkSize < members.length) {
                                    await delay(800);
                                }
                            }
                        } catch {
                            await this.sendInstant(chat, boxCard(`❌ 𝗧𝗔𝗚𝗔𝗟𝗟 𝗙𝗔𝗜𝗟𝗘𝗗 ❌`, [`*${g('STATUS')}* : ${g('TRY AGAIN')}`]));
                        }
                        continue;
                    }

                    if (cmd === `${PREFIX}flip`) {
                        const side = Math.random() < 0.5 ? `🪙 ${g('HEADS')}` : `🪙 ${g('TAILS')}`;
                        await this.sendInstant(chat, boxCard(`🪙 𝗖𝗢𝗜𝗡 𝗙𝗟𝗜𝗣 🪙`, [`*${g('RESULT')}* : ${side}`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}roll`) {
                        const num = Math.floor(Math.random() * 6) + 1;
                        await this.sendInstant(chat, boxCard(`🎲 𝗗𝗜𝗖𝗘 𝗥𝗢𝗟𝗟 🎲`, [`*${g('NUMBER')}* : *${num}*`]));
                        continue;
                    }

                    if (cmd === `${PREFIX}rps` || cmd.startsWith(`${PREFIX}rps `)) {
                        const choices = ['rock', 'paper', 'scissors'];
                        const botPick = choices[Math.floor(Math.random() * choices.length)];
                        const userPick = body.slice(PREFIX.length + 3).trim().toLowerCase();
                        await this.sendInstant(
                            chat,
                            boxCard(
                                `🎮 𝗥𝗢𝗖𝗞 𝗣𝗔𝗣𝗘𝗥 𝗦𝗖𝗜𝗦𝗦𝗢𝗥𝗦 🎮`,
                                [
                                    `*${g('YOU')}* : ${g(userPick || 'RANDOM')}`,
                                    `*${g('BOT')}* : ${g(botPick)}`
                                ]
                            )
                        );
                        continue;
                    }

                    if (cmd === `${PREFIX}ancstop` || cmd === `${PREFIX}stoptxt`) {
                        this.stopAllLoops();
                        await this.sendInstant(chat, boxCard(`🛑 𝗟𝗢𝗢𝗣𝗦 𝗦𝗧𝗢𝗣𝗣𝗘𝗗 🛑`, [`*${g('STATUS')}* : ${g('ALL ACTIVE LOOPS HALTED')}`]));
                        continue;
                    }

                    if (cmd.startsWith('+ai ') || cmd.startsWith(`${PREFIX}ai `)) {
                        const prompt = body.slice(body.startsWith('+ai ') ? 4 : PREFIX.length + 3).trim();
                        if (!prompt) {
                            await this.sendInstant(chat, boxCard(`⚠️ 𝗣𝗥𝗢𝗠𝗣𝗧 𝗠𝗜𝗦𝗦𝗜𝗡𝗚 ⚠️`, [`*${g('USAGE')}* : ${PREFIX}ai your question`]));
                            continue;
                        }
                        const reqEpoch = GLOBAL_EPOCH;
                        const reply = await generateDirectAI(prompt);
                        if (!runtimeState.botPaused && reqEpoch === GLOBAL_EPOCH) {
                            await this.sendInstant(chat, boxCard(`🧠 𝗦𝗠𝗪 𝗔𝗜 🧠`, [reply]));
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
                                if (!isGroup) await this.sendInstant(chat, boxCard(`⚠️ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬 ⚠️`, [`*${g('USE IN')}* : ${g('GROUP CHAT')}`]));
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

                if (
                    !runtimeState.botPaused &&
                    isChatAutoReplyOn(this.phone, chat) &&
                    !isFromMe &&
                    body &&
                    !isCommandText
                ) {
                    const reqEpoch = GLOBAL_EPOCH;
                    const chosenEmoji = pickRandomReaction();

                    this.enqueueSend(async () => {
                        if (!this.stopped && !runtimeState.botPaused && this.socket && isChatAutoReplyOn(this.phone, chat)) {
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
                            if (!this.socket) {
                                await delay(800);
                                continue;
                            }
                            const emo1 = emojis[idx % emojis.length];
                            const emo2 = emojis[(idx + 3) % emojis.length];
                            idx += 1;
                            try {
                                await this.socket.groupUpdateSubject(chat, `${emo1} ⚡ ${txt} ⚡ ${emo2}`);
                            } catch {}

                            const step = 120;
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

                    if (notify) await this.sendInstant(chat, loopStartLayout(key, `DELAY: ${safeDelay}ms`));
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
                            if (!this.socket) {
                                await delay(800);
                                continue;
                            }
                            try {
                                const sent = await this.socket.sendMessage(chat, { text: txt });
                                if (sent?.key?.id) this.sentByBotIds.add(sent.key.id);
                            } catch {}

                            const step = 120;
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

                    if (notify) await this.sendInstant(chat, loopStartLayout('text loop', `DELAY: ${safeDelay}ms`));
                    break;
                }
            }
        } catch {}
    }

    enqueueSend(taskFn) {
        this.sendQueue = this.sendQueue
            .then(async () => {
                await taskFn();
                await delay(80 + Math.floor(Math.random() * 60));
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

class Hub {
    constructor() {
        this.sessions = new Map();
        this.counter = 1;
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

        const existingEntries = [...this.sessions.entries()].filter(([, s]) => s.phone === clean && !s.stopped);
        for (const [key, oldSess] of existingEntries) {
            await oldSess.destroySession();
            this.sessions.delete(key);
        }

        const id = String(this.counter++);
        const session = new Session(id, clean, this, requesterJid, true, false);
        this.sessions.set(id, session);

        const allNums = [...this.sessions.values()].filter(x => !x.stopped && x.phone).map(x => x.phone);
        this.saveNumbers(allNums);

        return await session.pairFreshInChat();
    }

    pauseAllBotsKeepSessionAlive() {
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
        this.saveNumbers(numbers);
        for (const num of numbers) {
            const id = String(this.counter++);
            const isPrimary = Boolean(CONFIGURED_BOT_NUMBER && num === CONFIGURED_BOT_NUMBER);
            const session = new Session(id, num, this, null, false, isPrimary);
            this.sessions.set(id, session);
            await session.init();
            await delay(1000);
        }
    }
}

console.log(`
◈  𝗦𝗠𝗪 𝗜𝗢𝗦 𝗕𝗢𝗧 v18.1 ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary Number    : ${CONFIGURED_BOT_NUMBER ? `+${CONFIGURED_BOT_NUMBER}` : 'NOT SET'}
  Browser Profile   : macOS Desktop (Stable)
  Emoji Pool Loaded : ${REACTION_POOL.length} Emojis
  Initial Mode      : STANDBY (Send !start to run)
  Port              : ${PORT}
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
