/**
 * Captures de vitrine pour le README : l'accueil, et une partie en cours
 * avec le panneau d'analyse.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = process.argv[3] ?? 'captures/vitrine';
mkdirSync(OUT, { recursive: true });

const nav = await puppeteer.launch(optionsLancement());

async function nouvelle(w, h, theme) {
  const page = await nav.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.evaluate((t) => {
    localStorage.setItem('echiquier.reglages.v1', JSON.stringify({ theme: t }));
  }, theme);
  await page.reload({ waitUntil: 'networkidle2' });
  return page;
}

// --- Accueil, thème sombre ---
{
  const page = await nouvelle(1280, 800, 'sombre');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/accueil-sombre.png` });
  await page.close();
}

// --- Accueil, thème clair ---
{
  const page = await nouvelle(1280, 800, 'clair');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/accueil-clair.png` });
  await page.close();
}

// --- Jeu assisté, partie en cours avec verdict ---
{
  const page = await nouvelle(1280, 900, 'sombre');
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Jouer les blancs')
      ?.click();
  });
  await page.waitForSelector('cg-board');
  await new Promise((r) => setTimeout(r, 1200));

  // Joue 1. a4 : coup volontairement médiocre, pour obtenir un verdict.
  const boite = await (await page.$('cg-board')).boundingBox();
  const cote = boite.width / 8;
  const centre = (col, rang) => ({
    x: boite.x + (col + 0.5) * cote,
    y: boite.y + (7 - rang + 0.5) * cote,
  });
  const depart = centre(0, 1);
  const arrivee = centre(0, 3);
  await page.mouse.click(depart.x, depart.y);
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.click(arrivee.x, arrivee.y);

  // Attend le verdict, puis la réponse du moteur.
  await page
    .waitForFunction(
      () =>
        /Excellent|Bon|Imprécision|Erreur|Gaffe|Coup de théorie|Coup unique/i.test(
          document.body.innerText,
        ),
      { timeout: 120000, polling: 500 },
    )
    .catch(() => console.log('  (verdict non obtenu, capture quand même)'));
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/assiste-sombre.png` });
  await page.close();
}

// --- Jeu assisté en 390 px ---
{
  const page = await nouvelle(390, 844, 'sombre');
  await page.goto(`${BASE}/#/apprendre`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/apprendre-mobile.png` });
  await page.close();
}

await nav.close();
console.log('Captures de vitrine écrites dans', OUT);
