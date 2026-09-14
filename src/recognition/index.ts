/**
 * Registre des moteurs de reconnaissance et utilitaires de post-traitement.
 */

import { plateauVersPlacement, validateFenLegality } from '../lib/fen.ts';
import { ReconnaissanceLocale } from './local.ts';
import { ReconnaissanceParLlm } from './llm.ts';
import type { CaseReconnue, PositionRecognizer, ResultatReconnaissance } from './types.ts';

export * from './types.ts';
export { preparerImage, imageDuDepot, imageDuPressePapiers } from './image.ts';

const MOTEURS: PositionRecognizer[] = [new ReconnaissanceParLlm(), new ReconnaissanceLocale()];

export function moteursReconnaissance(): PositionRecognizer[] {
  return MOTEURS;
}

export function moteurReconnaissance(id: string): PositionRecognizer {
  return MOTEURS.find((m) => m.id === id) ?? MOTEURS[0];
}

/** Retourne un plateau de 180°, pour changer l'orientation de lecture. */
export function retournerPlateau<T>(plateau: T[][]): T[][] {
  return plateau.map((r) => [...r]).reverse().map((r) => r.reverse());
}

/**
 * Construit un FEN à partir d'un plateau et des métadonnées de position.
 * Le FEN passe toujours par la validation : c'est le seul chemin autorisé
 * entre la reconnaissance et l'échiquier.
 */
export function fenDepuisPlateau(
  plateau: CaseReconnue[][],
  meta: {
    trait: 'w' | 'b';
    roques: string;
    priseEnPassant: string;
    demiCoups?: number;
    numeroCoup?: number;
  },
) {
  const placement = plateauVersPlacement(plateau);
  const fen = `${placement} ${meta.trait} ${meta.roques || '-'} ${meta.priseEnPassant || '-'} ${
    meta.demiCoups ?? 0
  } ${meta.numeroCoup ?? 1}`;
  return validateFenLegality(fen);
}

/**
 * Choisit l'orientation la plus plausible.
 *
 * Une reconnaissance ne sait presque jamais dire de quel côté l'échiquier est
 * photographié. On tranche sur des indices objectifs : des pions sur la 1re ou
 * la 8e rangée sont impossibles, et des rois sur leur case d'origine sont un
 * signal fort. En cas d'égalité, on garde l'orientation proposée.
 */
export function orientationLaPlusPlausible(
  resultat: ResultatReconnaissance,
): ResultatReconnaissance {
  const scorer = (plateau: CaseReconnue[][]): number => {
    let score = 0;
    // Pions impossibles sur les rangées extrêmes.
    for (const c of plateau[0]) if (c === 'p' || c === 'P') score -= 8;
    for (const c of plateau[7]) if (c === 'p' || c === 'P') score -= 8;
    // Rois et tours sur leurs cases initiales : les blancs en bas.
    if (plateau[7][4] === 'K') score += 4;
    if (plateau[0][4] === 'k') score += 4;
    if (plateau[7][0] === 'R' || plateau[7][7] === 'R') score += 1;
    if (plateau[0][0] === 'r' || plateau[0][7] === 'r') score += 1;
    // Les pièces blanches occupent plutôt le bas de l'image.
    for (let r = 0; r < 8; r++) {
      for (const c of plateau[r]) {
        if (!c) continue;
        const estBlanche = c === c.toUpperCase();
        score += estBlanche ? (r >= 4 ? 0.25 : -0.25) : r <= 3 ? 0.25 : -0.25;
      }
    }
    return score;
  };

  const direct = scorer(resultat.plateau);
  const retourne = scorer(retournerPlateau(resultat.plateau));

  if (retourne > direct) {
    return {
      ...resultat,
      plateau: retournerPlateau(resultat.plateau),
      confiances: retournerPlateau(resultat.confiances),
      orientation: resultat.orientation === 'blancs-en-bas' ? 'noirs-en-bas' : 'blancs-en-bas',
      remarques: [
        ...resultat.remarques,
        "L'échiquier a été retourné automatiquement : la position semble vue depuis les noirs.",
      ],
    };
  }
  return resultat;
}

/**
 * Devine les droits de roque à partir de la position des rois et des tours.
 * Volontairement optimiste : l'écran de correction permet de retirer ce qui
 * ne convient pas, alors qu'un droit oublié est plus difficile à remarquer.
 */
export function roquesPlausibles(plateau: CaseReconnue[][]): string {
  let r = '';
  if (plateau[7][4] === 'K') {
    if (plateau[7][7] === 'R') r += 'K';
    if (plateau[7][0] === 'R') r += 'Q';
  }
  if (plateau[0][4] === 'k') {
    if (plateau[0][7] === 'r') r += 'k';
    if (plateau[0][0] === 'r') r += 'q';
  }
  return r || '-';
}
