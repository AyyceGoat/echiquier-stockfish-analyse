/**
 * Extrait les silhouettes de pièces du CSS de Chessground.
 *
 * Le jeu « cburnett » est celui de Lichess, de cette application, et de la
 * plupart des captures d'écran qu'on importe en pratique. Ses SVG sont déjà
 * embarqués en base64 dans la feuille de style : on en fait des gabarits de
 * reconnaissance, bien plus fidèles que des glyphes Unicode.
 *
 * Seules les pièces blanches sont extraites : la silhouette d'une tour est
 * la même quelle que soit sa couleur, et la couleur est déterminée
 * séparément, par comparaison des aires claires et sombres de la case.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = join('node_modules', 'chessground', 'assets', 'chessground.cburnett.css');
const SORTIE = join('src', 'recognition', 'gabarits-pieces.ts');

const ROLES = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

const css = readFileSync(CSS, 'utf8');
const trouves = {};

for (const [role, lettre] of Object.entries(ROLES)) {
  // .cg-wrap piece.<role>.white { background-image: url('data:image/svg+xml;base64,XXXX'); }
  const motif = new RegExp(
    `piece\\.${role}\\.white\\s*\\{[^}]*url\\('data:image/svg\\+xml;base64,([A-Za-z0-9+/=]+)'\\)`,
  );
  const m = css.match(motif);
  if (!m) {
    console.error(`Silhouette introuvable pour « ${role} ».`);
    process.exit(1);
  }
  trouves[lettre] = m[1];
}

const lignes = Object.entries(trouves)
  .map(([lettre, b64]) => `  ${lettre}: '${b64}',`)
  .join('\n');

const contenu = `/**
 * Silhouettes des pièces, en SVG encodé en base64.
 *
 * Fichier PRODUIT par \`npm run gabarits\` à partir du CSS de Chessground
 * (jeu cburnett, GPLv2+). Ne pas modifier à la main.
 *
 * Une seule silhouette par type : elle ne dépend pas de la couleur, qui est
 * déduite ailleurs, en comparant les aires claires et sombres de la case.
 */

export const SILHOUETTES: Record<string, string> = {
${lignes}
};
`;

writeFileSync(SORTIE, contenu, 'utf8');
console.log(`${Object.keys(trouves).length} silhouettes écrites dans ${SORTIE}.`);
