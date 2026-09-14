/**
 * Qualification du meilleur coup, pour le libellé affiché sous l'échiquier.
 *
 * Trois étiquettes seulement, parce qu'au-delà on ne retient plus rien :
 *  - « Coup forcé »   : il n'y a rien d'autre à jouer ;
 *  - « Coup brillant » : le coup donne du matériel et la position reste
 *                        gagnante — c'est ce qui mérite d'être remarqué ;
 *  - « Meilleur coup » : le cas ordinaire.
 */

import { Chess } from 'chess.js';
import { detaillerCoup, jouerSuite, materiel } from './motifs.ts';
import { evaluationEnCp, type Evaluation } from './uci.ts';

export type QualiteCoup = 'force' | 'brillant' | 'meilleur';

export const LIBELLE_QUALITE: Record<QualiteCoup, string> = {
  force: 'Coup forcé',
  brillant: 'Coup brillant',
  meilleur: 'Meilleur coup',
};

export interface EntreeQualite {
  fen: string;
  /** Meilleur coup, en UCI. */
  uci: string;
  /** Variante principale depuis `fen`, en UCI. */
  pv: string[];
  /** Évaluation du meilleur coup, du point de vue du camp au trait. */
  evaluation: Evaluation;
  /** Évaluation de la deuxième meilleure ligne, si elle est connue. */
  evaluationSeconde?: Evaluation;
}

/** Écart minimal, en centipions, au-delà duquel un coup est jugé obligatoire. */
export const ECART_COUP_FORCE = 150;

export function qualifierCoup(e: EntreeQualite): QualiteCoup {
  let jeu: Chess;
  try {
    jeu = new Chess(e.fen);
  } catch {
    return 'meilleur';
  }

  // --- Coup forcé ---
  if (jeu.moves().length <= 1) return 'force';
  if (e.evaluationSeconde) {
    const ecart = evaluationEnCp(e.evaluation) - evaluationEnCp(e.evaluationSeconde);
    if (ecart >= ECART_COUP_FORCE) return 'force';
  }

  // --- Coup brillant ---
  // On compare le matériel avant le coup et après la réponse adverse : si le
  // joueur a donné du bois et que la position reste nettement gagnante, c'est
  // un sacrifice qui fonctionne. Attendre la fin de la variante donnerait un
  // faux positif dès que le matériel est repris plus loin.
  const detail = detaillerCoup(e.fen, e.uci);
  if (detail) {
    const camp = jeu.turn();
    const signe = camp === 'w' ? 1 : -1;
    const avant = materiel(jeu) * signe;
    const apresReponse = materiel(jouerSuite(e.fen, e.pv.slice(0, 2))) * signe;
    const cp = evaluationEnCp(e.evaluation);

    const donneDuMateriel = apresReponse < avant;
    const restePositionGagnante = e.evaluation.type === 'mat' ? e.evaluation.valeur > 0 : cp >= 100;
    if (donneDuMateriel && restePositionGagnante) return 'brillant';
  }

  return 'meilleur';
}
