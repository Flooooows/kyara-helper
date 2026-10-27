const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'Run';
const appDirectory = path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'KyaraFreeOpener');
const stateFile = path.join(appDirectory, 'kyara-storage-state.json');
const statsFile = path.join(appDirectory, 'opened-boosters.tsv');
const lockFile = path.join(appDirectory, '.run.lock');
const url = 'https://kyara.games/ouvrir/all';

function ensureDirectory() {
  fs.mkdirSync(appDirectory, { recursive: true });
}

function showStats() {
  if (!fs.existsSync(statsFile)) {
    console.log('Boosters ouverts par le programme : 0');
    console.log('Le compteur démarre à partir de cette version du script.');
    return;
  }

  const entries = fs.readFileSync(statsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = entries.filter((entry) => entry.startsWith(today)).length;
  const lastOpening = entries.at(-1).split('\t')[0];

  console.log(`Boosters ouverts par le programme : ${entries.length}`);
  console.log(`Ouverts aujourd'hui : ${todayCount}`);
  console.log(`Dernière ouverture : ${lastOpening}`);
}

function acquireLock() {
  try {
    return fs.openSync(lockFile, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log('Une exécution est déjà en cours.');
      process.exit(0);
    }
    throw error;
  }
}

function releaseLock(lockHandle) {
  fs.closeSync(lockHandle);
  fs.rmSync(lockFile, { force: true });
}

function recordOpening() {
  fs.appendFileSync(statsFile, `${new Date().toISOString()}\tfree-booster\n`, { encoding: 'utf8', mode: 0o600 });
}

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    throw new Error('Playwright n’est pas installé. Exécutez : npm install ; npx playwright install chromium');
  }
}

async function initialize() {
  ensureDirectory();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    console.log('Connexion à Kyara… connectez-vous si nécessaire.');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const terminal = readline.createInterface({ input, output });
    await terminal.question('Une fois connecté et la page des boosters chargée, appuyez sur Entrée : ');
    terminal.close();

    await context.storageState({ path: stateFile });
    console.log(`Session sauvegardée dans ${stateFile}`);
  } finally {
    await browser.close();
  }
}

async function openFreeBooster(checkOnly) {
  ensureDirectory();
  if (!fs.existsSync(stateFile)) {
    throw new Error('Session absente. Lancez d’abord : .\\KyaraFreeOpener.ps1 -Mode Init');
  }

  const lockHandle = acquireLock();
  let browser;

  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: stateFile });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const openButton = page.getByRole('button', { name: /^(Open Free|Ouvrir\s+Gratuit)/i }).first();
    await openButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await openButton.count() === 0 || !(await openButton.isVisible()) || !(await openButton.isEnabled())) {
      const buttonTexts = await page.locator('button').allTextContents();
      const screenshot = path.join(appDirectory, 'last-no-free-button.png');

      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      console.log('Le bouton « Open Free » est introuvable ou indisponible.');
      console.log(`Diagnostic — URL : ${page.url()}`);
      console.log(`Diagnostic — titre : ${await page.title()}`);
      console.log(`Diagnostic — boutons : ${buttonTexts.map((text) => text.trim()).filter(Boolean).join(' | ') || 'aucun'}`);
      console.log(`Diagnostic — capture : ${screenshot}`);
      await context.storageState({ path: stateFile });
      return;
    }

    if (checkOnly) {
      console.log('Booster gratuit détecté, sans ouverture.');
      return;
    }

    await openButton.click();
    await page.waitForTimeout(3000);
    await context.storageState({ path: stateFile });
    recordOpening();
    console.log('Un booster gratuit a été ouvert.');
  } finally {
    if (browser) await browser.close();
    releaseLock(lockHandle);
  }
}

async function main() {
  switch (mode) {
    case 'Init':
      await initialize();
      break;
    case 'Run':
      await openFreeBooster(false);
      break;
    case 'DryRun':
      await openFreeBooster(true);
      break;
    case 'Stats':
      showStats();
      break;
    default:
      throw new Error(`Mode inconnu : ${mode}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
