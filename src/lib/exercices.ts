/**
 * Leçons et exercices.
 *
 * Tout est jouable sur l'échiquier : aucune leçon n'est un texte qu'on lit
 * passivement. Chaque entrée décrit une position, une consigne, et un
 * OBJECTIF vérifiable par les règles du jeu — pas par une liste de coups
 * figée. Un objectif « mat en 1 » accepte donc n'importe quel mat, et un
 * objectif « atteindre une case » accepte n'importe quel chemin légal.
 *
 * Les positions sont vérifiées automatiquement (`exercices.test.ts`) : FEN
 * légal, solution légale, et objectif réellement atteint par la solution.
 * Un exercice faux serait pire que pas d'exercice du tout.
 */

import { Chess, type Square } from 'chess.js';
import type { MotifExplication } from './explications.ts';

export type Objectif =
  /** Le coup doit mener au mat. */
  | { type: 'mat' }
  /** La pièce déplacée doit arriver sur cette case. */
  | { type: 'atteindre'; case: string }
  /** Le coup doit capturer la pièce présente sur cette case. */
  | { type: 'capturer'; case: string }
  /** Le coup doit être un roque. */
  | { type: 'roque'; cote: 'petit' | 'grand' }
  /** Le coup doit promouvoir un pion. */
  | { type: 'promotion' }
  /** N'importe quel coup légal : sert à faire constater une contrainte. */
  | { type: 'coup-legal' }
  /** Le coup doit gagner au moins tant de points de matériel dans la foulée. */
  | { type: 'gain-materiel'; minimum: number };

export type CategorieExercice = 'bases' | 'tactique';

export interface Exercice {
  id: string;
  categorie: CategorieExercice;
  /** Motif tactique, pour relier un exercice aux erreurs d'une partie. */
  motif?: MotifExplication;
  titre: string;
  /** Ce qu'il faut faire, en une phrase. */
  consigne: string;
  fen: string;
  objectif: Objectif;
  /** Coup de référence, en UCI : sert d'indice et de vérification. */
  solution: string;
  /** Indice donné à la demande, sans dévoiler le coup. */
  indice: string;
  /** Ce qu'on retient, affiché une fois l'exercice réussi. */
  lecon: string;
}

