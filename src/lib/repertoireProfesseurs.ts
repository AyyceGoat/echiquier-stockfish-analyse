/**
 * Répertoire de phrases des quatre professeurs.
 *
 * Séparé de `professeurs.ts`, qui assemble les commentaires : ici il n'y a
 * que du texte, et c'est le volume qui compte. Un professeur qui redit la
 * même chose d'une partie à l'autre cesse d'être un personnage, et la
 * mémoire persistante (`memoirePhrases.ts`) ne sert à rien si les registres
 * sont trop courts pour qu'elle ait de quoi puiser.
 *
 * Ordre de grandeur retenu : au moins douze tournures par registre et par
 * professeur, soit de quoi tenir plusieurs parties complètes sans reprise.
 */

import type { MotifExplication } from './explications.ts';

/** Issue de la partie, du point de vue de l'ÉLÈVE. */
export type IssuePartie = 'victoire' | 'defaite' | 'nulle' | 'abandon';

/* --- Accueil --------------------------------------------------------------
   Une seule salutation par professeur ne tenait pas : trois parties de suite
   et l'illusion tombait. */
export const SALUTATIONS: Record<string, string[]> = {
  'homme-ultime': [
    'Asseyez-vous. Nous allons voir ce que vous savez faire.',
    'Bien. Montrez-moi votre jeu, je vous dirai ce qu’il vaut.',
    'Commençons. Je ne vous ménagerai pas, ce ne serait pas vous rendre service.',
    'À vous. Chaque coup compte, y compris le premier.',
    'Je regarde tout. Jouez comme si personne ne regardait.',
    'Une partie, et nous verrons où vous en êtes réellement.',
    'Prenez votre temps sur le premier coup. Il donne le ton.',
    'Nous y voilà. Pas d’excuses, pas de précipitation.',
    'Je vous écoute — par vos coups, s’entend.',
    'Allons-y. Ce qui m’intéresse, ce sont vos raisons, pas vos résultats.',
    'Vous avez les pièces, vous avez le trait. Faites-en quelque chose.',
    'Jouez. Je ne dirai rien tant qu’il n’y aura rien à dire.',
  ],
  ephraim: [
    'Bonjour. On va travailler dans l’ordre : le roi d’abord, la structure ensuite, la tactique en dernier.',
    'Bonjour. Une partie, et je commente chaque coup — ce qui tient et ce qui ne tient pas.',
    'On commence. Pensez « sécurité, structure, plan », toujours dans cet ordre.',
    'Bonjour. Ne cherchez pas le beau coup, cherchez le coup nécessaire.',
    'Prêt ? Je vous suis coup par coup, sans vous interrompre pour rien.',
    'Bonjour. Une bonne partie est une partie sans coup gratuit. Essayons.',
    'On y va. Le plan avant la combinaison, c’est la seule règle qui tienne.',
    'Bonjour. Je vous signalerai surtout ce qui se répète : c’est là qu’on progresse.',
    'Commençons proprement. Développez, mettez le roi à l’abri, puis regardez.',
    'Bonjour. Je préfère une partie solide à une partie brillante. Vous verrez pourquoi.',
    'On démarre. Dites-vous à chaque coup : qu’est-ce que ça change à ma position ?',
    'Bonjour. Je ne vous donnerai pas les coups, je vous donnerai les questions.',
  ],
  johana: [
    'Bonjour ! Installez-vous, on va passer un bon moment.',
    'Salut ! On joue, et je vous explique au fur et à mesure.',
    'Bonjour. Pas de pression : on est là pour apprendre, pas pour briller.',
    'Prête quand vous voulez. Jouez ce qui vous semble juste.',
    'Bonjour ! Dites-vous que chaque erreur est une leçon offerte.',
    'On commence ? Je vous accompagne à chaque coup.',
    'Bonjour. Je serai exigeante, mais toujours de votre côté.',
    'Allez, à vous. Faites-vous confiance.',
    'Bonjour ! J’aime bien les premiers coups, ils disent beaucoup.',
    'C’est parti. Prenez le temps de regarder toute la position.',
    'Bonjour. Si quelque chose vous échappe, je vous le montrerai.',
    'On y va. Et n’ayez pas peur de jouer un coup ambitieux.',
  ],
  serena: [
    'Bonjour. Installez-vous, j’ai toujours aimé ce moment d’avant la première pièce.',
    'Ah, une partie ! Rien ne vaut le silence d’un échiquier neuf.',
    'Bonjour. Vous savez, Capablanca disait que la partie commence avant le premier coup.',
    'Prenez place. Je vous préviens, je parle beaucoup, mais rarement pour rien.',
    'Bonjour. Une position de départ, c’est trente-deux promesses.',
    'Nous y sommes. J’espère que vous aimez les positions un peu désordonnées.',
    'Bonjour. Jouez ce qui vous plaît, on verra bien où cela nous mène.',
    'Enchantée de vous revoir devant un échiquier. Allons-y.',
    'Bonjour. J’ai un faible pour les débuts de partie — tout est encore possible.',
    'Asseyez-vous donc. Je commenterai, je digresserai, et parfois les deux.',
    'Bonjour. Le premier coup ne coûte rien, c’est le seul.',
    'Voilà. Faites comme chez vous, et jouez comme vous pensez.',
  ],
};

