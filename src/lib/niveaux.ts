/**
 * Échelle de force du moteur.
 *
 * Trois leviers existent, et il a fallu mesurer lequel agit vraiment :
 *
 *  - `UCI_LimitStrength` + `UCI_Elo` est le mécanisme calibré de Stockfish.
 *    Il est excellent — au-dessus de son plancher, qui est 1320.
 *  - `Skill Level` (0–20) descend moins bas qu'on ne croit : à 0, Stockfish
 *    joue encore autour de 1300. Surtout, il est IGNORÉ dès que
 *    `UCI_LimitStrength` est actif, le moteur dérivant alors sa force du seul
 *    `UCI_Elo`. Les activer ensemble ne donne pas un moteur plus faible : il
 *    donne exactement `UCI_Elo`. C'était le défaut de la version précédente,
 *    où « Débutant » et « Amateur » demandaient tous deux 1320 et jouaient
 *    donc à l'identique.
 *  - Brider la PROFONDEUR aide, mais moins qu'attendu : à `depth 1`, la
 *    recherche de quiescence résout toutes les prises, si bien que le moteur
 *    ne pend jamais une pièce. Mesuré autour de 1200.
 *
 * Sous 1320, le seul levier qui descende réellement est donc de ne pas jouer
 * le meilleur coup : on demande plusieurs candidats (MultiPV) et on tire
 * parmi eux avec une pondération qui décroît avec leur qualité. Voir
 * `src/lib/choixCoup.ts`.
 *
 * D'où la règle de construction de cette table :
 *
 *   - au-dessus de 1320, on fait confiance à `UCI_Elo` et le tirage se
 *     resserre jusqu'à disparaître ;
 *   - en dessous, `UCI_LimitStrength` est coupé pour que `Skill Level`
 *     reprenne effet, et c'est le tirage pondéré qui porte la différence.
 *
 * Les écarts sont vérifiés par des matchs entre paliers :
 * `npm run test:matchs`.
 */

export interface NiveauMoteur {
  id: string;
  libelle: string;
  /** Ordre de grandeur affiché, `null` pour la pleine force. */
  elo: number | null;
  /** `Skill Level` UCI, 0 à 20. Sans effet si `limiterElo` est vrai. */
  skill: number;
  /** Activer la limitation calibrée par Elo. Faux sous le plancher de 1320. */
  limiterElo: boolean;
  /** Valeur d'`UCI_Elo`, quand la limitation est active (plancher : 1320). */
  uciElo?: number;
  /** Profondeur maximale imposée, `null` si aucune. */
  profondeurMax: number | null;
  /** Temps de réflexion par coup, en millisecondes. */
  tempsMs: number;
  /**
   * Nombre de candidats demandés au moteur pour le tirage.
   * 1 = le moteur joue toujours son meilleur coup.
   */
  candidats: number;
  /** Température du tirage, en centipions. 0 = toujours le meilleur coup. */
  temperatureCp: number;
  /** Probabilité de jouer franchement le pire des candidats. */
  probaBevue: number;
  /** Une phrase qui dit à quoi s'attendre. */
  description: string;
}

