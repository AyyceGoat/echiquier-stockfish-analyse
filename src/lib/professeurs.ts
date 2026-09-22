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
  /** Ce qu'il dit en s'asseyant, avant le premier coup. */
  salutation: string;
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
    salutation:
      'Asseyez-vous. Je ne commente pas pour vous faire plaisir, je commente pour que vous progressiez. Prenez l’initiative dès le premier coup — c’est elle que je regarde, et c’est elle que vous allez apprendre à garder.',
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
    salutation:
      'Bonjour. On va travailler dans l’ordre : le roi d’abord, la structure ensuite, la tactique en dernier. Je vous dirai à chaque coup ce qui tient et ce qui ne tient pas. À vous de jouer.',
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
    salutation:
      'Bonjour ! Alors, on y va. Je ne vous laisserai rien passer, mais je ne vous laisserai pas tomber non plus. Jouez votre coup, et regardez bien ce que fait l’adversaire — c’est là que tout se joue.',
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
    salutation:
      'Bonjour, bonjour. Vous savez qu’on a retrouvé des échiquiers dans des tombes égyptiennes vieilles de trois mille ans ? Enfin, ce n’étaient pas tout à fait des échecs… Bref. Jouez votre premier coup, je vous suis.',
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
  /** Variante recommandée, en SAN. Sert à donner une ligne aux joueurs avancés. */
  varianteSan: string[];
  /**
   * Meilleure réponse de l'adversaire à ce qui vient d'être joué.
   * C'est elle qui permet de dire ce qui est MENACÉ, au lieu de se contenter
   * de constater la faute.
   */
  reponseAdverseSan: string | null;
  /** Perte en centipions, pour doser le ton. */
  perteCp: number;
  /** Explication factuelle produite à partir de l'analyse de Stockfish. */
  explication: Explication;
  /** Niveau déclaré de l'élève : décide du vocabulaire ET de la profondeur. */
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

/** Les paliers où l'on explique un principe plutôt qu'une variante. */
const SIMPLE: NiveauEleve[] = ['decouverte', 'debutant'];
/** Les paliers à qui l'on donne une ligne concrète. */
const AVANCE: NiveauEleve[] = ['avance', 'confirme'];

/* --------------------------------------------------------------------------
   LA MATIÈRE : ce qu'il y a à dire, indépendamment de qui le dit.
   -------------------------------------------------------------------------- */

/**
 * Pourquoi le coup est fautif, selon le motif.
 *
 * Deux registres, et c'est là que se joue l'adaptation au niveau : à un
 * débutant on explique le mécanisme avec des mots de tous les jours, à un
 * joueur avancé on nomme la chose et on passe à la suite. Servir le même
 * texte aux deux serait refaire l'erreur des paliers du moteur, où tout le
 * monde jouait à 1320.
 */
