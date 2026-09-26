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
import {
  COUP_GARDE,
  FIN_BEAU_COUP,
  INTERROMPU,
  REACTIONS,
  REPRISE_ACCORDEE,
  FIN_CONSEIL,
  FIN_OUVERTURES,
  FIN_PIVOT,
  LECON_MOTIF,
  SALUTATIONS,
  type IssuePartie,
} from './repertoireProfesseurs.ts';
import type { MemoirePhrases } from './memoirePhrases.ts';
import { decrireCoup, decrireMeilleur, phraseDeFond, sansCoordonnees } from './parole.ts';
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
   * Ce qu'il dit en s'asseyant, avant le premier coup.
   *
   * Conservé pour compatibilité, mais c'est `salutationDe` qu'il faut
   * appeler : une salutation unique se reconnaissait dès la deuxième partie.
   */
  salutation: string;
  /**
   * États de bouche disponibles, dans l'ordre d'ouverture croissante.
   *
   * Ce ne sont PAS des portraits complets. Mesuré par
   * `scripts/controler-bouches.mjs`, les rendus « entrouverte » et
   * « ouverte » diffèrent du portrait de base sur tout le visage — deux à
   * quatre niveaux sur 255, yeux et cheveux compris. Échanger l'image
   * entière ferait donc vibrer le visage à chaque syllabe.
   *
   * On ne garde que la région de la bouche, découpée en ellipse à bord fondu
   * par `preparer-portraits.mjs` et posée sur le portrait immobile, à la
   * boîte donnée par `boiteBouche`. Au bord de la pastille l'alpha vaut zéro :
   * le pixel affiché est exactement celui du portrait, donc aucune couture.
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
    bouches: [
      '/profs/homme-ultime-bouche-entrouverte.webp',
      '/profs/homme-ultime-bouche-ouverte.webp',
    ],
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
    bouches: [
      '/profs/ephraim-bouche-entrouverte.webp',
      '/profs/ephraim-bouche-ouverte.webp',
    ],
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
    bouches: [
      '/profs/johana-bouche-entrouverte.webp',
      '/profs/johana-bouche-ouverte.webp',
    ],
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
    bouches: [
      '/profs/serena-bouche-entrouverte.webp',
      '/profs/serena-bouche-ouverte.webp',
    ],
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
  /** Coup joué, en notation algébrique. Sert à l'affichage, jamais à la voix. */
  coupSan: string;
  /**
   * Position d'où le coup a été joué.
   *
   * Elle permet de nommer les pièces plutôt que de citer des coordonnées :
   * « votre cavalier » se comprend et se prononce, « Cg6 » ni l'un ni l'autre.
   */
  fenAvant?: string;
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
  /**
   * Évaluation APRÈS le coup, en centipions, du point de vue de l'élève.
   *
   * Sans elle, le professeur félicitait un élève sur le point d'être maté :
   * un coup peut être le meilleur disponible et la position rester perdue.
   * Le ton doit suivre la position, pas seulement la qualité du coup.
   */
  cpApres: number;
  /**
   * Tournures déjà employées dans cette partie.
   *
   * Sans cet historique, la même formulation revenait dix fois de suite.
   * Le tirage les écarte tant qu'il reste des variantes disponibles.
   */
  memoire?: MemoirePhrases;
}

export interface MoteurCommentaire {
  readonly id: string;
  readonly nom: string;
  /** Vrai si l'implémentation a besoin du réseau. */
  readonly enLigne: boolean;
  commenter(prof: FicheProfesseur, ctx: ContexteCommentaire): Promise<string>;
}



/* --------------------------------------------------------------------------
   LA MATIÈRE : ce qu'il y a à dire, indépendamment de qui le dit.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   LA VOIX : comment chacun le dit.
   -------------------------------------------------------------------------- */

/**
 * Le ton suit la POSITION, pas seulement la qualité du coup.
 *
 * Défaut corrigé : un élève sur le point d'être maté s'entendait féliciter
 * parce que son coup était le meilleur disponible. Un coup peut être le
 * meilleur ET la position rester perdue — le commentaire doit dire les deux.
 */
export type Situation = 'perdu' | 'difficile' | 'equilibre' | 'mieux' | 'gagnant';

