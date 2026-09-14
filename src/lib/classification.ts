/**
 * Classification des coups et calcul de précision.
 *
 * Le classement ne se fonde pas uniquement sur la perte en centipions :
 * perdre 100 cp dans une position égale change la partie, perdre 100 cp
 * quand on a déjà +900 ne change rien. On combine donc la perte brute
 * et la perte en probabilité de gain, et on retient la plus indulgente
 * des deux — c'est ce qui correspond au ressenti du joueur.
 */

import { CP_MAT, evaluationEnCp, probabiliteDeGain, type Evaluation } from './uci.ts';

export type Classement =
  | 'theorie'
  | 'unique'
  | 'excellent'
  | 'bon'
  | 'imprecision'
  | 'erreur'
  | 'gaffe';

/**
 * Seuils de classification, modifiables depuis les réglages.
 * `cp` = perte en centipions ; `pdg` = perte en points de probabilité de gain
 * (0–100). Un coup tombe dans une catégorie si les DEUX critères sont atteints.
 */
export interface SeuilsClassification {
  imprecision: { cp: number; pdg: number };
  erreur: { cp: number; pdg: number };
  gaffe: { cp: number; pdg: number };
  /** En dessous de cette perte, le coup est « excellent ». */
  excellent: { cp: number; pdg: number };
  /**
   * Écart minimal entre le meilleur coup et le deuxième pour qu'une position
   * soit considérée comme n'offrant qu'un seul coup jouable.
   */
  ecartCoupUnique: number;
}

export const SEUILS_PAR_DEFAUT: SeuilsClassification = {
  excellent: { cp: 20, pdg: 2 },
  imprecision: { cp: 50, pdg: 5 },
  erreur: { cp: 150, pdg: 10 },
  gaffe: { cp: 300, pdg: 20 },
  ecartCoupUnique: 150,
};

export interface EntreeClassification {
  /** Évaluation de la position avant le coup, du point de vue du joueur au trait. */
  avant: Evaluation;
  /** Évaluation après le coup, ramenée au point de vue du même joueur. */
  apres: Evaluation;
  /** Le coup joué était-il le meilleur coup du moteur ? */
  estMeilleurCoup: boolean;
  /** Nombre de coups légaux dans la position. */
  nbCoupsLegaux: number;
  /** Écart en cp entre le meilleur coup et le deuxième (MultiPV), si connu. */
  ecartDeuxiemeCoup?: number;
  /** Le coup fait-il partie d'une ouverture connue ? */
  dansLaTheorie?: boolean;
  seuils?: SeuilsClassification;
}

export interface ResultatClassification {
  classement: Classement;
  /** Perte en centipions (>= 0). */
  perteCp: number;
  /** Perte en points de probabilité de gain (0–100). */
  pertePdg: number;
}

/** Libellé français affichable pour chaque classement. */
export const LIBELLES: Record<Classement, string> = {
  theorie: 'Coup de théorie',
  unique: 'Coup unique',
  excellent: 'Excellent',
  bon: 'Bon',
  imprecision: 'Imprécision',
  erreur: 'Erreur',
  gaffe: 'Gaffe',
};

/** Symbole d'annotation PGN standard associé à chaque classement. */
export const SYMBOLES: Record<Classement, string> = {
  theorie: '',
  unique: '!',
  excellent: '',
  bon: '',
  imprecision: '?!',
  erreur: '?',
  gaffe: '??',
};

/** Couleur (classe Tailwind) associée à chaque classement. */
export const COULEURS: Record<Classement, string> = {
  theorie: 'text-sky-400',
  unique: 'text-violet-400',
  excellent: 'text-emerald-400',
  bon: 'text-emerald-300',
  imprecision: 'text-amber-400',
  erreur: 'text-orange-400',
  gaffe: 'text-red-500',
};

/**
 * Classe un coup. `avant` et `apres` doivent être exprimés du point de vue
 * du joueur qui vient de jouer, sinon la perte est inversée.
 */
