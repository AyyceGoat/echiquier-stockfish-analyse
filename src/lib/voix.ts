/**
 * Voix des professeurs.
 *
 * Deux étages, choisis avec l'utilisateur :
 *
 *  1. `speechSynthesis`, celle du navigateur. Gratuite, hors ligne,
 *     immédiate. Sa qualité dépend entièrement de l'appareil : très correcte
 *     sur iOS et macOS, où les voix système françaises sont bonnes ;
 *     franchement mécanique sur Windows. On ne prétend pas le contraire.
 *
 *  2. Une voix de synthèse en ligne, activable avec la clé de l'utilisateur.
 *     Elle vit derrière la même fonction serverless que la reconnaissance
 *     d'image, pour que la clé ne traverse jamais le bundle client. Voir
 *     `voixDistante.ts`.
 *
 * Ce module ne s'occupe que du premier étage et de l'aiguillage. Il expose
 * une interface unique — `dire`, `taire` — pour que l'écran de jeu n'ait pas
 * à savoir d'où vient le son.
 *
 * Contrainte de navigateur, pas un choix : la synthèse vocale est bloquée
 * tant que l'utilisateur n'a pas interagi avec la page. Le premier
 * commentaire d'une session peut donc rester muet jusqu'au premier clic.
 * `debloquerVoix` sert à saisir cette première interaction.
 */

/** Réglages de timbre d'un professeur, appliqués à la voix du navigateur. */
export interface TimbreProfesseur {
  /** 0 à 2 ; 1 est la hauteur naturelle de la voix choisie. */
  hauteur: number;
  /** 0,1 à 10 ; 1 est le débit naturel. */
  debit: number;
  /** Genre recherché parmi les voix françaises de l'appareil. */
  genre: 'homme' | 'femme';
  /**
   * Fragments de noms de voix à privilégier, dans l'ordre.
   *
   * Les noms varient d'un système à l'autre et rien ne les normalise : on
   * liste donc ce qu'on sait exister, et on retombe sur n'importe quelle voix
   * française à défaut.
   */
  preferences: string[];
}

/**
 * Timbres des quatre professeurs.
 *
 * Les écarts de hauteur et de débit sont volontairement marqués : sur un
 * appareil qui n'offre qu'une seule voix française, c'est la seule chose qui
 * distingue encore les personnages.
 */
export const TIMBRES: Record<string, TimbreProfesseur> = {
  'homme-ultime': {
    // Grave, lent, solennel.
    hauteur: 0.72,
    debit: 0.86,
    genre: 'homme',
    preferences: ['thomas', 'nicolas', 'daniel', 'paul'],
  },
  ephraim: {
    // Masculine aussi, mais claire et nettement plus vive : c'est ce qui la
    // sépare de la précédente sur un appareil pauvre en voix.
    hauteur: 1.02,
    debit: 1.08,
    genre: 'homme',
    preferences: ['nicolas', 'thomas', 'daniel', 'paul'],
  },
  johana: {
    // Plus jeune, vive, encourageante.
    hauteur: 1.22,
    debit: 1.12,
    genre: 'femme',
    preferences: ['audrey', 'amelie', 'amélie', 'marie', 'aurelie', 'aurélie'],
  },
  serena: {
    // Chaleureuse et volubile : hauteur moyenne, débit soutenu.
    hauteur: 0.95,
    debit: 1.16,
    genre: 'femme',
    preferences: ['aurelie', 'aurélie', 'virginie', 'marie', 'audrey'],
  },
};

const TIMBRE_PAR_DEFAUT: TimbreProfesseur = {
  hauteur: 1,
  debit: 1,
  genre: 'homme',
  preferences: [],
};

export function timbreDe(idProfesseur: string): TimbreProfesseur {
  return TIMBRES[idProfesseur] ?? TIMBRE_PAR_DEFAUT;
}

/** La synthèse vocale du navigateur est-elle utilisable ici ? */
export function voixNavigateurDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Voix françaises de l'appareil.
 *
 * La liste arrive de façon asynchrone sur la plupart des navigateurs : elle
 * est vide au premier appel, puis se remplit. On la relit donc à chaque fois
 * plutôt que de la mémoriser.
 */
