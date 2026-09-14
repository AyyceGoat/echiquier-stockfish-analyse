/**
 * Détection de motifs tactiques, en géométrie pure.
 *
 * Aucun appel réseau, aucun modèle : tout se déduit de la position et des
 * règles du jeu. Ce module ne dit jamais « ce coup coûte 0,77 » ; il dit
 * « votre cavalier est en prise », ce qui est la seule information dont un
 * débutant puisse faire quelque chose.
 *
 * Les fonctions travaillent toutes sur une instance `chess.js` et sont
 * testables une par une.
 */

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const VALEURS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export const NOMS: Record<PieceSymbol, string> = {
  p: 'pion',
  n: 'cavalier',
  b: 'fou',
  r: 'tour',
  q: 'dame',
  k: 'roi',
};

/** « le cavalier », « la tour » — le genre compte en français. */
export function avecArticle(t: PieceSymbol): string {
  return t === 'r' || t === 'q' ? `la ${NOMS[t]}` : `le ${NOMS[t]}`;
}

/** « votre cavalier », « votre tour ». */
export function avecPossessif(t: PieceSymbol): string {
  return `votre ${NOMS[t]}`;
}

export function autreCouleur(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

const COLONNES = 'abcdefgh';

function caseDe(col: number, rang: number): Square | null {
  if (col < 0 || col > 7 || rang < 0 || rang > 7) return null;
  return `${COLONNES[col]}${rang + 1}` as Square;
}

function coordonnees(sq: Square): { col: number; rang: number } {
  return { col: sq.charCodeAt(0) - 97, rang: Number(sq[1]) - 1 };
}

/** Directions de déplacement des pièces à longue portée. */
const DIAGONALES = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const LIGNES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function directionsDe(t: PieceSymbol): readonly (readonly [number, number])[] {
  if (t === 'b') return DIAGONALES;
  if (t === 'r') return LIGNES;
  if (t === 'q') return [...DIAGONALES, ...LIGNES];
  return [];
}

export interface PieceSurCase {
  case: Square;
  type: PieceSymbol;
}

/** Toutes les pièces d'une couleur, avec leur case. */
export function piecesDe(jeu: Chess, couleur: Color): PieceSurCase[] {
  const out: PieceSurCase[] = [];
  for (const rangee of jeu.board()) {
    for (const c of rangee) {
      if (c && c.color === couleur) out.push({ case: c.square as Square, type: c.type });
    }
  }
  return out;
}

/**
 * Une pièce est-elle réellement perdable sur cette case ?
 *
 * On ne se contente pas de « elle est attaquée » : une pièce défendue n'est
 * en prise que si l'attaquant le moins cher vaut moins qu'elle. C'est une
 * approximation d'échange, suffisante pour nommer le problème à un débutant.
 */
export function estEnPrise(jeu: Chess, sq: Square, couleur: Color): boolean {
  const piece = jeu.get(sq);
  if (!piece || piece.color !== couleur || piece.type === 'k') return false;

  const adverse = autreCouleur(couleur);
  const attaquants = jeu.attackers(sq, adverse);
  if (attaquants.length === 0) return false;

  const defenseurs = jeu.attackers(sq, couleur);
  if (defenseurs.length === 0) return true;

  const moinsCher = Math.min(...attaquants.map((a) => VALEURS[jeu.get(a)?.type ?? 'p']));
  return moinsCher < VALEURS[piece.type];
}

/** Les pièces d'un camp réellement en prise, de la plus chère à la moins chère. */
export function piecesEnPrise(jeu: Chess, couleur: Color): PieceSurCase[] {
  return piecesDe(jeu, couleur)
    .filter((p) => p.type !== 'k' && estEnPrise(jeu, p.case, couleur))
    .sort((a, b) => VALEURS[b.type] - VALEURS[a.type]);
}

/**
 * Reconstruit la position avec le trait inversé.
 * Sert à lire ce que l'ADVERSAIRE menace dans la position courante.
 * Renvoie `null` si la position obtenue est illégale (roi en prise).
 */
export function avecTraitInverse(jeu: Chess): Chess | null {
  const champs = jeu.fen().split(' ');
  champs[1] = champs[1] === 'w' ? 'b' : 'w';
  // Une prise en passant n'a plus de sens après inversion du trait.
  champs[3] = '-';
  try {
    return new Chess(champs.join(' '));
  } catch {
    return null;
  }
}

export interface Fourchette {
  /** Case de la pièce qui fourchette. */
  depuis: Square;
  auteur: PieceSymbol;
  cibles: PieceSurCase[];
}

/**
 * La pièce posée sur `depuis` attaque-t-elle plusieurs pièces adverses de
 * valeur ? On exige que les cibles valent plus que l'attaquant, ou soient le
 * roi : attaquer deux pions avec une dame n'est pas une fourchette.
 */
export function fourchetteDepuis(
  jeu: Chess,
  depuis: Square,
  couleur: Color,
): Fourchette | null {
  const piece = jeu.get(depuis);
  if (!piece || piece.color !== couleur) return null;

  const adverse = autreCouleur(couleur);
  const cibles = piecesDe(jeu, adverse)
    .filter((c) => jeu.attackers(c.case, couleur).includes(depuis))
    .filter((c) => c.type === 'k' || VALEURS[c.type] > VALEURS[piece.type])
    // Une cible défendue reste une cible si elle vaut plus que l'attaquant.
    .sort((a, b) => VALEURS[b.type] - VALEURS[a.type]);

  if (cibles.length < 2) return null;
  return { depuis, auteur: piece.type, cibles };
}

export interface Alignement {
  /** Pièce à longue portée qui exerce la contrainte. */
  attaquant: PieceSurCase;
  /** Pièce prise entre l'attaquant et la pièce arrière. */
  devant: PieceSurCase;
  /** Pièce située derrière. */
  derriere: PieceSurCase;
}

/**
 * Parcourt les rayons des pièces à longue portée d'un camp et renvoie les
 * alignements « attaquant, pièce, pièce » sans rien entre eux. C'est la
 * base commune du clouage et de l'enfilade : seule la valeur relative des
 * deux pièces alignées les distingue.
 */
function alignements(jeu: Chess, attaquantCouleur: Color): Alignement[] {
  const victimeCouleur = autreCouleur(attaquantCouleur);
  const out: Alignement[] = [];

  for (const attaquant of piecesDe(jeu, attaquantCouleur)) {
    for (const [dc, dr] of directionsDe(attaquant.type)) {
      const depart = coordonnees(attaquant.case);
      let col = depart.col + dc;
      let rang = depart.rang + dr;
      let devant: PieceSurCase | null = null;

      for (;;) {
        const sq = caseDe(col, rang);
        if (!sq) break;
        const p = jeu.get(sq);
        if (p) {
          if (p.color === attaquantCouleur) break; // rayon bloqué par un ami
          if (!devant) {
            devant = { case: sq, type: p.type };
          } else {
            out.push({ attaquant, devant, derriere: { case: sq, type: p.type } });
            break;
          }
        }
        col += dc;
        rang += dr;
      }
      void victimeCouleur;
    }
  }

  return out;
}

export interface Clouage extends Alignement {
  /** true si la pièce arrière est le roi : le clouage est alors absolu. */
  absolu: boolean;
}

/**
 * Clouages subis par `couleur` : une pièce ne peut pas bouger sans exposer
 * une pièce plus précieuse placée derrière elle.
 */
export function clouages(jeu: Chess, couleur: Color): Clouage[] {
  return alignements(jeu, autreCouleur(couleur))
    .filter((a) => VALEURS[a.derriere.type] > VALEURS[a.devant.type])
    .map((a) => ({ ...a, absolu: a.derriere.type === 'k' }));
}

/**
 * Enfilades subies par `couleur` : la pièce la plus précieuse est devant, et
 * en la déplaçant on abandonne celle qui la suit.
 */
export function enfilades(jeu: Chess, couleur: Color): Alignement[] {
  return alignements(jeu, autreCouleur(couleur)).filter(
    (a) => VALEURS[a.devant.type] > VALEURS[a.derriere.type] && a.derriere.type !== 'k',
  );
}

/** Bilan matériel d'une position, du point de vue des blancs, en points. */
export function materiel(jeu: Chess): number {
  let total = 0;
  for (const rangee of jeu.board()) {
    for (const c of rangee) {
      if (!c || c.type === 'k') continue;
      total += c.color === 'w' ? VALEURS[c.type] : -VALEURS[c.type];
    }
  }
  return total;
}

/** Joue une suite de coups UCI, en s'arrêtant au premier coup illégal. */
export function jouerSuite(fen: string, uci: string[]): Chess {
  const jeu = new Chess(fen);
  for (const m of uci) {
    try {
      const coup = jeu.move({
        from: m.slice(0, 2) as Square,
        to: m.slice(2, 4) as Square,
        promotion: m.length > 4 ? (m[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!coup) break;
    } catch {
      break;
    }
  }
  return jeu;
}

/** Détail d'un coup UCI joué depuis une position. */
export interface CoupDetaille {
  san: string;
  depuis: Square;
  vers: Square;
  piece: PieceSymbol;
  capture: PieceSymbol | null;
  promotion: PieceSymbol | null;
  echec: boolean;
  mat: boolean;
  roque: boolean;
  /** Position après le coup. */
  apres: Chess;
}

export function detaillerCoup(fen: string, uci: string): CoupDetaille | null {
  try {
    const jeu = new Chess(fen);
    const coup = jeu.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    if (!coup) return null;
    return {
      san: coup.san,
      depuis: coup.from as Square,
      vers: coup.to as Square,
      piece: coup.piece,
      capture: (coup.captured as PieceSymbol) ?? null,
      promotion: (coup.promotion as PieceSymbol) ?? null,
      echec: jeu.isCheck(),
      mat: jeu.isCheckmate(),
      roque: coup.san === 'O-O' || coup.san === 'O-O-O',
      apres: jeu,
    };
  } catch {
    return null;
  }
}