export function classerCoup(e: EntreeClassification): ResultatClassification {
  const seuils = e.seuils ?? SEUILS_PAR_DEFAUT;

  const cpAvant = evaluationEnCp(e.avant);
  const cpApres = evaluationEnCp(e.apres);

  // La perte ne peut pas être négative : si le moteur trouve mieux après coup
  // (fluctuation de profondeur), on considère que le coup n'a rien coûté.
  const perteCp = Math.max(0, cpAvant - cpApres);
  const pertePdg = Math.max(0, probabiliteDeGain(cpAvant) - probabiliteDeGain(cpApres));

  // Un coup forcé reste un coup forcé, même s'il perd la partie.
  const forceParLesRegles = e.nbCoupsLegaux <= 1;
  const seulCoupJouable =
    e.estMeilleurCoup &&
    e.ecartDeuxiemeCoup !== undefined &&
    e.ecartDeuxiemeCoup >= seuils.ecartCoupUnique;

  if (forceParLesRegles || seulCoupJouable) {
    return { classement: 'unique', perteCp, pertePdg };
  }

  // La théorie n'est annoncée que si le coup ne perd rien de significatif :
  // une ligne connue mal jouée reste une erreur.
  if (e.dansLaTheorie && perteCp < seuils.erreur.cp) {
    return { classement: 'theorie', perteCp, pertePdg };
  }

  const atteint = (s: { cp: number; pdg: number }) => perteCp >= s.cp && pertePdg >= s.pdg;

  if (atteint(seuils.gaffe)) return { classement: 'gaffe', perteCp, pertePdg };
  if (atteint(seuils.erreur)) return { classement: 'erreur', perteCp, pertePdg };
  if (atteint(seuils.imprecision)) return { classement: 'imprecision', perteCp, pertePdg };
  if (e.estMeilleurCoup || !atteint(seuils.excellent)) {
    return { classement: 'excellent', perteCp, pertePdg };
  }
  return { classement: 'bon', perteCp, pertePdg };
}

/**
 * Précision d'un joueur sur une partie, en pourcentage.
 *
 * Formule dérivée de celle de Lichess : chaque coup reçoit une note à partir
 * de la chute de probabilité de gain, puis on fait la moyenne. Une moyenne
 * simple est volontairement préférée à la moyenne pondérée par volatilité :
 * elle est plus lisible et ne fait pas dépendre la note de coups adverses.
 */
export function precisionCoup(pdgAvant: number, pdgApres: number): number {
  const chute = Math.max(0, pdgAvant - pdgApres);
  const brut = 103.1668 * Math.exp(-0.04354 * chute) - 3.1669;
  return Math.max(0, Math.min(100, brut));
}

/**
 * Moyenne des précisions par coup. Renvoie `null` si le joueur n'a joué
 * aucun coup — afficher « 0 % » serait trompeur.
 */
export function precisionPartie(precisions: number[]): number | null {
  if (precisions.length === 0) return null;
  const somme = precisions.reduce((a, b) => a + b, 0);
  return Math.round((somme / precisions.length) * 10) / 10;
}

/** Convertit une évaluation en probabilité de gain pour les blancs (0–100). */
export function pdgBlancs(ev: Evaluation): number {
  return probabiliteDeGain(evaluationEnCp(ev));
}

/**
 * Repère les moments charnières : les coups qui ont le plus fait bouger
 * l'évaluation. On ignore les positions déjà décidées (au-delà de ±1500 cp)
 * où une variation n'apprend plus rien.
 */
export function momentsCharnieres<T extends { cpAvantBlancs: number; cpApresBlancs: number }>(
  coups: T[],
  combien = 3,
): T[] {
  return coups
    .filter((c) => Math.abs(c.cpAvantBlancs) < 1500 && Math.abs(c.cpAvantBlancs) < CP_MAT)
    .map((c) => ({ c, delta: Math.abs(c.cpApresBlancs - c.cpAvantBlancs) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, combien)
    .map((x) => x.c);
}
