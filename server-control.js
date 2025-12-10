// server-control.js - versão consolidada e única
// Painel simples para controlar o bot (start/stop) e exibir mensagens amigáveis.
// Uso: node server-control.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = process.cwd();
const OUTPUT_BASE = path.resolve(PROJECT_ROOT, 'bot-output');
const WEB_UI_DIR = path.join(__dirname, 'web-ui');
const CONTROL_FILE = path.join(PROJECT_ROOT, 'control.json');
const API_TOKEN = process.env.CONTROL_API_TOKEN || null; // optional token to protect POST endpoints

if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });
if (!fs.existsSync(CONTROL_FILE)) fs.writeFileSync(CONTROL_FILE, JSON.stringify({ paused: false, action: null, at: null }, null, 2));

function log(...args) { console.log('[server-control]', ...args); }
function appendLog(line) {
  try {
    const f = path.join(OUTPUT_BASE, 'bot.log');
    const txt = new Date().toISOString() + ' ' + line + '\n';
    fs.appendFileSync(f, txt, 'utf8');
  } catch (e) { log('appendLog failed', e.message); }
}

let botProcess = null;
let lastMessage = 'Nenhuma ação ainda';
let hasSlot = false;
let lastScreenshot = null;

function optionalAuth(req, res, next) {
  if (!API_TOKEN) return next(); // sem token definido, passa
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  const tokenFromHeader = auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const token = tokenFromHeader || req.query.token || (req.body && req.body.token);
  if (!token || token !== API_TOKEN) return res.status(401).json({ ok: false, error: 'unauthorized' });
  return next();
}

