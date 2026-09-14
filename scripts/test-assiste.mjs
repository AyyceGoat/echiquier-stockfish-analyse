/**
 * Teste le mode assisté et la reconnaissance locale.
 * - joue un coup faible et vérifie que le verdict arrive ;
 * - vérifie que « Reprendre » annule bien le coup ;
 * - fabrique une capture d'échiquier et la passe à la reconnaissance locale.
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
const page = await navigateur.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text());
});
page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e?.message ?? e)));

const cliquer = (p) =>
  page.evaluate((src) => {
    const test = new Function('t', 'return (' + src + ')(t);');
    const b = [...document.querySelectorAll('button')].find((x) => test(x.textContent?.trim() ?? ''));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, p);

// ---------- Mode assisté ----------
await page.goto(BASE + '/#/assiste', { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');
verifier(await cliquer("(t) => t === 'Jouer les blancs'"), 'Démarrage du jeu assisté');
await page.waitForSelector('cg-board', { timeout: 30000 });
// `cg-board` existe dès sa création ; Chessground place encore les pièces
// et calcule ses dimensions. Interagir trop tôt vise des coordonnées fausses.
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 15000, polling: 100 },
);
await new Promise((r) => setTimeout(r, 600));

/**
 * Joue un coup en touchant la case de départ puis celle d'arrivée.
 * C'est le geste réellement utilisé au doigt, et il éprouve le chemin
 * `selectable` de Chessground plutôt que le glisser-déposer.
 */
async function jouer(depuis, vers) {
  // Le clic précédent a pu faire défiler la page : sans remise à zéro, les
  // coordonnées absolues visées tombent à côté de l'échiquier.
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 250));
  const boite = await page.$eval('cg-board', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, c: r.width / 8, orientation: el.closest('.cg-wrap')?.className ?? '' };
  });
  const noires = boite.orientation.includes('orientation-black');
  const centre = (sq) => {
    const col = sq.charCodeAt(0) - 97;
    const rang = Number(sq[1]) - 1;
    const cx = noires ? 7 - col : col;
    const cy = noires ? rang : 7 - rang;
    return { x: boite.x + (cx + 0.5) * boite.c, y: boite.y + (cy + 0.5) * boite.c };
  };
  const a = centre(depuis);
  const vp = page.viewport();
  const verifierDansLEcran = (nom, pt) => {
    if (pt.y < 0 || pt.y > vp.height || pt.x < 0 || pt.x > vp.width) {
      throw new Error(`La case ${nom} est hors de l'écran : ${JSON.stringify(pt)}`);
    }
  };
  verifierDansLEcran('départ', a);
  await page.mouse.click(a.x, a.y);
  await new Promise((r) => setTimeout(r, 250));

  // L'échiquier est remesuré entre les deux appuis : une bannière qui
  // disparaît au-dessus de lui le déplacerait, et le second appui tomberait
  // sur une autre case.
  const boite2 = await page.$eval('cg-board', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, c: r.width / 8 };
  });
  const col = vers.charCodeAt(0) - 97;
  const rang = Number(vers[1]) - 1;
  const b = {
    x: boite2.x + ((noires ? 7 - col : col) + 0.5) * boite2.c,
    y: boite2.y + ((noires ? rang : 7 - rang) + 0.5) * boite2.c,
  };
  verifierDansLEcran('arrivée', b);
  await page.mouse.click(b.x, b.y);
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Joue le coup, avec une seconde tentative.
 * Sur un site distant, l'échiquier peut être visible avant que Chessground
 * ait reçu ses coups jouables : le premier appui ne sélectionne alors rien.
 */
let coupJoue = false;
for (let essai = 1; essai <= 2 && !coupJoue; essai++) {
  await jouer('a2', 'a4');
  coupJoue = await page.evaluate(() => document.body.innerText.includes('a4'));
  if (!coupJoue) await new Promise((r) => setTimeout(r, 1500));
}
verifier(coupJoue, 'Le coup a été enregistré sur l’échiquier');
await page.waitForFunction(() => document.body.innerText.includes('Votre coup'), {
  timeout: 30000,
  polling: 500,
});
await page.waitForFunction(
  () =>
    /Excellent|Bon|Imprécision|Erreur|Gaffe|Coup de théorie|Coup unique/.test(document.body.innerText) &&
    !document.body.innerText.includes('Évaluation en cours'),
  { timeout: 120000, polling: 500 },
);

const verdict = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    classement: (t.match(/Votre coup\s*\n\s*(\S[^\n]*)/) ?? [])[1] ?? '',
    aReprendre: t.includes('Reprendre'),
    aPertePionAberrante: /\d{2,},\d\d\s*pion/.test(t),
    nbCoups: document.querySelectorAll('ol li').length,
  };
});
verifier(Boolean(verdict.classement), 'Verdict rendu sur le coup joué', verdict.classement);
verifier(verdict.aReprendre, 'Bouton « Reprendre » proposé');
verifier(!verdict.aPertePionAberrante, 'Aucune perte en pions aberrante affichée');
await page.screenshot({ path: 'captures/assiste-verdict.png' });

verifier(await cliquer("(t) => t === 'Reprendre'"), 'Clic sur Reprendre');
await new Promise((r) => setTimeout(r, 2500));
const repris = await page.evaluate(() => ({
  listeVide: document.body.innerText.includes('Aucun coup joué'),
  texte: document.body.innerText.slice(0, 200),
}));
verifier(repris.listeVide, 'Le coup a bien été repris');

