/**
 * Les quatre professeurs.
 *
 * Un professeur, ici, c'est trois choses :
 *   - une identité et un portrait ;
 *   - un niveau de prédilection, qui désigne les ÉLÈVES qu'il accompagne et
 *     la force à laquelle il joue contre eux — pas sa propre force : les
 *     quatre sont des joueurs très forts ;
 *   - une voix, c'est-à-dire une façon de dire la même analyse.
 *
 * Architecture du commentaire — pourquoi cette forme :
 *
 * `MoteurCommentaire` est une interface à une seule méthode. L'implémentation
 * livrée (`commentaireLocal`) ne fait aucun appel réseau : elle re-voise ce
 * que `explications.ts` a déjà produit à partir de l'analyse de Stockfish.
 * Aucune clé, aucun service, fonctionne hors ligne.
 *
 * Le jour où l'on voudra un vrai modèle de langage, il suffira d'ajouter une
 * seconde implémentation qui appelle une fonction serverless, derrière la
 * MÊME interface. C'est exactement le patron déjà employé pour la
 * reconnaissance de position (`src/recognition/types.ts`), qui expose deux
 * implémentations interchangeables choisies dans les réglages. Le patron est
 * donc éprouvé dans ce dépôt, et l'écran de jeu n'aura pas à changer.
 */

import type { Classement } from './classification.ts';
import type { Explication, MotifExplication } from './explications.ts';

/* ==========================================================================
   NIVEAU DE L'ÉLÈVE
   ========================================================================== */

export type NiveauEleve = 'decouverte' | 'debutant' | 'intermediaire' | 'avance' | 'confirme';

export const NIVEAUX_ELEVE: { id: NiveauEleve; libelle: string; detail: string }[] = [
  { id: 'decouverte', libelle: 'Je découvre', detail: 'Je connais à peine les règles.' },
  { id: 'debutant', libelle: 'Débutant', detail: 'Je joue, mais je perds des pièces.' },
  { id: 'intermediaire', libelle: 'Intermédiaire', detail: 'Je vois les tactiques simples.' },
  { id: 'avance', libelle: 'Avancé', detail: 'Je joue en club ou en ligne régulièrement.' },
  { id: 'confirme', libelle: 'Confirmé', detail: 'Je cherche un vrai adversaire.' },
];

/** Palier moteur visé par niveau d'élève, avant bornage par le professeur. */
const PALIER_POUR_ELEVE: Record<NiveauEleve, string> = {
  decouverte: 'grand-debutant',
  debutant: 'debutant',
  intermediaire: 'amateur',
  avance: 'club',
  confirme: 'fort',
};

/** Ordre de l'échelle, pour borner un palier dans l'intervalle d'un prof. */
const ECHELLE = ['grand-debutant', 'debutant', 'amateur', 'club', 'fort', 'expert', 'maximum'];

/* ==========================================================================
   FICHES
   ========================================================================== */

export interface FicheProfesseur {
  id: string;
  nom: string;
  /** Une formule courte, affichée sous le nom. */
  role: string;
  /** Couleur d'accent, reprise du jeu de couleurs de l'application. */
  accent: string;
  /** Ce que le professeur apporte, en une phrase. */
  presentation: string;
  /** Élèves accompagnés, en clair. */
  eleves: string;
  /** Bornes de l'échelle moteur dans lesquelles il joue. */
  palierMin: string;
  palierMax: string;
  /**
   * Images de bouche, si elles existent un jour.
   *
   * Vide aujourd'hui : sur les portraits actuels, simuler l'ouverture de la
   * bouche par transformation produit une fente sombre à bords francs, et le
   * cure-dent d'Ephraim se détache de sa lèvre dès qu'elle bouge. Tant que ce
   * tableau est vide, l'interface se contente du halo pendant la parole.
   * Dès qu'on y met les variantes « entrouverte » et « ouverte », le portrait
   * les alterne automatiquement, sans autre changement.
   */
  bouches: string[];
}

export const PROFESSEURS: FicheProfesseur[] = [
  {
    id: 'homme-ultime',
    nom: 'L’Homme Ultime',
    role: 'Le souverain',
    accent: 'var(--color-accent)',
    presentation:
      'Corrige sans ménagement. Ne console jamais, ne doute jamais, et ne répète pas deux fois.',
    eleves: 'Joueurs confirmés',
    palierMin: 'fort',
    palierMax: 'maximum',
    bouches: [],
  },
  {
    id: 'ephraim',
    nom: 'Ephraim',
    role: 'L’entraîneur',
    accent: 'var(--color-info)',
    presentation:
      'Précis et méthodique. Remonte toujours à la structure, et donne les coups dans l’ordre.',
    eleves: 'Niveau club',
    palierMin: 'amateur',
    palierMax: 'fort',
    bouches: [],
  },
  {
    id: 'johana',
    nom: 'Johana',
    role: 'L’exigeante',
    accent: 'var(--color-succes)',
    presentation:
      'Directe et bienveillante. Exige que vous alliez au bout, sans jamais vous prendre par la main.',
    eleves: 'Débutants',
    palierMin: 'grand-debutant',
    palierMax: 'amateur',
    bouches: [],
  },
  {
    id: 'serena',
    nom: 'Serena',
    role: 'L’érudite',
    accent: 'var(--color-rare)',
    presentation:
      'Cultivée et curieuse. Passe par l’histoire du jeu et par le monde avant de revenir à la position — mais elle y revient toujours.',
    eleves: 'Joueurs intermédiaires',
    palierMin: 'debutant',
    palierMax: 'club',
    bouches: [],
  },
];

