/**
 * Générateur d'explications en langage clair.
 *
 * Entièrement déterministe : il ne consomme que ce que Stockfish fournit
 * déjà — l'évaluation avant et après, le meilleur coup, la variante — plus
 * la géométrie de la position. Aucun appel réseau, aucun modèle de langage,
 * donc utilisable hors ligne et sans clé d'API.
 *
 * Règle de rédaction : la phrase principale ne contient JAMAIS de chiffre
 * d'évaluation. « Ce coup laisse votre cavalier en f6 en prise » apprend
 * quelque chose ; « ce coup vous coûte 0,77 » n'apprend rien. La valeur
 * numérique reste disponible à côté, pour qui la lit.
 *
 * Le même générateur sert au mode assisté, au rapport de fin de partie et à
 * l'exploration de variantes.
 */

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import {
  autreCouleur,
  avecArticle,
  avecPossessif,
  clouages,
  detaillerCoup,
  enfilades,
  fourchetteDepuis,
  jouerSuite,
  NOMS,
  piecesEnPrise,
  avecTraitInverse,
  VALEURS,
} from './motifs.ts';
import type { Evaluation } from './uci.ts';

export type MotifExplication =
  | 'mat-manque'
  | 'mat-subi'
  | 'piece-en-prise'
  | 'occasion-manquee'
  | 'menace-ignoree'
  | 'fourchette'
  | 'clouage'
  | 'enfilade'
  | 'coup-force'
  | 'passif'
  | 'sans-consequence';

export interface Explication {
  /** Phrase principale, en français simple, sans chiffre d'évaluation. */
  phrase: string;
  /** Seconde phrase facultative : ce qu'il fallait jouer. */
  complement?: string;
  /** Motif reconnu, exploitable pour les statistiques et les exercices. */
  motif: MotifExplication;
}

export interface ContexteExplication {
  /** FEN avant le coup joué. */
  fenAvant: string;
  /** Coup réellement joué, en UCI. */
  coupJoue: string;
  /** Meilleur coup selon le moteur, en UCI. */
  meilleurCoup: string | null;
  /** Variante principale du moteur depuis `fenAvant`, en UCI. */
  pvMeilleure: string[];
  /** Variante du moteur APRÈS le coup joué : c'est la réfutation. */
  pvApresCoupJoue?: string[];
  /** Évaluation avant le coup, du point de vue du joueur qui joue. */
  avant: Evaluation;
  /** Évaluation après le coup, du point de vue du même joueur. */
  apres: Evaluation;
  /** Nombre de coups légaux dont disposait le joueur. */
  nbCoupsLegaux?: number;
}

/** Convertit un coup UCI en notation algébrique. */
export function uciVersSan(fen: string, uci: string): string | null {
  return detaillerCoup(fen, uci)?.san ?? null;
}

