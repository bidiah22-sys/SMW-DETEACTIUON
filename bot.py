#!/usr/bin/env python3
import os,re,time,sqlite3,logging
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from instagrapi import Client

load_dotenv()
SESSION_ID=os.getenv("INSTAGRAM_SESSION_ID","19088037883%3AQEE5oTG6apmh4F%3A18%3AAYnoGrgpBgyt3jyMGWDnpi3lmU3LoAkzUtsormQlDg").strip()
REGISTRY_THREAD_ID=os.getenv("REGISTRY_THREAD_ID","").strip()
DB_PATH=os.getenv("DB_PATH","smw_spammer_registry.db")
BOT_USERNAME=os.getenv("BOT_USERNAME","SMW_BOT")
POLL_INTERVAL=max(2,int(os.getenv("POLL_INTERVAL","3")))
TZ=os.getenv("TIMEZONE","Asia/Kolkata")
URL_RE=re.compile(r"(?i)\b(?:https?://|www\.)[^\s<>\[\]{}\"\']+|(?<!@)\b(?:[a-z0-9-]+\.)+(?:com|net|org|in|co|io|me|ly|gg|app|dev|xyz|top|site|online|shop|store|info|biz|tech|live|link)(?:/[^\s<>\[\]{}\"\']*)?")
logging.basicConfig(level=logging.INFO,format="%(asctime)s | %(levelname)s | %(message)s")
log=logging.getLogger("SMW-REGISTRY")

def now():
    try:return datetime.now(ZoneInfo(TZ))
    except:return datetime.now()

def init_db():
    with sqlite3.connect(DB_PATH) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS detections(
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,username TEXT,
        gc_id TEXT NOT NULL,gc_name TEXT,link TEXT NOT NULL,detected_at TEXT NOT NULL,
        evidence INTEGER NOT NULL DEFAULT 1,
        UNIQUE(user_id,gc_id,link))""")
        c.commit()

def links(text):
    if not text:return []
    return list(dict.fromkeys(x.rstrip(".,!?;:)]}'") for x in URL_RE.findall(text)))

def admin_ids(thread):
    out=set()
    for attr in ("admin_user_ids","admin_users"):
        try:
            v=getattr(thread,attr,None)
            if v: v=v if isinstance(v,(list,tuple,set)) else [v]
            else:v=[]
            for x in v:
                if isinstance(x,(str,int)):out.add(str(x))
                else:
                    for a in ("pk","id","user_id"):
                        z=getattr(x,a,None)
                        if z is not None:out.add(str(z));break
        except:pass
    return out

def is_admin(thread,bot_id):
    return bool(bot_id and bot_id in admin_ids(thread))

def is_group(thread):
    try:
        if len(getattr(thread,"users",[]) or [])>1:return True
    except:pass
    try:return "group" in str(getattr(thread,"thread_type","")).lower()
    except:return False

def thread_name(thread):
    for a in ("thread_title","name","title"):
        try:
            v=getattr(thread,a,None)
            if v:return str(v)
        except:pass
    return "Instagram Group"

def message_id(m):
    return str(getattr(m,"id",getattr(m,"pk","")) or "")

def sender(m):
    try:
        uid=getattr(m,"user_id",getattr(m,"sender_id",None))
        if uid:return str(uid), ""
    except:pass
    try:
        u=getattr(m,"user",None)
        if u:return str(getattr(u,"pk",getattr(u,"id",""))),str(getattr(u,"username","") or "")
    except:pass
    return "",""

def text_of(m):
    return str(getattr(m,"text",getattr(m,"item_text","")) or "")

def save_detection(uid,uname,gid,gname,link,stamp):
    with sqlite3.connect(DB_PATH) as c:
        row=c.execute("SELECT id,evidence FROM detections WHERE user_id=? AND gc_id=? AND link=?",(uid,gid,link)).fetchone()
        if row:
            n=row[1]+1
            c.execute("UPDATE detections SET evidence=?,username=?,detected_at=? WHERE id=?",(n,uname,stamp,row[0]))
        else:
            n=1
            c.execute("INSERT INTO detections(user_id,username,gc_id,gc_name,link,detected_at) VALUES(?,?,?,?,?,?)",(uid,uname,gid,gname,link,stamp))
        total=c.execute("SELECT COALESCE(SUM(evidence),0) FROM detections WHERE user_id=?",(uid,)).fetchone()[0]
        c.commit()
    return n,total

def card(uname,uid,link,gname,dt,total):
    u=("@"+uname.lstrip("@")) if uname else "Unknown"
    return f"""🚨 𝗦𝗠𝗪 𝗦𝗣𝗔𝗠𝗠𝗘𝗥 𝗥𝗘𝗚𝗜𝗦𝗧𝗥𝗬

