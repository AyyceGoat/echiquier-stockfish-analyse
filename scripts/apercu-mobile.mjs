/**
 * Contrôle d'adaptabilité sur téléphone, en situation.
 *
 * `test-mise-en-page.mjs` parcourt les écrans au repos et attrape les
 * débordements. Il ne voit pas ce qui se passe une fois la partie lancée :
 * l'échiquier et le portrait du professeur n'existent qu'à ce moment-là, et
 * c'est précisément là que la place manque sur un téléphone.
 *
 * Ce script joue un coup, capture l'écran de jeu, et vérifie trois choses
 * qu'une capture seule ne prouve pas :
 *  - l'échiquier entre en entier dans la fenêtre, sans défilement pour voir
 *    la dernière rangée ;
 *  - le portrait et le commentaire restent lisibles, donc ni écrasés ni
 *    tronqués ;
 *  - l'écran de lancement occupe bien la fenêtre, sans barre résiduelle.
 *
 * Usage : node scripts/apercu-mobile.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const OUT = 'captures/mobile-jeu';
/** Les deux téléphones visés : le plus étroit encore courant, et le médian. */
const FORMATS = [
  ['360', 360, 740],
  ['390', 390, 844],
];

mkdirSync(OUT, { recursive: true });

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement());

for (const [nom, largeur, hauteur] of FORMATS) {
  const page = await nav.newPage();
  await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // --- Écran de lancement ------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const lancement = await page.evaluate(() => {
    const el = document.getElementById('lancement');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.width, h: r.height, vw: innerWidth, vh: innerHeight, deborde: document.documentElement.scrollWidth > innerWidth };
  });
  if (lancement) {
    // 600 ms : l'écran de lancement se dessine par étapes, et une capture
    // prise au premier rendu ne montre que des cases encore transparentes.
    // On le saisit une fois établi, c'est-à-dire tel que l'élève le voit.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
    await page.screenshot({ path: `${OUT}/${nom}-lancement.png` });
    verifier(
      Math.abs(lancement.l - lancement.vw) < 2 && Math.abs(lancement.h - lancement.vh) < 2 && !lancement.deborde,
      `[${nom}] L'écran de lancement occupe la fenêtre`,
      `${Math.round(lancement.l)}x${Math.round(lancement.h)} pour ${lancement.vw}x${lancement.vh}`,
    );
  }

  // --- Partie assistée ---------------------------------------------------
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1', { timeout: 30000 });
  // Attendre le bouton plutôt que de le chercher une fois : l'écran de
  // configuration se monte après l'écran de lancement, et le chercher trop
  // tôt donnait un échec qui ne disait rien de la mise en page.
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((x) => x.textContent?.trim() === 'Jouer les blancs'),
    { timeout: 30000, polling: 200 },
  );
  const lance = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  });
  verifier(lance, `[${nom}] La partie démarre`);
  await page.waitForSelector('cg-board', { timeout: 30000 });
  await page.waitForFunction(
    () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
    { timeout: 20000, polling: 100 },
  );

  // Remonter AVANT de relever les coordonnées : `scrollIntoView` a fait
  // défiler la page pour atteindre le bouton de départ, et un rectangle
  // relevé dans cet état vise des pixels hors fenêtre.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // Un coup, pour que le professeur parle.
  const coup = await page.evaluate(() => {
    const b = document.querySelector('cg-board');
    const r = b.getBoundingClientRect();
    const c = r.width / 8;
    // e2 → e4, vu des blancs.
    return {
      de: { x: r.left + 4.5 * c, y: r.top + 6.5 * c },
      vers: { x: r.left + 4.5 * c, y: r.top + 4.5 * c },
    };
  });
  // Taper, et non cliquer : la fenêtre est déclarée tactile, et Chessground
  // écoute alors les événements de toucher. Un clic souris ne déplaçait
  // aucune pièce, et la capture montrait l'échiquier au coup zéro.
  await page.touchscreen.tap(coup.de.x, coup.de.y);
  await page.touchscreen.tap(coup.vers.x, coup.vers.y);
  const joue = await page
    .waitForFunction(() => !/Aucun coup joué/.test(document.body.innerText), {
      timeout: 15000,
      polling: 300,
    })
    .then(() => true)
    .catch(() => false);
  verifier(joue, `[${nom}] Un coup se joue au doigt`);
  await page
    .waitForFunction(() => /réfléchit|[.]{3}/.test(document.body.innerText), { timeout: 20000, polling: 300 })
    .catch(() => {});
  await page.evaluate(() => new Promise((r) => setTimeout(r, 4000)));

  await page.evaluate(() => window.scrollTo(0, 0));
  const mesures = await page.evaluate(() => {
    const board = document.querySelector('cg-board')?.getBoundingClientRect() ?? null;
    const portrait = document.querySelector('.pp-scene')?.getBoundingClientRect() ?? null;
    // Le commentaire du professeur : le paragraphe le plus long de sa carte.
    const carte = [...document.querySelectorAll('section, article, div')].find((e) =>
      e.className && /carte/.test(String(e.className)) && e.querySelector('.pp-scene'),
    );
    const texte = carte
      ? [...carte.querySelectorAll('p')].map((p) => ({
          texte: p.textContent?.trim() ?? '',
          taille: parseFloat(getComputedStyle(p).fontSize),
          largeur: p.getBoundingClientRect().width,
        }))
      : [];
    return {
      board: board && { l: board.width, bas: board.bottom },
      portrait: portrait && { l: portrait.width, h: portrait.height },
      texte,
      vw: innerWidth,
      vh: innerHeight,
      deborde: document.documentElement.scrollWidth - innerWidth,
    };
  });

  await page.screenshot({ path: `${OUT}/${nom}-partie.png`, fullPage: true });

  verifier(mesures.deborde <= 1, `[${nom}] Aucun débordement horizontal`, `${mesures.deborde} px`);
  verifier(
    mesures.board !== null && mesures.board.l <= mesures.vw - 16,
    `[${nom}] L'échiquier tient dans la largeur`,
    mesures.board ? `${Math.round(mesures.board.l)} px pour ${mesures.vw}` : 'absent',
  );
  verifier(
    mesures.board !== null && mesures.board.bas <= mesures.vh,
    `[${nom}] L'échiquier entier est visible sans défiler`,
    mesures.board ? `bas à ${Math.round(mesures.board.bas)} px, fenêtre ${mesures.vh}` : 'absent',
  );
  verifier(
    mesures.portrait !== null && mesures.portrait.l >= 90,
    `[${nom}] Le portrait reste lisible`,
    mesures.portrait ? `${Math.round(mesures.portrait.l)}x${Math.round(mesures.portrait.h)} px` : 'absent',
  );
  const petits = mesures.texte.filter((t) => t.texte.length > 20 && t.taille < 14);
  verifier(
    petits.length === 0,
    `[${nom}] Le commentaire est au-dessus de 14 px`,
    petits.length ? `${petits.length} paragraphe(s) à ${petits[0].taille} px` : 'aucun texte rétréci',
  );

  await page.close();
}

await nav.close();
console.log(
  '\n' + (echecs === 0 ? `Mobile : rien à redire. Captures dans ${OUT}/` : `${echecs} contrôle(s) en échec.`),
);
process.exit(echecs === 0 ? 0 : 1);
