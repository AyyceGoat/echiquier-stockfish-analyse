/**
 * Détection des capacités de l'appareil.
 *
 * Toute API moderne est testée avant usage. Le principe directeur : ne jamais
 * échouer, seulement dégrader. Un appareil qui n'a pas `SharedArrayBuffer`
 * reçoit le moteur mono-thread ; un mobile reçoit une table de hachage réduite
 * et une profondeur plus faible.
 */

/**
 * Deux moteurs cohabitent, et ce n'est pas un accident.
 *
 * Stockfish 19 est plus fort (+44 Elo) et surtout beaucoup plus léger — son
 * réseau NNUE n'est pas embarqué, ce qui ramène le téléchargement de 7 Mo à
 * moins de 2 Mo. Mais son build web déclare une mémoire WebAssembly
 * PARTAGÉE : il exige un contexte isolé et ne connaît pas de variante
 * mono-thread. Là où `SharedArrayBuffer` manque — WebView Android, en-têtes
 * COOP/COEP non appliqués — il ne peut tout simplement pas démarrer.
 *
 * Stockfish 18 Lite reste donc en place pour ce cas, avec son build
 * mono-thread. On ne télécharge jamais les deux : l'appareil reçoit celui
 * qu'il peut exécuter.
 */
export const VERSION_SF19 = '19';
export const VERSION_SF18 = '18.0.8';
export const CHEMIN_SF19 = '/engine/sf19';
export const CHEMIN_SF18 = '/engine/sf18';

/** Conservé pour la page de diagnostic : version réellement susceptible d'être chargée. */
export const VERSION_MOTEUR = VERSION_SF18;
export const CHEMIN_MOTEUR = CHEMIN_SF18;

/**
 * `sf19` : Stockfish 19, multi-thread, contexte isolé obligatoire.
 * `multithread` / `monothread` : Stockfish 18 Lite, en repli.
 */
export type VarianteMoteur = 'sf19' | 'multithread' | 'monothread';

export interface Capacites {
  /** `SharedArrayBuffer` utilisable (nécessite un contexte isolé COOP/COEP). */
  sharedArrayBuffer: boolean;
  /** `crossOriginIsolated` : les en-têtes COOP/COEP sont bien appliqués. */
  isole: boolean;
  webAssembly: boolean;
  /** WebAssembly threads (atomics + mémoire partagée). */
  wasmThreads: boolean;
  coeurs: number;
  /** Mémoire annoncée en Go (Chrome uniquement), `null` si inconnue. */
  memoireGo: number | null;
  mobile: boolean;
  ios: boolean;
  navigateur: string;
  reseauLent: boolean;
  /** L'utilisateur a demandé moins d'animations. */
  animationsReduites: boolean;
  stockagePersistant: boolean;
}

/** Test réel du support des threads WebAssembly (pas seulement `SharedArrayBuffer`). */
function testerWasmThreads(): boolean {
  try {
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.Memory !== 'function') return false;
    if (typeof SharedArrayBuffer !== 'function') return false;
    const memoire = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    return memoire.buffer instanceof SharedArrayBuffer;
  } catch {
    return false;
  }
}

function detecterNavigateur(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA?\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/FxiOS/i.test(ua)) return 'Firefox (iOS / WebKit)';
  if (/CriOS/i.test(ua)) return 'Chrome (iOS / WebKit)';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Navigateur inconnu';
}

export function detecterCapacites(): Capacites {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; saveData?: boolean } };

  // iPadOS 13+ se présente comme un Mac : on le repère au support tactile.
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1);
  const mobile = ios || /Android|Mobile|Tablet/i.test(ua);

  const connexion = nav.connection;
  const reseauLent =
    connexion?.saveData === true ||
    (typeof connexion?.effectiveType === 'string' &&
      ['slow-2g', '2g', '3g'].includes(connexion.effectiveType));

  let animationsReduites = false;
  try {
    animationsReduites =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    animationsReduites = false;
  }

  return {
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
    isole: typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false,
    webAssembly: typeof WebAssembly === 'object',
    wasmThreads: testerWasmThreads(),
    coeurs: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
    memoireGo: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    mobile,
    ios,
    navigateur: detecterNavigateur(ua),
    reseauLent: Boolean(reseauLent),
    animationsReduites,
    stockagePersistant: typeof indexedDB !== 'undefined',
  };
}

