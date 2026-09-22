/**
 * Choix pondéré d'un coup parmi les candidats du moteur.
 *
 * Pourquoi ce module existe — le problème que ni `Skill Level` ni `UCI_Elo`
 * ne résolvent :
 *
 *  - `UCI_LimitStrength` + `UCI_Elo` est le mécanisme calibré de Stockfish,
 *    mais son plancher est 1320. En dessous, il ne sait rien faire.
 *  - Pire, quand `UCI_LimitStrength` est actif, Stockfish dérive sa force du
 *    seul `UCI_Elo` et IGNORE `Skill Level`. Combiner les deux ne donne donc
 *    pas un moteur plus faible : il donne exactement `UCI_Elo`.
 *  - Et `go depth 1` n'est pas faible non plus : la recherche de quiescence
 *    résout toutes les prises, si bien que le moteur ne pend jamais une pièce
 *    et ramasse tout ce qui traîne. On mesure ce réglage autour de 1200.
 *
 * Le seul levier qui descende réellement plus bas est donc de NE PAS jouer le
 * meilleur coup. On demande plusieurs candidats au moteur (MultiPV), puis on
 * tire parmi eux avec une probabilité qui décroît avec leur qualité.
 *
 * La pondération est un softmax sur la perte en centipions :
 *
 *     poids(i) = exp( -perte(i) / temperature )
 *
 * où `perte(i)` est l'écart, en centipions, entre le meilleur candidat et le
 * candidat `i`, du point de vue du joueur au trait. La température se lit
 * directement : à T = 100, un coup qui perd un pion est environ e fois moins
 * probable que le meilleur ; à T = 600, un débutant joue presque au hasard
 * parmi ce que le moteur lui propose.
 *
 * Tout est pur et le générateur aléatoire est injecté : le comportement est
 * vérifiable en test unitaire, sans moteur ni navigateur.
 */

import { CP_MAT, evaluationEnCp, type Evaluation } from './uci.ts';

/** Un candidat tel que le moteur le renvoie. */
export interface CandidatCoup {
  /** Coup en notation UCI (e2e4, g8f6, e7e8q…). */
  coup: string;
  /** Évaluation après ce coup, du point de vue du joueur au trait. */
  evaluation: Evaluation;
}

export interface ReglagesChoix {
  /** Température du softmax, en centipions. 0 = toujours le meilleur coup. */
  temperatureCp: number;
  /**
   * Probabilité de choisir délibérément parmi les PIRES candidats.
   *
   * Le softmax seul produit un joueur médiocre mais régulier. Un vrai
   * débutant est irrégulier : il joue trois coups corrects puis pend sa dame.
   * Cette probabilité reproduit ce décrochage, que la pondération continue
   * ne sait pas imiter.
   */
  probaBevue: number;
}

/** Générateur aléatoire, injecté pour rendre le tirage reproductible en test. */
export type Alea = () => number;

/**
 * Perte en centipions de chaque candidat par rapport au meilleur.
 * Toujours positive ou nulle, et plafonnée : un mat encaissé donnerait
 * sinon une perte de 30 000 qui écrase tous les autres écarts.
 */
export function pertesParCandidat(candidats: CandidatCoup[]): number[] {
  if (candidats.length === 0) return [];
  const cps = candidats.map((c) => evaluationEnCp(c.evaluation));
  const meilleur = Math.max(...cps);
  // Le plafond vaut une dame et demie : au-delà, tous les désastres se
  // valent, et les distinguer ne changerait rien au comportement.
  const PLAFOND = 1500;
  return cps.map((cp) => Math.min(PLAFOND, Math.max(0, meilleur - cp)));
}

/**
 * Choisit un coup parmi les candidats.
 *
 * Renvoie `null` si la liste est vide, pour que l'appelant retombe sur le
 * `bestmove` du moteur plutôt que de ne rien jouer.
 */
export function choisirCoup(
  candidats: CandidatCoup[],
  reglages: ReglagesChoix,
  alea: Alea = Math.random,
): string | null {
  if (candidats.length === 0) return null;
  if (candidats.length === 1) return candidats[0].coup;

  const pertes = pertesParCandidat(candidats);

  // --- Bévue franche ---------------------------------------------------
  // On écarte d'emblée les coups qui perdent sur-le-champ par mat : même un
  // grand débutant voit l'échec et mat en un coup, et le lui faire jouer
  // donnerait des parties absurdes plutôt que des parties faibles.
  const jouables = candidats
    .map((c, i) => ({ c, perte: pertes[i], cp: evaluationEnCp(c.evaluation) }))
    .filter((x) => x.cp > -CP_MAT + 100);
  const pool = jouables.length > 0 ? jouables : candidats.map((c, i) => ({ c, perte: pertes[i], cp: 0 }));

  if (reglages.probaBevue > 0 && alea() < reglages.probaBevue && pool.length > 1) {
    // Le pire des candidats encore jouables. C'est volontairement brutal :
    // c'est ce qui produit la pièce en prise que l'on attend d'un débutant.
    let pire = pool[0];
    for (const x of pool) if (x.perte > pire.perte) pire = x;
    return pire.c.coup;
  }

  // --- Tirage pondéré ---------------------------------------------------
  const t = reglages.temperatureCp;
  if (!Number.isFinite(t) || t <= 0) {
    // Température nulle : le meilleur coup, sans hasard.
    let meilleur = pool[0];
    for (const x of pool) if (x.perte < meilleur.perte) meilleur = x;
    return meilleur.c.coup;
  }

  // `exp(-perte / t)` : la perte du meilleur candidat vaut 0, donc son poids
  // vaut 1 et aucune normalisation préalable n'est nécessaire.
  const poids = pool.map((x) => Math.exp(-x.perte / t));
  const total = poids.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) return pool[0].c.coup;

  let seuil = alea() * total;
  for (let i = 0; i < pool.length; i++) {
    seuil -= poids[i];
    if (seuil <= 0) return pool[i].c.coup;
  }
  // Repli sur le dernier : seules les erreurs d'arrondi mènent ici.
  return pool[pool.length - 1].c.coup;
}

/**
 * Probabilité théorique de chaque candidat, hors bévue.
 * N'est pas utilisée en jeu : elle sert aux tests, qui vérifient la forme de
 * la distribution sans avoir à échantillonner des milliers de tirages.
 */
export function probabilites(candidats: CandidatCoup[], temperatureCp: number): number[] {
  if (candidats.length === 0) return [];
  const pertes = pertesParCandidat(candidats);
  if (temperatureCp <= 0) {
    const min = Math.min(...pertes);
    const gagnants = pertes.filter((p) => p === min).length;
    return pertes.map((p) => (p === min ? 1 / gagnants : 0));
  }
  const poids = pertes.map((p) => Math.exp(-p / temperatureCp));
  const total = poids.reduce((a, b) => a + b, 0);
  return poids.map((w) => w / total);
}
