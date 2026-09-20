/**
 * Vérifie la section Apprendre : les exercices sont jouables, une solution
 * correcte est acceptée, une erreur est refusée avec une explication, et la
 * progression se conserve d'une visite à l'autre.
 */
import puppeteer from 'puppeteer-core';
import { optionsLancement, trouverNavigateur } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

const navigateur = await puppeteer.launch(optionsLancement());
const page = await navigateur.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text());
});
page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e?.message ?? e)));

await page.goto(BASE + '/#/apprendre', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.body.innerText.includes('Apprendre'), {
  timeout: 15000,
  polling: 200,
});
await page.waitForSelector('cg-board', { timeout: 15000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { polling: 100 },
);
await new Promise((r) => setTimeout(r, 600));

verifier(
  await page.evaluate(() => document.body.innerText.includes('Le pion avance')),
  'Premier exercice affiché',
);

/** Joue un coup en touchant la case de départ puis celle d'arrivée. */
async function jouer(depuis, vers) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 200));

  const mesurer = () =>
    page.$eval('cg-board', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, c: r.width / 8, cls: el.closest('.cg-wrap')?.className ?? '' };
    });

  let boite = await mesurer();
  const noires = boite.cls.includes('orientation-black');
  const point = (sq, b) => {
    const col = sq.charCodeAt(0) - 97;
    const rang = Number(sq[1]) - 1;
    return {
      x: b.x + ((noires ? 7 - col : col) + 0.5) * b.c,
      y: b.y + ((noires ? rang : 7 - rang) + 0.5) * b.c,
    };
  };

  const a = point(depuis, boite);
  await page.mouse.click(a.x, a.y);
  await new Promise((r) => setTimeout(r, 200));
  // L'échiquier est remesuré : le verdict précédent peut avoir changé la mise en page.
  boite = await mesurer();
  const z = point(vers, boite);
  await page.mouse.click(z.x, z.y);
  await new Promise((r) => setTimeout(r, 700));
}

// --- Une tentative incorrecte est refusée, avec une explication ---
await jouer('e2', 'e3');
const refus = await page.evaluate(() => {
  const t = document.body.innerText;
  return { explique: /Il faut arriver en e4/.test(t), retablie: /Réessayez/.test(t) };
});
verifier(refus.explique, 'Une mauvaise réponse est refusée en expliquant pourquoi');
verifier(refus.retablie, 'La position est rétablie pour réessayer');

// --- La bonne solution est acceptée ---
await jouer('e2', 'e4');
const succes = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    accepte: /C’est la bonne case/.test(t),
    lecon: /ne recule jamais/.test(t),
    suivant: /Exercice suivant/.test(t),
  };
});
verifier(succes.accepte, 'La bonne réponse est acceptée');
verifier(succes.lecon, 'La leçon est affichée après la réussite');
verifier(succes.suivant, 'Le passage à l’exercice suivant est proposé');

// --- La progression survit à un rechargement ---
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => /réussis? sur/.test(document.body.innerText), {
  timeout: 15000,
  polling: 200,
});
const progres = await page.evaluate(
  () => (document.body.innerText.match(/(\d+) réussis? sur (\d+)/) ?? [])[0] ?? '',
);
verifier(Boolean(progres) && !progres.startsWith('0 '), 'La progression est conservée', progres);

// --- Les trois séries sont proposées ---
const onglets = await page.evaluate(() =>
  ['Les bases', 'Tactique', 'Mes erreurs'].filter((t) =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === t),
  ),
);
verifier(onglets.length === 3, 'Les trois séries sont proposées', onglets.join(', '));

// --- La série tactique propose un exercice ---
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'Tactique')
    ?.click();
});
await new Promise((r) => setTimeout(r, 800));
verifier(
  await page.evaluate(() => /Fourchette|Clouer|Enfilade|Mat |Prendre/.test(document.body.innerText)),
  'La série tactique propose un exercice',
);

// --- Mise en page ---
verifier(
  await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth <= d.clientWidth + 2;
  }),
  'Aucun débordement horizontal en 390 px',
);

await page.screenshot({ path: 'captures/apprendre.png', fullPage: true });

const bloquantes = erreurs.filter((e) => !/favicon|404/i.test(e));
verifier(bloquantes.length === 0, 'Aucune erreur de console', bloquantes.slice(0, 2).join(' | '));

await navigateur.close();
console.log(
  '\n' +
    (echecs === 0
      ? 'Apprendre : tous les contrôles sont passés.'
      : `${echecs} contrôle(s) en échec.`),
);
process.exit(echecs === 0 ? 0 : 1);
