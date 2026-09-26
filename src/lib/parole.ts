/**
 * Traduction de l'analyse en langage parlé.
 *
 * Les professeurs récitaient ce que le moteur leur donnait : « Cg6 », « Ng6 »,
 * dans des phrases longues. À l'oral, la notation algébrique est illisible —
 * une synthèse vocale prononce « Cg6 » de travers, et un débutant ne la
 * comprend pas davantage. Ce module ne produit donc que du français : des
 * pièces, des actions, jamais de coordonnées.
 *
 * Deux règles tiennent tout le reste :
 *
 *   - **aucune notation à l'oral.** Le coup joué reste visible en notation
 *     dans la carte de verdict, qui est un affichage, pas une parole ;
 *   - **court.** Deux phrases brèves valent mieux qu'un paragraphe exact. Ce
 *     qu'un élève retient d'un commentaire parlé, c'est une idée, pas une
 *     démonstration.
 */

import { Chess, type PieceSymbol } from 'chess.js';
import { avecArticle, avecPossessif, NOMS } from './motifs.ts';
import type { Classement } from './classification.ts';
import type { MotifExplication } from './explications.ts';
import type { NiveauEleve } from './professeurs.ts';

/** Ce qu'un coup fait, en termes dicibles. */
export interface CoupDecrit {
  /** « votre cavalier », « votre dame »… */
  sujet: string;
  /** « le cavalier », pour parler du coup qu'il fallait jouer. */
  article: string;
  /** Pièce prise, s'il y en a une : « le fou ». */
  capture: string | null;
  roque: boolean;
  promotion: boolean;
  echec: boolean;
  /** Le coup avance-t-il une pièce vers le camp adverse ? */
  type: PieceSymbol;
}

/**
 * Décrit un coup à partir de la position d'où il est joué.
 *
 * On repart de la position plutôt que d'analyser la notation : le symbole
 * d'une pièce y est ambigu — « b » désigne un fou en notation anglaise et une
 * colonne en français — et les coups de pion n'en portent aucun.
 */
export function decrireCoup(fenAvant: string, san: string): CoupDecrit | null {
  try {
    const jeu = new Chess(fenAvant);
    const coup = jeu.move(san);
    if (!coup) return null;
    return {
      sujet: avecPossessif(coup.piece),
      article: avecArticle(coup.piece),
      capture: coup.captured ? avecArticle(coup.captured) : null,
      roque: coup.san.startsWith('O-O'),
      promotion: Boolean(coup.promotion),
      echec: coup.san.includes('+') || coup.san.includes('#'),
      type: coup.piece,
    };
  } catch {
    return null;
  }
}

/** Décrit le coup qu'il aurait fallu jouer, sans le nommer en notation. */
export function decrireMeilleur(fenAvant: string, san: string | null): CoupDecrit | null {
  return san ? decrireCoup(fenAvant, san) : null;
}

/**
 * Ce que le joueur vient de faire, en une proposition courte.
 *
 * « vous sortez votre cavalier », « vous prenez le fou », « vous roquez ».
 */
export function actionDe(c: CoupDecrit): string {
  if (c.roque) return 'vous roquez';
  if (c.promotion) return 'vous promouvez votre pion';
  if (c.capture) return `vous prenez ${c.capture}`;
  if (c.type === 'k') return 'vous bougez votre roi';
  if (c.type === 'p') return 'vous poussez un pion';
  return `vous déplacez ${c.sujet}`;
}

/** Ce qu'il fallait faire, en une proposition courte. */
export function alternativeDe(c: CoupDecrit): string {
  if (c.roque) return 'le roque';
  if (c.capture) return `la prise ${c.capture === 'la dame' ? 'de la dame' : `du ${c.capture.slice(3)}`}`;
  return c.article;
}

/**
 * Nom parlé d'une pièce, sans possessif ni article.
 *
 * Sert aux tournures où l'article gênerait : « le fou aurait été plus utile ».
 */
export function nomDe(t: PieceSymbol): string {
  return NOMS[t];
}

