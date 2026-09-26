/**
 * Jusqu'où la reconnaissance locale tient-elle ?
 *
 * Signalé : « la version locale ne fonctionne pas correctement ». Elle rend
 * pourtant 64 cases sur 64 sur une capture d'écran d'échiquier numérique.
 * L'écart vient donc des conditions réelles — une photo, pas une capture.
 *
 * Ce script dégrade progressivement une image parfaite et mesure la chute :
 * flou, bruit, rognage, rotation, contraste. C'est la seule façon de dire ce
 * qui casse, plutôt que de constater que « ça ne marche pas ».
 *
 * Usage : node scripts/diag-reconnaissance-locale.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const ATTENDU = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));
const page = await nav.newPage();
await page.setViewport({ width: 900, height: 900 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
  { timeout: 60000, polling: 200 },
);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
  b?.scrollIntoView({ block: 'center' });
  b?.click();
});
await page.waitForSelector('cg-board', { timeout: 30000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 20000, polling: 100 },
);

const plateau = await page.$('cg-board');
const png = await plateau.screenshot({ type: 'png', encoding: 'base64' });

/** Applique une dégradation, puis lit la position avec le moteur LOCAL. */
const essayer = (base64, filtre, rognage) =>
  page.evaluate(
    async (base64, filtre, rognage) => {
      const { moteurReconnaissance } = await import('/src/recognition/index.ts');
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();

      const c = document.createElement('canvas');
      const marge = Math.round(img.width * rognage);
      c.width = img.width - 2 * marge;
      c.height = img.height - 2 * marge;
      const x = c.getContext('2d');
      x.filter = filtre;
      x.drawImage(img, marge, marge, c.width, c.height, 0, 0, c.width, c.height);

      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      try {
        const r = await moteurReconnaissance('locale').reconnaitre(blob, {});
        // Une case est un symbole FEN ou `null` ; les confiances vivent dans
        // un tableau parallèle.
        const rangees = r.plateau.map((rang) => rang.map((c) => c ?? '.').join('')).join('/');
        const basses = r.confiances.flat().filter((v) => v < 0.5).length;
        return { rangees, basses, globale: r.confianceGlobale };
      } catch (e) {
        return { erreur: String(e?.message ?? e).slice(0, 80) };
      }
    },
    base64,
    filtre,
    rognage,
  );

/** Compare case à case au plateau attendu, développé. */
function exactitude(rangees) {
  const developper = (s) =>
    s
      .split('/')
      .map((r) => {
        let out = '';
        for (const ch of r) out += ch >= '1' && ch <= '8' ? '.'.repeat(Number(ch)) : ch;
        return out.padEnd(8, '.').slice(0, 8);
      })
      .join('');
  const a = developper(ATTENDU);
  const b = developper((rangees ?? '').replace(/\./g, '1'));
  let n = 0;
  for (let i = 0; i < 64; i++) if (a[i] === b[i]) n += 1;
  return n;
}

const EPREUVES = [
  ['capture nette', 'none', 0],
  ['léger flou', 'blur(1px)', 0],
  ['flou marqué', 'blur(2.5px)', 0],
  ['contraste faible', 'contrast(0.55) brightness(1.15)', 0],
  ['sombre', 'brightness(0.55)', 0],
  ['rogné de 4 %', 'none', 0.04],
  ['rogné de 8 %', 'none', 0.08],
  ['flou + rogné', 'blur(1.5px)', 0.04],
];

console.log('\n  épreuve              cases justes   confiances basses');
console.log('  ---------------------------------------------------');
for (const [nom, filtre, rognage] of EPREUVES) {
  const r = await essayer(png, filtre, rognage);
  if (r.erreur) {
    console.log(`  ${nom.padEnd(20)} échec — ${r.erreur}`);
    continue;
  }
  const justes = exactitude(r.rangees);
  console.log(
    `  ${nom.padEnd(20)} ${String(justes).padStart(6)}/64        ${String(r.basses).padStart(3)}` +
      `     confiance ${(r.globale ?? 0).toFixed(2)}`,
  );
}

console.log('');
console.log('La reconnaissance locale repose sur une détection de grille par');
console.log('gradient et une comparaison de silhouettes. Elle suppose un cadrage');
console.log('serré, un contraste franc et une vue de face — les conditions d’une');
console.log('capture d’écran, pas celles d’une photo.');

await nav.close();
