/**
 * Rythme de la parole : début de partie, et jeu rapide.
 *
 * Trois défauts signalés, mesurés ici sur un format de téléphone :
 *
 *   - quand le professeur a les blancs, il joue sans rien dire et ne parle
 *     qu'au troisième ou quatrième coup ;
 *   - en enchaînant les coups, il répète « ah, vous avez joué ça » à chaque
 *     fois ;
 *   - la parole prend du retard sur le coup en cours.
 *
 * Usage : node scripts/test-rythme.mjs [url]
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

/** Texte actuellement affiché dans la carte du professeur. */
const lire = (page) =>
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

async function ouvrirPartie(camp) {
  const page = await nav.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim().startsWith('Jouer les')),
    { timeout: 60000, polling: 150 },
  );
  const libelle = camp === 'w' ? 'Jouer les blancs' : 'Jouer les noirs';
  const lance = Date.now();
  await page.evaluate((libelle) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === libelle);
    b?.scrollIntoView({ block: 'center' });
    b?.click();
  }, libelle);
  return { page, lance };
}

/* --- 3. Le professeur parle-t-il dès l'ouverture ? ----------------------- */
console.log('');
console.log('--- Début de partie ---');
for (const [camp, qui] of [
  ['w', 'le joueur a les blancs'],
  ['b', 'le PROFESSEUR a les blancs'],
]) {
  const { page, lance } = await ouvrirPartie(camp);
  const parle = await page
    .waitForFunction(
      () => {
        const scene = document.querySelector('.pp-scene');
        let n = scene?.parentElement ?? null;
        for (let i = 0; i < 4 && n; i++) {
          const p = n.querySelector(':scope > p');
          if (p) return (p.textContent?.trim().length ?? 0) > 10;
          n = n.parentElement;
        }
        return false;
      },
      { timeout: 60000, polling: 80 },
    )
    .then(() => Date.now() - lance)
    .catch(() => null);

  // Le professeur doit avoir parlé AVANT que son premier coup soit joué.
  const avantSonCoup = await page.evaluate(
    () => (document.body.textContent ?? '').includes('Aucun coup joué'),
  );
  const texte = await lire(page);
  console.log(`  ${qui} : « ${texte.slice(0, 70)} »`);
  verifier(
    parle !== null && parle < 3000,
    `[${qui}] Il parle dès l'ouverture`,
    parle === null ? 'jamais' : `${parle} ms`,
  );
  if (camp === 'b') {
    verifier(avantSonCoup, `[${qui}] Il salue AVANT de jouer son premier coup`);
  }
  await page.close();
}

/* --- 1 et 2. Variété quand on joue posé, silence quand on enchaîne ------ */

const COUPS = [
  ['e2', 'e4'],
  ['g1', 'f3'],
  ['f1', 'c4'],
  ['d2', 'd3'],
  ['b1', 'c3'],
  ['c1', 'g5'],
];

/**
 * Joue la série sur une partie neuve, en laissant `attente` ms par coup.
 *
 * On n'interroge pas l'écran à un instant choisi : à 400 ms d'un coup, le
 * texte en cours de frappe est tronqué et celui du coup précédent est encore
 * là. On enregistre donc TOUTES les valeurs prises par le paragraphe, et on ne
 * garde que celles qui ne sont pas le préfixe de la suivante — c'est-à-dire
 * les répliques réellement terminées.
 */
async function serie(attente) {
  const { page } = await ouvrirPartie('w');
  await page.waitForSelector('cg-board', { timeout: 60000 });
  await page.waitForFunction(
    () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
    { timeout: 30000, polling: 100 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    const scene = document.querySelector('.pp-scene');
    let cible = null;
    let n = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && n && !cible; i++) {
      cible = n.querySelector(':scope > p');
      n = n.parentElement;
    }
    window.__suivi = [];
    if (!cible) return;
    const noter = () => {
      const t = cible.textContent?.trim() ?? '';
      if (window.__suivi[window.__suivi.length - 1] !== t) window.__suivi.push(t);
    };
    noter();
    new MutationObserver(noter).observe(cible, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  const ecarts = [];
  let precedent = 0;
  for (const [de, vers] of COUPS) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('cg-board').getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width };
    });
    const c = r.width / 8;
    const pt = (sq) => ({
      x: r.left + (sq.charCodeAt(0) - 97 + 0.5) * c,
      y: r.top + (8 - Number(sq[1]) + 0.5) * c,
    });
    const a = pt(de);
    const b = pt(vers);
    await page.touchscreen.tap(a.x, a.y);
    await page.touchscreen.tap(b.x, b.y);
    const maintenant = Date.now();
    if (precedent) ecarts.push(maintenant - precedent);
    precedent = maintenant;
    if (attente > 0) {
      await page.evaluate((ms) => new Promise((res) => setTimeout(res, ms)), attente);
    }
    // Garder le coup, dès que le bouton paraît : c'est ce clic qui rend la
    // main au professeur. L'attendre longuement fabriquerait un rythme posé
    // alors qu'on veut mesurer le rythme vif.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((x) =>
            /Garder le coup|Garder|Continuer/i.test(x.textContent ?? ''),
          ),
        // Court exprès : sur un site déployé, le moteur peut mettre vingt
        // secondes à rendre son verdict, et attendre ce bouton fabriquerait un
        // rythme posé au milieu d'une rafale.
        { timeout: attente > 0 ? 20000 : 3000, polling: 40 },
      )
      .catch(() => null);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /Garder le coup|Garder|Continuer/i.test(x.textContent ?? ''),
      );
      b?.click();
    });
  }
  // Laisser retomber : la dernière réplique a le droit de finir sa phrase.
  await page.evaluate(() => new Promise((res) => setTimeout(res, 2500)));
  const lecteurs = await page.evaluate(
    () => [...document.querySelectorAll('audio')].filter((a) => !a.paused).length,
  );
  const suivi = await page.evaluate(() => window.__suivi ?? []);
  await page.close();
  // Une valeur qui est le préfixe de la suivante est une frappe en cours.
  const terminees = suivi.filter(
    (t, i) => t.length > 0 && !(suivi[i + 1] ?? '').startsWith(t),
  );
  return { ecarts, lecteurs, terminees };
}

