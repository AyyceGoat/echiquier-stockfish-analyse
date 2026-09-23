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

/**
 * Met en forme la perte d'un coup, ou renvoie `null` si l'afficher
 * n'apprendrait rien.
 *
 * Dès qu'un mat entre dans le calcul, la perte atteint des milliers de
 * centipions et « −100,12 pion » ne veut plus rien dire pour un joueur.
 * Dans ce cas, c'est l'explication en français qui porte l'information.
 */
export function formaterPerte(
  perteCp: number,
  avant: Evaluation,
  apres: Evaluation,
): string | null {
  if (avant.type === 'mat' || apres.type === 'mat') return null;
  if (perteCp < 20) return null;
  return `−${(perteCp / 100).toFixed(2).replace('.', ',')}`;
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
/**
 * Couleur de chaque classement, en VALEUR CSS et non en classe Tailwind.
 *
 * Les classes figées (`text-emerald-400`) ne suivaient pas le thème : sur
 * l'ivoire du thème clair, cet émeraude tombe à 1,9:1, très en dessous du
 * minimum lisible. Les variables, elles, sont redéfinies par thème.
 * À utiliser en `style={{ color: COULEURS[c] }}`.
 */
export const COULEURS: Record<Classement, string> = {
  theorie: 'var(--color-info)',
  unique: 'var(--color-rare)',
  excellent: 'var(--color-succes)',
  bon: 'var(--color-succes-doux)',
  imprecision: 'var(--color-alerte)',
  erreur: 'var(--color-orange)',
  gaffe: 'var(--color-danger)',
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

/** Écart-type d'une série. Sert à pondérer les coups par la volatilité. */
function ecartType(v: number[]): number {
  if (v.length === 0) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

/**
 * Précision d'une partie, pour un camp.
 *
 * La moyenne arithmétique — ce qui était fait ici — est beaucoup trop
 * indulgente, et c'est un défaut mesurable, pas une question de goût. Dans
 * une partie ordinaire, l'immense majorité des coups sont forcés ou évidents
 * et valent 100 % ; deux gaffes noyées dans soixante coups à 100 % laissent
 * la moyenne au-dessus de 95 %. D'où des parties jouées sans attention
 * notées 96 %.
 *
 * On reprend donc la méthode de Lichess, qui combine deux moyennes :
 *
 *  - une moyenne PONDÉRÉE PAR LA VOLATILITÉ : chaque coup est pesé par
 *    l'écart-type des probabilités de gain dans une fenêtre glissante
 *    autour de lui. Un coup joué dans une position calme, où rien ne peut
 *    mal tourner, compte moins qu'un coup joué dans une position tendue ;
 *  - une moyenne HARMONIQUE, qui est dominée par les petites valeurs. C'est
 *    elle qui fait qu'une gaffe coûte vraiment, au lieu d'être diluée.
 *
 * Le résultat est la moyenne des deux. C'est la combinaison qui distingue
 * une partie soignée d'une partie jouée à la légère, là où la moyenne
 * arithmétique les mettait toutes deux au-dessus de 90 %.
 *
 * Renvoie `null` si le joueur n'a joué aucun coup : afficher « 0 % » serait
 * trompeur.
 */
export function precisionPartie(precisions: number[], pdgSuccessives?: number[]): number | null {
  if (precisions.length === 0) return null;
  if (precisions.length === 1) return Math.round(precisions[0] * 10) / 10;

  // --- Moyenne pondérée par la volatilité ---
  // Sans la suite des probabilités de gain, on retombe sur des poids égaux :
  // la moyenne harmonique porte alors seule la sévérité.
  let moyennePonderee: number;
  if (pdgSuccessives && pdgSuccessives.length >= 2) {
    const fenetre = Math.max(2, Math.min(8, Math.floor(pdgSuccessives.length / 10)));
    const poids: number[] = [];
    for (let i = 0; i < precisions.length; i++) {
      // Fenêtre centrée, ramenée dans les bornes de la série.
      const debut = Math.max(0, Math.min(pdgSuccessives.length - fenetre, i));
      const sd = ecartType(pdgSuccessives.slice(debut, debut + fenetre));
      poids.push(Math.max(0.5, Math.min(12, sd)));
    }
    const sommePoids = poids.reduce((a, b) => a + b, 0);
    moyennePonderee =
      sommePoids > 0
        ? precisions.reduce((a, p, i) => a + p * poids[i], 0) / sommePoids
        : precisions.reduce((a, b) => a + b, 0) / precisions.length;
  } else {
    moyennePonderee = precisions.reduce((a, b) => a + b, 0) / precisions.length;
  }

  // --- Moyenne harmonique ---
  // Le plancher à 1 évite la division par zéro d'un coup noté 0 %, qui
  // ramènerait toute la partie à 0.
  const sommeInverses = precisions.reduce((a, p) => a + 1 / Math.max(1, p), 0);
  const moyenneHarmonique = precisions.length / sommeInverses;

  const valeur = (moyennePonderee + moyenneHarmonique) / 2;
  return Math.round(Math.max(0, Math.min(100, valeur)) * 10) / 10;
}

/**
 * Elo estimé auquel un joueur a joué, d'après sa perte moyenne en
 * centipions.
 *
 * La courbe n'est pas tirée d'un article : elle est calée sur l'échelle de
 * force de CE moteur, par des parties RÉELLES de chaque palier contre
 * lui-même (`npm run test:elo`). C'est le seul étalonnage qui vaille, et
 * l'ancien ne le faisait pas.
 *
 * Ce qui n'allait pas. Les ancrages précédents (Club 40 cp → 1600,
 * Débutant 150 cp → 800) venaient de `test:niveaux`, qui calcule la perte
 * moyenne sur TOUS les coups, sans plafond ni filtre. L'analyse de
 * l'application, elle, écarte les positions décidées et plafonne la perte à
 * 600 cp : elle produit donc un nombre systématiquement plus petit, qui
 * entrait dans la formule calée sur l'autre grandeur et en ressortait trop
 * haut. Tous les paliers étaient surévalués, de +110 à +523 Elo, et une
 * partie ordinaire pouvait afficher 1800.
 *
 * Mesuré, deux parties par palier, les deux camps :
 *
 *     palier            perte moyenne   ancienne courbe   courbe actuelle
 *     Grand débutant        176 cp            704               595
 *     Débutant              122 cp            923               765
 *     Amateur                66 cp           1300              1059
 *     Club                   26 cp           1873              1505
 *     Fort                   10 cp           2454              1958
 *     Expert                  4 cp           2900              2378
 *
 * Forme retenue : l'Elo décroît linéairement avec le LOGARITHME de la perte
 * moyenne — une exponentielle simple ratait tout le milieu de l'échelle. Les
 * deux coefficients sont ajustés par moindres carrés sur les 24 relevés :
 *
 *     Elo = 3031 − 471 · ln(perte moyenne)
 *
 * Écart absolu moyen de l'ajustement : 155 Elo. C'est l'ordre de grandeur de
 * ce qu'on peut affirmer sur une seule partie, et il ne faut pas prétendre
 * mieux.
 */
/**
 * Nombre minimal de coups retenus pour oser une estimation.
 *
 * Dix était bien trop peu. Une partie tranchée tôt — typiquement contre les
 * paliers faibles, qui s'effondrent en une douzaine de coups — ne laisse que
 * des coups d'ouverture dans l'échantillon, là où même un joueur pressé perd
 * peu. Une seule faute de 300 cp sur dix coups déplace la moyenne de 30 cp,
 * soit près de 200 Elo. Mieux vaut ne rien annoncer que d'annoncer un
 * chiffre que la partie ne porte pas.
 */
export const COUPS_MIN_ELO = 16;

export function eloEstime(perteMoyenneCp: number, nbCoups: number): number | null {
  if (nbCoups < COUPS_MIN_ELO) return null;
  const acpl = Math.max(1, perteMoyenneCp);
  const elo = 3031 - 471 * Math.log(acpl);
  return Math.round(Math.max(250, Math.min(2900, elo)) / 10) * 10;
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
