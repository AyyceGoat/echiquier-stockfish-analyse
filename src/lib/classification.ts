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
 * Plafond de perte par coup, en centipions.
 *
 * Borne commune à la précision et à la perte moyenne. Au-delà d'un plafond
 * entier lâché d'un seul coup, la position est décidée et l'écart exact
 * n'apprend plus rien.
 */
export const PLAFOND_PERTE = 1000;

/**
 * Précision d'UN coup, à partir de la perte plafonnée.
 *
 * Pourquoi pas la probabilité de gain, comme Lichess et Chess.com. Cette
 * probabilité SATURE : passé environ onze pions d'avance, elle est collée à
 * ses bornes et ne peut plus bouger. Mesuré sur une partie de contrôle, tous
 * les coups joués au-delà de ce seuil ressortaient à exactement 100 % pour
 * les DEUX camps — y compris un coup lâchant 486 centipions. La moitié d'une
 * partie déséquilibrée était donc notée parfaite pour tout le monde, et la
 * note finale ne dépendait plus que des rares coups encore disputés. C'est ce
 * qui permettait à un palier Débutant d'afficher 98 %.
 *
 * Lichess et Chess.com évitent ce travers en ÉCARTANT les positions décidées.
 * Cela règle la précision mais fausse la perte moyenne : contre un adversaire
 * beaucoup plus faible, il ne reste dans l'échantillon que l'ouverture, et le
 * vainqueur ressort surévalué.
 *
 * On fonde donc la précision sur la perte elle-même, plafonnée. Les deux
 * mesures deviennent monotones l'une de l'autre par construction, sur tous
 * les coups de la partie, sans zone morte. La contrepartie est assumée : la
 * note n'est plus directement comparable à celle de Lichess ou Chess.com.
 *
 * Coefficients ajustés pour épouser l'ancienne courbe sur le domaine
 * disputé, et continuer à descendre au-delà au lieu de s'aplatir :
 *
 *     perte      cette courbe   ancienne (probabilité de gain)
 *       0 cp       100,0 %          100,0 %
 *      50 cp        81,6 %           81,3 %
 *     100 cp        67,2 %           66,2 %
 *     300 cp        31,4 %           31,4 %
 *     600 cp        11,3 %           14,8 %
 *    1000 cp         4,4 %            9,9 %   <- l'ancienne plafonnait ici
 */