export function situationDe(cp: number): Situation {
  if (cp <= -600) return 'perdu';
  if (cp <= -200) return 'difficile';
  if (cp < 200) return 'equilibre';
  if (cp < 600) return 'mieux';
  return 'gagnant';
}

/** Choix déterministe dans une liste, à partir d'une chaîne. */
function piocher<T>(liste: T[], graine: string): T {
  let h = 0;
  for (let i = 0; i < graine.length; i++) h = (h * 31 + graine.charCodeAt(i)) | 0;
  return liste[Math.abs(h) % liste.length];
}

/**
 * Tirage qui écarte les tournures déjà employées dans la partie.
 *
 * Sans cela, « ce coup était la meilleure continuation » revenait dix fois.
 * Si toutes les variantes ont servi, on repart de la liste complète plutôt
 * que de ne rien dire — mieux vaut une répétition tardive qu'un blanc.
 */
function piocherNeuf(liste: string[], graine: string, memoire?: MemoirePhrases): string {
  if (liste.length === 0) return '';
  const deja = memoire
    ? new Set([...memoire.dites, ...memoire.nouvelles, ...memoire.partie])
    : new Set<string>();
  const restantes = liste.filter((t) => !deja.has(t));
  const choisie = piocher(restantes.length > 0 ? restantes : liste, graine);
  // On note la tournure retenue : c'est elle, et non le commentaire
  // assemblé, qui constitue l'unité de répétition.
  if (memoire && choisie) memoire.nouvelles.push(choisie);
  return choisie;
}

/**
 * Salutation du professeur, sans répéter celle des parties précédentes.
 *
 * La graine dépend de l'horloge : deux parties lancées coup sur coup ne
 * doivent pas ouvrir de la même façon, et la mémoire écarte de toute façon
 * ce qui a déjà servi.
 */
export function salutationDe(prof: FicheProfesseur, memoire?: MemoirePhrases): string {
  const registre = SALUTATIONS[prof.id];
  if (!registre || registre.length === 0) return prof.salutation;
  return piocherNeuf(registre, `${prof.id}|${Date.now()}`, memoire);
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

  /**
   * Une réplique parlée : deux phrases courtes, aucune notation.
   *
   * L'assemblage précédent empilait ouverture, constat, correction, menace,
   * état de la position, principe et clôture — jusqu'à sept propositions,
   * truffées de « Cg6 » et de « Td1 ». À l'écrit dans un rapport, cela se
   * lit ; dit à voix haute pendant une partie, c'est un exposé, et la
   * synthèse vocale écorche la notation.
   *
   * On garde donc l'essentiel : une réaction brève dans la voix du
   * professeur, puis ce que le coup fait, en français. Le détail complet
   * reste disponible dans le rapport de fin de partie.
   */
  async commenter(prof, ctx) {
    const memoire = ctx.memoire;
    const graine = `${prof.id}|${ctx.coupSan}|${ctx.classement}|${ctx.eleve}`;
    const morceaux: string[] = [];

    // 1. Réaction, en deux ou trois mots.
    const registre = REACTIONS[prof.id] ?? REACTIONS.ephraim;
    const ton: 'bon' | 'faute' | 'grave' | 'neutre' =
      ctx.classement === 'gaffe'
        ? 'grave'
        : ctx.classement === 'erreur' || ctx.classement === 'imprecision'
          ? 'faute'
          : ctx.classement === 'theorie'
            ? 'neutre'
            : 'bon';
    morceaux.push(piocherNeuf(registre[ton], graine, memoire));

    // 2. Ce que le coup fait, traduit en français.
    const coup = ctx.fenAvant ? decrireCoup(ctx.fenAvant, ctx.coupSan) : null;
    const meilleur = ctx.fenAvant ? decrireMeilleur(ctx.fenAvant, ctx.meilleurSan) : null;
    morceaux.push(
      phraseDeFond({
        classement: ctx.classement,
        motif: ctx.explication.motif,
        coup,
        meilleur,
        eleve: ctx.eleve,
      }),
    );

    // 3. L'état de la position, et seulement quand il est tranché. Le répéter
    //    à chaque coup dans une partie équilibrée serait du remplissage.
    const situation = situationDe(ctx.cpApres);
    if (situation === 'perdu' || situation === 'gagnant') {
      const etat = ETAT_COURT[prof.id]?.[situation];
      if (etat) morceaux.push(piocherNeuf(etat, graine, memoire));
    }

    // Filet de sécurité : aucune coordonnée ne doit survivre jusqu'à la voix.
    return sansCoordonnees(morceaux.filter(Boolean).join(' '));
  },
};

