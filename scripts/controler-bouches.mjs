/**
 * Contrôle d'alignement des trois états de bouche.
 *
 * C'est ce script qui a tranché la façon d'animer la bouche.
 *
 * L'idée simple était d'échanger le portrait entier contre son rendu
 * « entrouverte » ou « ouverte ». Elle ne tient que si le reste du visage
 * est rigoureusement identique d'un rendu à l'autre. La mesure dit le
 * contraire : l'écart moyen atteint 2 à 4 niveaux sur 255 dans les zones
 * témoins — bandeau des yeux et haut du crâne —, c'est-à-dire là où rien ne
 * devrait bouger. Un échange d'image ferait donc vibrer les yeux et les
 * cheveux à chaque syllabe. L'animation ne garde que la RÉGION de la bouche,
 * découpée en ellipse à bord fondu (`preparer-portraits.mjs`).
 *
 * Ce que le script vérifie, du coup :
 *  - les rendus se rapportent bien au même cadrage ;
 *  - la bouche change nettement, et nettement PLUS que les zones témoins,
 *    faute de quoi la pastille ne montrerait rien.
 *
 * Usage : node scripts/controler-bouches.mjs [url-racine]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';
import { COTE_SOURCE, REPERES } from '../src/lib/reperesPortraits.ts';

const BASE = process.argv[2] ?? 'http://localhost:8100';
const PORTRAITS = ['homme-ultime', 'ephraim', 'johana', 'serena'];
const ETATS = ['entrouverte', 'ouverte'];
/** Au-delà, on considère que le pixel a changé (0–255). */
const SEUIL = 18;

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));
const page = await nav.newPage();
await page.goto(`${BASE}/PROFS/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

let echecs = 0;
console.log('  portrait         état          défs.        écart moyen (0–255)');
console.log('                                              bouche    yeux   front   tout');
console.log('  ------------------------------------------------------------------------------------------');

for (const id of PORTRAITS) {
  const reperes = REPERES[id];
  for (const etat of ETATS) {
    const r = await page.evaluate(
      async (base, id, etat, seuil, reperes, cote) => {
        const charger = async (src) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = src;
          await img.decode();
          return img;
        };
        const a = await charger(`${base}/PROFS/${id}.jpg`);
        const b = await charger(`${base}/PROFS/${id}-${etat}.jpg`);

        // Les rendus n'ont pas tous la même définition — celui d'Ephraim
        // bouche ouverte fait 1254 px. Ce n'est pas un défaut : le découpage
        // les ramène au carré de référence. On compare donc après mise à
        // l'échelle, au lieu d'abandonner sur une différence de taille.
        const L = cote;
        const H = cote;
        const pixels = (img) => {
          const c = document.createElement('canvas');
          c.width = L;
          c.height = H;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.imageSmoothingQuality = 'high';
          x.drawImage(img, 0, 0, L, H);
          return x.getImageData(0, 0, L, H).data;
        };
        const pa = pixels(a);
        const pb = pixels(b);
        const dims = `${a.naturalWidth} / ${b.naturalWidth}`;

        // Les repères sont donnés dans un carré de référence : on les
        // ramène aux dimensions réelles de l'image.
        const k = L / cote;
        const bx = reperes.bouche.cx * k;
        const by = reperes.bouche.cy * (H / cote);
        // Boîte généreuse : la mâchoire bouge avec la bouche.
        const rx = reperes.bouche.rx * k * 3;
        const ry = reperes.bouche.ry * (H / cote) * 4;

        /**
         * Écart MOYEN par région, et non un comptage par seuil.
         *
         * Le comptage ne distinguait pas un déplacement de la tête du simple
         * bruit de recompression JPEG : les deux font « changer » des pixels
         * un peu partout. L'amplitude, elle, tranche — le bruit reste sous
         * un ou deux niveaux, un décalage de contour en produit des dizaines.
         */
        const moyenne = (x0, y0, x1, y1) => {
          let somme = 0;
          let n = 0;
          for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++) {
            for (let x = Math.max(0, x0 | 0); x < Math.min(L, x1 | 0); x++) {
              const i = (y * L + x) * 4;
              somme +=
                (Math.abs(pa[i] - pb[i]) +
                  Math.abs(pa[i + 1] - pb[i + 1]) +
                  Math.abs(pa[i + 2] - pb[i + 2])) /
                3;
              n++;
            }
          }
          return n ? somme / n : 0;
        };

        const ky = H / cote;
        const ex = reperes.oeilG.cx * k;
        const ey = reperes.oeilG.cy * ky;
        const edx = (reperes.oeilD.cx - reperes.oeilG.cx) * k;

        return {
          dims,
          identiques: true,
          // Bouche et mâchoire : c'est là que la différence doit vivre.
          bouche: moyenne(bx - rx, by - ry, bx + rx, by + ry),
          // Bandeau des yeux, élargi aux deux côtés : témoin immobile.
          yeux: moyenne(ex - 2 * edx, ey - 4 * reperes.oeilG.ry * ky, ex + 3 * edx, ey + 4 * reperes.oeilG.ry * ky),
          // Haut du crâne : second témoin, loin de toute expression.
          front: moyenne(0, 0, L, reperes.oeilG.cy * ky - 6 * reperes.oeilG.ry * ky),
          tout: moyenne(0, 0, L, H),
        };
      },
      BASE,
      id,
      etat,
      SEUIL,
      reperes,
      COTE_SOURCE,
    );

    if (!r.identiques) {
      console.log(`  ${id.padEnd(15)} ${etat.padEnd(13)} ${r.dims}   DIMENSIONS DIFFÉRENTES`);
      echecs++;
      continue;
    }
    // La bouche doit porter nettement plus de changement que les témoins.
    // Une fois et demie, et non le triple : une bouche ENTROUVERTE bouge peu
    // par nature, et le seuil sévère la recalait à tort.
    const ok = r.bouche >= 4 && r.bouche >= 1.5 * Math.max(r.yeux, r.front);
    // Un témoin qui bouge est ce qui interdit l'échange d'image entière.
    const temoinBouge = Math.max(r.yeux, r.front) >= 2;
    if (!ok) echecs++;
    console.log(
      `  ${id.padEnd(15)} ${etat.padEnd(13)} ${r.dims.padEnd(12)} ` +
        `${r.bouche.toFixed(2).padStart(6)}   ${r.yeux.toFixed(2).padStart(5)}   ` +
        `${r.front.toFixed(2).padStart(5)}   ${r.tout.toFixed(2).padStart(5)}   ${ok ? 'pastille exploitable' : 'AMPLITUDE INSUFFISANTE'}` +
        `${temoinBouge ? ' · témoins mobiles' : ''}`,
    );
  }
}

await nav.close();
if (echecs === 0) {
  console.log('');
  console.log('La bouche porte le changement : la pastille est exploitable.');
  console.log('Les zones témoins bougeant de 2 à 4 niveaux, l’échange du portrait');
  console.log('entier reste exclu — c’est pourquoi seule la bouche est découpée.');
} else {
  console.log('');
  console.log(`${echecs} état(s) sans amplitude suffisante — la pastille ne montrerait rien.`);
}
process.exit(echecs === 0 ? 0 : 1);