export function precisionCoup(perteCp: number): number {
  const perte = Math.max(0, Math.min(PLAFOND_PERTE, perteCp));
  const brut = 97.3 * Math.exp(-0.00404 * perte) + 2.7;
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

/**
 * Au-delà de ce nombre de coups disputés, on ose une valeur unique.
 *
 * Entre les deux seuils, la partie porte une information réelle mais trop
 * mince pour un chiffre unique : on annonce alors un intervalle. Dire « entre
 * 600 et 1400 » est plus utile qu'un silence, et plus honnête qu'un « 1000 »
 * que rien ne soutient.
 */
export const COUPS_VALEUR_UNIQUE = 25;

/**
 * Ancrages mesurés : perte moyenne observée pour chaque palier du moteur.
 *
 * Relevés par `npm run test:elo`, en faisant s'affronter des paliers VOISINS
 * — seules les parties restées disputées portent une mesure exploitable. Deux
 * parties par paire, les deux couleurs, quatre relevés par palier pour la
 * plupart.
 *
 * Une courbe logarithmique unique a été essayée d'abord : elle laissait le
 * palier le plus faible 343 Elo trop haut et le palier Club 248 Elo trop bas,
 * parce que la relation entre perte et force n'est pas log-linéaire sur toute
 * l'échelle. On interpole donc directement entre les ancrages, ce qui les
 * respecte exactement et reste monotone entre eux.
 *
 * Les valeurs sont la MOYENNE DE DEUX SÉRIES indépendantes. Une seule série
 * donnait des ancrages qui ne tenaient pas à la suivante : le palier Débutant,
 * mesuré à 85 cp puis à 75 cp, ressortait à +180 Elo de sa valeur annoncée dès
 * qu'on rejouait. C'est l'ordre de grandeur du bruit d'échantillonnage sur
 * quatre parties, et c'est aussi pourquoi l'estimation s'accompagne d'une
 * incertitude plutôt que d'être donnée comme exacte.
 */
const ANCRAGES_ELO: { perte: number; elo: number }[] = [
  { perte: 124, elo: 400 },
  { perte: 80, elo: 800 },
  { perte: 62, elo: 1200 },
  { perte: 27, elo: 1600 },
  { perte: 12, elo: 2000 },
  { perte: 4, elo: 2400 },
];

/**
 * Elo estimé, par interpolation entre les ancrages mesurés.
 *
 * L'interpolation se fait sur le LOGARITHME de la perte : c'est l'échelle sur
 * laquelle les paliers s'espacent régulièrement. Au-delà des ancrages, la
 * pente du segment extrême est prolongée, puis le résultat est borné.
 */
export function eloEstime(perteMoyenneCp: number, nbCoups: number): number | null {
  if (nbCoups < COUPS_MIN_ELO) return null;
  const x = Math.log(Math.max(1, perteMoyenneCp));
  const pts = ANCRAGES_ELO.map((a) => ({ x: Math.log(a.perte), y: a.elo }));

  // Les ancrages vont de la perte la plus forte à la plus faible, donc de x
  // décroissant : on cherche le segment qui encadre x.
  let i = 0;
  while (i < pts.length - 2 && x < pts[i + 1].x) i += 1;
  const a = pts[i];
  const b = pts[i + 1];
  const pente = (b.y - a.y) / (b.x - a.x);
  const elo = a.y + pente * (x - a.x);
  return Math.round(Math.max(250, Math.min(2900, elo)) / 10) * 10;
}

export interface EstimationElo {
  /** Valeur centrale, toujours renseignée. */
  valeur: number;
  bas: number;
  haut: number;
  /** Faut-il présenter un intervalle plutôt qu'une valeur unique ? */
  intervalle: boolean;
  /** Nombre de coups disputés sur lesquels l'estimation repose. */
  coups: number;
}

/**
 * Estimation de niveau, avec son incertitude.
 *
 * Deux sources d'erreur, additionnées :
 *
 *  - l'ajustement de la courbe, dont l'écart absolu moyen mesuré sur les
 *    paliers du moteur est d'environ 150 Elo ;
 *  - l'échantillonnage. La perte par coup est très dispersée — quelques
 *    fautes lourdes au milieu de coups corrects —, avec un coefficient de
 *    variation proche de 1,2. L'erreur sur le logarithme de la moyenne vaut
 *    donc environ 1,2 / racine(n), que la pente de la courbe convertit en Elo.
 *
 * Conséquence assumée : l'intervalle est large sur une partie courte. C'est
 * la réalité de ce qu'une seule partie permet d'affirmer.
 */
export function estimationElo(perteMoyenneCp: number, nbCoups: number): EstimationElo | null {
  const valeur = eloEstime(perteMoyenneCp, nbCoups);
  if (valeur === null) return null;
  const RESIDU_AJUSTEMENT = 150;
  const DISPERSION = 1.2;
  const PENTE = 471;
  const demiLargeur = RESIDU_AJUSTEMENT + (PENTE * DISPERSION) / Math.sqrt(nbCoups);
  const arrondi = (v: number) => Math.round(Math.max(250, Math.min(2900, v)) / 50) * 50;
  return {
    valeur,
    bas: arrondi(valeur - demiLargeur),
    haut: arrondi(valeur + demiLargeur),
    intervalle: nbCoups < COUPS_VALEUR_UNIQUE,
    coups: nbCoups,
  };
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
