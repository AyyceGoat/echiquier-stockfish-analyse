/**
 * Détection des capacités de l'appareil.
 *
 * Toute API moderne est testée avant usage. Le principe directeur : ne jamais
 * échouer, seulement dégrader. Un appareil qui n'a pas `SharedArrayBuffer`
 * reçoit le moteur mono-thread ; un mobile reçoit une table de hachage réduite
 * et une profondeur plus faible.
 */

export const VERSION_MOTEUR = '18.0.8';
export const CHEMIN_MOTEUR = '/engine/sf18';

export type VarianteMoteur = 'multithread' | 'monothread';

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
    variante: peutMultithread ? 'multithread' : 'monothread',
    threads,
    hash,
    profondeurParDefaut: appareilLimite ? 14 : 18,
    tempsParCoupMs: appareilLimite ? 250 : 500,
    raisonModeReduit: raison,
  };
}

/** URL du script worker et du binaire WASM pour une variante donnée. */
export function urlsMoteur(variante: VarianteMoteur): { js: string; wasm: string } {
  const base = variante === 'multithread' ? 'stockfish-18-lite' : 'stockfish-18-lite-single';
  return {
    js: `${CHEMIN_MOTEUR}/${base}.js`,
    wasm: `${CHEMIN_MOTEUR}/${base}.wasm`,
  };
}
