/**
 * Fluidité de la prise de parole, sur un format de téléphone.
 *
 * Quatre défauts signalés, vérifiés ici sur le produit :
 *
 *   - les commentaires s'empilaient au lieu de se remplacer ;
 *   - la voix arrivait deux à trois secondes après le texte ;
 *   - en jouant vite, les paroles se chevauchaient ;
 *   - il fallait une dizaine de secondes avant la première réplique.
 *
 * Usage : node scripts/test-fluidite.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 600_000 }));
const page = await nav.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

/** Texte du commentaire affiché. */
const lireCommentaire = () =>
  page.evaluate(() => {
    const scene = document.querySelector('.pp-scene');
    let n = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && n; i++) {
      const p = n.querySelector(':scope > p');
      if (p) return p.textContent?.trim() ?? '';
      n = n.parentElement;
    }
    return '';
  });

const depart = Date.now();
await page.goto(`${BASE}/#/assiste`, { waitUntil: 'domcontentloaded', timeout: 60000 });

// --- 10. Les portraits sont-ils là tout de suite ? ------------------------
const portraits = await page
  .waitForFunction(() => document.querySelectorAll('.pp-image').length >= 4, {
    timeout: 30000,
    polling: 100,
  })
  .then(() => Date.now() - depart)
  .catch(() => null);
verifier(
  portraits !== null && portraits < 4000,
  'Les portraits des professeurs sont là rapidement',
  portraits === null ? 'jamais' : `${portraits} ms`,
);

await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
  { timeout: 60000, polling: 150 },
);
const lance = Date.now();
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
  b?.scrollIntoView({ block: 'center' });
  b?.click();
});

// --- 10. Combien de temps avant que le professeur parle ? ------------------
const premiereReplique = await page
  .waitForFunction(() => {
    const scene = document.querySelector('.pp-scene');
    let n = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && n; i++) {
      const p = n.querySelector(':scope > p');
      if (p) return (p.textContent?.trim().length ?? 0) > 10;
      n = n.parentElement;
    }
    return false;
  }, { timeout: 60000, polling: 100 })
  .then(() => Date.now() - lance)
  .catch(() => null);
verifier(
  premiereReplique !== null && premiereReplique < 4000,
  'Le professeur prend la parole sans attendre',
  premiereReplique === null ? 'jamais' : `${premiereReplique} ms après le lancement`,
);

await page.waitForSelector('cg-board', { timeout: 60000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 30000, polling: 100 },
);
await page.evaluate(() => window.scrollTo(0, 0));

// --- 3. L'échiquier occupe-t-il l'écran ? ---------------------------------
const plateau = await page.evaluate(() => {
  const r = document.querySelector('cg-board').getBoundingClientRect();
  return { l: r.width, h: r.height, vw: innerWidth, vh: innerHeight, haut: r.top };
});
verifier(
  plateau.l >= plateau.vw * 0.8,
  'L’échiquier occupe l’essentiel de la largeur',
  `${Math.round(plateau.l)} px sur ${plateau.vw}`,
);

// --- 4 et 7. Trois coups rapides : un seul commentaire, pas d'empilement ---
const carre = (sq, r) => {
  const c = r.width / 8;
  return {
    x: r.left + (sq.charCodeAt(0) - 97 + 0.5) * c,
    y: r.top + (8 - Number(sq[1]) + 0.5) * c,
  };
};

const longueurs = [];
for (const [de, vers] of [
  ['e2', 'e4'],
  ['g1', 'f3'],
  ['f1', 'c4'],
]) {
  await page.waitForFunction(() => !/réfléchit/.test(document.body.innerText), {
    timeout: 120000,
    polling: 200,
  }).catch(() => {});
  const r = await page.evaluate(() => {
    const b = document.querySelector('cg-board').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width };
  });
  const a = carre(de, r);
  const b = carre(vers, r);
  await page.touchscreen.tap(a.x, a.y);
  await page.touchscreen.tap(b.x, b.y);
  // Volontairement court : c'est « jouer vite » qu'on reproduit.
  await page.evaluate(() => new Promise((res) => setTimeout(res, 1500)));
  const texte = await lireCommentaire();
  longueurs.push(texte.length);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /Garder le coup|Continuer/i.test(x.textContent ?? ''),
    );
    b?.click();
  });
}

console.log(`\n  longueurs des commentaires successifs : ${longueurs.join(', ')} caractères\n`);
verifier(
  longueurs.every((n) => n < 400),
  'Un seul commentaire à la fois, sans empilement',
  longueurs.join(' / '),
);

// --- 7. Une seule voix à la fois ------------------------------------------
const lecteurs = await page.evaluate(
  () => [...document.querySelectorAll('audio')].filter((a) => !a.paused).length,
);
verifier(lecteurs <= 1, 'Une seule réplique parle à la fois', `${lecteurs} lecteurs actifs`);

// --- 5. La liste des coups est-elle repliée ? -----------------------------
const replies = await page.evaluate(() => {
  const blocs = [...document.querySelectorAll('details')];
  return {
    total: blocs.length,
    ouverts: blocs.filter((d) => d.open).length,
    titres: blocs.map((d) => d.querySelector('summary')?.textContent?.trim().slice(0, 30) ?? ''),
  };
});
verifier(
  replies.total >= 2 && replies.ouverts === 0,
  'Les panneaux secondaires sont repliés par défaut',
  `${replies.ouverts} ouverts sur ${replies.total} — ${replies.titres.join(' | ')}`,
);

await nav.close();
console.log('\n' + (echecs === 0 ? 'Fluidité : conforme.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