// ---------- Reconnaissance locale ----------
await page.goto(BASE + '/#/reglages', { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');
verifier(await cliquer("(t) => t.includes('Reconnaissance locale')"), 'Sélection du moteur local');

await page.goto(BASE + '/#/analyse', { waitUntil: 'networkidle2' });
// On attend l'écran d'analyse lui-même : `h1` existe déjà sur l'écran
// précédent, et la navigation par fragment ne recharge pas le document.
await page.waitForFunction(
  () => document.body.innerText.includes('Analyse de position'),
  { timeout: 15000, polling: 200 },
);
await page.waitForSelector('input[type="file"]', { timeout: 15000 });

// L'image de test est une capture RÉELLE de l'échiquier de l'application
// (jeu de pièces cburnett, cases brunes) : c'est exactement le cas d'usage
// visé par la reconnaissance locale — une capture d'écran d'échiquier
// numérique. Un dessin fabriqué avec des glyphes Unicode ne prouverait rien
// sur les vrais jeux de pièces.
const pageBoard = await navigateur.newPage();
await pageBoard.setViewport({ width: 700, height: 900, deviceScaleFactor: 1 });
await pageBoard.goto(BASE + '/#/libre', { waitUntil: 'networkidle2' });
// Capture sans coordonnées : les lettres de colonnes se superposent à la
// première rangée et perturbent la lecture des pièces qui s'y trouvent.
await pageBoard.evaluate(() => {
  try {
    const r = JSON.parse(localStorage.getItem('echiquier.reglages.v1') ?? '{}');
    localStorage.setItem(
      'echiquier.reglages.v1',
      JSON.stringify({ ...r, coordonnees: false }),
    );
  } catch {
    /* stockage indisponible : la capture gardera ses coordonnées */
  }
});
await pageBoard.reload({ waitUntil: 'networkidle2' });
await pageBoard.waitForSelector('h1');
await pageBoard.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.textContent?.includes('Commencer la partie'),
  );
  b.click();
});
await pageBoard.waitForSelector('cg-board');
await pageBoard.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 200,
  { timeout: 15000, polling: 100 },
);
await new Promise((r) => setTimeout(r, 800));
const echiquierPng = await (await pageBoard.$('cg-board')).screenshot({ encoding: 'base64' });
await pageBoard.close();
const dataUrl = 'data:image/png;base64,' + echiquierPng;

const champ = await page.$('input[type="file"]');
verifier(Boolean(champ), 'Champ d’import présent');

await page.evaluate(async (url) => {
  const blob = await (await fetch(url)).blob();
  const f = new File([blob], 'echiquier.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(f);
  const champs = [...document.querySelectorAll('input[type="file"]')];
  const cible = champs[champs.length - 1];
  cible.files = dt.files;
  cible.dispatchEvent(new Event('change', { bubbles: true }));
}, dataUrl);

await page.waitForFunction(
  () =>
    document.body.innerText.includes('Vérifier la position') ||
    document.body.innerText.includes('échoué') ||
    document.body.innerText.includes('détecté'),
  { timeout: 60000, polling: 500 },
);

const corr = await page.evaluate(() => {
  const t = document.body.innerText;
  const cases = [...document.querySelectorAll('[role="grid"] button')];
  return {
    arrive: t.includes('Vérifier la position'),
    occupees: cases.filter((b) => b.querySelector('piece')).length,
    aFen: /\/.*\/.*\s[wb]\s/.test(t),
    douteuses: (t.match(/(\d+) cases? à vérifier/) ?? [])[1],
    fen: (t.match(/([rnbqkpRNBQKP1-8]+(?:\/[rnbqkpRNBQKP1-8]+){7} [wb] \S+ \S+ \d+ \d+)/) ?? [])[1],
  };
});
verifier(corr.arrive, 'Écran de correction atteint');
verifier(corr.occupees === 32, 'Les 32 pièces sont détectées', corr.occupees + '/32');
verifier(corr.aFen, 'FEN produit et affiché');

// L'image importée est la position initiale : on sait exactement ce que la
// reconnaissance doit produire, case par case.
const ATTENDU = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const obtenu = (corr.fen ?? '').split(' ')[0];
const exactes = (() => {
  const dep = (p) =>
    p
      .split('/')
      .map((r) => [...r].flatMap((c) => (c >= '1' && c <= '8' ? Array(+c).fill('.') : [c])))
      .flat();
  const a = dep(ATTENDU);
  const b = dep(obtenu);
  return a.length === b.length ? a.filter((v, i) => v === b[i]).length : 0;
})();
// Garde-fou de non-régression, pas une exigence d'exactitude : la
// reconnaissance locale est heuristique et l'écran de correction existe
// pour le reste. Mesuré à ce jour : 63/64, la dame blanche étant parfois
// lue comme une tour (silhouettes très proches dans le jeu cburnett).
verifier(exactes >= 62, 'Position reconnue (seuil de non-régression)', `${exactes}/64 — ${obtenu}`);
if (obtenu !== ATTENDU) console.log('       attendu : ' + ATTENDU);
console.log('       cases signalées à vérifier : ' + (corr.douteuses ?? '0'));
await page.screenshot({ path: 'captures/correction.png', fullPage: true });

const bloquantes = erreurs.filter((e) => !/favicon|404/i.test(e));
verifier(bloquantes.length === 0, 'Aucune erreur de console', bloquantes.slice(0, 2).join(' | '));

await navigateur.close();
console.log('\n' + (echecs === 0 ? 'Tous les contrôles sont passés.' : echecs + ' contrôle(s) en échec.'));
process.exit(echecs === 0 ? 0 : 1);
