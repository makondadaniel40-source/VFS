// bot.js
// Versão melhorada: aceita argumentos, usa Chrome real opcionalmente, tenta detetar login e salva state.json
// Como usar:
//   node bot.js                          (usa ./user-data e tenta path padrão do Chrome)
//   node bot.js --user-data ./perfil --chrome-path "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- Helpers para argumentos simples ---
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--user-data' && args[i + 1]) { out.userData = args[++i]; }
    else if (a === '--chrome-path' && args[i + 1]) { out.chromePath = args[++i]; }
    else if (a === '--headless') { out.headless = true; }
  }
  return out;
}

const argv = parseArgs();

// Default user-data dir (pode substituir com --user-data)
const defaultUserData = path.resolve(__dirname, 'user-data');
const userDataDir = argv.userData ? path.resolve(process.cwd(), argv.userData) : defaultUserData;

// Tenta detectar um executável Chrome padrão por plataforma (apenas se o user passou --chrome-path omitido)
function defaultChromePath() {
  const platform = process.platform;
  if (platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  // Linux (várias possiveis); deixamos null para fallback
  return '/usr/bin/google-chrome';
}

const chromePath = argv.chromePath || defaultChromePath();

// Garante pasta existe
if (!fs.existsSync(userDataDir)) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log('Criada pasta userDataDir em', userDataDir);
  } catch (e) {
    console.warn('Não foi possível criar userDataDir:', e.message);
  }
}

(async () => {
  // Opções seguras e explícitas
  const launchOptions = {
    headless: !!argv.headless || false,
    slowMo: 20,
    args: [
      '--start-maximized',
      // evita usar headless detection flags
      '--disable-blink-features=AutomationControlled'
    ],
  };

  // Se o chromePath parecer existir, tenta usar (reduz reCAPTCHA vs Chromium puro).
  if (chromePath && fs.existsSync(chromePath)) {
    launchOptions.executablePath = chromePath;
    console.log('Usando executável Chrome encontrado em:', chromePath);
  } else {
    // se não existir, remove para deixar o Playwright escolher (vai usar Chromium)
    if (chromePath) console.log('Executável sugerido não encontrado em', chromePath, '\nCaindo para Chromium (padrão do Playwright).');
  }

  console.log('Abrindo browser com userDataDir =', userDataDir);
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);

  // Cria uma página (se já houver páginas, usa a primeira disponível)
  const page = context.pages().length ? context.pages()[0] : await context.newPage();

  // URL que queremos que o utilizador entre manualmente (pode alterar)
  const targetLoginUrl = 'https://visa.vfsglobal.com/ago/pt/bra/login';

  // Função util para salvar storageState
  async function trySaveState() {
    try {
      await context.storageState({ path: 'state.json' });
      console.log('state.json salvo com sucesso.');
      // trigger fill-clients once after saving state.json
      try {
        const { spawn } = require('child_process');
        // only start if script exists
        const fc = require('path').join(process.cwd(), 'fill-clients.js');
        if (fs.existsSync(fc)) {
          console.log('Launching fill-clients.js to attempt bookings...');
          const child = spawn(process.execPath, [fc, '--all=true'], { stdio: 'inherit', cwd: process.cwd(), env: Object.assign({}, process.env, { HEADLESS: 'true' }) });
          child.on('exit', (code) => console.log('fill-clients.js exited with code', code));
        } else {
          console.log('fill-clients.js not found; skipping automatic booking launch.');
        }
      } catch (e) { console.warn('Failed to launch fill-clients.js:', e.message); }
    } catch (e) {
      console.warn('Não foi possível salvar state.json:', e.message);
    }
  }

  // Detecta heurística de "login completo" — regra geral: URL deixou de conter 'login' e não é uma página de challenge
  let autoSaved = false;
  page.on('framenavigated', async (frame) => {
    try {
      const url = frame.url();
      // Se a navegação mudou e já não estamos numa rota /login, tenta salvar automaticamente uma vez
      if (!autoSaved && url && !url.toLowerCase().includes('/login') && !url.toLowerCase().includes('captcha')) {
        console.log('Navegação detectada para', url);
        // Espera um pouco para garantir que cookies/token foram gravados
        await new Promise(r => setTimeout(r, 1500));
        await trySaveState();
        autoSaved = true;
      }
    } catch (e) {
      // ignorar
    }
  });

  // Se quiseres, navegar automaticamente para a página de login que referiste, para facilitar o usuário
  try {
    await page.goto(targetLoginUrl, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    console.warn('Não foi possível navegar automaticamente para o URL. Abre a página manualmente no browser do perfil.');
  }

  console.log('\n=== Instruções rápidas ===');
  console.log('1) No browser que abriu, faz login manualmente em', targetLoginUrl);
  console.log('   -> resolve qualquer reCAPTCHA, 2FA etc.');
  console.log('2) Quando estiveres no dashboard (ou a página principal após o login), volta ao terminal e pressiona ENTER.');
  console.log('   OBS: o script tenta detectar automaticamente uma navegação pós-login e salvar state.json; se isso falhar, pressiona ENTER para forçar.');

  // Espera ENTER do terminal
  process.stdin.resume();
  await new Promise(resolve => process.stdin.once('data', resolve));

  // Ao receber ENTER, tenta salvar state.json (garante que o utilizador quer persistir o estado)
  await trySaveState();

  console.log('\nFeito — podes fechar o browser manualmente. Se quiseres usar o state.json em scripts sem profile, usa-o com playwright.launch() e storageState.');
  console.log('Exemplo (outro script):\n  const browser = await chromium.launch({ headless: false });\n  const context = await browser.newContext({ storageState: "state.json" });\n');

  // Não fechamos automaticamente o context para permitir inspecionar o browser
  // Se quiseres fechar, descomenta a linha abaixo:
  // await context.close();

  // Mantemos o processo vivo até o usuário fechar manualmente (ou pressionar Ctrl+C)
})();