function readControl() { try { return JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8')); } catch (e) { return { paused: false, action: null, at: null }; } }
function writeControl(obj) { try { fs.writeFileSync(CONTROL_FILE, JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { log('Erro ao escrever control.json', e.message); } }

function findLatestScreenshot() {
  try {
    const globalStatus = path.join(OUTPUT_BASE, 'last_status.json');
    if (fs.existsSync(globalStatus)) {
      const st = JSON.parse(fs.readFileSync(globalStatus, 'utf8'));
      if (st.runDir && st.screenshot) return `/files/${path.basename(st.runDir)}/${st.screenshot}`;
    }
    const runs = fs.readdirSync(OUTPUT_BASE).filter(n => fs.statSync(path.join(OUTPUT_BASE, n)).isDirectory()).sort();
    if (runs.length) {
      const latest = runs[runs.length - 1];
      const files = fs.readdirSync(path.join(OUTPUT_BASE, latest));
      const img = files.find(f => f.endsWith('.png') || f.endsWith('.jpg'));
      if (img) return `/files/${latest}/${img}`;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function startBot() {
  if (botProcess) return { ok: false, message: 'O bot já está em execução' };
  const node = process.execPath || 'node';
  const script = path.join(PROJECT_ROOT, 'bot.js');
  if (!fs.existsSync(script)) return { ok: false, message: 'Arquivo bot.js não encontrado' };

  lastMessage = 'Iniciando agendamento...';
  appendLog('API start requested - iniciando agendamento');
  hasSlot = false;
  lastScreenshot = null;

  botProcess = spawn(node, [script], { cwd: PROJECT_ROOT, env: Object.assign({}, process.env, { NODE_ENV: 'production' }), stdio: ['ignore', 'pipe', 'pipe'] });

  botProcess.stdout.on('data', (data) => {
    const txt = String(data).trim();
    appendLog('[bot stdout] ' + txt);
    if (/iniciando|starting|abrindo/i.test(txt)) lastMessage = 'Iniciando agendamento...';
    else if (/verificando|checking|checando/i.test(txt)) lastMessage = 'A verificar disponibilidade...';
    else lastMessage = txt;

    if (/success|recibo|receipt|booking|agendado|confirmado/i.test(txt)) {
      hasSlot = true;
      lastMessage = 'Vaga encontrada!';
      appendLog('Slot detected (heuristic)');
      lastScreenshot = findLatestScreenshot();
    }
    if (/no slots|sem vagas|não há vagas|nao ha vagas|no availability/i.test(txt)) {
      hasSlot = false;
      lastMessage = 'Não há vagas de momento';
    }
  });

  botProcess.stderr.on('data', (data) => {
    const txt = String(data).trim();
    appendLog('[bot stderr] ' + txt);
    lastMessage = txt;
  });

  botProcess.on('exit', (code, signal) => {
    appendLog('Bot exited code=' + code + ' signal=' + signal);
    lastMessage = 'Bot parado' + (code != null ? (' (exit ' + code + ')') : '');
    botProcess = null;
  });

  return { ok: true, message: 'Bot iniciado' };
}

function stopBot() {
  if (!botProcess) return { ok: false, message: 'Bot não está em execução' };
  try {
    appendLog('API stop requested - parando bot');
    lastMessage = 'Parando agendamento...';
    botProcess.kill('SIGTERM');
    const pid = botProcess.pid;
    setTimeout(() => {
      try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); appendLog('Bot SIGKILL sent'); } catch (e) { }
    }, 5000);
    return { ok: true, message: 'Parando bot' };
  } catch (e) {
    return { ok: false, message: 'Falha ao parar bot: ' + e.message };
  }
}

const app = express();
app.use(express.json());

if (fs.existsSync(WEB_UI_DIR)) { app.use('/', express.static(WEB_UI_DIR)); log('Serving web UI from', WEB_UI_DIR); } else { log('web-ui folder not found at', WEB_UI_DIR); }
app.use('/files', express.static(OUTPUT_BASE));
log('Serving bot-output files at /files ->', OUTPUT_BASE);

app.post('/start', optionalAuth, (req, res) => { try { const r = startBot(); return res.json(Object.assign({ ok: true }, r)); } catch (e) { appendLog('start error ' + e.message); return res.status(500).json({ ok: false, error: e.message }); } });
app.post('/stop', optionalAuth, (req, res) => { try { const r = stopBot(); return res.json(Object.assign({ ok: true }, r)); } catch (e) { appendLog('stop error ' + e.message); return res.status(500).json({ ok: false, error: e.message }); } });

app.get('/status', (req, res) => { try { lastScreenshot = lastScreenshot || findLatestScreenshot(); const friendly = lastMessage || (botProcess ? 'A verificar...' : 'Não há vagas de momento'); return res.json({ ok: true, running: !!botProcess, hasSlot: !!hasSlot, lastMessage: friendly, lastScreenshot }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.get('/logs', (req, res) => { try { const f = path.join(OUTPUT_BASE, 'bot.log'); if (!fs.existsSync(f)) return res.json({ ok: true, text: 'no logs' }); const txt = fs.readFileSync(f, 'utf8'); const q = parseInt(req.query.lines || '200', 10) || 200; const lines = txt.split(/\r?\n/).filter(Boolean); return res.json({ ok: true, text: lines.slice(-q).join('\n') }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.get('/last-result', (req, res) => { try { const globalStatusFile = path.join(OUTPUT_BASE, 'last_status.json'); if (fs.existsSync(globalStatusFile)) { const st = JSON.parse(fs.readFileSync(globalStatusFile, 'utf8')); if (st.runDir && st.screenshot) st.screenshotPath = `/files/${path.basename(st.runDir)}/${st.screenshot}`; return res.json({ ok: true, source: 'last_status', result: st }); } const items = fs.readdirSync(OUTPUT_BASE).filter(n => fs.statSync(path.join(OUTPUT_BASE, n)).isDirectory()).sort(); if (items.length) { const latest = items[items.length - 1]; const latestDir = path.join(OUTPUT_BASE, latest); const bookingFile = path.join(latestDir, 'booking_result.json'); const statusFile = path.join(latestDir, 'status.json'); let out = { status: 'unknown', runDir: latestDir }; if (fs.existsSync(statusFile)) out = Object.assign(out, JSON.parse(fs.readFileSync(statusFile, 'utf8'))); else if (fs.existsSync(bookingFile)) out = Object.assign(out, JSON.parse(fs.readFileSync(bookingFile, 'utf8'))); const imgs = fs.readdirSync(latestDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg')); if (imgs.length) out.screenshotPath = `/files/${latest}/${imgs[0]}`; return res.json({ ok: true, source: 'latest-run', result: out }); } return res.json({ ok: true, source: 'none', result: { status: 'offline', message: 'Sem resultados' } }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.post('/clear-logs', optionalAuth, (req, res) => { try { const f = path.join(OUTPUT_BASE, 'bot.log'); if (!fs.existsSync(f)) return res.json({ ok: true, cleared: false, message: 'nenhum bot.log' }); fs.unlinkSync(f); appendLog('API clear-logs requested'); return res.json({ ok: true, cleared: true }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.post('/force', optionalAuth, (req, res) => { try { const ctrl = readControl(); ctrl.action = 'force'; ctrl.at = new Date().toISOString(); writeControl(ctrl); appendLog('API force requested'); return res.json({ ok: true, action: 'force' }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.post('/pause', optionalAuth, (req, res) => { try { const ctrl = readControl(); ctrl.paused = true; ctrl.at = new Date().toISOString(); writeControl(ctrl); appendLog('API pause requested'); return res.json({ ok: true, paused: true }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.post('/resume', optionalAuth, (req, res) => { try { const ctrl = readControl(); ctrl.paused = false; ctrl.at = new Date().toISOString(); writeControl(ctrl); appendLog('API resume requested'); return res.json({ ok: true, paused: false }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });

app.get('/control', (req, res) => { try { return res.json({ ok: true, control: readControl() }); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); } });
app.get('/ping', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.listen(PORT, () => log('Control server listening on', PORT));
