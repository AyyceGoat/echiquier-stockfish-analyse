/**
 * Adaptateur Stockfish 19 → protocole worker classique.
 *
 * Le build web de Stockfish 19 (paquet @lichess-org/stockfish-web) n'est pas
 * un worker UCI prêt à l'emploi comme celui de Stockfish 18 : c'est un module
 * ES qui exporte une fabrique, attend qu'on lui fournisse le réseau NNUE en
 * mémoire, et dialogue par `uci()` / `listen`. Cet adaptateur lui redonne
 * l'interface attendue partout ailleurs dans l'application — on lui envoie
 * des commandes UCI par `postMessage`, il répond par des lignes de texte.
 *
 * Résultat : `moteur.ts` traite les deux versions du moteur exactement de la
 * même façon, et ne connaît qu'un seul protocole.
 */

import fabrique from './sf_19_smallnet.js';

/**
 * Taille de la mémoire WebAssembly, en pages de 64 Ko.
 *
 * C'est le garde-fou mémoire principal : sur iOS, une mémoire trop grande
 * fait recharger l'onglet par le système sans le moindre message d'erreur.
 * La mémoire étant partagée entre threads, son maximum est fixé une fois
 * pour toutes à la création.
 */
function pagesMemoire() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const ios = /iPad|iPhone|iPod/.test(ua);
  const mobile = ios || /Android|Mobile/i.test(ua);

  // Le module déclare lui-même une mémoire initiale de 1024 pages : lui en
  // fournir moins le fait échouer au lien avec « memory import has N pages
  // which is smaller than the declared initial ». C'est un plancher, pas un
  // réglage.
  const INITIAL = 1024; // 64 Mo

  // Le maximum doit couvrir ce plancher PLUS la table de hachage que
  // l'application va demander, plus une marge. Sans cela, le premier
  // `setoption name Hash` échoue sur « Failed to allocate N bytes » — la
  // mémoire étant partagée, son maximum est figé à la création et ne peut
  // plus être relevé ensuite.
  const params = new URL(import.meta.url).searchParams;
  const lire = (nom, defaut) => {
    const v = Number(params.get(nom));
    return Number.isFinite(v) && v > 0 ? v : defaut;
  };
  const hashMo = lire('hash', 16);
  const threads = lire('threads', 1);

  const pagesHash = Math.ceil((hashMo * 1024 * 1024) / 65536);
  // Chaque thread réplique le réseau NNUE et sa pile de recherche. Oublier ce
  // poste faisait échouer l'allocation dès que l'on demandait plusieurs
  // threads, avec un « Failed to allocate » que rien ne remontait.
  const pagesThreads = threads * 128; // 8 Mo par thread
  const MARGE = 512; // 32 Mo

  // Plafond par appareil : sur iOS, une réservation trop large fait recharger
  // l'onglet par le système, sans le moindre message.
  const plafond = ios ? 2048 : mobile ? 3072 : 6144;

  return {
    initial: INITIAL,
    maximum: Math.min(plafond, INITIAL + pagesHash + pagesThreads + MARGE),
  };
}

let moteur = null;
/** Commandes reçues avant que le moteur ne soit prêt. */
const enAttente = [];
let demarrageLance = false;

function envoyer(ligne) {
  self.postMessage(ligne);
}

async function demarrer() {
  if (demarrageLance) return;
  demarrageLance = true;

  try {
    const { initial, maximum } = pagesMemoire();
    const instance = await fabrique({
      wasmMemory: new WebAssembly.Memory({ initial, maximum, shared: true }),
      locateFile: (fichier) => new URL(fichier, import.meta.url).href,
    });

    instance.listen = (ligne) => envoyer(ligne);
    instance.onError = (e) => {
      const message = e && e.message ? e.message : String(e);
      envoyer(`info string erreur moteur : ${message}`);
      // Une panne du moteur doit être une VRAIE panne du worker, sinon elle
      // reste invisible : le service moteur attendait un `bestmove` qui ne
      // venait jamais, jusqu'au chien de garde. En relançant l'erreur hors
      // du gestionnaire, elle atteint `worker.onerror` et déclenche le repli.
      setTimeout(() => {
        throw new Error(`Stockfish 19 : ${message}`);
      }, 0);
    };

    // Le réseau NNUE n'est pas embarqué dans le binaire : c'est ce qui fait
    // passer le téléchargement de 7 Mo à moins de 2 Mo. Il faut donc le
    // charger nous-mêmes avant la première recherche.
    const nom = instance.getRecommendedNnue ? instance.getRecommendedNnue(0) : null;
    const url = new URL(nom || 'nn-61e7af4bb97d.nnue', import.meta.url).href;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`réseau NNUE introuvable (HTTP ${reponse.status})`);
    instance.setNnueBuffer(new Uint8Array(await reponse.arrayBuffer()), 0);

    moteur = instance;
    for (const cmd of enAttente.splice(0)) moteur.uci(cmd);
  } catch (e) {
    // On signale l'échec par une ligne, puis on se tait : `moteur.ts` a un
    // chien de garde et bascule sur Stockfish 18.
    const message = e && e.message ? e.message : String(e);
    envoyer(`info string echec demarrage : ${message}`);
    setTimeout(() => {
      throw new Error(`Stockfish 19 : ${message}`);
    }, 0);
  }
}

self.onmessage = (ev) => {
  const commande = typeof ev.data === 'string' ? ev.data : String(ev.data?.data ?? '');
  if (!commande) return;

  if (commande === 'quit') {
    self.close();
    return;
  }

  if (moteur) {
    moteur.uci(commande);
  } else {
    enAttente.push(commande);
    void demarrer();
  }
};