/* --- Fin de partie -------------------------------------------------------
   Défaut corrigé : une fois le mat tombé, le professeur continuait à
   commenter comme si le jeu se poursuivait. */
export const FIN_OUVERTURES: Record<string, Record<IssuePartie, string[]>> = {
  'homme-ultime': {
    victoire: [
      'Vous avez gagné. C’est ce qu’on attendait de vous.',
      'La partie est à vous. Bien.',
      'Victoire. Regardons comment vous l’avez obtenue.',
      'C’est fait. Vous avez tenu jusqu’au bout.',
      'Gagnée, et pas par accident.',
      'Voilà une partie menée à son terme.',
    ],
    defaite: [
      'Vous avez perdu. Ce n’est pas une catastrophe, c’est une leçon.',
      'Défaite. Nous allons voir où elle s’est jouée.',
      'C’est perdu. Regardez ce qui vous a coûté la partie.',
      'Vous avez cédé. Comprenez à quel moment.',
      'Battu. Reste à savoir pourquoi.',
      'La partie vous échappe. Ce n’est jamais un hasard.',
    ],
    nulle: [
      'Partie nulle. Ni gagnée, ni perdue.',
      'Match nul. Il y avait peut-être mieux à chercher.',
      'Nulle. La position ne donnait plus rien à personne.',
      'Partage. Voyons si vous avez laissé passer une occasion.',
    ],
    abandon: [
      'Vous abandonnez. C’est une décision, et elle se respecte.',
      'Abandon. Parfois c’est juste, parfois c’est prématuré.',
      'Vous rendez les armes. Voyons si c’était nécessaire.',
      'Partie abandonnée. Il faut savoir pourquoi on le fait.',
    ],
  },
  ephraim: {
    victoire: [
      'Partie gagnée. Reprenons ce qui a fonctionné.',
      'Vous l’emportez. Analysons la méthode.',
      'Victoire, et elle se construit. Voyons comment.',
      'C’est gagné. Le plan a tenu du début à la fin.',
      'Bien joué. Regardons la structure de cette partie.',
      'Vous gagnez. Retenons l’enchaînement.',
    ],
    defaite: [
      'Partie perdue. Nous allons la démonter proprement.',
      'Défaite. Cherchons le moment où le plan a lâché.',
      'Vous perdez cette partie. Il y a une cause, et elle est identifiable.',
      'C’est perdu. La bonne nouvelle, c’est que la cause se voit.',
      'Revers. Regardons la structure avant la tactique.',
      'Partie perdue. Ce n’est pas grave si on en tire la règle.',
    ],
    nulle: [
      'Partie nulle. L’équilibre a tenu.',
      'Match nul. Correct, sans plus.',
      'Nulle. Les deux camps ont manqué le moment décisif.',
      'Partage du point. Voyons s’il y avait mieux.',
    ],
    abandon: [
      'Vous abandonnez. Regardons si la position le justifiait.',
      'Abandon. C’est parfois la bonne décision, parfois une facilité.',
      'Vous arrêtez la partie. Analysons la position au moment où vous l’avez quittée.',
      'Partie abandonnée. Voyons ce qu’il restait à défendre.',
    ],
  },
  johana: {
    victoire: [
      'Bravo, vous avez gagné !',
      'Victoire, et vous l’avez méritée.',
      'Gagné ! Je savais que vous pouviez y arriver.',
      'C’est une belle victoire. Profitez-en.',
      'Vous l’avez fait. Très bien.',
      'Partie gagnée, et proprement.',
    ],
    defaite: [
      'C’est perdu, et ce n’est pas grave. On regarde ensemble.',
      'Défaite. Ne baissez pas la tête, on va comprendre.',
      'Vous avez perdu celle-là. C’est comme ça qu’on progresse.',
      'Partie perdue. Ce qui compte, c’est ce que vous en tirez.',
      'C’est raté cette fois. La prochaine sera différente.',
      'Battu, mais vous avez tenu longtemps.',
    ],
    nulle: [
      'Partie nulle. C’est un résultat honnête.',
      'Match nul. Vous n’avez rien lâché.',
      'Nulle. Il y avait peut-être un peu plus à aller chercher.',
      'Partage. Pas de quoi rougir.',
    ],
    abandon: [
      'Vous abandonnez. On va regarder si c’était vraiment perdu.',
      'Abandon. Parfois il faut savoir s’arrêter, parfois il faut s’accrocher.',
      'Vous arrêtez. Voyons ce qu’il restait comme ressources.',
      'Partie abandonnée. Ne prenez pas l’habitude trop vite.',
    ],
  },
  serena: {
    victoire: [
      'Vous avez gagné, et c’est très bien ainsi.',
      'Victoire ! Voyons comment elle est venue.',
      'Gagnée. Il y a eu un joli moment dans cette partie.',
      'C’est à vous. Bien mené.',
      'Belle partie, et belle fin.',
      'Vous l’emportez. Reprenons le fil.',
    ],
    defaite: [
      'Perdue. Cela arrive aux meilleurs, et régulièrement.',
      'Défaite. Ce n’est pas la fin du monde, loin de là.',
      'Vous perdez cette partie. Regardons-la sans amertume.',
      'C’est perdu, et il y avait pourtant de bonnes idées.',
      'Battu. Reprenons calmement.',
      'Partie perdue. Il y a toujours quelque chose à y prendre.',
    ],
    nulle: [
      'Partie nulle. L’équilibre a résisté.',
      'Match nul. Un résultat qui se défend.',
      'Nulle. Personne n’a trouvé la faille.',
      'Partage. C’est parfois le plus juste.',
    ],
    abandon: [
      'Vous abandonnez. Voyons si la position le méritait.',
      'Abandon. Une décision qui en dit long sur la position.',
      'Vous quittez la partie. Regardons où elle en était.',
      'Partie abandonnée. On en tire quand même quelque chose.',
    ],
  },
};