👤 𝗨𝗦𝗘𝗥 ➜ {u}
🆔 𝗨𝗦𝗘𝗥 𝗜𝗗 ➜ {uid}

🔗 𝗗𝗘𝗧𝗘𝗖𝗧𝗜𝗢𝗡 ➜ 𝗟𝗜𝗡𝗞 𝗦𝗘𝗡𝗧
📌 𝗥𝗘𝗔𝗦𝗢𝗡 ➜ 𝗔𝗡𝗬 𝗟𝗜𝗡𝗞 𝗗𝗘𝗧𝗘𝗖𝗧𝗘𝗗
🌐 𝗟𝗜𝗡𝗞 ➜ {link}

🌷 𝗦𝗢𝗨𝗥𝗖𝗘 𝗚𝗖 ➜ {gname}
📅 𝗗𝗔𝗧𝗘 ➜ {dt.strftime("%d %b %Y")}
⏰ 𝗧𝗜𝗠𝗘 ➜ {dt.strftime("%I:%M %p")}

⚠️ 𝗦𝗧𝗔𝗧𝗨𝗦 ➜ 𝗟𝗜𝗡𝗞 𝗦𝗣𝗔𝗠 𝗗𝗘𝗧𝗘𝗖𝗧𝗘𝗗
📊 𝗘𝗩𝗜𝗗𝗘𝗡𝗖𝗘 ➜ {total} Detection{"s" if total!=1 else ""}

🚫 𝗔𝗖𝗧𝗜𝗢𝗡 ➜ 𝗗𝗢 𝗡𝗢𝗧 𝗔𝗗𝗗 𝗪𝗜𝗧𝗛𝗢𝗨𝗧 𝗥𝗘𝗩𝗜𝗘𝗪

👑 𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥 ➜ 𝗦𝗠𝗪 🚩"""

def login():
    if not SESSION_ID:raise RuntimeError("INSTAGRAM_SESSION_ID is missing")
    cl=Client();cl.delay_range=[1,2];cl.login_by_sessionid(SESSION_ID)
    log.info("Logged in as @%s",getattr(cl,"username",BOT_USERNAME));return cl

def send_registry(cl,msg):
    if not REGISTRY_THREAD_ID:
        log.warning("REGISTRY_THREAD_ID is not configured; detection saved only.");return
    try:cl.direct_send(msg,thread_ids=[int(REGISTRY_THREAD_ID)])
    except Exception as e:log.error("Registry send failed: %s",e)

def scan(cl,seen):
    bot_id=str(getattr(cl,"user_id",""))
    try:threads=cl.direct_threads(amount=200)
    except Exception as e:log.error("Thread fetch failed: %s",e);return
    for t in threads:
        gid=str(getattr(t,"pk",getattr(t,"id","")) or "")
        if not gid or not is_group(t) or not is_admin(t,bot_id):continue
        gname=thread_name(t)
        try:msgs=cl.direct_messages(gid,amount=20)
        except Exception as e:log.warning("GC read failed %s: %s",gname,e);continue
        for m in reversed(msgs):
            mid=message_id(m)
            if not mid or mid in seen:continue
            seen.add(mid)
            ls=links(text_of(m))
            if not ls:continue
            uid,uname=sender(m)
            if not uid:continue
            dt=now()
            for link in ls:
                _,total=save_detection(uid,uname,gid,gname,link,dt.isoformat())
                send_registry(cl,card(uname,uid,link,gname,dt,total))
                log.info("LINK SPAM | %s | %s | %s",uid,gname,link)
    if len(seen)>50000:seen.clear()

def main():
    init_db()
    cl=login();seen=set()
    log.info("SMW SPAMMER REGISTRY ONLINE")
    log.info("RULE: ANY LINK DETECTED = LINK SPAM")
    log.info("RULE: ONLY GCs WHERE BOT IS ADMIN ARE SCANNED")
    while True:
        try:scan(cl,seen)
        except KeyboardInterrupt:break
        except Exception as e:
            log.exception("Scanner error: %s",e)
            try:time.sleep(5);cl=login();seen=set()
            except Exception as x:log.error("Re-login failed: %s",x)
        time.sleep(POLL_INTERVAL)

if __name__=="__main__":main()
