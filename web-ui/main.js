const API_BASE = '';

async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts));
  if (!res.ok) throw new Error('Erro ' + res.status);
  return res.json();
}

function setBanner(status) {
  const b = document.getElementById('statusBanner');
  b.className = '';
  if (status === 'ok') { b.classList.add('ok'); b.innerText = 'VAGA ENCONTRADA!'; }
  else if (status === 'warn') { b.classList.add('warn'); b.innerText = 'A verificar... (aguarde)'; }
  else { b.classList.add('off'); b.innerText = 'Sem vagas no momento'; }
}

async function refreshStatus() {
  try {
    const res = await api('/status');
    document.getElementById('lastMessage').innerText = res.lastMessage || '—';
    const img = document.getElementById('lastScreenshot');
    if (res.lastScreenshot) { img.src = res.lastScreenshot + '?t=' + Date.now(); document.getElementById('screenshotWrap').style.display = 'block'; }
    else { document.getElementById('screenshotWrap').style.display = 'none'; }
    if (res.running) setBanner('warn'); else setBanner(res.hasSlot ? 'ok' : 'off');
    // enable/disable buttons
    document.getElementById('btn-start').disabled = res.running;
    document.getElementById('btn-stop').disabled = !res.running;
  } catch (e) {
    console.error(e);
    document.getElementById('lastMessage').innerText = 'Erro ao obter estado';
    setBanner('off');
  }
}

document.getElementById('btn-start').addEventListener('click', async () => {
  try { document.getElementById('btn-start').disabled = true; await api('/start', { method: 'POST' }); setTimeout(refreshStatus, 1000); } catch (e) { alert('Erro: ' + e.message); document.getElementById('btn-start').disabled = false; }
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  try { document.getElementById('btn-stop').disabled = true; await api('/stop', { method: 'POST' }); setTimeout(refreshStatus, 1000); } catch (e) { alert('Erro: ' + e.message); document.getElementById('btn-stop').disabled = false; }
});

document.getElementById('btn-logs').addEventListener('click', async () => {
  try {
    const logs = await api('/logs?lines=500');
    const win = window.open('', '_blank');
    win.document.write('<pre>' + (logs.text || '—') + '</pre>');
  } catch (e) { alert('Erro: ' + e.message); }
});

window.addEventListener('load', () => {
  refreshStatus();
  setInterval(refreshStatus, 3000);
});