/** Comment introduire le coup qui a fait basculer la partie. */
export const FIN_PIVOT: Record<string, string[]> = {
  'homme-ultime': [
    'Tout s’est joué sur',
    'La partie bascule à',
    'Le point de rupture est',
    'C’est à ce coup que tout change :',
    'Retenez ce moment :',
  ],
  ephraim: [
    'Le moment décisif est',
    'La partie change de nature à',
    'Le basculement se situe à',
    'C’est là que la structure cède :',
    'Le coup à revoir est',
  ],
  johana: [
    'Le coup qui a tout changé, c’est',
    'Regardez bien ce moment :',
    'C’est là que ça s’est joué :',
    'Le tournant, c’est',
    'Notez ce coup-là :',
  ],
  serena: [
    'Le moment charnière, c’est',
    'Tout tient à ce coup :',
    'La partie pivote à',
    'C’est ici que la balance penche :',
    'Le coup à retenir est',
  ],
};

/** Ce qu'il faut retenir, selon l'issue. */
export const FIN_CONSEIL: Record<string, Record<'gagne' | 'perdu', string[]>> = {
  'homme-ultime': {
    gagne: [
      'Retenez la méthode, pas le résultat. Le résultat ne se répète pas, la méthode si.',
      'Une victoire ne prouve rien si vous ne savez pas dire pourquoi.',
      'Gardez cette rigueur quand vous serez moins bien placé.',
      'La prochaine sera plus dure. Préparez-vous en conséquence.',
      'Ne confondez pas avoir gagné et avoir bien joué.',
    ],
    perdu: [
      'Une partie perdue vaut trois parties gagnées, si vous la relisez.',
      'Ne cherchez pas d’excuse dans la position. Cherchez le coup.',
      'Vous saurez éviter cela la prochaine fois. C’est tout ce qu’on demande.',
      'Perdre n’est rien. Perdre deux fois de la même manière, si.',
      'Revoyez ce coup à froid. Vous le verrez venir la prochaine fois.',
    ],
  },
  ephraim: {
    gagne: [
      'Notez l’ordre dans lequel vous avez procédé : c’est lui qui a gagné.',
      'Refaites ce plan dans une autre partie, vous verrez qu’il tient.',
      'La solidité paie. Continuez ainsi.',
      'Votre structure a tenu jusqu’au bout, c’est l’essentiel.',
      'Une victoire méthodique vaut mieux qu’une victoire chanceuse.',
    ],
    perdu: [
      'Reprenez cette partie au calme et cherchez le coup où le plan s’est interrompu.',
      'La faute n’est presque jamais là où l’on croit : elle précède la perte de matériel.',
      'Travaillez la position, pas la tactique. Elle viendra d’elle-même.',
      'Une défaite bien analysée ne se reproduit pas.',
      'Identifiez la question que vous ne vous êtes pas posée.',
    ],
  },
  johana: {
    gagne: [
      'Vous progressez, ça se voit dans cette partie.',
      'Gardez cette confiance, elle vous va bien.',
      'Continuez comme ça, vous êtes sur la bonne voie.',
      'Belle maîtrise. Faites-en une habitude.',
      'Vous avez tenu votre plan, c’est ça le plus dur.',
    ],
    perdu: [
      'Ne retenez pas la défaite, retenez le coup qui l’a causée.',
      'Vous avez bien joué par moments, c’est ça qu’il faut garder.',
      'On rejoue quand vous voulez. C’est comme ça qu’on apprend.',
      'Une partie perdue, c’est une leçon gratuite. Prenez-la.',
      'Vous y étiez presque. Ne lâchez rien.',
    ],
  },
  serena: {
    gagne: [
      'Savourez, puis relisez. Les victoires enseignent moins, mais elles enseignent.',
      'Il y avait de vraies idées là-dedans. Gardez-les.',
      'Capablanca disait qu’on apprend surtout de ses défaites. Il gagnait beaucoup, cela dit.',
      'Une belle partie. Refaites-la de mémoire ce soir, vous verrez ce qui reste.',
      'Le plaisir d’une partie gagnée est un excellent professeur, à petite dose.',
    ],
    perdu: [
      'Les meilleures parties de l’histoire ont été perdues par quelqu’un.',
      'Reprenez-la demain, à froid. Vous y verrez des choses invisibles aujourd’hui.',
      'Une défaite comprise vaut mieux qu’une victoire subie.',
      'Ce n’est qu’une partie. Il y en aura d’autres, et vous serez meilleur.',
      'Tartakover prétendait que personne n’a jamais gagné en abandonnant. Il exagérait à peine.',
    ],
  },
};