export const EXERCICES: Exercice[] = [
  // ─────────────────────────── Les bases ───────────────────────────
  {
    id: 'pion-avance',
    categorie: 'bases',
    titre: 'Le pion avance',
    consigne: 'Depuis sa case de départ, un pion peut avancer de deux cases. Jouez-le en e4.',
    fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'e4' },
    solution: 'e2e4',
    indice: 'Le pion est en e2. Comptez deux cases vers le haut.',
    lecon: 'Un pion avance tout droit, de deux cases au premier coup, d’une seule ensuite. Il ne recule jamais.',
  },
  {
    id: 'pion-prend',
    categorie: 'bases',
    titre: 'Le pion prend en diagonale',
    consigne: 'Le pion avance tout droit mais capture en diagonale. Prenez le pion noir.',
    fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
    objectif: { type: 'capturer', case: 'd5' },
    solution: 'e4d5',
    indice: 'Votre pion est en e4, le pion noir en d5 : juste en diagonale.',
    lecon: 'C’est la seule pièce qui ne capture pas dans sa direction de déplacement.',
  },
  {
    id: 'prise-en-passant',
    categorie: 'bases',
    titre: 'La prise en passant',
    consigne:
      'Le pion noir vient d’avancer de deux cases en passant à côté du vôtre. Prenez-le « en passant ».',
    fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
    objectif: { type: 'atteindre', case: 'd6' },
    solution: 'e5d6',
    indice: 'Votre pion se déplace en d6, et le pion noir de d5 disparaît.',
    lecon:
      'Un pion qui avance de deux cases peut être pris comme s’il n’en avait avancé qu’une. Ce droit se perd si l’on ne l’exerce pas immédiatement.',
  },
  {
    id: 'promotion',
    categorie: 'bases',
    titre: 'La promotion',
    consigne: 'Amenez le pion sur la dernière rangée : il devient la pièce de votre choix.',
    fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
    objectif: { type: 'promotion' },
    solution: 'a7a8q',
    indice: 'Le pion est en a7, la dernière rangée est juste au-dessus.',
    lecon:
      'On choisit presque toujours la dame, mais les trois autres pièces sont permises — le cavalier rend parfois service.',
  },
  {
    id: 'cavalier-en-l',
    categorie: 'bases',
    titre: 'Le cavalier saute en L',
    consigne: 'Le cavalier se déplace de deux cases puis d’une, en angle droit. Amenez-le en c2.',
    fen: '4k3/8/8/8/8/8/8/N3K3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'c2' },
    solution: 'a1c2',
    indice: 'Deux cases vers la droite, une vers le haut.',
    lecon: 'C’est la seule pièce qui saute par-dessus les autres. Il change de couleur de case à chaque coup.',
  },
  {
    id: 'fou-diagonale',
    categorie: 'bases',
    titre: 'Le fou suit les diagonales',
    consigne: 'Le fou se déplace en diagonale, aussi loin qu’il veut. Amenez-le en h8.',
    fen: '4k3/8/8/8/8/8/8/B3K3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'h8' },
    solution: 'a1h8',
    indice: 'La grande diagonale est libre de a1 jusqu’en h8.',
    lecon: 'Un fou reste toute la partie sur les cases d’une seule couleur.',
  },
  {
    id: 'tour-lignes',
    categorie: 'bases',
    titre: 'La tour suit les lignes',
    consigne: 'La tour se déplace en ligne droite. Amenez-la en a8.',
    fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'a8' },
    solution: 'a1a8',
    indice: 'La colonne a est entièrement libre.',
    lecon: 'La tour est d’autant plus forte que les colonnes sont ouvertes.',
  },
  {
    id: 'dame-partout',
    categorie: 'bases',
    titre: 'La dame cumule les deux',
    consigne: 'La dame se déplace comme une tour ET comme un fou. Amenez-la en d8.',
    fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'd8' },
    solution: 'd1d8',
    indice: 'La colonne d est libre.',
    lecon: 'C’est la pièce la plus puissante — raison de plus pour ne pas la sortir trop tôt.',
  },
  {
    id: 'roi-une-case',
    categorie: 'bases',
    titre: 'Le roi avance d’une case',
    consigne: 'Le roi se déplace d’une seule case, dans toutes les directions. Avancez-le en e2.',
    fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    objectif: { type: 'atteindre', case: 'e2' },
    solution: 'e1e2',
    indice: 'Une seule case suffit.',
    lecon: 'Deux rois ne peuvent jamais se toucher : chacun interdit à l’autre les cases voisines.',
  },
  {
    id: 'petit-roque',
    categorie: 'bases',
    titre: 'Le petit roque',
    consigne:
      'Le roque met le roi à l’abri et active la tour. Roquez du petit côté : déplacez le roi en g1.',
    fen: '4k3/8/8/8/8/8/PPPP1PPP/RNBQK2R w KQ - 0 1',
    objectif: { type: 'roque', cote: 'petit' },
    solution: 'e1g1',
    indice: 'Le roi fait deux pas vers la tour, qui saute par-dessus lui.',
    lecon:
      'Le roque est impossible si le roi ou la tour a déjà bougé, si le roi est en échec, ou s’il traverse une case attaquée.',
  },
  {
    id: 'grand-roque',
    categorie: 'bases',
    titre: 'Le grand roque',
    consigne: 'Roquez du grand côté : déplacez le roi en c1.',
    fen: '4k3/8/8/8/8/8/PPPPPPPP/R3KBNR w KQ - 0 1',
    objectif: { type: 'roque', cote: 'grand' },
    solution: 'e1c1',
    indice: 'Le roi fait deux pas vers la tour a1.',
    lecon: 'Le grand roque laisse le roi un peu plus exposé, mais amène la tour au centre.',
  },
  {
    id: 'parer-echec',
    categorie: 'bases',
    titre: 'Parer un échec',
    consigne: 'Votre roi est en échec. Vous devez y répondre : sortez-le de la colonne attaquée.',
    fen: '4k3/8/8/8/8/8/8/r3K3 w - - 0 1',
    objectif: { type: 'coup-legal' },
    solution: 'e1e2',
    indice: 'La tour noire contrôle toute la première rangée.',
    lecon:
      'Face à un échec, trois réponses seulement : bouger le roi, capturer l’attaquant, ou interposer une pièce.',
  },
  {
    id: 'mat-tour',
    categorie: 'bases',
    titre: 'Échec et mat',
    consigne: 'Le roi noir n’a plus de case libre. Donnez mat en un coup.',
    fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    objectif: { type: 'mat' },
    solution: 'a1a8',
    indice: 'Votre roi contrôle déjà g7 et h7. Il ne reste qu’à couvrir la huitième rangée.',
    lecon: 'Le mat, c’est un échec auquel il n’existe aucune réponse légale. La partie s’arrête là.',
  },

  // ─────────────────────────── Tactique ───────────────────────────
  {
    id: 'fourchette-cavalier',
    categorie: 'tactique',
    motif: 'fourchette',
    titre: 'Fourchette de cavalier',
    consigne: 'Attaquez le roi et la tour d’un seul coup.',
    fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
    objectif: { type: 'gain-materiel', minimum: 4 },
    solution: 'd5c7',
    indice: 'Cherchez une case d’où le cavalier touche à la fois e8 et a8.',
    lecon:
      'Le cavalier est le roi de la fourchette : il attaque des cases qu’aucune autre pièce ne peut défendre en même temps.',
  },
  {
    id: 'fourchette-pion',
    categorie: 'tactique',
    motif: 'fourchette',
    titre: 'Fourchette de pion',
    consigne: 'Un simple pion peut attaquer deux pièces à la fois. Trouvez le coup.',
    fen: '4k3/8/8/1n1n4/8/2P5/8/4K3 w - - 0 1',
    objectif: { type: 'gain-materiel', minimum: 2 },
    solution: 'c3c4',
    indice: 'Avancez le pion : il attaquera les deux cases en diagonale.',
    lecon: 'La pièce la moins chère est la meilleure attaquante : personne ne peut se permettre de la prendre.',
  },
  {
    id: 'clouage-fou',
    categorie: 'tactique',
    motif: 'clouage',
    titre: 'Clouer une pièce',
    consigne: 'Immobilisez le cavalier noir en l’alignant devant son roi.',
    fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1',
    objectif: { type: 'atteindre', case: 'b5' },
    solution: 'f1b5',
    indice: 'Une diagonale relie votre fou au roi noir, en passant par le cavalier.',
    lecon:
      'Une pièce clouée devant son roi ne peut plus bouger du tout : elle cesse de défendre ce qu’elle gardait.',
  },
  {
    id: 'enfilade-tour',
    categorie: 'tactique',
    motif: 'enfilade',
    titre: 'Enfilade',
    consigne: 'Donnez échec de façon à gagner la tour placée derrière le roi.',
    fen: 'r7/8/8/8/k7/8/8/1R2K3 w - - 0 1',
    objectif: { type: 'gain-materiel', minimum: 4 },
    solution: 'b1a1',
    indice: 'Mettez votre tour sur la même colonne que le roi noir.',
    lecon:
      'L’enfilade est le clouage à l’envers : la pièce de valeur est devant, elle doit fuir, et abandonne celle qui la suit.',
  },
  {
    id: 'decouverte',
    categorie: 'tactique',
    motif: 'fourchette',
    titre: 'Attaque à la découverte',
    consigne: 'Déplacez le cavalier en donnant échec : votre fou attaquera la dame.',
    fen: '3k3q/8/8/4N3/8/8/1B6/4K3 w - - 0 1',
    objectif: { type: 'gain-materiel', minimum: 8 },
    solution: 'e5f7',
    indice: 'Le fou b2 vise h8, mais le cavalier lui bouche la diagonale.',
    lecon:
      'En découverte, c’est la pièce qui NE bouge PAS qui attaque. L’adversaire ne peut parer qu’une menace à la fois.',
  },
  {
    id: 'mat-du-couloir',
    categorie: 'tactique',
    motif: 'mat-manque',
    titre: 'Mat du couloir',
    consigne: 'Les pions noirs enferment leur propre roi. Matez en un coup.',
    fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    objectif: { type: 'mat' },
    solution: 'e1e8',
    indice: 'La huitième rangée est la seule voie d’accès.',
    lecon:
      'Un roi roqué derrière trois pions intacts est vulnérable à la dernière rangée. D’où l’utilité de faire « un trou ».',
  },
  {
    id: 'mat-dame-soutenue',
    categorie: 'tactique',
    motif: 'mat-manque',
    titre: 'Mat avec la dame soutenue',
    consigne: 'Approchez la dame du roi noir, soutenue par votre roi. Mat en un coup.',
    fen: '6k1/8/6K1/8/Q7/8/8/8 w - - 0 1',
    objectif: { type: 'mat' },
    solution: 'a4a8',
    indice: 'Votre roi couvre déjà f7, g7 et h7. Reste la huitième rangée.',
    lecon: 'Contre un roi au bord, la dame mate dès qu’une autre pièce couvre ses cases de fuite.',
  },
  {
    id: 'piece-en-prise',
    categorie: 'tactique',
    motif: 'piece-en-prise',
    titre: 'Prendre ce qui est libre',
    consigne: 'Une pièce noire n’est défendue par personne. Prenez-la.',
    fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1',
    objectif: { type: 'capturer', case: 'd5' },
    solution: 'd1d5',
    indice: 'Regardez la colonne d.',
    lecon:
      'Avant chaque coup, la question la plus rentable est : « qu’est-ce qui n’est pas défendu, chez lui comme chez moi ? »',
  },
  {
    id: 'menace-a-parer',
    categorie: 'tactique',
    motif: 'menace-ignoree',
    titre: 'Parer une menace',
    consigne:
      'Votre tour est attaquée par le fou noir. Mettez-la hors d’atteinte, en d8, où elle reste active.',
    fen: '4k3/8/8/8/b7/8/8/3R3K w - - 0 1',
    objectif: { type: 'atteindre', case: 'd8' },
    solution: 'd1d8',
    indice: 'Le fou en a4 vise votre tour le long de la diagonale a4-d1.',
    lecon:
      'Après chaque coup adverse, demandez-vous ce qu’il menace. Une menace ignorée coûte plus cher qu’un coup lent.',
  },
];

