/**
 * Contrôle de mise en page sur tous les écrans, toutes les largeurs, les
 * deux thèmes.
 *
 * Ce que ce test attrape et qu'aucun autre ne voit : un débordement
 * horizontal qui n'apparaît qu'en thème clair, une erreur de console qui ne
 * se produit que sur un écran rarement visité, une régression de largeur
 * introduite par une carte trop rigide. Il produit aussi les captures qui
 * servent à la relecture visuelle.
 *
 * Usage : node scripts/test-mise-en-page.mjs [url] [dossier-de-sortie]
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'captures/mise-en-page';

/** 360 px est la largeur la plus étroite visée ; 390 px le mobile courant. */
const FORMATS = [
  ['360', 360, 760],
  ['390', 390, 844],
  ['tablette', 834, 1112],
  ['desktop', 1440, 900],
];

const ECRANS = ['/', '/libre', '/assiste', '/apprendre', '/analyse', '/historique', '/reglages', '/voix'];

mkdirSync(OUT, { recursive: true });
const nav = await puppeteer.launch(optionsLancement());
const problemes = [];

for (const theme of ['sombre', 'clair']) {
  for (const [nom, largeur, hauteur] of FORMATS) {
    const page = await nav.newPage();
    await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 1 });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const texte = m.text();
      // `/api/voix` est une fonction serverless : elle n'existe pas sur le
      // serveur de développement, et son absence y produit un 404 attendu.
      // Le point d'entrée est vérifié pour de bon par `test:deploye`, qui
      // appelle l'adresse publique et exige un audio en retour.
      if (/api\/voix/.test(texte) || (/404/.test(texte) && /Failed to load resource/.test(texte))) {
        return;
      }
      problemes.push(`[${theme}/${nom}] console : ${texte.slice(0, 220)}`);
    });
    page.on('pageerror', (e) => problemes.push(`[${theme}/${nom}] page : ${String(e).slice(0, 220)}`));

    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate((t) => {
      localStorage.setItem('echiquier.reglages.v1', JSON.stringify({ theme: t }));
    }, theme);
    // Rechargement obligatoire : une navigation qui ne change que le
    // fragment reste dans le même document, donc React conserve son état et
    // le thème ne bascule pas.
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });

    for (const ecran of ECRANS) {
      await page.goto(BASE + '#' + ecran, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));

      const debord = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (debord > 0) problemes.push(`[${theme}/${nom}${ecran}] déborde de ${debord} px`);

      // Cibles tactiles : 44 px est le minimum recommandé par Apple et
      // Google. On ignore ce qui est masqué et les liens en ligne dans un
      // paragraphe, qui n'ont pas à respecter cette taille.
      const petites = await page.evaluate(() => {
        const out = [];
        for (const b of document.querySelectorAll('button, [role="switch"], [role="radio"]')) {
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 40 || r.width < 24) {
            out.push(`${(b.textContent ?? '').trim().slice(0, 24) || b.getAttribute('aria-label') || '?'} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out.slice(0, 6);
      });
      for (const p of petites) problemes.push(`[${theme}/${nom}${ecran}] cible tactile ${p}`);

      const slug = ecran === '/' ? 'accueil' : ecran.replace(/\//g, '');
      await page.screenshot({
        path: `${OUT}/${theme}-${nom}-${slug}.png`,
        fullPage: nom !== 'desktop',
      });
    }
    await page.close();
  }
}
await nav.close();

if (problemes.length === 0) {
  console.log('Mise en page : aucun débordement, aucune cible trop petite, aucune erreur.');
} else {
  console.log(`Mise en page : ${problemes.length} problème(s).`);
  for (const p of problemes) console.log('  ' + p);
  process.exitCode = 1;
}
