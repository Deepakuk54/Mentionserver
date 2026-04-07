const fs = require('fs');
const path = require('path');
const express = require('express');
const wiegine = require('fca-mafiya');
const axios = require('axios');
const WebSocket = require('ws');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 21306;
const TASKS_FILE = path.join(__dirname, 'database_mention_v4.json');

let nameCache = new Map();
let activeEngines = new Map();

// RENDER KEEP-ALIVE
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        axios.get(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}.onrender.com`).catch(() => {});
    }
}, 8 * 60 * 1000); 

const U_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
];

function saveToDB(t) { try { fs.writeFileSync(TASKS_FILE, JSON.stringify(t, null, 2)); } catch(e){} }
function loadFromDB() {
    if(fs.existsSync(TASKS_FILE)) { try { return JSON.parse(fs.readFileSync(TASKS_FILE)); } catch(e){ return []; } }
    return [];
}

class Messenger {
    constructor(ws, token) { this.ws = ws; this.sessions = []; this.idx = 0; this.token = token; }
    log(m) {
        const t = `[${new Date().toLocaleTimeString()}] ${m}`;
        if(this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({type:'log', message:t}));
        console.log(`[${this.token}] ${t}`);
    }
    
    async send(msg, tid, mentionUID) {
        const active = this.sessions.filter(s => s.ok);
        if(!active.length) return { success: false };
        const s = active[this.idx % active.length];
        this.idx++;

        return new Promise(async (res) => {
            try {
                let name = nameCache.get(mentionUID);
                if (!name) {
                    await new Promise(resolve => {
                        s.api.getUserInfo(mentionUID, (err, ret) => {
                            if(!err && ret[mentionUID]) {
                                name = ret[mentionUID].name;
                                nameCache.set(mentionUID, name);
                            } else { name = "User"; }
                            resolve();
                        });
                    });
                }
                const mentionData = [{ tag: name, id: mentionUID }];
                s.api.sendMessage({ body: `${name} ${msg}`, mentions: mentionData }, tid, (err) => {
                    if(err) { s.ok = false; res({ success: false }); }
                    else res({ success: true, name });
                });
            } catch (e) { res({ success: false }); }
        });
    }
}

async function startLoop(token) {
    if(!activeEngines.has(token)) return;
    const all = loadFromDB();
    const task = all.find(t => t.token === token);
    const engine = activeEngines.get(token);
    if(!task || !task.run) return;

    const msgs = (task.msgs || "").split('\n').filter(Boolean);
    const uids = (task.haters || "").split(',').filter(Boolean);
    if(msgs.length === 0) return;

    const randomMsgIndex = Math.floor(Math.random() * msgs.length);
    const m = msgs[randomMsgIndex].toString().trim();
    const targetUID = uids[Math.floor(Math.random() * uids.length)].trim();

    const res = await engine.send(m, task.tid, targetUID);
    if(res.success) {
        engine.log(`✔️ [OK] Tagged ${res.name}`);
    } else {
        engine.log(`❌ [FAIL] Session Error`);
    }

    const baseDelay = parseInt(task.delay || 5) * 1000;
    setTimeout(() => { if(activeEngines.has(token)) startLoop(token); }, baseDelay + Math.floor(Math.random() * 2000));
}

async function initTask(ws, d) {
    const token = d.token || uuidv4().split('-')[0].toUpperCase();
    d.token = token; d.run = true;
    let current = loadFromDB();
    if(!current.find(t => t.token === token)) { current.push(d); saveToDB(current); }
    const engine = new Messenger(ws, token);
    activeEngines.set(token, engine);
    if(ws) ws.send(JSON.stringify({type:'token', token}));
    
    const cookies = (d.cookies || "").split('\n').filter(Boolean);
    for(let i=0; i<cookies.length; i++) {
        await new Promise(r => {
            try {
                let ck = cookies[i].trim();
                let loginData = (ck.startsWith('[') && ck.endsWith(']')) ? {appState: JSON.parse(ck)} : ck;
                const agent = U_AGENTS[Math.floor(Math.random() * U_AGENTS.length)];
                wiegine.login(loginData, {logLevel:'silent', forceLogin: true, userAgent: agent}, (err, api) => {
                    if(!err && api) {
                        api.setOptions({listenEvents: false, selfListen: false, autoMarkRead: true});
                        engine.sessions.push({api, ok:true});
                        engine.log(`✔️ Cookie ${i+1} Ready`);
                    } r();
                });
            } catch(e){ r(); }
        });
    }
    if(engine.sessions.length > 0) startLoop(token);
}

app.post('/upload-msg', upload.single('f'), (req, res) => {
    if(!req.file) return res.send({m:''});
    res.send({m: fs.readFileSync(req.file.path, 'utf-8')});
    fs.unlinkSync(req.file.path);
});

app.get('/', (req,res) => {
    res.send(`<!DOCTYPE html><html><head><title>DEEPAK RANDOM MENTION</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0d1117;color:#58a6ff;font-family:monospace;padding:10px;text-align:center}.box{max-width:400px;margin:auto;border:1px solid #30363d;padding:20px;background:#161b22;border-radius:10px}input,textarea{width:90%;margin:10px 0;padding:10px;background:#0d1117;border:1px solid #30363d;color:#fff;border-radius:5px}button{width:100%;padding:12px;background:#238636;color:#fff;border:none;cursor:pointer;font-weight:bold;margin-top:10px}#log{height:180px;overflow-y:auto;background:#000;margin-top:15px;padding:8px;font-size:12px;text-align:left;color:#00f2ff}</style></head><body><div class="box"><h2>◈ RANDOM TAG BOT ◈</h2><input id="t" placeholder="Group UID"><input id="d" type="number" placeholder="Delay"><input id="h" placeholder="Haters UIDs (Comma separated)"><div style="border:1px dashed #30363d;padding:10px;margin:10px 0"><small>Upload Messages (.txt)</small><br><input type="file" id="fi" style="width:100%"></div><textarea id="c" rows="4" placeholder="Cookies"></textarea><button onclick="st()">LAUNCH RANDOM ATTACK</button><hr style="border:0.1px solid #30363d;margin:20px 0"><input id="sk" placeholder="Token to Stop"><button onclick="sp()" style="background:#da3333">TERMINATE</button><div id="log">Ready...</div></div><script>let ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.onmessage = e => { let d = JSON.parse(e.data); if(d.type==='log'){ let l=document.getElementById('log'); l.innerHTML+='<div>'+d.message+'</div>'; l.scrollTop=l.scrollHeight; } if(d.type==='token') alert('YOUR TOKEN: ' + d.token); };async function up(){let f=document.getElementById('fi').files[0];if(!f)return null;let fd=new FormData();fd.append('f',f);let r=await fetch('/upload-msg',{method:'POST',body:fd});let j=await r.json();return j.m;}async function st(){let msgs=await up();if(!msgs){alert('File dalo!');return;}ws.send(JSON.stringify({type:'start',tid:document.getElementById('t').value,delay:document.getElementById('d').value,haters:document.getElementById('h').value,msgs:msgs,cookies:document.getElementById('c').value}));}function sp(){ let tk=document.getElementById('sk').value; if(!tk){alert('Token dalo!');return;} ws.send(JSON.stringify({type:'stop', token:tk})); }</script></body></html>`);
});

const server = app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    loadFromDB().forEach((t, i) => { if(t.run) setTimeout(() => initTask(null, t), i * 5000); });
});

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', ws => {
    ws.on('message', m => {
        try {
            let d = JSON.parse(m);
            if(d.type==='start') initTask(ws, d);
            if(d.type==='stop') {
                activeEngines.delete(d.token);
                saveToDB(loadFromDB().filter(t => t.token !== d.token));
                ws.send(JSON.stringify({type:'log', message:'🔴 Bot Stopped'}));
            }
        } catch(e){}
    });
});
