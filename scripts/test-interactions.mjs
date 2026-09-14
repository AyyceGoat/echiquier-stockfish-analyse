/**
 * Vérifie les exigences transverses :
 *  - la partie libre n'affiche AUCUNE information du moteur ;
 *  - les raccourcis clavier fonctionnent sur ordinateur ;
 *  - le balayage tactile navigue dans les coups ;
 *  - le thème clair s'applique réellement.
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHEMINS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const BASE = process.argv[2] ?? 'http://localhost:4173';

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

const navigateur = await puppeteer.launch({
  executablePath: CHEMINS.find(existsSync),
  headless: 'new',
  args: ['--no-sandbox'],
});

const cliquer = (page, p) =>
  page.evaluate((src) => {
    const test = new Function('t', 'return (' + src + ')(t);');
    const b = [...document.querySelectorAll('button')].find((x) => test(x.textContent?.trim() ?? ''));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, p);

async function attendreEchiquier(page) {
  await page.waitForSelector('cg-board', { timeout: 20000 });
  await page.waitForFunction(
    () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
    { timeout: 15000, polling: 100 },
  );
  await new Promise((r) => setTimeout(r, 500));
}

/** Joue un coup en touchant la case de départ puis celle d'arrivée. */
async function jouer(page, depuis, vers) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 200));
  const b = await page.$eval('cg-board', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, c: r.width / 8, cls: el.closest('.cg-wrap')?.className ?? '' };
  });
  const noires = b.cls.includes('orientation-black');
  const centre = (sq) => {
    const col = sq.charCodeAt(0) - 97;
    const rang = Number(sq[1]) - 1;
    return {
      x: b.x + ((noires ? 7 - col : col) + 0.5) * b.c,
      y: b.y + ((noires ? rang : 7 - rang) + 0.5) * b.c,
    };
  };
  const a = centre(depuis);
  const z = centre(vers);
  await page.mouse.click(a.x, a.y);
  await new Promise((r) => setTimeout(r, 200));
  await page.mouse.click(z.x, z.y);
  await new Promise((r) => setTimeout(r, 400));
}

// ============ 1. Partie libre : silence complet du moteur ============
{
  const page = await navigateur.newPage();
  await page.setViewport({ width: 900, height: 900 });
  await page.goto(BASE + '/#/libre', { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1');
  await cliquer(page, "(t) => t.includes('Commencer la partie')");
  await attendreEchiquier(page);
  await jouer(page, 'e2', 'e4');
  // Laisse au moteur le temps de jouer sa réponse.
  await page.waitForFunction(() => document.querySelectorAll('ol li button').length >= 2, {
    timeout: 60000,
    polling: 500,
  });

  const silence = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      // Une évaluation en pions ou un mat annoncé ne doit jamais apparaître.
      evaluation: /[+−]\d+,\d\d|[+−]M\d+|prof\./.test(t),
      barre: document.querySelectorAll('[role="img"][aria-label^="Évaluation"]').length,
      // Chessground rend toujours des <g> conteneurs vides : on compte les
      // formes réellement dessinées, pas les couches qui les accueillent.
      fleches: document.querySelectorAll('.cg-shapes > g > *, .cg-custom-svgs > g > *').length,
      classement: /Excellent|Imprécision|Gaffe|Il y avait mieux/.test(t),
      texte: t.slice(0, 120).replace(/\n/g, ' '),
    };
  });
  verifier(!silence.evaluation, 'Aucune évaluation affichée en partie libre');
  verifier(silence.barre === 0, 'Aucune barre d’évaluation en partie libre');
  verifier(!silence.classement, 'Aucun jugement de coup en partie libre');
  verifier(silence.fleches === 0, 'Aucune flèche du moteur en partie libre');

  // ============ 2. Raccourcis clavier ============
  const avant = await page.evaluate(() => document.querySelectorAll('ol li button.bg-\\[var\\(--color-accent\\)\\]').length);
  void avant;

  const posInitiale = await page.$eval('cg-board', (el) => el.closest('.cg-wrap')?.className ?? '');
  await page.keyboard.press('KeyF');
  await new Promise((r) => setTimeout(r, 400));
  const posRetournee = await page.$eval('cg-board', (el) => el.closest('.cg-wrap')?.className ?? '');
  verifier(
    posInitiale.includes('orientation-white') !== posRetournee.includes('orientation-white'),
    'Touche F : l’échiquier se retourne',
  );

  const fenAvant = await page.evaluate(() => document.querySelectorAll('cg-board piece').length);
  await page.keyboard.press('ArrowLeft');
  await new Promise((r) => setTimeout(r, 400));
  const apresGauche = await page.evaluate(() => {
    const actif = document.querySelector('ol li button.bg-\\[var\\(--color-accent\\)\\]');
    return { actif: actif?.textContent?.trim() ?? null, pieces: document.querySelectorAll('cg-board piece').length };
  });
  verifier(apresGauche.pieces === fenAvant, 'Flèche gauche : la position reste cohérente');

  await page.keyboard.press('Home');
  await new Promise((r) => setTimeout(r, 400));
  const auDebut = await page.evaluate(
    () => document.querySelectorAll('ol li button.bg-\\[var\\(--color-accent\\)\\]').length === 0,
  );
  verifier(auDebut, 'Touche Début : retour à la position de départ');

  await page.keyboard.press('End');
  await new Promise((r) => setTimeout(r, 400));
  const aLaFin = await page.evaluate(
    () => document.querySelectorAll('ol li button.bg-\\[var\\(--color-accent\\)\\]').length === 1,
  );
  verifier(aLaFin, 'Touche Fin : retour au dernier coup');

  await page.close();
}