export const PROFESSEUR_PAR_DEFAUT = 'ephraim';

export function professeurParId(id: string): FicheProfesseur {
  return (
    PROFESSEURS.find((p) => p.id === id) ??
    PROFESSEURS.find((p) => p.id === PROFESSEUR_PAR_DEFAUT)!
  );
}

/**
 * Palier moteur auquel ce professeur joue contre cet élève.
 * Le niveau déclaré par l'élève décide ; les bornes du professeur cadrent.
 */
export function palierDuProfesseur(prof: FicheProfesseur, eleve: NiveauEleve): string {
  const vise = ECHELLE.indexOf(PALIER_POUR_ELEVE[eleve]);
  const bas = ECHELLE.indexOf(prof.palierMin);
  const haut = ECHELLE.indexOf(prof.palierMax);
  return ECHELLE[Math.min(haut, Math.max(bas, vise))];
}

/* ==========================================================================
   COMMENTAIRE
   ========================================================================== */

export interface ContexteCommentaire {
  classement: Classement;
  /** Coup joué, en notation algébrique. */
  coupSan: string;
  /** Meilleur coup, s'il y en avait un meilleur. */
  meilleurSan: string | null;
  /** Explication factuelle produite à partir de l'analyse de Stockfish. */
  explication: Explication;
  /** Niveau déclaré de l'élève : le professeur y adapte son vocabulaire. */
  eleve: NiveauEleve;
}

export interface MoteurCommentaire {
  readonly id: string;
  readonly nom: string;
  /** Vrai si l'implémentation a besoin du réseau. */
  readonly enLigne: boolean;
  commenter(prof: FicheProfesseur, ctx: ContexteCommentaire): Promise<string>;
}

/** Les classements qui désignent une faute. */
const FAUTES: Classement[] = ['imprecision', 'erreur', 'gaffe'];

/** Ouvertures de phrase, par professeur et par registre. */
const OUVERTURES: Record<string, { faute: string[]; bon: string[] }> = {
  'homme-ultime': {
    faute: ['Non.', 'C’est une erreur.', 'Vous venez de rendre l’initiative.'],
    bon: ['C’est le coup.', 'Correct.', 'Rien à reprendre.'],
  },
  ephraim: {
    faute: ['Reprenons.', 'Il y a un problème de structure ici.', 'Ce coup coûte plus qu’il ne rapporte.'],
    bon: ['Bien.', 'C’est le bon ordre.', 'Solide.'],
  },
  johana: {
    faute: ['Attention.', 'Là, vous vous êtes précipité.', 'Vous pouviez faire mieux, et vous le savez.'],
    bon: ['Voilà.', 'C’est exactement ça.', 'Vous avez vu juste.'],
  },
  serena: {
    faute: ['Hmm.', 'Ah, c’est dommage.', 'Voyons.'],
    bon: ['Joli.', 'Très bien vu.', 'C’est le genre de coup qui fait plaisir.'],
  },
};

/**
 * Digressions de Serena.
 *
 * Elle est la seule à en avoir : c'est sa caractéristique. Elles sont
 * choisies en fonction du motif détecté, pour que le détour ait tout de même
 * un rapport avec la position — elle prend le chemin long, elle ne raconte
 * pas n'importe quoi.
 */
const DIGRESSIONS: Partial<Record<MotifExplication, string[]>> = {
  'piece-en-prise': [
    'Vous savez, Capablanca disait qu’il n’avait jamais étudié une ouverture de sa vie ; il regardait simplement si ses pièces étaient défendues. C’était sa seule règle, et elle lui a suffi jusqu’au titre mondial.',
    'À La Havane, on joue encore dans la rue, sur des pendules cassées, et la première chose qu’on apprend aux enfants là-bas n’est pas une ouverture : c’est de compter les défenseurs.',
  ],
  'occasion-manquee': [
    'Tal racontait qu’il voyait les combinaisons avant de savoir pourquoi elles marchaient. Il calculait ensuite, pour la forme. On n’est pas obligé d’aller jusque-là, mais il faut regarder.',
    'Il y a une partie de Morphy, à l’Opéra de Paris en 1858, où il sacrifie presque tout en douze coups. Il jouait entre deux actes, distrait. C’est ce genre d’occasion qu’on laisse passer quand on regarde ses propres pièces au lieu de celles d’en face.',
  ],
  fourchette: [
    'La fourchette du cavalier, les Russes l’appellent « la pique ». C’est la première chose qu’on enseigne dans les écoles là-bas, avant même le roque.',
    'On dit que le cavalier est la pièce qui fait perdre les débutants et gagner les maîtres. La différence tient entièrement à qui voit la fourchette en premier.',
  ],
  'mat-manque': [
    'Il y a chez Greco, au dix-septième siècle, des mats qui traînent dans des positions que personne ne regardait. Il les notait pour les vendre à des nobles. Les mats sont restés, pas les nobles.',
  ],
};

