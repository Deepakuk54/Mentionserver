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
    
    // Log function with Stop Button logic
    log(m, isSystem = false) {
        const t = `[${new Date().toLocaleTimeString()}] ${m}`;
        if(this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({
                type: 'log', 
                message: t, 
                token: this.token,
                isSystem: isSystem 
            }));
        }
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
                const mentionData = [{ tag: name, id: mentionUID, fromIndex: 0 }];
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
        engine.log(`✔️ [RANDOM OK] Tagged ${res.name}`);
    } else {
        engine.log(`❌ [FAIL] Session Check...`);
    }

    const baseDelay = parseInt(task.delay || 5) * 1000;
    const extraRandom = Math.floor(Math.random() * 2000); 
    setTimeout(() => { if(activeEngines.has(token)) startLoop(token); }, baseDelay + extraRandom);
}

async function initTask(ws, d) {
    const token = d.token || "DRB-" + uuidv4().split('-')[0].toUpperCase();
    d.token = token; d.run = true;
    let current = loadFromDB();
    if(!current.find(t => t.token === token)) { current.push(d); saveToDB(current); }
    
    const engine = new Messenger(ws, token);
    activeEngines.set(token, engine);
    
    if(ws) ws.send(JSON.stringify({type:'token', token}));
    
    // UI mein stop button dikhane ke liye system log
    engine.log(`🚀 Task Started! (ID: ${token})`, true);

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
                        engine.log(`✔️ Cookie ${i+1} Connected`);
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
    res.send(`<!DOCTYPE html><html><head><title>DEEPAK RAJPUT V7 VIP</title><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
        :root { --glow: #ff0000; --bg: #050505; --cyan: #00f2ff; }
        body { background: var(--bg); color: #fff; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 10px; margin: 0; }
        .drb-card { max-width: 450px; margin: 10px auto; background: #111; border: 2px solid var(--glow); border-radius: 15px; box-shadow: 0 0 20px rgba(255,0,0,0.2); overflow: hidden; }
        .drb-head { background: linear-gradient(to bottom, #800000, #ff0000); padding: 20px; font-weight: bold; font-size: 18px; text-transform: uppercase; letter-spacing: 2px; }
        .drb-body { padding: 20px; }
        input, textarea { width: 100%; padding: 12px; margin-bottom: 12px; background: #1a1a1c; border: 1px solid #333; color: #fff; border-radius: 8px; box-sizing: border-box; outline: none; }
        input:focus { border-color: var(--cyan); }
        .btn-launch { background: #28a745; color: #fff; border: none; padding: 15px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; text-transform: uppercase; font-size: 16px; box-shadow: 0 4px 0 #1e7e34; }
        .btn-launch:active { transform: translateY(2px); box-shadow: none; }
        #log { height: 280px; overflow-y: auto; background: #000; margin-top: 15px; padding: 10px; font-size: 11px; text-align: left; color: var(--cyan); border-radius: 8px; border: 1px solid #222; }
        .log-item { margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #222; }
        .stop-btn-log { background: #ff003c; color: white; border: none; padding: 4px 10px; font-size: 10px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-left: 10px; }
        .sys-log { color: #ffd700; background: #1a1a1c; padding: 8px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffd700; }
    </style>
</head><body>
    <div class="drb-card">
        <div class="drb-head">Deepak Rajput Brand V7</div>
        <div class="drb-body">
            <input id="t" placeholder="Target Group ID">
            <input id="d" type="number" placeholder="Delay (Seconds)">
            <input id="h" placeholder="Hater UIDs (Comma separated)">
            <div style="text-align:left; font-size:11px; color:#888; margin-bottom:5px;">Upload Messages (.txt)</div>
            <input type="file" id="fi">
            <textarea id="c" rows="4" placeholder="String Cookies (One per line)"></textarea>
            <button class="btn-launch" onclick="st()">Launch Attack 🚀</button>
            <div id="log">Ready for Deployment...</div>
        </div>
    </div>
<script>
    let ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
    ws.onmessage = e => {
        let d = JSON.parse(e.data);
        if(d.type==='log'){
            let l=document.getElementById('log');
            let div = document.createElement('div');
            div.className = d.isSystem ? 'log-item sys-log' : 'log-item';
            let content = '<span>' + d.message + '</span>';
            if(d.isSystem) {
                content += '<button class="stop-btn-log" onclick="sp(\''+d.token+'\')">STOP TASK</button>';
            }
            div.innerHTML = content;
            l.appendChild(div);
            l.scrollTop = l.scrollHeight;
        }
        if(d.type==='token') alert('SUCCESS! TOKEN: ' + d.token);
    };
    async function up(){
        let f=document.getElementById('fi').files[0]; if(!f) return null;
        let fd=new FormData(); fd.append('f',f);
        let r=await fetch('/upload-msg',{method:'POST',body:fd});
        let j=await r.json(); return j.m;
    }
    async function st(){
        let msgs=await up(); if(!msgs){alert('File dalo!'); return;}
        ws.send(JSON.stringify({
            type:'start', tid:document.getElementById('t').value, delay:document.getElementById('d').value,
            haters:document.getElementById('h').value, msgs:msgs, cookies:document.getElementById('c').value
        }));
    }
    function sp(tk){
        if(confirm('Stop this task? ID: ' + tk)) {
            ws.send(JSON.stringify({type:'stop', token:tk}));
        }
    }
</script></body></html>`);
});

const server = app.listen(PORT, () => {
    loadFromDB().forEach((t, i) => { if(t.run) setTimeout(() => initTask(null, t), i * 4000); });
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
                ws.send(JSON.stringify({type:'log', message:'🔴 TERMINATED: ' + d.token}));
            }
        } catch(e){}
    });
});
