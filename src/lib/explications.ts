/**
 * Explications en français des coups manqués.
 *
 * L'objectif n'est pas de commenter comme un entraîneur humain, mais de
 * répondre à la seule question utile : « qu'est-ce que le meilleur coup
 * faisait que le mien ne faisait pas ? ». On combine donc trois sources :
 * la différence d'évaluation, le matériel réellement gagné ou perdu dans la
 * variante, et des motifs tactiques reconnaissables (fourchette, pièce en
 * prise, mat forcé). Aucune explication n'est inventée : si rien n'est
 * détecté, on reste factuel sur l'évaluation.
 */

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { evaluationEnCp, type Evaluation } from './uci.ts';
import type { Classement } from './classification.ts';

const VALEURS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const NOMS_PIECES: Record<PieceSymbol, string> = {
  p: 'pion',
  n: 'cavalier',
  b: 'fou',
  r: 'tour',
  q: 'dame',
  k: 'roi',
};

/** Convertit un coup UCI en notation algébrique française lisible (SAN anglais conservé). */
export function uciVersSan(fen: string, uci: string): string | null {
  try {
    const jeu = new Chess(fen);
    const coup = jeu.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    return coup ? coup.san : null;
  } catch {
    return null;
  }
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

/** Bilan matériel d'une position, du point de vue des blancs, en points. */
function materiel(jeu: Chess): number {
  let total = 0;
  for (const rangee of jeu.board()) {
    for (const c of rangee) {
      if (!c) continue;
      total += c.color === 'w' ? VALEURS[c.type] : -VALEURS[c.type];
    }
  }
  return total;
}

/** Une pièce est-elle en prise (attaquée et insuffisamment défendue) ? */
function estEnPrise(jeu: Chess, sq: Square, couleur: Color): boolean {
  const adverse: Color = couleur === 'w' ? 'b' : 'w';
  if (!jeu.isAttacked(sq, adverse)) return false;
  const piece = jeu.get(sq);
  if (!piece) return false;
  const defenseurs = jeu.attackers(sq, couleur).length;
  if (defenseurs === 0) return true;
  // Défendue, mais attaquée par moins cher : l'échange reste perdant.
  const attaquants = jeu.attackers(sq, adverse);
  const moinsCher = Math.min(
    ...attaquants.map((a) => VALEURS[jeu.get(a)?.type ?? 'p']),
  );
  return moinsCher < VALEURS[piece.type];
}

/** Cherche les pièces adverses de valeur attaquées par la pièce qui vient de jouer. */
function ciblesDeLaPiece(jeu: Chez, depuis: Square, couleur: Color): PieceSymbol[] {
  const adverse: Color = couleur === 'w' ? 'b' : 'w';
  const coups = jeu.moves({ square: depuis, verbose: true });
  const cibles: PieceSymbol[] = [];
  for (const c of coups) {
    const cible = jeu.get(c.to as Square);
    if (cible && cible.color === adverse && VALEURS[cible.type] >= 3) {
      cibles.push(cible.type);
    }
  }
  return cibles;
}

// Alias de type interne : chess.js n'exporte pas le type de l'instance.
type Chez = InstanceType<typeof Chess>;

export interface ContexteExplication {
  /** FEN avant le coup joué. */
  fenAvant: string;
  /** Coup réellement joué (UCI). */
  coupJoue: string;
  /** Meilleur coup selon le moteur (UCI). */
  meilleurCoup: string | null;
  /** Variante principale du moteur depuis `fenAvant` (UCI). */
  pvMeilleure: string[];
  /** Évaluation avant, du point de vue du joueur au trait. */
  avant: Evaluation;
  /** Évaluation après le coup joué, du point de vue du même joueur. */
  apres: Evaluation;
  classement: Classement;
}

/**
 * Produit une explication d'une à deux phrases.
 * Elle décrit d'abord ce que le meilleur coup accomplissait, puis, si le coup
 * joué a une faiblesse identifiable, ce qu'il concède.
 */
export function expliquerCoup(ctx: ContexteExplication): string {
  const morceaux: string[] = [];

  // 1. Un mat forcé manqué prime sur tout le reste.
  if (ctx.avant.type === 'mat' && ctx.avant.valeur > 0 && ctx.apres.type !== 'mat') {
    morceaux.push(
      `Il y avait un mat forcé en ${ctx.avant.valeur} coup${ctx.avant.valeur > 1 ? 's' : ''}.`,
    );
  } else if (ctx.apres.type === 'mat' && ctx.apres.valeur < 0) {
    morceaux.push(
      `Ce coup permet à l'adversaire de mater en ${Math.abs(ctx.apres.valeur)} coup${
        Math.abs(ctx.apres.valeur) > 1 ? 's' : ''
      }.`,
    );
  }

  // 2. Ce que rapportait la variante du moteur, en matériel.
  const gainMeilleur = gainMateriel(ctx.fenAvant, ctx.pvMeilleure);
  const gainJoue = gainMateriel(ctx.fenAvant, [ctx.coupJoue]);

  if (morceaux.length === 0 && ctx.meilleurCoup) {
    const san = uciVersSan(ctx.fenAvant, ctx.meilleurCoup);
    const motif = detecterMotif(ctx.fenAvant, ctx.meilleurCoup);

    if (gainMeilleur >= 1 && gainMeilleur > gainJoue) {
      const nom = nommerGain(gainMeilleur);
      morceaux.push(`${san} gagnait ${nom}.`);
    } else if (motif) {
      morceaux.push(`${san} ${motif}.`);
    }
  }

  // 3. Ce que le coup joué concède.
  const faiblesse = detecterFaiblesse(ctx.fenAvant, ctx.coupJoue);
  if (faiblesse) morceaux.push(faiblesse);

  // 4. Repli factuel : toujours dire quelque chose d'exact.
  if (morceaux.length === 0) {
    const perte = Math.round(
      (evaluationEnCp(ctx.avant) - evaluationEnCp(ctx.apres)) / 10,
    ) / 10;
    if (perte >= 0.2) {
      morceaux.push(
        `Ce coup cède ${perte.toFixed(2).replace('.', ',')} pion${perte >= 2 ? 's' : ''} d'évaluation sans compensation visible.`,
      );
    } else {
      morceaux.push("Ce coup ne change pas l'appréciation de la position.");
    }
  }

  return morceaux.join(' ');
}

function nommerGain(points: number): string {
  if (points >= 8) return 'une dame';
  if (points >= 4.5) return 'une tour';
  if (points >= 2.5) return 'une pièce';
  if (points >= 1.5) return 'la qualité';
  return 'un pion';
}

/** Matériel gagné (en points, du point de vue du joueur au trait) au fil d'une variante. */
function gainMateriel(fen: string, pv: string[]): number {
  try {
    const jeu = new Chess(fen);
    const camp = jeu.turn();
    const avant = materiel(jeu);
    for (const uci of pv.slice(0, 6)) {
      const coup = jeu.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!coup) break;
    }
    const apres = materiel(jeu);
    return camp === 'w' ? apres - avant : avant - apres;
  } catch {
    return 0;
  }
}