export function exercicesParCategorie(c: CategorieExercice): Exercice[] {
  return EXERCICES.filter((e) => e.categorie === c);
}

export function exercicesParMotif(motif: MotifExplication): Exercice[] {
  return EXERCICES.filter((e) => e.motif === motif);
}

export function exerciceParId(id: string): Exercice | undefined {
  return EXERCICES.find((e) => e.id === id);
}

export interface Verdict {
  reussi: boolean;
  /** Message affiché : ce qui va, ou ce qui manque. */
  message: string;
}

/**
 * Le coup joué satisfait-il l'objectif ?
 *
 * On juge le RÉSULTAT, pas la conformité à un coup écrit d'avance : il y a
 * souvent plusieurs façons correctes de mater ou d'atteindre une case, et
 * refuser une bonne solution parce qu'elle n'était pas prévue est le plus
 * sûr moyen de décourager.
 */
export function evaluerTentative(exercice: Exercice, uci: string): Verdict {
  let jeu: Chess;
  let coup;
  try {
    jeu = new Chess(exercice.fen);
    coup = jeu.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
  } catch {
    return { reussi: false, message: 'Ce coup n’est pas légal dans cette position.' };
  }
  if (!coup) return { reussi: false, message: 'Ce coup n’est pas légal dans cette position.' };

  const o = exercice.objectif;
  switch (o.type) {
    case 'mat':
      return jeu.isCheckmate()
        ? { reussi: true, message: 'Échec et mat.' }
        : {
            reussi: false,
            message: jeu.isCheck()
              ? 'C’est un échec, mais le roi peut encore s’en sortir.'
              : 'Ce coup ne donne pas mat.',
          };

    case 'atteindre':
      return coup.to === o.case
        ? { reussi: true, message: 'C’est la bonne case.' }
        : { reussi: false, message: `Il faut arriver en ${o.case}.` };

    case 'capturer':
      return coup.captured && coup.to === o.case
        ? { reussi: true, message: 'Pièce capturée.' }
        : { reussi: false, message: `Il faut capturer la pièce en ${o.case}.` };

    case 'roque':
      return coup.san === (o.cote === 'petit' ? 'O-O' : 'O-O-O')
        ? { reussi: true, message: 'Roque effectué.' }
        : { reussi: false, message: 'Ce coup n’est pas le roque demandé.' };

    case 'promotion':
      return coup.promotion
        ? { reussi: true, message: 'Pion promu.' }
        : { reussi: false, message: 'Le pion doit atteindre la dernière rangée.' };

    case 'coup-legal':
      return { reussi: true, message: 'Coup légal : la contrainte est respectée.' };

    case 'gain-materiel': {
      // On mesure ce que le coup rapporte VRAIMENT : après la meilleure
      // réponse adverse, le matériel doit avoir basculé d'au moins `minimum`.
      const gain = gainApresMeilleureReponse(exercice.fen, uci);
      return gain >= o.minimum
        ? { reussi: true, message: 'Le matériel est gagné.' }
        : {
            reussi: false,
            message:
              gain > 0
                ? 'Ce coup gagne quelque chose, mais il y a nettement mieux.'
                : 'Ce coup ne gagne pas de matériel.',
          };
    }

    default:
      return { reussi: false, message: 'Objectif inconnu.' };
  }
}