/**
 * État de la position, en une phrase brève.
 *
 * L'ancien registre expliquait comment se défendre en deux propositions. Dit
 * à voix haute après chaque coup, c'était trop long ; la consigne détaillée
 * appartient au bilan de fin de partie.
 */
const ETAT_COURT: Record<string, Partial<Record<Situation, string[]>>> = {
  'homme-ultime': {
    perdu: ['C’est perdu. Défendez-vous.', 'Vous êtes perdu. Compliquez.', 'Position perdue. Ne donnez plus rien.'],
    gagnant: ['Vous dominez. Ne relâchez rien.', 'C’est gagnant. Convertissez.', 'La position est à vous.'],
  },
  ephraim: {
    perdu: ['La position est perdue. Compliquez.', 'C’est perdu ; jouez pour gêner.', 'Position intenable. Posez des problèmes.'],
    gagnant: ['Vous êtes gagnant. Simplifiez.', 'C’est gagné. Échangez les pièces.', 'Position nettement meilleure.'],
  },
  johana: {
    perdu: ['C’est très mauvais, mais on ne lâche pas.', 'Position perdue. Défendez-vous bien.', 'C’est perdu ; cherchez le coup qui gêne.'],
    gagnant: ['Vous êtes largement devant.', 'C’est gagnant. Restez concentré.', 'La partie est à vous.'],
  },
  serena: {
    perdu: ['La position est perdue. Compliquez.', 'C’est mauvais ; cherchez le désordre.', 'Perdue, autant se le dire.'],
    gagnant: ['Vous dominez largement.', 'C’est gagné, sauf accident.', 'Position magnifique.'],
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

/* ==========================================================================
   FIN DE PARTIE
   ========================================================================== */

/** Un coup saillant de la partie, retenu par l'assistance au fil des coups. */
export interface CoupMarquant {
  san: string;
  ply: number;
  perteCp: number;
  classement: Classement;
  motif?: MotifExplication;
}

export interface ContexteFin {
  /** Issue, du point de vue de l'ÉLÈVE. */
  issue: IssuePartie;
  /** Raison de fin telle que le jeu la nomme : mat, pat, répétition… */
  raison: string;
  /** Nombre de demi-coups joués. */
  nbCoups: number;
  /** La faute la plus coûteuse de l'élève, si l'assistance en a relevé une. */
  pireCoup: CoupMarquant | null;
  /** Son meilleur moment, pour ne pas ne retenir que le négatif. */
  beauCoup: CoupMarquant | null;
  eleve: NiveauEleve;
  memoire?: MemoirePhrases;
}

/** Numéro de coup affichable : « 24. » pour les blancs, « 24… » pour les noirs. */
function numeroDe(ply: number): string {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;
}

/**
 * Le mot de la fin, dans la voix du professeur.
 *
 * Défaut corrigé : une fois le mat tombé, le professeur commentait le dernier
 * coup comme si la partie continuait. Il lui manquait simplement de quoi
 * parler au passé — une ouverture propre à l'issue, le coup qui a fait
 * basculer la partie, et ce qu'il faut en retenir.
 *
 * Le coup charnière n'est pas recalculé : il vient du journal tenu par
 * l'écran de jeu, qui a évalué chaque coup de l'élève au moment où il le
 * jouait. C'est plus juste qu'une analyse d'après-coup, et instantané.
 */
export function commentaireFinPartie(prof: FicheProfesseur, ctx: ContexteFin): string {
  const memoire = ctx.memoire;
  const graine = `${prof.id}|fin|${ctx.issue}|${ctx.nbCoups}`;
  const morceaux: string[] = [];

  // 1. Ouverture propre à l'issue.
  const registre = FIN_OUVERTURES[prof.id] ?? FIN_OUVERTURES.ephraim;
  morceaux.push(piocherNeuf(registre[ctx.issue] ?? registre.nulle, graine, memoire));

  // 2. Le coup qui a fait basculer la partie, quand il y en a un.
  //    Seuil à un pion : en dessous, ce n'est pas un basculement, c'est une
  //    imprécision, et la désigner comme « le moment décisif » serait faux.
  if (ctx.pireCoup && ctx.pireCoup.perteCp >= 100) {
    const intro = piocherNeuf(FIN_PIVOT[prof.id] ?? [], graine, memoire);
    const pions = (ctx.pireCoup.perteCp / 100).toFixed(1).replace('.', ',');
    morceaux.push(
      `${intro} ${numeroDe(ctx.pireCoup.ply)} ${ctx.pireCoup.san}, qui coûte ${pions} pion${
        ctx.pireCoup.perteCp >= 200 ? 's' : ''
      }.`,
    );
    const lecon = ctx.pireCoup.motif ? LECON_MOTIF[ctx.pireCoup.motif] : undefined;
    if (lecon) morceaux.push(`La prochaine fois : ${lecon}.`);
  }

  // 3. Le meilleur moment, pour ne pas s'en tenir au négatif. Réservé aux
  //    parties perdues ou nulles : féliciter un vainqueur d'un bon coup isolé
  //    sonnerait condescendant.
  if (ctx.beauCoup && ctx.issue !== 'victoire') {
    const intro = piocherNeuf(FIN_BEAU_COUP[prof.id] ?? [], graine, memoire);
    morceaux.push(`${intro} ${numeroDe(ctx.beauCoup.ply)} ${ctx.beauCoup.san}.`);
  }

  // 4. Ce qu'il faut retenir.
  const conseils = FIN_CONSEIL[prof.id] ?? FIN_CONSEIL.ephraim;
  morceaux.push(piocherNeuf(ctx.issue === 'victoire' ? conseils.gagne : conseils.perdu, graine, memoire));

  return morceaux.filter(Boolean).join(' ');
}

/** Traduit un résultat PGN et le camp de l'élève en issue vécue. */
export function issueDe(resultat: string, monCamp: 'w' | 'b', raison: string): IssuePartie {
  if (/abandon/i.test(raison)) return 'abandon';
  if (resultat === '1/2-1/2' || resultat === '½-½') return 'nulle';
  if (resultat === '1-0') return monCamp === 'w' ? 'victoire' : 'defaite';
  if (resultat === '0-1') return monCamp === 'b' ? 'victoire' : 'defaite';
  return 'nulle';
}

/**
 * Tous les registres de phrases, réunis pour la pré-génération vocale.
 *
 * Ces tables sont privées au module : le générateur de voix ne les voyait
 * donc pas, et seules les cent quatre-vingt-une phrases du répertoire étaient
 * pré-générées. Or l'essentiel de ce qu'un professeur dit en cours de partie
 * vient d'ici. Une seule exportation agrégée suffit, plutôt que d'ouvrir
 * chaque table et d'élargir l'interface du module.
 */
export const REGISTRES_FIGES = {
  ETAT_COURT,
};

/* ==========================================================================
   RÉPLIQUES BRÈVES
   ========================================================================== */

/**
 * Ce que dit le professeur quand on joue pendant qu'il parle.
 *
 * Il s'interrompait et restait muet deux ou trois coups, ce qui donnait
 * l'impression qu'il avait décroché. Il reconnaît maintenant le coup, en
 * trois mots, avant d'enchaîner sur son commentaire.
 */
export function repliqueInterrompu(prof: FicheProfesseur, memoire?: MemoirePhrases): string {
  return piocherNeuf(INTERROMPU[prof.id] ?? [], `${prof.id}|coupe|${Date.now()}`, memoire);
}

/** Réponse au choix de reprendre le coup. */
export function repliqueReprise(prof: FicheProfesseur, memoire?: MemoirePhrases): string {
  return piocherNeuf(REPRISE_ACCORDEE[prof.id] ?? [], `${prof.id}|reprise|${Date.now()}`, memoire);
}

/** Réponse au choix de garder le coup. */
export function repliqueGarder(prof: FicheProfesseur, memoire?: MemoirePhrases): string {
  return piocherNeuf(COUP_GARDE[prof.id] ?? [], `${prof.id}|garder|${Date.now()}`, memoire);
}
