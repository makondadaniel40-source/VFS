// fill-clients.js
// Usa Playwright para preencher o formulário do VFS com dados de `clients.json`.
// Uso:
//   node fill-clients.js --index=0      # preenche o cliente 0
//   node fill-clients.js --all=true     # preenche todos (loop)
// CONFIG:
// - usa `config.json` para selectors/urls
// - salva resultados em bot-output/fill-runs/<timestamp>/

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function log(...a) { console.log('[fill-clients]', ...a); }

async function run() {
  const cwd = process.cwd();
  const cfgPath = path.join(cwd, 'config.json');
  const clientsPath = path.join(cwd, 'clients.json');
  if (!fs.existsSync(cfgPath)) throw new Error('config.json not found');
  if (!fs.existsSync(clientsPath)) throw new Error('clients.json not found');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const clients = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));

  // parse args
  const argv = require('minimist')(process.argv.slice(2));
  const index = typeof argv.index !== 'undefined' ? parseInt(argv.index, 10) : null;
  const all = argv.all === 'true' || argv.all === true || false;
  const headless = (process.env.HEADLESS || 'true') === 'true';

  const runList = [];
  if (all) {
    for (let i = 0; i < clients.length; i++) runList.push({ i, client: clients[i] });
  } else if (index !== null && !isNaN(index)) {
    if (!clients[index]) throw new Error('client index out of range');
    runList.push({ i: index, client: clients[index] });
  } else {
    // default: first client
    runList.push({ i: 0, client: clients[0] });
  }

  const outBase = path.join(cwd, 'bot-output', 'fill-runs');
  if (!fs.existsSync(outBase)) fs.mkdirSync(outBase, { recursive: true });

  // Prefer Playwright specific storage file, but also accept `state.json` produced by `bot.js`.
  const storageCandidates = [path.join(cwd, 'playwright-storage.json'), path.join(cwd, 'state.json')];
  let storageFile = storageCandidates.find(f => fs.existsSync(f));

  // if no storage state exists, require interactive login (only supported when headless=false)
  if (!storageFile && headless) {
    throw new Error('No storage state found. Run once with HEADLESS=false to login interactively so the session can be saved.');
  }

  const browser = await chromium.launch({ headless });

  // if storage missing and not headless, open a temporary context for user to login and save storage
  if (!storageFile && !headless) {
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    log('No storage state found. A browser window opened; please login manually.');
    await loginPage.goto(cfg.baseUrl || 'about:blank', { waitUntil: 'domcontentloaded' });
    console.log('After login completes in the browser, press ENTER here to continue and save the session...');
    await new Promise((resolve) => {
      const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', async () => {
        try {
          // prefer saving to playwright-storage.json for compatibility
          const savePath = path.join(cwd, 'playwright-storage.json');
          await loginContext.storageState({ path: savePath });
          storageFile = savePath;
          log('Saved storage state to', savePath);
        } catch (e) { log('Failed to save storage state', e.message); }
        rl.close();
        resolve();
      });
    });
    await loginContext.close();
  }

  const context = await browser.newContext({ storageState: storageFile });
  const page = await context.newPage();

  for (const item of runList) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = path.join(outBase, `${ts}-client-${item.i}`);
    fs.mkdirSync(runDir, { recursive: true });
    const out = { clientIndex: item.i, client: item.client, startedAt: new Date().toISOString() };
    const consoleLogs = [];
    page.on('console', msg => {
      try { consoleLogs.push(`${msg.type()}: ${msg.text()}`); } catch (e) { /* ignore */ }
    });

    try {
      const target = cfg.checkUrl || cfg.baseUrl;
      log('navigating to', target);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Attempt to navigate initial booking flow: click Start Booking, select center/service if configured,
      // then poll for available slots for a short period.
      try {
        const startSel = cfg.selectors && cfg.selectors.startBooking;
        if (startSel) {
          const el = await page.$(startSel);
          if (el) {
            log('Clicking startBooking:', startSel);
            await el.click();
            await page.waitForTimeout(800 + Math.floor(Math.random() * 800));
          }
        }
      } catch (e) { log('startBooking step error', e.message); }

      // Optionally choose center/service (values in config.formData.center/service)
      try {
        if (cfg.selectors && cfg.selectors.centerSelect && cfg.formData && cfg.formData.center) {
          const sel = cfg.selectors.centerSelect;
          if (await page.$(sel)) {
            try {
              await page.selectOption(sel, { label: cfg.formData.center });
            } catch (e) {
              try { await page.selectOption(sel, { value: cfg.formData.center }); } catch (__) { }
            }
            await page.waitForTimeout(600 + Math.floor(Math.random() * 600));
          }
        }
        if (cfg.selectors && cfg.selectors.serviceSelect && cfg.formData && cfg.formData.service) {
          const sel2 = cfg.selectors.serviceSelect;
          if (await page.$(sel2)) {
            try {
              await page.selectOption(sel2, { label: cfg.formData.service });
            } catch (e) {
              try { await page.selectOption(sel2, { value: cfg.formData.service }); } catch (__) { }
            }
            await page.waitForTimeout(600 + Math.floor(Math.random() * 600));
          }
        }
      } catch (e) { log('select center/service error', e.message); }

      const slotSel = (cfg.selectors && cfg.selectors.slotList) || null;
      let slots = [];
      if (slotSel) {
        // poll for slots up to 60s
        const start = Date.now();
        const timeoutMs = 60000;
        const interval = 2000;
        while (Date.now() - start < timeoutMs) {
          try {
            slots = await page.$$(slotSel);
            if (slots && slots.length) break;
          } catch (e) { /* ignore */ }
          await page.waitForTimeout(interval + Math.floor(Math.random() * 800));
        }
      }

      if (slotSel && (!slots || !slots.length)) {
        out.success = false;
        out.message = 'no slots found';
        console.log(`Client ${item.i}: no slots found`);
        out.finishedAt = new Date().toISOString();
        try { fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(out, null, 2)); } catch (e) { log('failed write result', e.message); }
        continue;
      }

      const s = (cfg.selectors && cfg.selectors.form) || {};
      // increased timeout to account for dynamic loads
      const FIELD_TIMEOUT = 30000;
      // name
      if (s.name) {
        await page.waitForSelector(s.name, { timeout: FIELD_TIMEOUT });
        const fullname = (item.client.firstName || '') + ' ' + (item.client.lastName || '');
        await page.fill(s.name, fullname.trim());
      }
      if (s.phone && item.client.phone) {
        await page.waitForSelector(s.phone, { timeout: FIELD_TIMEOUT });
        await page.fill(s.phone, item.client.phone);
      }
      if (s.email && item.client.email) {
        await page.waitForSelector(s.email, { timeout: FIELD_TIMEOUT });
        await page.fill(s.email, item.client.email);
      }

      // screenshot after fill
      const fillShot = path.join(runDir, 'filled.png');
      await page.screenshot({ path: fillShot, fullPage: false });
      out.filledScreenshot = fillShot;

      // try to click book button
      const bookSel = (cfg.selectors && cfg.selectors.bookButton) || null;
      if (bookSel) {
        try {
          await page.click(bookSel);
          await page.waitForTimeout(1000);
          out.bookClicked = true;
        } catch (e) {
          out.bookClicked = false;
          out.bookError = e.message;
        }
      }

      // confirm (optionally pause before confirm)
      const confirmSel = (cfg.selectors && cfg.selectors.confirmButton) || null;
      if (confirmSel) {
        if (cfg.pauseBeforeConfirm) {
          log('pauseBeforeConfirm enabled — skipping confirm for manual check');
          out.confirmed = false;
        } else {
          try {
            await page.click(confirmSel);
            await page.waitForTimeout(1000);
            out.confirmed = true;
          } catch (e) {
            out.confirmed = false;
            out.confirmError = e.message;
          }
        }
      }

      // try capture receipt/receipt selector
      const receiptSel = (cfg.selectors && cfg.selectors.receipt) || null;
      if (receiptSel) {
        try {
          await page.waitForSelector(receiptSel, { timeout: 8000 });
          const receiptShot = path.join(runDir, 'receipt.png');
          await page.screenshot({ path: receiptShot });
          out.receiptScreenshot = receiptShot;
        } catch (e) {
          out.receiptError = e.message;
        }
      }

      out.success = true;
      out.finishedAt = new Date().toISOString();
    } catch (err) {
      log('error during run', err && err.message ? err.message : err);
      out.success = false;
      out.error = err && err.message ? err.message : String(err);
      // save debug artifacts: page HTML and console logs
      try {
        const html = await page.content();
        fs.writeFileSync(path.join(runDir, 'error.html'), html, 'utf8');
      } catch (e) { log('failed saving error.html', e.message); }
      try { fs.writeFileSync(path.join(runDir, 'console.log'), consoleLogs.join('\n'), 'utf8'); } catch (e) { /* ignore */ }
    }

    // write result file
    try { fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(out, null, 2)); } catch (e) { log('failed write result', e.message); }
  }

  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err && err.message ? err.message : err);
  process.exit(1);
});