const VALEURS: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Bilan matériel du camp au trait dans `fen`, après le coup et la meilleure réponse. */
function gainApresMeilleureReponse(fen: string, uci: string): number {
  const depart = new Chess(fen);
  const monCamp = depart.turn();
  const compter = (j: Chess) => {
    let t = 0;
    for (const rangee of j.board()) {
      for (const c of rangee) {
        if (!c) continue;
        t += c.color === monCamp ? VALEURS[c.type] : -VALEURS[c.type];
      }
    }
    return t;
  };
  const avant = compter(depart);

  const apres = new Chess(fen);
  try {
    apres.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
  } catch {
    return 0;
  }

  if (apres.isCheckmate()) return 100;

  // Réponse adverse : celle qui limite le mieux les dégâts, c'est-à-dire
  // celle qui laisse le meilleur bilan au défenseur.
  let pire = Infinity;
  for (const reponse of apres.moves({ verbose: true })) {
    const suite = new Chess(apres.fen());
    suite.move(reponse.san);
    // Puis notre meilleure prise immédiate, si elle existe.
    let meilleur = compter(suite);
    for (const prise of suite.moves({ verbose: true })) {
      if (!prise.captured) continue;
      const apresPrise = new Chess(suite.fen());
      apresPrise.move(prise.san);
      meilleur = Math.max(meilleur, compter(apresPrise));
    }
    pire = Math.min(pire, meilleur);
  }

  return (pire === Infinity ? compter(apres) : pire) - avant;
}