/** Manière de saluer un beau coup dans le bilan de fin de partie. */
export const FIN_BEAU_COUP: Record<string, string[]> = {
  'homme-ultime': [
    'Votre meilleur moment :',
    'À mettre à votre crédit :',
    'Un coup juste, celui-là :',
  ],
  ephraim: [
    'Ce que vous avez bien fait :',
    'Le bon moment de la partie :',
    'À retenir du côté positif :',
  ],
  johana: [
    'Et votre plus beau coup :',
    'Ça, c’était très bien vu :',
    'Gardez ce moment-là :',
  ],
  serena: [
    'Il y a eu ce joli coup :',
    'Votre meilleur instant :',
    'Et ce coup-là m’a plu :',
  ],
};

/** Motifs pour lesquels un conseil de fin de partie existe. */
export const LECON_MOTIF: Partial<Record<MotifExplication, string>> = {
  'piece-en-prise': 'comptez les attaquants et les défenseurs avant de poser une pièce',
  'menace-ignoree': 'demandez-vous à chaque coup adverse ce qu’il menace',
  fourchette: 'surveillez les cases d’où un cavalier toucherait deux pièces à la fois',
  clouage: 'évitez d’aligner une pièce et votre roi sur une même ligne',
  enfilade: 'ne laissez pas deux pièces de valeur sur une même ligne',
  'mat-manque': 'quand le roi adverse étouffe, cherchez le mat avant le matériel',
  'mat-subi': 'comptez les cases de fuite de votre roi avant d’ouvrir une ligne',
  'occasion-manquee': 'avant de consolider, vérifiez s’il n’y a pas un coup qui gagne tout de suite',
};

/* --- Réactions brèves ----------------------------------------------------
   Deux mots, trois au plus. C'est ce qui ouvre une réplique parlée : un coach
   ne commence pas par une subordonnée. Les registres longs restent employés
   par le rapport écrit, qui se lit et se relit. */