// ============ 3. Balayage tactile ============
{
  const page = await navigateur.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(BASE + '/#/libre', { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1');
  await cliquer(page, "(t) => t.includes('Deux joueurs')");
  await cliquer(page, "(t) => t.includes('Commencer la partie')");
  await attendreEchiquier(page);
  await jouer(page, 'e2', 'e4');
  await jouer(page, 'e7', 'e5');

  const nbCoups = await page.evaluate(() => document.querySelectorAll('ol li button').length);
  verifier(nbCoups >= 2, 'Deux coups joués à deux joueurs', String(nbCoups));

  const boite = await page.$eval('cg-board', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  const actifAvant = await page.evaluate(
    () => document.querySelector('ol li button.bg-\\[var\\(--color-accent\\)\\]')?.textContent?.trim() ?? '',
  );
  // Balayage vers la droite = coup précédent.
  await page.touchscreen.touchStart(boite.x - 90, boite.y);
  await page.touchscreen.touchMove(boite.x + 30, boite.y + 4);
  await page.touchscreen.touchEnd();
  await new Promise((r) => setTimeout(r, 500));
  const actifApres = await page.evaluate(
    () => document.querySelector('ol li button.bg-\\[var\\(--color-accent\\)\\]')?.textContent?.trim() ?? '',
  );
  verifier(actifAvant !== actifApres, 'Balayage : navigation dans les coups', `${actifAvant} -> ${actifApres}`);

  await page.close();
}

// ============ 4. Thème clair ============
{
  const page = await navigateur.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(BASE + '/#/reglages', { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1');

  const sombre = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    fond: getComputedStyle(document.body).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
  verifier(sombre.theme === 'sombre', 'Mode sombre par défaut', sombre.fond);

  verifier(await cliquer(page, "(t) => t === 'Clair'"), 'Bascule vers le thème clair');
  await new Promise((r) => setTimeout(r, 600));
  const clair = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    fond: getComputedStyle(document.body).backgroundColor,
    texte: getComputedStyle(document.body).color,
    meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
  verifier(clair.theme === 'clair', 'Attribut de thème mis à jour');
  verifier(clair.fond !== sombre.fond, 'Le fond change réellement', `${sombre.fond} -> ${clair.fond}`);
  verifier(clair.meta !== sombre.meta, 'La couleur de barre système suit le thème', clair.meta ?? '');

  // Contraste : le texte doit rester lisible sur le nouveau fond.
  const contraste = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => {
        const s = Number(v) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const s = getComputedStyle(document.body);
    const a = lum(s.backgroundColor);
    const b = lum(s.color);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  verifier(contraste >= 4.5, 'Contraste du texte suffisant en thème clair', contraste.toFixed(1) + ':1');

  await page.screenshot({ path: 'captures/theme-clair.png' });
  await page.close();
}

await navigateur.close();
console.log('\n' + (echecs === 0 ? 'Interactions : tous les contrôles sont passés.' : echecs + ' contrôle(s) en échec.'));
process.exit(echecs === 0 ? 0 : 1);
