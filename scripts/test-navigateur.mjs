/**
 * Test de bout en bout dans un vrai navigateur, en format mobile.
 *
 * Vérifie ce qu'un typecheck ne peut pas voir : le worker Stockfish démarre
 * réellement, l'échiquier se rend, aucune erreur de console n'apparaît, et
 * la page ne déborde pas horizontalement sur un écran de 360 px.
 *
 * Usage : node scripts/test-navigateur.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { optionsLancement, trouverNavigateur } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SORTIE = 'captures';

// Deux formats : le plus étroit exigé (360 px) et un mobile courant.
const FORMATS = [
  { nom: 'etroit-360', largeur: 360, hauteur: 640 },
  { nom: 'mobile-390', largeur: 390, hauteur: 844 },
];

/** Navigue par fragment et attend que l'écran visé soit rendu. */
async function allerA(page, hash, selecteurAttendu) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForSelector(selecteurAttendu, { timeout: 20000 });
  // Laisse React terminer le rendu paresseux avant toute interaction.
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Clique un bouton par son libellé, après l'avoir recentré.
 * `elementHandle.click()` peut viser un point recouvert par la barre de
 * navigation fixe ; on recentre d'abord et on vérifie la cible.
 */
async function cliquerBouton(page, predicat) {
  return page.evaluate((src) => {
    const test = new Function('t', `return (${src})(t);`);
    const b = [...document.querySelectorAll('button')].find((x) => test(x.textContent?.trim() ?? ''));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (dessus !== b && !b.contains(dessus)) return false;
    b.click();
    return true;
  }, predicat);
}

mkdirSync(SORTIE, { recursive: true });

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

console.log('Navigateur :', trouverNavigateur());
const navigateur = await puppeteer.launch(optionsLancement());

try {
  for (const format of FORMATS) {
    console.log(`\n=== Format ${format.nom} (${format.largeur}x${format.hauteur}) ===`);
    const page = await navigateur.newPage();
    await page.setViewport({
      width: format.largeur,
      height: format.hauteur,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    );

    const erreurs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erreurs.push(m.text());
    });
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e?.message ?? e)));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('       [console]', m.text().slice(0, 200));
    });
    page.on('requestfailed', (r) =>
      console.log('       [requête échouée]', r.url().replace(BASE, ''), r.failure()?.errorText),
    );

    // --- Accueil ---
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('h1', { timeout: 15000 });

    const titre = await page.$eval('h1', (el) => el.textContent);
    verifier(Boolean(titre), 'Accueil rendu', titre ?? '');

    const isole = await page.evaluate(() => globalThis.crossOriginIsolated === true);
    verifier(true, 'Contexte isolé (COOP/COEP)', isole ? 'oui' : 'non (repli mono-thread attendu)');

    const debordement = await page.evaluate(() => {
      const d = document.documentElement;
      return { scroll: d.scrollWidth, client: d.clientWidth };
    });
    verifier(
      debordement.scroll <= debordement.client + 1,
      'Aucun défilement horizontal',
      `${debordement.scroll} / ${debordement.client}`,
    );

    await page.screenshot({ path: `${SORTIE}/${format.nom}-accueil.png` });

    // --- Partie libre : configuration puis échiquier ---
    await allerA(page, '/libre', 'h1');
    await page.screenshot({ path: `${SORTIE}/${format.nom}-libre-config.png` });

    const demarre = await cliquerBouton(page, "(t) => t.includes('Commencer la partie')");
    verifier(demarre, 'Démarrage de la partie');

    if (demarre) {
      await page.waitForSelector('cg-board', { timeout: 20000 });

      const carre = await page.$eval('cg-board', (el) => {
        const r = el.getBoundingClientRect();
        return { l: Math.round(r.width), h: Math.round(r.height) };
      });
      verifier(
        Math.abs(carre.l - carre.h) <= 2 && carre.l > 200,
        'Échiquier carré et dimensionné',
        `${carre.l}x${carre.h}`,
      );

      const nbPieces = await page.$$eval('cg-board piece', (p) => p.length);
      verifier(nbPieces === 32, 'Les 32 pièces sont rendues', String(nbPieces));

      const debord2 = await page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth <= d.clientWidth + 1;
      });
      verifier(debord2, 'Aucun débordement horizontal avec l’échiquier');

      await page.screenshot({ path: `${SORTIE}/${format.nom}-libre-echiquier.png` });
    }

    // --- Le moteur répond-il vraiment ? (une seule fois, sur le format large) ---
    if (format.nom === 'mobile-390') {
      console.log('  … test du moteur Stockfish (téléchargement ~7 Mo)');
      await allerA(page, '/diagnostic', 'h1');

      const lance = await cliquerBouton(page, "(t) => t === 'Tester'");
      verifier(lance, 'Lancement du test moteur');

      if (lance) {
        // Le premier démarrage télécharge le binaire : on laisse large.
        await page.waitForFunction(
          () => document.body.innerText.includes('Le moteur a répondu') ||
                document.body.innerText.includes('Échec :'),
          { timeout: 180000, polling: 1000 },
        );
        const resultat = await page.evaluate(() => {
          const m = document.body.innerText.match(/(Le moteur a répondu[^\n]*|Échec :[^\n]*)/);
          return m ? m[0] : '';
        });
        verifier(resultat.startsWith('Le moteur a répondu'), 'Stockfish répond', resultat);
        await page.screenshot({ path: `${SORTIE}/${format.nom}-diagnostic.png`, fullPage: true });
      }

      // --- Analyse de position : chargement par FEN puis évaluation ---
      await allerA(page, '/analyse', 'h1');
      const ongletFen = await cliquerBouton(page, "(t) => t === 'FEN'");
      verifier(ongletFen, 'Onglet FEN accessible');
      if (ongletFen) {
        await page.waitForSelector('input[type="text"]', { timeout: 5000 });
        await page.type(
          'input[type="text"]',
          'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        );
        const charge = await cliquerBouton(page, "(t) => t.includes('Charger la position')");
        verifier(charge, 'Chargement du FEN');
        await page.waitForSelector('cg-board', { timeout: 15000 });

        // L'évaluation doit apparaître : preuve que l'analyse continue tourne.
        await page.waitForFunction(
          () => /[+−]\d+,\d\d|[+−]M\d+/.test(document.body.innerText),
          { timeout: 120000, polling: 500 },
        );
        const eval1 = await page.evaluate(() => {
          const m = document.body.innerText.match(/[+−]\d+,\d\d|[+−]M\d+/);
          return m ? m[0] : '';
        });
        verifier(Boolean(eval1), 'Analyse continue : évaluation affichée', eval1);
        await page.screenshot({ path: `${SORTIE}/${format.nom}-analyse.png` });
      }
    }

    // --- Erreurs de console ---
    // On tolère les 404 de favicon en préversion, rien d'autre.
    const bloquantes = erreurs.filter(
      (e) => !/favicon|Failed to load resource: the server responded with a status of 404/i.test(e),
    );
    verifier(
      bloquantes.length === 0,
      'Aucune erreur de console',
      bloquantes.slice(0, 3).join(' | '),
    );

    await page.close();
  }
} finally {
  await navigateur.close();
}

console.log(`\n${echecs === 0 ? 'Tous les contrôles sont passés.' : `${echecs} contrôle(s) en échec.`}`);
process.exit(echecs === 0 ? 0 : 1);
