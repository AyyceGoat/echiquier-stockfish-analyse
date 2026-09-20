/**
 * Jeu d'icônes de la navigation.
 *
 * Dessinées ici plutôt qu'empruntées à une police d'icônes ou à une
 * bibliothèque : il en faut sept, elles pèsent moins d'un kilo-octet, et
 * elles restent nettes à toutes les tailles. Surtout, elles partagent la
 * même grammaire — grille de 24, trait de 1,7, extrémités arrondies — là
 * où les glyphes Unicode d'origine (♙ ★ ♛ ▦ ☰) venaient de quatre familles
 * différentes et changeaient de graisse et d'alignement d'un onglet à
 * l'autre.
 *
 * Toutes héritent de `currentColor` et sont décoratives : le libellé
 * textuel est toujours présent à côté.
 */

import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;

function Icone({ children, ...reste }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...reste}
    >
      {children}
    </svg>
  );
}

/** Le pion : la partie libre, le jeu nu. */
export function IconePion(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="6.75" r="2.9" />
      <path d="M9.9 9.4c-.5 1.5-1.3 2.2-2.2 2.7h8.6c-.9-.5-1.7-1.2-2.2-2.7" />
      <path d="M10 12.1c0 2.8-.6 4.9-1.6 6.3h7.2c-1-1.4-1.6-3.5-1.6-6.3" />
      <path d="M6.6 18.4h10.8" />
    </Icone>
  );
}

/** Le pion et son étincelle : le jeu assisté, où le moteur commente. */
export function IconePionAssiste(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="10.5" cy="7.6" r="2.6" />
      <path d="M8.6 10.1c-.5 1.3-1.2 1.9-2 2.4h7.8c-.8-.5-1.5-1.1-2-2.4" />
      <path d="M8.7 12.5c0 2.6-.6 4.5-1.5 5.8h6.6c-.9-1.3-1.5-3.2-1.5-5.8" />
      <path d="M5.6 18.3h9.8" />
      <path d="M18.4 4v3.6M16.6 5.8h3.6" />
    </Icone>
  );
}

/** Le livre ouvert : apprendre. */
export function IconeLivre(p: Props) {
  return (
    <Icone {...p}>
      <path d="M12 7.1C10.6 6 8.8 5.4 6.6 5.4H4v12h2.6c2.2 0 4 .6 5.4 1.7" />
      <path d="M12 7.1c1.4-1.1 3.2-1.7 5.4-1.7H20v12h-2.6c-2.2 0-4 .6-5.4 1.7" />
      <path d="M12 7.1v12" />
    </Icone>
  );
}

/** La courbe d'évaluation : l'analyse. */
export function IconeCourbe(p: Props) {
  return (
    <Icone {...p}>
      <path d="M4 4.5v13.2a1.8 1.8 0 0 0 1.8 1.8H20" />
      <path d="M7.4 14.6l3.3-4.2 2.7 2.3 4.2-5.6" />
      <circle cx="10.7" cy="10.4" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="12.7" r="1.05" fill="currentColor" stroke="none" />
    </Icone>
  );
}

/** L'horloge : l'historique des parties. */
export function IconeHorloge(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12.4" r="7.9" />
      <path d="M12 7.9v4.5l3 1.9" />
    </Icone>
  );
}

/** Les curseurs : les réglages. Plus lisible qu'un engrenage en 20 px. */
export function IconeCurseurs(p: Props) {
  return (
    <Icone {...p}>
      <path d="M4 8.2h4.4M13.1 8.2H20" />
      <path d="M4 15.8h7.3M16 15.8h4" />
      <circle cx="10.7" cy="8.2" r="2.3" />
      <circle cx="13.6" cy="15.8" r="2.3" />
    </Icone>
  );
}

/**
 * La marque.
 *
 * Le même damier cerclé de laiton que le favicon et que l'icône installée :
 * l'onglet du navigateur, l'écran d'accueil du téléphone et l'en-tête
 * montrent exactement le même signe. Un cavalier avait été essayé d'abord,
 * mais sa silhouette devient illisible en 20 px, là où un damier 4x4 reste
 * net et se reconnaît immédiatement.
 *
 * Elle porte ses couleurs — c'est une marque, pas une icône d'interface —
 * et reste donc identique dans les deux thèmes.
 */
export function MarqueEchiquier(p: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      <rect width="32" height="32" rx="7" fill="#14120f" />
      <rect x="4.2" y="4.2" width="23.6" height="23.6" rx="1.6" fill="#d9a441" />
      <rect x="5" y="5" width="22" height="22" fill="#e8d3b0" />
      <path
        fill="#8c6242"
        d="M5 5h5.5v5.5H5zM16 5h5.5v5.5H16zM10.5 10.5H16V16h-5.5zM21.5 10.5H27V16h-5.5zM5 16h5.5v5.5H5zM16 16h5.5v5.5H16zM10.5 21.5H16V27h-5.5zM21.5 21.5H27V27h-5.5z"
      />
    </svg>
  );
}