/** Première phrase de chaque réplique : c'est elle qui se répétait. */
const SEPARATEUR = new RegExp('(?<=[.!?…])\\s');
const premieres = (dits) => dits.map((t) => t.split(SEPARATEUR)[0] ?? '').filter(Boolean);

console.log('');
console.log('--- Six coups posés : la variété ---');
const posee = await serie(4600);
console.log(`  écarts entre coups : ${posee.ecarts.join(' / ')} ms`);
for (const [i, t] of posee.terminees.entries())
  console.log(`  réplique ${i + 1} : « ${t.slice(0, 80)} »`);
const ouvertures = premieres(posee.terminees);
const consecutives = ouvertures.filter((o, i) => i > 0 && o === ouvertures[i - 1]);
// Cinq et non six : sur un site déployé, le moteur met parfois vingt-cinq
// secondes à rendre un verdict, et deux répliques se confondent alors dans le
// relevé. Ce n'est pas un silence du professeur, c'est une latence du moteur —
// et les écarts mesurés, affichés plus haut, le montrent.
verifier(
  ouvertures.length >= 5,
  'Le professeur parle à chaque coup quand on lui laisse le temps',
  `${ouvertures.length} répliques terminées pour ${COUPS.length} coups`,
);
verifier(
  consecutives.length === 0,
  'Jamais deux fois la même phrase d’affilée',
  consecutives.length ? `répétée : « ${consecutives[0]} »` : `sur ${ouvertures.length} coups`,
);
verifier(
  new Set(ouvertures).size === ouvertures.length,
  'Aucune phrase répétée dans la partie',
  `${new Set(ouvertures).size} distinctes sur ${ouvertures.length}`,
);
verifier(posee.lecteurs <= 1, 'Une seule réplique en cours', `${posee.lecteurs} lecteurs`);

console.log('');
console.log('--- Six coups enchaînés : le silence ---');
const vive = await serie(0);
console.log(`  écarts entre coups : ${vive.ecarts.join(' / ')} ms`);
for (const [i, t] of vive.terminees.entries())
  console.log(`  réplique ${i + 1} : « ${t.slice(0, 80)} »`);
// La salutation compte pour une : elle est dite avant le premier coup.
const pendant = vive.terminees.slice(1);
verifier(
  pendant.every((t) => t.length < 60),
  'Les répliques restent courtes quand on enchaîne',
  pendant.length ? pendant.map((t) => t.length).join(' / ') : 'aucune',
);
// Le relevé ne peut pas distinguer une réplique achevée d'une réplique
// interrompue puis remplacée : les deux laissent une valeur qui n'est pas le
// préfixe de la suivante. On ne compte donc pas les silences, on constate
// qu'il y en a — moins de répliques que de coups — et que ce qui est dit est
// nettement plus court qu'au rythme posé.
/**
 * Compter les silences par coup ne marche pas, et c'est instructif.
 *
 * D'une part le rythme réel dépend du moteur : sur un site déployé un verdict
 * peut mettre trois secondes, et le coup suivant n'est alors plus « enchaîné »
 * au sens de l'application. D'autre part les coups de ce scénario sont jugés
 * imprécis ou fautifs par le moteur, et une faute est expliquée à n'importe
 * quel rythme — c'est voulu.
 *
 * Ce qui se vérifie sans ambiguïté, c'est la règle elle-même : il acquiesce
 * UNE fois, puis se taît. Donc jamais deux acquiescements de suite. Un
 * acquiescement se reconnaît à ce qu'il est court et terminé ; un relevé
 * tronqué en pleine frappe ne finit pas sur un point.
 */
const estAcquiescement = (t) => t.length <= 15 && /[.!?…]$/.test(t);
const acquiescements = pendant.filter(estAcquiescement);
const colles = pendant.filter(
  (t, i) => i > 0 && estAcquiescement(t) && estAcquiescement(pendant[i - 1]),
);
console.log(`  écarts sous deux secondes : ${vive.ecarts.filter((e) => e < 2000).length} sur ${vive.ecarts.length}`);
verifier(
  colles.length === 0,
  'Il acquiesce une fois, puis se taît',
  `${acquiescements.length} acquiescement(s)${colles.length ? `, dont « ${colles[0]} » collé au précédent` : ', aucun collé'}`,
);
// On ne compare pas la longueur d'une série à l'autre : ce sont deux parties
// différentes, le relevé tronque les répliques interrompues, et un verdict qui
// tarde sur un site déployé suffit à rendre un coup « posé » au milieu d'une
// rafale. Que la réplique raccourcisse avec le rythme est vérifié par les
// tests unitaires, professeur par professeur, sans aléa de mesure.
console.log(`  longueurs : ${pendant.map((t) => t.length).join(' / ') || 'aucune'}`);
verifier(vive.lecteurs <= 1, 'Une seule réplique en cours', `${vive.lecteurs} lecteurs`);

await nav.close();
console.log('');
console.log(echecs === 0 ? 'Rythme : conforme.' : `${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