/** Y a-t-il une case à citer ? Non — on n'en cite jamais à l'oral. */
export function sansCoordonnees(texte: string): string {
  // Filet de sécurité : si une notation se glisse malgré tout dans une
  // phrase, on la retire plutôt que de la faire prononcer. Une lettre suivie
  // d'un chiffre — « e4 », « Cg6 », « Txd5 » — n'a aucun sens à l'oreille.
  return texte
    .replace(/\b[KQRBNCFTD]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTFC])?[+#]?\b/g, '')
    .replace(/\bO-O(?:-O)?[+#]?\b/g, 'le roque')
    .replace(/\s{2,}/g, ' ')
    // Seules la virgule et le point se collent au mot : en français, le
    // point-virgule, les deux-points et les signes doubles prennent une
    // espace devant. La retirer donnait « en prise; le roi ».
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s*([;:!?])/g, ' $1')
    .replace(/(^|[.!?…]\s*)([a-zà-ÿ])/g, (_, avant, lettre) => avant + lettre.toUpperCase())
    .trim();
}

/** Longueur au-delà de laquelle une réplique parlée devient un exposé. */
export const LONGUEUR_CONFORTABLE = 140;

/**
 * Contenu d'une réplique, en langage humain.
 *
 * Une seule phrase, la plus utile : ce que le coup fait, ou ce qu'il aurait
 * fallu faire. Le reste — variantes, complément technique — appartient au
 * rapport, qui se lit.
 */
export interface ContenuParle {
  classement: Classement;
  motif: MotifExplication | undefined;
  coup: CoupDecrit | null;
  meilleur: CoupDecrit | null;
  eleve: NiveauEleve;
}

const SIMPLE: NiveauEleve[] = ['decouverte', 'debutant'];

/**
 * La phrase de fond, adaptée au palier.
 *
 * Pour un débutant, on nomme les pièces et on dit l'idée. Pour un joueur
 * avancé, on peut nommer le motif — « clouage », « fourchette » — parce que
 * le mot lui parle et abrège la phrase.
 */
export function phraseDeFond(c: ContenuParle): string {
  const simple = SIMPLE.includes(c.eleve);
  const sujet = c.coup?.sujet ?? 'cette pièce';
  /**
   * Le coup qu'il fallait jouer, nommé.
   *
   * Le roque se nomme « le roque » et non « le roi » : c'est la pièce qui
   * bouge, mais ce n'est pas ce qu'on dit.
   */
  const alternative = (() => {
    if (!c.meilleur || !c.coup) return null;
    if (c.meilleur.roque) return 'le roque';
    if (c.meilleur.type === c.coup.type) return null;
    const nom = nomDe(c.meilleur.type);
    return `${c.meilleur.type === 'q' || c.meilleur.type === 'r' ? 'la' : 'le'} ${nom}`;
  })();

  switch (c.motif) {
    case 'piece-en-prise':
      return alternative
        ? `${sujet} est en prise ; ${alternative} était plus utile.`
        : `${sujet} est en prise.`;
    case 'menace-ignoree':
      return simple
        ? 'Votre adversaire menaçait quelque chose, et vous ne l’avez pas vu.'
        : 'Vous laissez passer une menace.';
    case 'fourchette':
      return simple
        ? 'Son cavalier attaque deux de vos pièces à la fois.'
        : 'Vous vous exposez à une fourchette.';
    case 'clouage':
      return simple ? 'Cette pièce ne peut plus bouger sans découvrir votre roi.' : 'Vous vous clouez.';
    case 'enfilade':
      return simple
        ? 'Deux de vos pièces sont alignées, il va les enfiler.'
        : 'Vous vous exposez à une enfilade.';
    case 'mat-manque':
      return 'Il y avait un mat, juste là.';
    case 'mat-subi':
      return 'Votre roi n’a plus d’air.';
    case 'occasion-manquee':
      return alternative ? `${alternative} gagnait tout de suite.` : 'Vous aviez beaucoup mieux.';
    case 'coup-force':
      return 'Vous n’aviez pas le choix.';
    case 'passif':
      return alternative ? `${alternative} aurait été plus actif.` : 'Ce coup est trop timide.';
    default:
      break;
  }

  // Sans motif reconnu, on s'en tient au classement.
  if (c.classement === 'gaffe' || c.classement === 'erreur') {
    return alternative ? `${alternative} valait mieux.` : 'Ce coup coûte cher.';
  }
  if (c.classement === 'imprecision') {
    return alternative ? `${alternative} était plus précis.` : 'Un peu imprécis.';
  }
  if (c.classement === 'theorie') return 'C’est la ligne connue.';
  if (c.classement === 'unique') return 'Rien d’autre ne tenait.';
  // Sur un bon coup sans motif, la réaction du professeur suffit : y ajouter
  // « et c'est juste » redit ce qui vient d'être dit.
  if (c.coup && (c.classement === 'bon' || c.classement === 'excellent')) {
    return `${actionDe(c.coup)}.`.replace(/^v/, 'V');
  }
  return '';
}