/** Motifs tactiques reconnaissables produits par un coup. */
function detecterMotif(fen: string, uci: string): string | null {
  try {
    const jeu = new Chess(fen);
    const camp = jeu.turn();
    const coup = jeu.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    if (!coup) return null;

    if (jeu.isCheckmate()) return 'matait immédiatement';

    // Fourchette : la pièce qui vient de jouer attaque deux pièces de valeur.
    // On repasse le trait au joueur pour lire les attaques de sa pièce.
    const fenApres = jeu.fen();
    const fenTraitInverse = fenApres.replace(
      / [wb] /,
      camp === 'w' ? ' w ' : ' b ',
    );
    try {
      const vue = new Chess(fenTraitInverse);
      const cibles = ciblesDeLaPiece(vue, coup.to as Square, camp);
      if (cibles.length >= 2) {
        return `créait une double attaque sur ${cibles
          .slice(0, 2)
          .map((t) => `le ${NOMS_PIECES[t]}`)
          .join(' et ')}`;
      }
    } catch {
      // Position intermédiaire illégale (roi en prise) : on passe.
    }

    if (coup.san.includes('=')) return 'promouvait le pion';
    if (jeu.isCheck()) return "donnait échec et prenait l'initiative";
    if (coup.captured) return `prenait ${articleDe(coup.captured)}`;
    if (coup.san === 'O-O' || coup.san === 'O-O-O') return 'mettait le roi à l’abri';

    // Activation : la pièce gagne nettement en mobilité.
    const mobiliteAvant = new Chess(fen).moves({
      square: coup.from as Square,
      verbose: true,
    }).length;
    const mobiliteApres = (() => {
      try {
        const vue = new Chess(fenApres.replace(/ [wb] /, camp === 'w' ? ' w ' : ' b '));
        return vue.moves({ square: coup.to as Square, verbose: true }).length;
      } catch {
        return 0;
      }
    })();
    if (mobiliteApres >= mobiliteAvant + 4) {
      return `activait ${articleDe(coup.piece)} sur une case bien plus active`;
    }

    return null;
  } catch {
    return null;
  }
}

function articleDe(p: PieceSymbol): string {
  const nom = NOMS_PIECES[p];
  return nom === 'tour' || nom === 'dame' ? `la ${nom}` : `le ${nom}`;
}

/** Ce que le coup joué laisse à l'adversaire. */
function detecterFaiblesse(fen: string, uci: string): string | null {
  try {
    const jeu = new Chess(fen);
    const camp = jeu.turn();
    const coup = jeu.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    if (!coup) return null;

    if (jeu.isCheckmate()) return null;

    // La pièce déplacée est-elle désormais en prise ?
    if (estEnPrise(jeu, coup.to as Square, camp)) {
      return `Elle laisse ${articleDe(coup.piece)} en ${coup.to} insuffisamment défendu${
        coup.piece === 'r' || coup.piece === 'q' ? 'e' : ''
      }.`;
    }

    // Une autre pièce se retrouve-t-elle en prise après ce coup ?
    for (const rangee of jeu.board()) {
      for (const c of rangee) {
        if (!c || c.color !== camp || c.type === 'k' || c.type === 'p') continue;
        if (c.square === coup.to) continue;
        if (estEnPrise(jeu, c.square as Square, camp) && VALEURS[c.type] >= 3) {
          return `Elle laisse ${articleDe(c.type)} en ${c.square} sans défense suffisante.`;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