const POURQUOI: Record<MotifExplication, { simple: string; technique: string }> = {
  'piece-en-prise': {
    simple:
      'Une pièce que personne ne défend peut être prise gratuitement. Avant de poser la main, regardez ce que l’adversaire attaque.',
    technique: 'La pièce reste sans défenseur sur une case que l’adversaire contrôle.',
  },
  'occasion-manquee': {
    simple:
      'Il y avait un coup qui gagnait du matériel, et il est parti. Cherchez toujours les prises et les échecs avant de choisir.',
    technique: 'La ressource tactique s’évapore après ce coup ; elle ne reviendra pas.',
  },
  'menace-ignoree': {
    simple:
      'L’adversaire préparait quelque chose et vous avez joué ailleurs. Une menace ne disparaît pas parce qu’on regarde autre chose.',
    technique: 'La menace n’est ni parée, ni contre-attaquée, ni compensée.',
  },
  fourchette: {
    simple:
      'Une même pièce peut en attaquer deux à la fois. On ne peut en sauver qu’une.',
    technique: 'Double attaque : les deux pièces visées ne peuvent être défendues simultanément.',
  },
  clouage: {
    simple:
      'Une pièce clouée ne peut pas bouger sans exposer ce qu’elle protège derrière elle.',
    technique: 'Le clouage immobilise la pièce sur la ligne d’attaque.',
  },
  enfilade: {
    simple:
      'Deux pièces alignées : la première doit s’écarter, et la seconde tombe.',
    technique: 'Enfilade sur la ligne : la pièce de valeur devant cède celle de derrière.',
  },
  'mat-manque': {
    simple: 'Il y avait un mat. Un mat ne se rattrape pas au coup suivant.',
    technique: 'La séquence de mat est perdue ; l’avantage retombe au matériel.',
  },
  'mat-subi': {
    simple: 'Ce coup laisse l’adversaire mater. Le roi doit toujours passer avant le reste.',
    technique: 'La configuration de mat devient forcée.',
  },
  'coup-force': {
    simple: 'Il n’y avait rien d’autre à jouer.',
    technique: 'Coup unique : la position ne laissait pas d’alternative.',
  },
  passif: {
    simple:
      'Ce coup ne fait rien. Il ne prend rien, ne menace rien, ne développe rien — et pendant ce temps l’adversaire avance.',
    technique: 'Coup passif : ni gain d’espace, ni développement, ni menace.',
  },
  'sans-consequence': {
    simple: 'Ce coup ne change pas grand-chose à la position.',
    technique: 'Aucun effet mesurable sur l’évaluation.',
  },
};

/** Le principe à retenir, pour les paliers où l'on enseigne une règle. */
const PRINCIPE: Partial<Record<MotifExplication, string>> = {
  'piece-en-prise': 'Après chaque coup adverse, demandez-vous : qu’est-ce qui est attaqué ?',
  'occasion-manquee': 'Regardez d’abord les prises, puis les échecs, puis le reste.',
  'menace-ignoree': 'On ne construit pas son plan tant que la menace adverse n’est pas réglée.',
  fourchette: 'Méfiez-vous du cavalier : c’est lui qui attaque deux pièces à la fois.',
  clouage: 'Ne mettez pas deux pièces de valeur sur la même ligne que votre roi.',
  'mat-subi': 'Mettez le roi à l’abri avant d’ouvrir la position.',
  passif: 'Chaque coup doit faire quelque chose : développer, attaquer, ou améliorer une pièce.',
};

/* --------------------------------------------------------------------------
   LA VOIX : comment chacun le dit.
   -------------------------------------------------------------------------- */

const OUVERTURES: Record<string, { faute: string[]; bon: string[] }> = {
  'homme-ultime': {
    faute: [
      'Non.',
      'C’est une erreur, et vous le saviez en jouant.',
      'Vous venez de rendre l’initiative.',
      'Ce coup ne mérite pas d’être discuté longtemps.',
    ],
    bon: ['C’est le coup.', 'Correct.', 'Rien à reprendre.', 'Voilà comment on garde la main.'],
  },
  ephraim: {
    faute: [
      'Reprenons depuis la structure.',
      'Il y a un problème ici, et il n’est pas tactique.',
      'Ce coup coûte plus qu’il ne rapporte.',
      'Arrêtons-nous une seconde.',
    ],
    bon: ['Bien.', 'C’est le bon ordre.', 'Solide.', 'La structure tient, continuez.'],
  },
  johana: {
    faute: [
      'Attention.',
      'Là, vous êtes allé trop vite.',
      'Vous pouviez faire mieux, et je pense que vous le sentiez.',
      'Bon. On regarde ensemble.',
    ],
    bon: [
      'Voilà.',
      'C’est exactement ça.',
      'Vous avez vu juste, et c’est ce qui compte.',
      'Très bien. Continuez comme ça.',
    ],
  },
  serena: {
    faute: ['Hmm.', 'Ah, c’est dommage.', 'Voyons voir.', 'Attendez.'],
    bon: ['Joli.', 'Très bien vu.', 'C’est le genre de coup qui fait plaisir.', 'Parfait.'],
  },
};