export const NIVEAUX: NiveauMoteur[] = [
  {
    id: 'grand-debutant',
    libelle: 'Grand débutant',
    elo: 400,
    skill: 0,
    limiterElo: false,
    profondeurMax: 1,
    tempsMs: 30,
    // Douze candidats et une température très haute : le coup joué n'a
    // presque aucun rapport avec le meilleur. C'est l'objectif.
    candidats: 12,
    temperatureCp: 700,
    probaBevue: 0.3,
    description: 'Découvre le jeu. Donne des pièces sans s’en rendre compte.',
  },
  {
    id: 'debutant',
    libelle: 'Débutant',
    elo: 800,
    skill: 0,
    limiterElo: false,
    profondeurMax: 2,
    tempsMs: 50,
    candidats: 10,
    temperatureCp: 300,
    probaBevue: 0.14,
    description: 'Laisse des pièces en prise et rate les menaces simples.',
  },
  {
    id: 'amateur',
    libelle: 'Amateur',
    elo: 1200,
    skill: 3,
    limiterElo: false,
    profondeurMax: 4,
    tempsMs: 100,
    candidats: 6,
    temperatureCp: 120,
    probaBevue: 0.05,
    description: 'Voit les prises immédiates, manque les combinaisons.',
  },
  {
    id: 'club',
    libelle: 'Club',
    elo: 1600,
    skill: 12,
    // Au-dessus du plancher : la calibration du moteur reprend la main.
    limiterElo: true,
    uciElo: 1600,
    profondeurMax: 8,
    tempsMs: 200,
    candidats: 3,
    temperatureCp: 45,
    probaBevue: 0,
    description: 'Joue des plans cohérents et punit les erreurs nettes.',
  },
  {
    id: 'fort',
    libelle: 'Fort',
    elo: 2000,
    skill: 16,
    limiterElo: true,
    uciElo: 2000,
    profondeurMax: 12,
    tempsMs: 400,
    candidats: 2,
    temperatureCp: 15,
    probaBevue: 0,
    description: 'Tactiquement solide ; il faut un vrai plan pour le gêner.',
  },
  {
    id: 'expert',
    libelle: 'Expert',
    elo: 2400,
    skill: 18,
    // PAS de limitation par Elo ici, et c'est un résultat de mesure, pas un
    // choix de confort.
    //
    // `UCI_LimitStrength` calibre correctement à 1600 et à 2000 — Club et
    // Fort se départagent à 94 % en match. Au-delà, il décroche : sur une
    // position tactique de contrôle, Expert à `UCI_Elo 2400` choisissait un
    // mauvais coup de dame (f3d3) là où le MÊME palier, limitation coupée,
    // retrouvait le coup de la pleine force (g1e2). En match, Fort battait
    // Expert 8–0. Ce build est un réseau réduit (`sf_19_smallnet`) dont la
    // calibration Elo n'est fiable que dans le bas de sa plage.
    //
    // Au-dessus de 2000, on sépare donc les paliers par `Skill Level` — qui
    // reprend effet dès que la limitation est coupée —, la profondeur et le
    // temps.
    limiterElo: false,
    profondeurMax: 16,
    tempsMs: 700,
    candidats: 1,
    temperatureCp: 0,
    probaBevue: 0,
    description: 'Ne laisse presque rien passer.',
  },
  {
    id: 'maximum',
    libelle: 'Maximum',
    elo: null,
    skill: 20,
    limiterElo: false,
    profondeurMax: null,
    // Plus de temps qu'« Expert », et aucun plafond de profondeur : la
    // pleine force doit dominer le palier qui la précède sans discussion.
    tempsMs: 1200,
    candidats: 1,
    temperatureCp: 0,
    probaBevue: 0,
    description: 'Pleine force. Aucune concession.',
  },
];

export const NIVEAU_PAR_DEFAUT = 'club';

export function niveauParId(id: string): NiveauMoteur {
  return NIVEAUX.find((n) => n.id === id) ?? NIVEAUX.find((n) => n.id === NIVEAU_PAR_DEFAUT)!;
}

/** Libellé complet, avec l'ordre de grandeur Elo. */
export function libelleNiveau(n: NiveauMoteur): string {
  return n.elo === null ? n.libelle : `${n.libelle} (~${n.elo} Elo)`;
}

/**
 * Convertit un ancien réglage numérique (0–20) vers un palier.
 * Les réglages déjà enregistrés sur l'appareil doivent continuer à ouvrir
 * l'application sur quelque chose de sensé.
 */
export function niveauDepuisAncienneValeur(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return NIVEAU_PAR_DEFAUT;
  if (v <= 2) return 'debutant';
  if (v <= 6) return 'amateur';
  if (v <= 11) return 'club';
  if (v <= 15) return 'fort';
  if (v <= 19) return 'expert';
  return 'maximum';
}