export const REACTIONS: Record<string, Record<'bon' | 'faute' | 'grave' | 'neutre', string[]>> = {
  'homme-ultime': {
    bon: ['Juste.', 'Correct.', 'Bien.', 'C’est le coup.', 'Rien à redire.', 'Propre.'],
    faute: ['Non.', 'Trop mou.', 'Vous relâchez.', 'Pas celui-là.', 'Insuffisant.', 'Vous perdez le fil.'],
    grave: ['Non, c’est grave.', 'Là, vous lâchez la partie.', 'Faute lourde.', 'Indéfendable.', 'Vous venez de tout gâcher.'],
    neutre: ['On continue.', 'Bien.', 'Poursuivez.', 'Soit.'],
  },
  ephraim: {
    bon: ['Bien.', 'Solide.', 'Bon ordre.', 'C’est méthodique.', 'La structure tient.', 'Juste.'],
    faute: ['Attention.', 'Ce n’est pas l’ordre.', 'Reprenons.', 'Il manque une étape.', 'Trop tôt.', 'Pas encore.'],
    grave: ['Arrêtons-nous.', 'C’est grave.', 'La position se retourne.', 'Faute lourde.', 'Vous cassez tout.'],
    neutre: ['On continue.', 'Poursuivez.', 'Très bien.', 'Suivant.'],
  },
  johana: {
    bon: ['Voilà !', 'Très bien.', 'Oui, c’est ça.', 'Bien vu.', 'Parfait.', 'Vous progressez.'],
    faute: ['Attention.', 'Doucement.', 'Hmm, pas tout à fait.', 'Regardez mieux.', 'Un peu vite.', 'On reprend.'],
    grave: ['Aïe.', 'Là, c’est sérieux.', 'Oh non.', 'Ça fait mal.', 'Attention, c’est lourd.'],
    neutre: ['On continue.', 'D’accord.', 'Très bien.', 'Allez-y.'],
  },
  serena: {
    bon: ['Joli.', 'Ah, voilà.', 'Très bien vu.', 'Élégant.', 'Parfait.', 'C’est ça.'],
    faute: ['Hmm.', 'Tiens, non.', 'Dommage.', 'Ah, attention.', 'Pas tout à fait.', 'Voyons…'],
    grave: ['Oh.', 'Aïe aïe aïe.', 'Alors là…', 'C’est ennuyeux.', 'Mmh, non.'],
    neutre: ['On continue.', 'Bien.', 'Poursuivons.', 'Allons-y.'],
  },
};

/** Réponse au choix « reprendre le coup ». */
export const REPRISE_ACCORDEE: Record<string, string[]> = {
  'homme-ultime': ['Bien. Rejouez, et réfléchissez cette fois.', 'On reprend. Faites mieux.', 'Soit. Recommencez.'],
  ephraim: ['D’accord, on reprend.', 'Très bien, rejouez ce coup.', 'On revient en arrière. Regardez la position.'],
  johana: ['D’accord, on reprend !', 'Bonne idée, rejouez-le.', 'On efface, à vous.'],
  serena: ['On reprend, volontiers.', 'Très bien, revenons en arrière.', 'D’accord, rejouez.'],
};

/** Réponse au choix « garder le coup ». */
export const COUP_GARDE: Record<string, string[]> = {
  'homme-ultime': ['Comme vous voulez. On continue.', 'Vous assumez. Bien.', 'Soit, poursuivons.'],
  ephraim: ['Bien, on continue avec ce coup.', 'D’accord. Voyons la suite.', 'Entendu, poursuivons.'],
  johana: ['D’accord, on continue !', 'Très bien, allons-y.', 'Ça marche, on poursuit.'],
  serena: ['Va pour ce coup.', 'Entendu, continuons.', 'D’accord, poursuivons.'],
};

/**
 * Ce que dit le professeur quand on joue pendant qu'il parle.
 *
 * Il doit s'interrompre et reconnaître le coup, brièvement. Rester muet deux
 * ou trois coups, comme c'était le cas, donne l'impression qu'il a décroché.
 */
export const INTERROMPU: Record<string, string[]> = {
  'homme-ultime': ['Ah, vous avez joué.', 'Vous enchaînez. Bien.', 'Déjà ? Voyons.'],
  ephraim: ['Ah, vous avez joué ça.', 'Vous allez vite. Regardons.', 'Bien, continuons.'],
  johana: ['Ah, vous enchaînez !', 'Oh, déjà ! Voyons ça.', 'Vous êtes rapide, d’accord.'],
  serena: ['Ah, vous avez joué ça.', 'Vite fait ! Voyons.', 'Oh, déjà ?'],
};