/** Convertit une suite de coups UCI en SAN, en s'arrêtant au premier coup illégal. */
export function variantEnSan(fen: string, pv: string[], maxCoups = 5): string[] {
  const jeu = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, maxCoups)) {
    try {
      const coup = jeu.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!coup) break;
      out.push(coup.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Nom de la pièce présente sur une case, avant le coup. */
function pieceSur(fen: string, sq: Square): PieceSymbol | null {
  try {
    return new Chess(fen).get(sq)?.type ?? null;
  } catch {
    return null;
  }
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

/** Ce que le meilleur coup accomplissait, en une proposition. */
function apportDuMeilleurCoup(ctx: ContexteExplication): string | null {
  if (!ctx.meilleurCoup) return null;
  const d = detaillerCoup(ctx.fenAvant, ctx.meilleurCoup);
  if (!d) return null;

  if (d.mat) return `${d.san} matait immédiatement`;
  if (d.capture && VALEURS[d.capture] >= 3) {
    return `${d.san} prenait ${avecArticle(d.capture)} en ${d.vers}`;
  }

  const monCamp = new Chess(ctx.fenAvant).turn() as Color;
  const vue = avecTraitInverse(d.apres);
  if (vue) {
    const f = fourchetteDepuis(vue, d.vers, monCamp);
    if (f) {
      const noms = f.cibles.slice(0, 2).map((c) => avecArticle(c.type));
      return `${d.san} attaquait à la fois ${noms[0]} et ${noms[1]}`;
    }
  }

  if (d.roque) return `${d.san} mettait votre roi à l'abri`;
  if (d.capture) return `${d.san} prenait ${avecArticle(d.capture)} en ${d.vers}`;
  return null;
}

/**
 * Produit l'explication d'un coup.
 *
 * L'ordre des tests est délibéré : on annonce toujours le fait le plus grave
 * et le plus concret. Un mat manqué prime sur une pièce en prise, qui prime
 * sur un motif géométrique, qui prime sur « ce coup est passif ».
 */
export function expliquerCoup(ctx: ContexteExplication): Explication {
  const jeuAvant = new Chess(ctx.fenAvant);
  const monCamp = jeuAvant.turn() as Color;
  const adverse = autreCouleur(monCamp);

  const coup = detaillerCoup(ctx.fenAvant, ctx.coupJoue);
  const meilleurSan = ctx.meilleurCoup ? uciVersSan(ctx.fenAvant, ctx.meilleurCoup) : null;
  const apport = apportDuMeilleurCoup(ctx);
  const complementMeilleur = meilleurSan
    ? apport
      ? `${apport.charAt(0).toUpperCase()}${apport.slice(1)}.`
      : `Il fallait jouer ${meilleurSan}.`
    : undefined;

  // --- 1. Coup forcé : rien à reprocher, et il faut le dire ---
  if (ctx.nbCoupsLegaux === 1) {
    return {
      phrase: 'Ce coup était le seul possible.',
      motif: 'coup-force',
    };
  }

  // --- 2. Mat subi ---
  if (ctx.apres.type === 'mat' && ctx.apres.valeur < 0) {
    const n = Math.abs(ctx.apres.valeur);
    return {
      phrase:
        n === 0
          ? 'Ce coup laisse votre roi mat.'
          : `Ce coup permet à l'adversaire de mater en ${pluriel(n, 'coup')}.`,
      complement: complementMeilleur,
      motif: 'mat-subi',
    };
  }

  // --- 3. Mat manqué ---
  if (
    ctx.avant.type === 'mat' &&
    ctx.avant.valeur > 0 &&
    !(ctx.apres.type === 'mat' && ctx.apres.valeur > 0)
  ) {
    const n = ctx.avant.valeur;
    return {
      phrase: meilleurSan
        ? `Il y avait un mat en ${pluriel(n, 'coup')} avec ${meilleurSan}.`
        : `Il y avait un mat en ${pluriel(n, 'coup')}.`,
      motif: 'mat-manque',
    };
  }

  // --- 4. Pièce laissée en prise ---
  // On lit la position après le coup joué : c'est là que la pièce se trouve
  // exposée, et c'est ce que le joueur a sous les yeux.
  if (coup) {
    const enPrise = piecesEnPrise(coup.apres, monCamp);
    if (enPrise.length > 0) {
      const p = enPrise[0];
      const cestLaPieceDeplacee = p.case === coup.vers;
      return {
        phrase: cestLaPieceDeplacee
          ? `Ce coup laisse ${avecPossessif(p.type)} en ${p.case} en prise.`
          : `Ce coup laisse ${avecPossessif(p.type)} en ${p.case} sans défense.`,
        complement: complementMeilleur,
        motif: 'piece-en-prise',
      };
    }
  }

  // --- 5. Menace adverse ignorée ---
  // La menace existait AVANT le coup, et existe encore APRÈS : le coup ne
  // s'en occupe pas.
  if (coup) {
    const vueAvant = avecTraitInverse(jeuAvant);
    if (vueAvant) {
      const menaceesAvant = piecesEnPrise(vueAvant, monCamp);
      const encoreMenacees = piecesEnPrise(coup.apres, monCamp).map((p) => p.case);
      const ignoree = menaceesAvant.find(
        (p) => encoreMenacees.includes(p.case) || p.case === coup.depuis,
      );
      if (ignoree && encoreMenacees.includes(ignoree.case)) {
        const attaquant = coup.apres.attackers(ignoree.case, adverse)[0];
        const typeAttaquant = attaquant ? coup.apres.get(attaquant)?.type : null;
        return {
          phrase:
            typeAttaquant && attaquant
              ? `${avecPossessif(ignoree.type)} reste menacé${
                  ignoree.type === 'r' || ignoree.type === 'q' ? 'e' : ''
                } par ${avecArticle(typeAttaquant)} en ${attaquant}.`
              : `${avecPossessif(ignoree.type)} reste menacé${
                  ignoree.type === 'r' || ignoree.type === 'q' ? 'e' : ''
                }.`,
          complement: complementMeilleur,
          motif: 'menace-ignoree',
        };
      }
    }
  }

  // --- 6. Motifs géométriques subis après le coup ---
  if (coup) {
    // Fourchette adverse : la réponse du moteur attaque deux de nos pièces.
    const reponse = ctx.pvApresCoupJoue?.[0];
    if (reponse) {
      const apresReponse = jouerSuite(coup.apres.fen(), [reponse]);
      const detailReponse = detaillerCoup(coup.apres.fen(), reponse);
      if (detailReponse) {
        const vue = avecTraitInverse(apresReponse);
        if (vue) {
          const f = fourchetteDepuis(vue, detailReponse.vers, adverse);
          if (f) {
            const noms = f.cibles.slice(0, 2).map((c) => avecPossessif(c.type));
            return {
              phrase: `Ce coup permet ${detailReponse.san}, qui attaque à la fois ${noms[0]} et ${noms[1]}.`,
              complement: complementMeilleur,
              motif: 'fourchette',
            };
          }
        }
      }
    }

    const cloues = clouages(coup.apres, monCamp);
    if (cloues.length > 0) {
      const c = cloues[0];
      return {
        phrase: c.absolu
          ? `Ce coup cloue ${avecPossessif(c.devant.type)} en ${c.devant.case} : il ne peut plus bouger sans exposer votre roi.`
          : `${avecPossessif(c.devant.type)} en ${c.devant.case} est cloué${
              c.devant.type === 'r' || c.devant.type === 'q' ? 'e' : ''
            } devant ${avecPossessif(c.derriere.type)}.`,
        complement: complementMeilleur,
        motif: 'clouage',
      };
    }

    const enfilees = enfilades(coup.apres, monCamp);
    if (enfilees.length > 0) {
      const e = enfilees[0];
      return {
        phrase: `${avecPossessif(e.devant.type)} en ${e.devant.case} est en enfilade : en la déplaçant vous abandonnez ${avecPossessif(
          e.derriere.type,
        )} juste derrière.`,
        complement: complementMeilleur,
        motif: 'enfilade',
      };
    }
  }

  // --- 7. Occasion manquée : le meilleur coup gagnait du matériel ---
  if (ctx.meilleurCoup && ctx.meilleurCoup !== ctx.coupJoue) {
    const d = detaillerCoup(ctx.fenAvant, ctx.meilleurCoup);
    if (d?.capture && VALEURS[d.capture] >= 3) {
      const cible = pieceSur(ctx.fenAvant, d.vers);
      return {
        phrase: `Vous pouviez prendre ${avecArticle(cible ?? d.capture)} en ${d.vers}.`,
        complement: `${d.san} était le coup à jouer.`,
        motif: 'occasion-manquee',
      };
    }
  }

  // --- 8. Coup jouable mais mou ---
  if (meilleurSan && ctx.meilleurCoup !== ctx.coupJoue) {
    return {
      phrase: apport
        ? `Ce coup est jouable, mais ${apport}.`
        : `Ce coup est jouable mais passif ; ${meilleurSan} est plus actif.`,
      motif: 'passif',
    };
  }

  return {
    phrase: "Ce coup ne change pas l'appréciation de la position.",
    motif: 'sans-consequence',
  };
}

/** Libellé court du motif, pour les filtres et les exercices. */
export const LIBELLE_MOTIF: Record<MotifExplication, string> = {
  'mat-manque': 'Mat manqué',
  'mat-subi': 'Mat concédé',
  'piece-en-prise': 'Pièce en prise',
  'occasion-manquee': 'Occasion manquée',
  'menace-ignoree': 'Menace ignorée',
  fourchette: 'Fourchette',
  clouage: 'Clouage',
  enfilade: 'Enfilade',
  'coup-force': 'Coup forcé',
  passif: 'Coup passif',
  'sans-consequence': 'Sans conséquence',
};

export { NOMS, avecArticle, avecPossessif };