const CONSEILS_FIN: Record<string, string> = {
  'homme-ultime': 'Reprenez l’initiative, ou cette partie est déjà écrite.',
  ephraim: 'Sécurisez d’abord, ouvrez ensuite. Dans cet ordre.',
  johana: 'Ne reculez pas parce que ça vous paraît trop beau. Jouez-le.',
  serena: 'Bref — revenons à la position.',
};

/** Choix déterministe dans une liste, à partir d'une chaîne. */
function piocher<T>(liste: T[], graine: string): T {
  let h = 0;
  for (let i = 0; i < graine.length; i++) h = (h * 31 + graine.charCodeAt(i)) | 0;
  return liste[Math.abs(h) % liste.length];
}

/**
 * Commentaire local : aucune requête, aucune clé, fonctionne hors ligne.
 *
 * Il ne réinvente aucune analyse. Il reprend la phrase produite par
 * `explications.ts` — qui, elle, vient de la géométrie de la position et de
 * ce que Stockfish a renvoyé — et la met dans la bouche du professeur.
 */
export const commentaireLocal: MoteurCommentaire = {
  id: 'local',
  nom: 'Commentaire local',
  enLigne: false,

  async commenter(prof, ctx) {
    const estFaute = FAUTES.includes(ctx.classement);
    const registre = OUVERTURES[prof.id] ?? OUVERTURES.ephraim;
    const graine = `${prof.id}|${ctx.coupSan}|${ctx.classement}`;
    const ouverture = piocher(estFaute ? registre.faute : registre.bon, graine);

    const morceaux: string[] = [];

    // Serena ouvre par sa digression, quand le motif s'y prête. Les autres
    // vont droit au fait.
    let aDigresse = false;
    if (prof.id === 'serena' && estFaute) {
      const d = ctx.explication.motif ? DIGRESSIONS[ctx.explication.motif] : undefined;
      if (d) {
        morceaux.push(piocher(d, graine));
        aDigresse = true;
      }
    }

    morceaux.push(ouverture);
    morceaux.push(ctx.explication.phrase);

    // Le complément technique n'est donné qu'à partir d'un certain niveau :
    // « avant-poste » ou « colonne semi-ouverte » ne dit rien à un débutant.
    const assezAvance = ctx.eleve !== 'decouverte' && ctx.eleve !== 'debutant';
    if (ctx.explication.complement && (assezAvance || prof.id === 'ephraim')) {
      morceaux.push(ctx.explication.complement);
    }

    if (estFaute && ctx.meilleurSan) {
      const tournure: Record<string, string> = {
        'homme-ultime': `${ctx.meilleurSan} était le coup. Pas le meilleur : le seul.`,
        ephraim: `${ctx.meilleurSan} d’abord, et la position tient.`,
        johana: `Allez au bout : ${ctx.meilleurSan}.`,
        serena: `${ctx.meilleurSan}, et la position se remet d’aplomb.`,
      };
      morceaux.push(tournure[prof.id] ?? `Il y avait ${ctx.meilleurSan}.`);
    }

    // « Bref — revenons à la position » n'a de sens qu'après une digression.
    // Sans elle, Serena semblait s'excuser d'un détour qu'elle n'avait pas
    // pris.
    if (estFaute && (prof.id !== 'serena' || aDigresse)) {
      morceaux.push(CONSEILS_FIN[prof.id] ?? '');
    }

    return morceaux.filter(Boolean).join(' ');
  },
};

/**
 * Emplacement de la future implémentation en ligne.
 *
 * Elle appellera une fonction serverless — qui détiendra la clé, comme celle
 * de la reconnaissance d'image — et se déclarera ici. L'écran de jeu ne
 * distingue pas les deux : il demande un commentaire à `moteurCommentaire()`
 * et affiche ce qui revient.
 */
export function moteursCommentaire(): MoteurCommentaire[] {
  return [commentaireLocal];
}

export function moteurCommentaire(id?: string): MoteurCommentaire {
  return moteursCommentaire().find((m) => m.id === id) ?? commentaireLocal;
}