export interface ProfilMoteur {
  variante: VarianteMoteur;
  threads: number;
  /** Table de hachage en Mo. */
  hash: number;
  profondeurParDefaut: number;
  /** Temps de réflexion par coup en analyse complète (ms). */
  tempsParCoupMs: number;
  /** Explication affichable si le moteur tourne en mode réduit. */
  raisonModeReduit: string | null;
}

/**
 * Choisit la configuration du moteur.
 *
 * La table de hachage est le principal facteur de plantage sur iOS Safari :
 * le WASM y dispose d'un budget mémoire étroit et le système recharge l'onglet
 * sans prévenir. On reste donc à 16 Mo sur iOS, 32 Mo sur les autres mobiles.
 */
export function choisirProfilMoteur(c: Capacites): ProfilMoteur {
  const peutMultithread = c.wasmThreads && c.isole;

  let raison: string | null = null;
  if (!peutMultithread) {
    if (!c.sharedArrayBuffer) {
      raison = "SharedArrayBuffer n'est pas disponible sur ce navigateur.";
    } else if (!c.isole) {
      raison = "La page n'est pas en contexte isolé (en-têtes COOP/COEP absents).";
    } else {
      raison = 'Les threads WebAssembly ne sont pas utilisables ici.';
    }
  }

  // On laisse toujours un cœur au thread principal pour garder l'interface fluide.
  const threadsMax = c.mobile ? 2 : 4;
  const threads = peutMultithread ? Math.max(1, Math.min(threadsMax, c.coeurs - 1)) : 1;

  const hash = c.ios ? 16 : c.mobile ? 32 : c.memoireGo !== null && c.memoireGo <= 4 ? 32 : 128;

  const appareilLimite = c.mobile || c.coeurs <= 2 || (c.memoireGo !== null && c.memoireGo <= 4);

  return {
    // Stockfish 19 dès que le contexte le permet : plus fort et bien plus
    // léger à télécharger.
    variante: peutMultithread ? 'sf19' : 'monothread',
    threads,
    hash,
    profondeurParDefaut: appareilLimite ? 14 : 18,
    tempsParCoupMs: appareilLimite ? 250 : 500,
    raisonModeReduit: raison,
  };
}

/** URL du script worker et du binaire WASM pour une variante donnée. */
export function urlsMoteur(
  variante: VarianteMoteur,
  /**
   * Table de hachage visée, en Mo. Stockfish 19 travaille en mémoire
   * partagée, dont le maximum est figé à la création : l'adaptateur a besoin
   * de connaître le hachage AVANT de créer la mémoire, sinon le premier
   * `setoption name Hash` échoue faute de place.
   */
  hashMo = 16,
  /** Nombre de threads visé : chacun réplique le réseau NNUE. */
  threads = 1,
): {
  js: string;
  wasm: string;
  /** Un worker de module ES, ou le worker classique de Stockfish 18. */
  typeWorker: 'module' | 'classic';
  /** Réseau NNUE à charger séparément, quand il n'est pas embarqué. */
  nnue?: string;
} {
  if (variante === 'sf19') {
    return {
      js: `${CHEMIN_SF19}/worker-sf19.js?hash=${hashMo}&threads=${threads}`,
      wasm: `${CHEMIN_SF19}/sf_19_smallnet.wasm`,
      nnue: `${CHEMIN_SF19}/nn-61e7af4bb97d.nnue`,
      typeWorker: 'module',
    };
  }
  const base = variante === 'multithread' ? 'stockfish-18-lite' : 'stockfish-18-lite-single';
  return {
    js: `${CHEMIN_SF18}/${base}.js`,
    wasm: `${CHEMIN_SF18}/${base}.wasm`,
    typeWorker: 'classic',
  };
}

/** Nom lisible d'une variante, pour le diagnostic. */
/**
 * Nom affichable d'une variante.
 *
 * Le nom du logiciel n'apparaît nulle part dans l'interface : l'élève
 * affronte un professeur, pas un programme, et le nommer suffit à défaire
 * le personnage. On décrit donc la variante par ce qu'elle change —
 * génération et parallélisme — ce qui est aussi la seule chose utile au
 * diagnostic.
 */
export function nomVariante(v: VarianteMoteur): string {
  if (v === 'sf19') return 'Analyse 19 (multi-thread)';
  if (v === 'multithread') return 'Analyse 18 allégée (multi-thread)';
  return 'Analyse 18 allégée (mono-thread)';
}
