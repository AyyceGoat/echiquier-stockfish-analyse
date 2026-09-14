/**
 * Éprouve la reconnaissance par modèle de bout en bout sur le site déployé :
 * réglage du moteur, import d'une capture d'échiquier réelle, passage par la
 * fonction serverless, puis écran de correction.
 *
 * Fait UN seul appel au modèle : c'est une vérification, pas une campagne.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHEMINS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const BASE = process.argv[2] ?? 'https://echiquier-stockfish-analyse.netlify.app';
const ATTENDU = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

const b = await puppeteer.launch({ executablePath: CHEMINS.find(existsSync), headless: 'new', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => erreurs.push(String(e?.message ?? e).slice(0, 200)));

const cliquer = (p) =>
  page.evaluate((src) => {
    const test = new Function('t', 'return (' + src + ')(t);');
    const el = [...document.querySelectorAll('button')].find((x) => test(x.textContent?.trim() ?? ''));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, p);

// Capture de l'échiquier de l'application, comme image de test.
const pb = await b.newPage();
await pb.setViewport({ width: 700, height: 900 });
await pb.goto(BASE + '/#/libre', { waitUntil: 'networkidle2' });
await pb.waitForSelector('h1');
await pb.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Commencer la partie')).click();
});
await pb.waitForSelector('cg-board');
await pb.waitForFunction(() => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 200, { polling: 100 });
await new Promise((r) => setTimeout(r, 800));
const png = await (await pb.$('cg-board')).screenshot({ encoding: 'base64' });
await pb.close();

// Choix du moteur « vision par modèle ».
await page.goto(BASE + '/#/reglages', { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');
verifier(await cliquer("(t) => t.includes('Vision par modèle')"), 'Moteur « vision par modèle » sélectionné');

await page.goto(BASE + '/#/analyse', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.body.innerText.includes('Analyse de position'), { timeout: 15000, polling: 200 });
await page.waitForSelector('input[type="file"]', { timeout: 15000 });

const debut = Date.now();
await page.evaluate(async (b64) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  const f = new File([blob], 'echiquier.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(f);
  const champs = [...document.querySelectorAll('input[type="file"]')];
  const cible = champs[champs.length - 1];
  cible.files = dt.files;
  cible.dispatchEvent(new Event('change', { bubbles: true }));
}, png);

await page.waitForFunction(
  () => /Vérifier la position|échoué|Impossible|clé d’API|indisponible/i.test(document.body.innerText),
  { timeout: 180000, polling: 500 },
);
const duree = ((Date.now() - debut) / 1000).toFixed(1);

const r = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    arrive: t.includes('Vérifier la position'),
    fen: (t.match(/([rnbqkpRNBQKP1-8]+(?:\/[rnbqkpRNBQKP1-8]+){7} [wb] \S+ \S+ \d+ \d+)/) ?? [])[1] ?? '',
    douteuses: (t.match(/(\d+) cases? à vérifier/) ?? [])[1] ?? '0',
    message: t.slice(0, 400).replace(/\n+/g, ' | '),
  };
});

verifier(r.arrive, 'Écran de correction atteint via le modèle', `${duree}s`);
if (r.arrive) {
  const placement = r.fen.split(' ')[0];
  const dep = (p) => p.split('/').flatMap((ra) => [...ra].flatMap((c) => (c >= '1' && c <= '8' ? Array(+c).fill('.') : [c])));
  const a = dep(ATTENDU);
  const z = dep(placement);
  const exactes = a.length === z.length ? a.filter((v, i) => v === z[i]).length : 0;
  verifier(exactes >= 60, 'Position lue par le modèle', `${exactes}/64 — ${placement}`);
  console.log('       cases signalées à vérifier : ' + r.douteuses);
} else {
  console.log('       message affiché : ' + r.message);
}

const bloquantes = erreurs.filter((e) => !/favicon|404/i.test(e));
verifier(bloquantes.length === 0, 'Aucune erreur de console', bloquantes.slice(0, 2).join(' | '));

await page.screenshot({ path: 'captures/prod-reconnaissance-llm.png', fullPage: true });
await b.close();
console.log('\n' + (echecs === 0 ? 'Reconnaissance par modèle : OK.' : echecs + ' contrôle(s) en échec.'));
process.exit(echecs === 0 ? 0 : 1);
