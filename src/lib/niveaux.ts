/**
 * Échelle de force du moteur.
 *
 * Pourquoi une table explicite plutôt qu'un curseur de 0 à 20 :
 *
 *  - `Skill Level` seul ne descend pas assez bas. À 0, Stockfish joue encore
 *    autour de 1300–1400 Elo : c'est déjà un joueur de club, pas un débutant.
 *  - `UCI_LimitStrength` + `UCI_Elo` est le mécanisme calibré du moteur, mais
 *    son plancher est 1320. En dessous, le seul levier qui fonctionne est de
 *    brider la PROFONDEUR : à profondeur 1, le moteur ne voit pas la réponse
 *    adverse et laisse des pièces en prise, comme un vrai débutant.
 *
 * Chaque palier combine donc les trois leviers, et l'ordre de grandeur Elo
 * est affiché pour qu'on sache ce qu'on affronte.
 */

export interface NiveauMoteur {
  id: string;
  libelle: string;
  /** Ordre de grandeur affiché, `null` pour la pleine force. */
  elo: number | null;
  /** `Skill Level` UCI, 0 à 20. */
  skill: number;
  /** Activer la limitation calibrée par Elo. */
  limiterElo: boolean;
  /** Valeur d'`UCI_Elo`, quand la limitation est active (plancher moteur : 1320). */
  uciElo?: number;
  /** Profondeur maximale imposée, `null` si aucune. */
  profondeurMax: number | null;
  /** Temps de réflexion par coup, en millisecondes. */
  tempsMs: number;
  /** Une phrase qui dit à quoi s'attendre. */
  description: string;
}

export const NIVEAUX: NiveauMoteur[] = [
  {
    id: 'debutant',
    libelle: 'Débutant',
    elo: 800,
    skill: 0,
    limiterElo: true,
    uciElo: 1320,
    // Profondeur 1 : le moteur ne regarde pas la réponse de l'adversaire.
    // C'est le seul moyen de descendre sous le plancher d'UCI_Elo.
    profondeurMax: 1,
    tempsMs: 50,
    description: 'Laisse des pièces en prise et rate les menaces simples.',
  },
  {
    id: 'amateur',
    libelle: 'Amateur',
    elo: 1200,
    skill: 3,
    limiterElo: true,
    uciElo: 1320,
    profondeurMax: 3,
    tempsMs: 100,
    description: 'Voit les prises immédiates, manque les combinaisons.',
  },
  {
    id: 'club',
    libelle: 'Club',
    elo: 1600,
    skill: 9,
    limiterElo: true,
    uciElo: 1600,
    profondeurMax: 8,
    tempsMs: 200,
    description: 'Joue des plans cohérents et punit les erreurs nettes.',
  },
  {
    id: 'fort',
    libelle: 'Fort',
    elo: 2000,
    skill: 14,
    limiterElo: true,
    uciElo: 2000,
    profondeurMax: 12,
    tempsMs: 400,
    description: 'Tactiquement solide ; il faut un vrai plan pour le gêner.',
  },
  {
    id: 'expert',
    libelle: 'Expert',
    elo: 2400,
    skill: 18,
    limiterElo: true,
    uciElo: 2400,
    profondeurMax: null,
    tempsMs: 600,
    description: 'Ne laisse presque rien passer.',
  },
  {
    id: 'maximum',
    libelle: 'Maximum',
    elo: null,
    skill: 20,
    limiterElo: false,
    profondeurMax: null,
    tempsMs: 1000,
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
