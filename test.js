// open_and_wait.js
// Pede ao utilizador um link (URL), imprime no prompt, abre o browser com perfil persistente (user-data)
// e espera que o utilizador faça login manualmente. Ao pressionar ENTER, salva state.json.
// Uso: node open_and_wait.js
//
// Garantias:
// - NÃO automatiza login (não preenche, não clica).
// - Apenas abre o navegador para tu interagires manualmente.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USER_DATA = 'user-data';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // ajusta se necessário

(async () => {
  // lê URL do utilizador via prompt (com valor padrão para VFS)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const defaultUrl = 'https://visa.vfsglobal.com/ago/pt/bra/login';
  const answer = await new Promise(resolve => {
    rl.question(`Cole ou digite a URL a abrir (pressione ENTER para usar padrão: ${defaultUrl}):\n> `, resolve);
  });
  const urlToOpen = (answer && answer.trim()) ? answer.trim() : defaultUrl;
  console.log('\nURL definida:', urlToOpen);
  console.log('Abrindo navegador com perfil persistente (user-data). Não farei nenhum preenchimento nem clique no login.\n');

  // prepara o browser
  const useChromeReal = fs.existsSync(CHROME_PATH);
  if (useChromeReal) console.log('Será usado o Chrome real em:', CHROME_PATH);
  else console.log('Chrome real não encontrado. Usando Chromium do Playwright.');

  const context = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    ...(useChromeReal ? { executablePath: CHROME_PATH } : {}),
    args: ['--start-maximized']
  });

  // pega ou cria página
  const page = context.pages().length ? context.pages()[0] : await context.newPage();

  // tenta navegar para a URL (sem forçar demasiado)
  try {
    await page.goto(urlToOpen, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Página aberta no navegador. Interage nela manualmente (resolve cookies / reCAPTCHA / 2FA).');
  } catch (e) {
    console.warn('Aviso: não foi possível completar a navegação automaticamente (timeout ou bloqueio).');
    console.log('A página foi aberta (ou a aba está disponível) — verifica manualmente o URL no browser do perfil.');
  }

  console.log('\nQuando tiveres concluído o login/manual flow e estiveres no dashboard, volta ao terminal e pressiona ENTER para salvar state.json e continuar.');
  await new Promise(resolve => rl.question('Pressiona ENTER para salvar state.json e prosseguir...\n', resolve));
  rl.close();

  // tenta recarregar para garantir que cookies/token foram actualizados
  try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); } catch(_) {}

  // salva o state.json (cookies + localStorage)
  try {
    const outPath = path.resolve(process.cwd(), 'state.json');
    await context.storageState({ path: outPath });
    console.log('state.json salvo em:', outPath);
  } catch (err) {
    console.warn('Não foi possível salvar state.json:', err.message);
  }

  console.log('Operação concluída. O navegador permanece aberto para tua inspeção. Fecha manualmente quando quiseres.');
  // não fechamos context; termina o processo mas deixa browser visível
  // se preferires que o script feche o browser, descomenta a linha abaixo:
  // await context.close();
  process.exit(0);
})();