/** Manière d'annoncer le meilleur coup. */
const CORRECTION: Record<string, (m: string) => string> = {
  'homme-ultime': (m) => `${m} était le coup. Pas le meilleur parmi d’autres : le seul.`,
  ephraim: (m) => `${m} d’abord. C’est l’ordre qui compte, et il commence là.`,
  johana: (m) => `Il fallait jouer ${m}. Regardez-le bien, vous le retrouverez.`,
  serena: (m) => `${m}, et tout se remet d’aplomb.`,
};

/** Manière d'annoncer ce que l'adversaire menace maintenant. */
const MENACE: Record<string, (r: string) => string> = {
  'homme-ultime': (r) => `Il joue ${r} et vous subissez. Vous n’aviez pas à en arriver là.`,
  ephraim: (r) => `Attendez-vous à ${r} : c’est la suite naturelle, et elle est désagréable.`,
  johana: (r) => `Maintenant il va jouer ${r}. Anticipez-le, ne le découvrez pas.`,
  serena: (r) => `Et il ne va pas se gêner : ${r} arrive.`,
};

const CLOTURES: Record<string, string[]> = {
  'homme-ultime': [
    'Reprenez l’initiative maintenant, ou cette partie est déjà écrite.',
    'Je ne le répéterai pas.',
    'Jouez le coup qui force, pas celui qui rassure.',
  ],
  ephraim: [
    'Sécurisez d’abord, ouvrez ensuite. Dans cet ordre.',
    'La structure commande, la tactique suit.',
    'Reprenez le plan là où vous l’avez laissé.',
  ],
  johana: [
    'Ne reculez pas parce que ça vous paraît trop beau. Jouez-le.',
    'Vous en êtes capable, alors allez au bout.',
    'Ce n’est pas grave. Ce qui compte, c’est de le voir la prochaine fois.',
  ],
  serena: ['Bref — revenons à la position.', 'Enfin, tout ça pour dire : regardez la position.'],
};

/**
 * Les digressions de Serena.
 *
 * Elle est la seule à en avoir, et c'est son trait principal. Elles sont
 * choisies selon le motif détecté, pour que le détour garde un rapport avec
 * la position : elle prend le chemin long, elle ne raconte pas n'importe
 * quoi. Elles sont volontairement longues — c'est le personnage.
 */