export function voixFrancaises(): SpeechSynthesisVoice[] {
  if (!voixNavigateurDisponible()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'));
}

/** Indices lexicaux de genre dans les noms de voix courants. */
const INDICES_FEMME = ['audrey', 'amelie', 'amélie', 'aurelie', 'aurélie', 'marie', 'virginie', 'chantal', 'julie', 'female', 'femme'];
const INDICES_HOMME = ['thomas', 'nicolas', 'daniel', 'paul', 'male', 'homme'];

/**
 * Choisit la voix la plus proche du timbre demandé.
 *
 * Trois passes : d'abord les préférences nommées, puis le genre déduit du
 * nom, puis n'importe quelle voix française. Aucune ne garantit un bon
 * résultat — c'est la limite de cet étage.
 */
export function choisirVoix(timbre: TimbreProfesseur, disponibles = voixFrancaises()): SpeechSynthesisVoice | null {
  if (disponibles.length === 0) return null;
  const nom = (v: SpeechSynthesisVoice) => v.name.toLowerCase();

  for (const souhait of timbre.preferences) {
    const trouvee = disponibles.find((v) => nom(v).includes(souhait));
    if (trouvee) return trouvee;
  }

  const indices = timbre.genre === 'femme' ? INDICES_FEMME : INDICES_HOMME;
  const parGenre = disponibles.find((v) => indices.some((i) => nom(v).includes(i)));
  if (parGenre) return parGenre;

  return disponibles[0];
}

/**
 * Répartit les quatre professeurs sur les voix disponibles.
 *
 * Sans cela, deux professeurs du même genre reçoivent la même voix dès que
 * l'appareil n'en propose qu'une par genre, et seuls la hauteur et le débit
 * les distinguent. On attribue donc les voix en évitant les doublons tant
 * qu'il en reste.
 */
export function repartirVoix(ids: string[], disponibles = voixFrancaises()): Record<string, SpeechSynthesisVoice | null> {
  const restantes = [...disponibles];
  const sortie: Record<string, SpeechSynthesisVoice | null> = {};
  for (const id of ids) {
    const timbre = timbreDe(id);
    const choisie = choisirVoix(timbre, restantes.length > 0 ? restantes : disponibles);
    sortie[id] = choisie;
    const i = restantes.indexOf(choisie as SpeechSynthesisVoice);
    if (i >= 0) restantes.splice(i, 1);
  }
  return sortie;
}

let debloquee = false;

/**
 * Saisit la première interaction pour débloquer la synthèse.
 *
 * Les navigateurs refusent de parler avant un geste de l'utilisateur. On
 * prononce donc un énoncé vide au premier clic : il ne s'entend pas et lève
 * le verrou pour la suite.
 */
export function debloquerVoix(): void {
  if (debloquee || !voixNavigateurDisponible()) return;
  debloquee = true;
  try {
    const vide = new SpeechSynthesisUtterance(' ');
    vide.volume = 0;
    speechSynthesis.speak(vide);
  } catch {
    // Sans effet sur le reste : au pire la première réplique reste muette.
  }
}

export interface OptionsDire {
  idProfesseur: string;
  texte: string;
  /** Voix imposée, sinon celle que `choisirVoix` retient. */
  voix?: SpeechSynthesisVoice | null;
  surFin?: () => void;
}

/**
 * Prononce un texte, en coupant ce qui était en cours.
 *
 * Couper est volontaire : deux commentaires qui se chevauchent seraient
 * incompréhensibles, et le texte à l'écran, lui, est toujours remplacé.
 */
export function dire({ idProfesseur, texte, voix, surFin }: OptionsDire): void {
  if (!voixNavigateurDisponible() || texte.trim() === '') {
    surFin?.();
    return;
  }
  taire();
  const timbre = timbreDe(idProfesseur);
  const enonce = new SpeechSynthesisUtterance(texte);
  enonce.lang = 'fr-FR';
  enonce.pitch = timbre.hauteur;
  enonce.rate = timbre.debit;
  const choisie = voix === undefined ? choisirVoix(timbre) : voix;
  if (choisie) enonce.voice = choisie;
  enonce.onend = () => surFin?.();
  enonce.onerror = () => surFin?.();
  try {
    speechSynthesis.speak(enonce);
  } catch {
    surFin?.();
  }
}

/** Interrompt immédiatement la parole en cours. */
export function taire(): void {
  if (!voixNavigateurDisponible()) return;
  try {
    speechSynthesis.cancel();
  } catch {
    // Rien à faire.
  }
}
