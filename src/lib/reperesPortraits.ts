/**
 * Repères anatomiques des portraits, en coordonnées de l'image d'origine
 * (1024 × 1024).
 *
 * Relevés à l'œil, corrigés sur une vue de contrôle, puis validés. Ils
 * pilotent les calques d'animation : chaque valeur qui bouge ici déplace la
 * paupière ou la bouche correspondante.
 *
 * Conventions :
 *   - `oeilG` / `oeilD` : gauche et droite DU SPECTATEUR, pas du personnage ;
 *   - `rx` / `ry` : demi-largeur et demi-hauteur de la zone ;
 *   - `cou` : hauteur de la ligne de cou, qui sert de pivot au mouvement de
 *     tête et de bord au masque en fondu du calque de tête.
 */

export interface Zone {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ReperesPortrait {
  oeilG: Zone;
  oeilD: Zone;
  bouche: Zone;
  cou: number;
}

/** Côté de l'image d'origine. Tous les repères sont exprimés dans ce carré. */
export const COTE_SOURCE = 1024;

export const REPERES: Record<string, ReperesPortrait> = {
  'homme-ultime': {
    oeilG: { cx: 385, cy: 560, rx: 52, ry: 20 },
    oeilD: { cx: 578, cy: 557, rx: 52, ry: 20 },
    bouche: { cx: 487, cy: 797, rx: 62, ry: 25 },
    cou: 880,
  },
  ephraim: {
    oeilG: { cx: 417, cy: 378, rx: 46, ry: 17 },
    oeilD: { cx: 607, cy: 375, rx: 46, ry: 17 },
    bouche: { cx: 521, cy: 562, rx: 60, ry: 22 },
    cou: 690,
  },
  johana: {
    oeilG: { cx: 421, cy: 385, rx: 45, ry: 20 },
    oeilD: { cx: 597, cy: 385, rx: 45, ry: 20 },
    bouche: { cx: 512, cy: 546, rx: 46, ry: 22 },
    cou: 660,
  },
  serena: {
    oeilG: { cx: 400, cy: 447, rx: 42, ry: 18 },
    oeilD: { cx: 556, cy: 443, rx: 42, ry: 18 },
    bouche: { cx: 486, cy: 604, rx: 44, ry: 21 },
    cou: 730,
  },
};

/** Pourcentage de l'image, pour positionner un calque indépendamment de la taille affichée. */
export const pourcent = (v: number): string => `${(v / COTE_SOURCE) * 100}%`;