const DIGRESSIONS: Partial<Record<MotifExplication, string[]>> = {
  'piece-en-prise': [
    'Vous savez, Capablanca prétendait n’avoir jamais étudié une seule ouverture. Ce qu’il faisait, à chaque coup, c’était compter les défenseurs. Rien d’autre. Il est devenu champion du monde avec cette seule habitude, et il a perdu une trentaine de parties en trente ans de carrière.',
    'À La Havane, on joue encore dans la rue, sur des pendules cassées et des échiquiers dont il manque des pièces — un bouchon fait la tour. La première chose qu’on y apprend aux enfants n’est pas une ouverture : c’est de regarder ce qui est défendu avant de toucher quoi que ce soit.',
  ],
  'occasion-manquee': [
    'Tal disait qu’il voyait les combinaisons avant de savoir pourquoi elles fonctionnaient ; il calculait ensuite, par acquit de conscience. On n’est pas obligé d’avoir son génie, mais on est obligé de regarder — c’est gratuit.',
    'Il y a cette partie de Morphy, à l’Opéra de Paris en 1858, dans la loge du duc de Brunswick. Il jouait entre deux actes, distrait, contre deux amateurs qui se consultaient. Il a tout sacrifié en dix-sept coups. La leçon n’est pas le sacrifice : c’est qu’il regardait les pièces adverses pendant qu’eux regardaient les leurs.',
  ],
  fourchette: [
    'Les Russes appellent la fourchette du cavalier « la pique ». Dans leurs écoles, on l’enseigne avant le roque — avant, oui. Ils considèrent qu’un enfant qui ne voit pas une fourchette n’a rien à faire sur un échiquier.',
    'On dit que le cavalier fait perdre les débutants et gagner les maîtres. C’est la même pièce ; toute la différence tient à qui voit la fourchette en premier.',
  ],
  'menace-ignoree': [
    'Nimzowitsch a écrit tout un livre autour de cette idée qu’une menace non traitée ne s’évapore pas. Il était insupportable, se plaignait de tout, et il avait raison sur ce point précis.',
  ],
  'mat-manque': [
    'Chez Greco, au dix-septième siècle, on trouve des mats qui traînaient dans des positions que personne ne regardait. Il les notait pour les vendre à des nobles italiens. Les mats sont restés ; les nobles, beaucoup moins.',
  ],
  passif: [
    'Steinitz soutenait qu’un avantage doit être exploité sous peine d’être perdu. On l’a pris pour un dogmatique. Il avait simplement remarqué qu’une position ne reste jamais immobile : si vous ne l’améliorez pas, quelqu’un d’autre s’en charge.',
  ],
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
 * Il ne réinvente aucune analyse. Il assemble, dans la voix du professeur,
 * ce que Stockfish et `explications.ts` ont établi : le constat, le coup
 * qu'il fallait jouer, la raison, et ce que l'adversaire menace ensuite.
 *
 * La construction suit toujours le même ordre — constat, correction, raison,
 * menace, puis principe ou variante selon le niveau. C'est cet ordre qui
 * rend le commentaire utilisable : dire la menace avant la correction
 * obligerait à relire.
 */
export const commentaireLocal: MoteurCommentaire = {
  id: 'local',
  nom: 'Commentaire local',
  enLigne: false,

  async commenter(prof, ctx) {
    const estFaute = FAUTES.includes(ctx.classement);
    const simple = SIMPLE.includes(ctx.eleve);
    const avance = AVANCE.includes(ctx.eleve);
    const motif = ctx.explication.motif;
    const graine = `${prof.id}|${ctx.coupSan}|${ctx.classement}|${ctx.eleve}`;

    const morceaux: string[] = [];

    // 1. Ouverture, dans la voix du professeur.
    const registre = OUVERTURES[prof.id] ?? OUVERTURES.ephraim;
    morceaux.push(piocher(estFaute ? registre.faute : registre.bon, graine));

    // 2. Digression de Serena — avant le fond, c'est son mouvement naturel.
    let aDigresse = false;
    if (prof.id === 'serena') {
      const d = motif ? DIGRESSIONS[motif] : undefined;
      // Elle digresse largement sur les fautes, et de temps en temps ailleurs.
      if (d && (estFaute || ctx.classement === 'excellent')) {
        morceaux.push(piocher(d, graine));
        aDigresse = true;
      }
    }

    // 3. Constat : ce que l'analyse a établi.
    morceaux.push(ctx.explication.phrase);

    // 4. Le coup qu'il fallait jouer, et pourquoi.
    if (estFaute && ctx.meilleurSan) {
      morceaux.push((CORRECTION[prof.id] ?? ((m: string) => `Il y avait ${m}.`))(ctx.meilleurSan));
      if (motif) {
        const p = POURQUOI[motif];
        if (p) morceaux.push(simple ? p.simple : p.technique);
      }
    }

    // 5. Le complément technique, réservé à qui le comprend.
    if (ctx.explication.complement && !simple) morceaux.push(ctx.explication.complement);

    // 6. Ce que l'adversaire menace maintenant. C'est ce qui manquait le
    //    plus : sans cela, le commentaire décrit le passé et n'aide pas au
    //    coup suivant.
    if (estFaute && ctx.reponseAdverseSan) {
      morceaux.push((MENACE[prof.id] ?? ((r: string) => `Il menace ${r}.`))(ctx.reponseAdverseSan));
    }

    // 7. Principe pour les débutants, variante pour les avancés.
    if (estFaute) {
      if (simple && motif && PRINCIPE[motif]) {
        morceaux.push(`À retenir : ${PRINCIPE[motif]}`);
      } else if (avance && ctx.varianteSan.length >= 2) {
        morceaux.push(`La suite : ${ctx.varianteSan.slice(0, 6).join(' ')}.`);
      }
    }

    // 8. Clôture, dans la voix. Serena ne referme son détour que si elle en
    //    a pris un.
    if (estFaute && (prof.id !== 'serena' || aDigresse)) {
      morceaux.push(piocher(CLOTURES[prof.id] ?? [''], graine));
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
