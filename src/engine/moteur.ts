/**
 * Service moteur : encapsule Stockfish et le protocole UCI.
 *
 * Règles de conception :
 *  - le moteur vit dans un Web Worker, le thread principal n'attend jamais ;
 *  - une seule recherche à la fois, les demandes suivantes sont mises en file ;
 *  - aucune recherche n'est lancée avant d'avoir reçu le `bestmove` de la
 *    précédente, sinon Stockfish traite la nouvelle position avec l'ancienne
 *    recherche encore active et renvoie des évaluations fausses ;
 *  - tout échec est remonté explicitement, jamais avalé.
 */

import {
  parseLigneUci,
  type Evaluation,
  type LigneInfo,
} from '../lib/uci.ts';
import {
  choisirProfilMoteur,
  detecterCapacites,
  urlsMoteur,
  VERSION_MOTEUR,
  type Capacites,
  type ProfilMoteur,
  type VarianteMoteur,
} from './capacites.ts';

export interface LignePv {
  multipv: number;
  evaluation: Evaluation;
  /** Variante en notation UCI (e2e4, g8f6...). */
  pv: string[];
  profondeur: number;
}

export interface ResultatRecherche {
  lignes: LignePv[];
  meilleurCoup: string | null;
  ponder: string | null;
  profondeur: number;
  /** true si la recherche a été interrompue avant d'atteindre sa cible. */
  interrompue: boolean;
}

export interface ParametresRecherche {
  fen: string;
  /** Coups UCI joués depuis `fen`. */
  coups?: string[];
  profondeur?: number;
  tempsMs?: number;
  /** Nombre de variantes à retourner (1 à 5). */
  multiPV?: number;
  /** Analyse continue : ne s'arrête que sur `arreter()`. */
  infinie?: boolean;
  /** Limite de force, 0–20. `undefined` = pleine force. */
  niveau?: number;
  /** Rappel appelé à chaque mise à jour de profondeur. */
  surProgression?: (r: ResultatRecherche) => void;
  signal?: AbortSignal;
}

export type EtatMoteur = 'arrete' | 'telechargement' | 'demarrage' | 'pret' | 'recherche' | 'echec';

export interface EvenementMoteur {
  etat: EtatMoteur;
  /** Progression du téléchargement du binaire, 0–1. */
  progression?: number;
  message?: string;
  erreur?: string;
}

interface Tache {
  params: ParametresRecherche;
  resoudre: (r: ResultatRecherche) => void;
  rejeter: (e: Error) => void;
  annulee: boolean;
}

/** Délai au-delà duquel on considère que le moteur ne répondra plus. */
const DELAI_GARDE_MS = 120_000;
const DELAI_DEMARRAGE_MS = 60_000;

export class Moteur {
  private worker: Worker | null = null;
  private etat: EtatMoteur = 'arrete';
  private file: Tache[] = [];
  private tacheCourante: Tache | null = null;
  private lignes = new Map<number, LignePv>();
  private profondeurCourante = 0;
  private multiPVActuel = 1;
  private niveauActuel: number | null = null;
  private arretDemande = false;
  private garde: ReturnType<typeof setTimeout> | null = null;

  private resolveurUciok: (() => void) | null = null;
  private resolveurReadyok: (() => void) | null = null;

  private abonnes = new Set<(e: EvenementMoteur) => void>();

  readonly capacites: Capacites;
  profil: ProfilMoteur;
  varianteChargee: VarianteMoteur | null = null;
  nomMoteur = `Stockfish ${VERSION_MOTEUR}`;

  private promesseDemarrage: Promise<void> | null = null;

  constructor(capacites: Capacites = detecterCapacites()) {
    this.capacites = capacites;
    this.profil = choisirProfilMoteur(capacites);
  }

  /** S'abonne aux changements d'état. Renvoie la fonction de désabonnement. */
  surEtat(f: (e: EvenementMoteur) => void): () => void {
    this.abonnes.add(f);
    f({ etat: this.etat });
    return () => this.abonnes.delete(f);
  }

  private emettre(e: EvenementMoteur): void {
    this.etat = e.etat;
    for (const f of this.abonnes) {
      try {
        f(e);
      } catch {
        // Un abonné défaillant ne doit pas casser le moteur.
      }
    }
  }

  get estPret(): boolean {
    return this.etat === 'pret' || this.etat === 'recherche';
  }

  /**
   * Démarre le moteur. Idempotent : les appels concurrents partagent
   * la même promesse. En cas d'échec du build multi-thread, bascule
   * automatiquement sur le mono-thread.
   */
  demarrer(): Promise<void> {
    if (this.promesseDemarrage) return this.promesseDemarrage;
    this.promesseDemarrage = this.demarrerInterne().catch((e) => {
      this.promesseDemarrage = null;
      throw e;
    });
    return this.promesseDemarrage;
  }

  private async demarrerInterne(): Promise<void> {
    if (!this.capacites.webAssembly) {
      const msg = "Ce navigateur ne prend pas en charge WebAssembly : le moteur est indisponible.";
      this.emettre({ etat: 'echec', erreur: msg });
      throw new Error(msg);
    }

    const variantes: VarianteMoteur[] =
      this.profil.variante === 'multithread' ? ['multithread', 'monothread'] : ['monothread'];

    let derniereErreur: Error | null = null;
    for (const variante of variantes) {
      try {
        await this.chargerVariante(variante);
        this.varianteChargee = variante;
        if (variante !== this.profil.variante) {
          // Le build multi-thread a échoué à l'exécution : on ajuste le profil
          // pour que la page de diagnostic reflète ce qui tourne réellement.
          this.profil = {
            ...this.profil,
            variante: 'monothread',
            threads: 1,
            raisonModeReduit:
              "Le moteur multi-thread n'a pas pu démarrer : repli automatique sur le mono-thread.",
          };
        }
        this.emettre({ etat: 'pret' });
        return;
      } catch (e) {
        derniereErreur = e instanceof Error ? e : new Error(String(e));
        this.detruireWorker();
      }
    }

    const msg = `Impossible de démarrer le moteur. ${derniereErreur?.message ?? ''}`.trim();
    this.emettre({ etat: 'echec', erreur: msg });
    throw new Error(msg);
  }

  private async chargerVariante(variante: VarianteMoteur): Promise<void> {
    const { js, wasm } = urlsMoteur(variante);

    // On télécharge le binaire nous-mêmes pour afficher une progression réelle.
    // Le worker le relira ensuite depuis le cache HTTP / le service worker.
    await this.prechargerWasm(wasm);

    this.emettre({ etat: 'demarrage', message: 'Initialisation du moteur…' });

    const worker = new Worker(`${js}#${encodeURIComponent(wasm)}`);
    this.worker = worker;

    worker.onmessage = (ev: MessageEvent) => this.surMessage(ev);
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault?.();
      this.surEchecWorker(ev.message || 'Erreur inconnue dans le worker du moteur.');
    };
    worker.onmessageerror = () => {
      this.surEchecWorker('Message illisible reçu du moteur.');
    };

    await this.attendre('uciok', () => worker.postMessage('uci'), DELAI_DEMARRAGE_MS);

    worker.postMessage(`setoption name Hash value ${this.profil.hash}`);
    if (variante === 'multithread') {
      worker.postMessage(`setoption name Threads value ${this.profil.threads}`);
    }
    worker.postMessage('setoption name UCI_ShowWDL value true');
    worker.postMessage('ucinewgame');

    await this.attendre('readyok', () => worker.postMessage('isready'), DELAI_DEMARRAGE_MS);
  }

  /** Télécharge le WASM en signalant la progression, sans conserver les octets. */
  private async prechargerWasm(url: string): Promise<void> {
    this.emettre({ etat: 'telechargement', progression: 0, message: 'Téléchargement du moteur…' });
    try {
      const rep = await fetch(url);
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);

      const total = Number(rep.headers.get('content-length') ?? 0);
      const flux = rep.body;

      if (!flux || !total) {
        // Pas de flux lisible (vieux WebKit) : on consomme sans progression.
        await rep.arrayBuffer();
        this.emettre({ etat: 'telechargement', progression: 1 });
        return;
      }

      const lecteur = flux.getReader();
      let recu = 0;
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        recu += value?.length ?? 0;
        this.emettre({
          etat: 'telechargement',
          progression: Math.min(1, recu / total),
          message: 'Téléchargement du moteur…',
        });
      }
    } catch (e) {
      // Le préchargement n'est qu'un confort : si la requête échoue ici,
      // on laisse le worker tenter sa propre requête avant de conclure.
      this.emettre({
        etat: 'telechargement',
        progression: 1,
        message: `Préchargement impossible (${e instanceof Error ? e.message : 'erreur'}), nouvelle tentative par le moteur…`,
      });
    }
  }

  private attendre(jeton: 'uciok' | 'readyok', declencher: () => void, delaiMs: number): Promise<void> {
    return new Promise<void>((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        if (jeton === 'uciok') this.resolveurUciok = null;
        else this.resolveurReadyok = null;
        rejeter(new Error(`Le moteur n'a pas répondu (${jeton}) dans le délai imparti.`));
      }, delaiMs);

      const fin = () => {
        clearTimeout(minuteur);
        resoudre();
      };
      if (jeton === 'uciok') this.resolveurUciok = fin;
      else this.resolveurReadyok = fin;

      declencher();
    });
  }

  private surEchecWorker(message: string): void {
    const erreur = new Error(message);
    this.detruireWorker();
    this.promesseDemarrage = null;
    const enCours = this.tacheCourante;
    this.tacheCourante = null;
    const enFile = this.file.splice(0);
    this.emettre({ etat: 'echec', erreur: message });
    enCours?.rejeter(erreur);
    for (const t of enFile) t.rejeter(erreur);
  }

  private surMessage(ev: MessageEvent): void {
    const brut = typeof ev.data === 'string' ? ev.data : String(ev.data?.data ?? '');
    for (const ligne of brut.split('\n')) {
      this.traiterLigne(ligne);
    }
  }

  private traiterLigne(brut: string): void {
    const ligne = parseLigneUci(brut);
    if (!ligne) return;

    switch (ligne.type) {
      case 'uciok': {
        const f = this.resolveurUciok;
        this.resolveurUciok = null;
        f?.();
        return;
      }
      case 'readyok': {
        const f = this.resolveurReadyok;
        this.resolveurReadyok = null;
        f?.();
        return;
      }
      case 'id':
        if (ligne.champ === 'name' && ligne.valeur) this.nomMoteur = ligne.valeur;
        return;
      case 'info':
        this.traiterInfo(ligne);
        return;
      case 'bestmove':
        this.terminerTache(ligne.coup, ligne.ponder);
        return;
      default:
        return;
    }
  }

  private traiterInfo(info: LigneInfo): void {
    if (!this.tacheCourante || !info.evaluation || info.pv.length === 0) return;
    // Les bornes sont des évaluations partielles : les retenir ferait
    // sauter la courbe d'évaluation sans apporter d'information.
    if (info.borne) return;

    this.lignes.set(info.multipv, {
      multipv: info.multipv,
      evaluation: info.evaluation,
      pv: info.pv,
      profondeur: info.profondeur ?? 0,
    });

    if (info.profondeur && info.profondeur !== this.profondeurCourante) {
      this.profondeurCourante = info.profondeur;
    }

    this.tacheCourante.params.surProgression?.(this.instantane(false));
  }

  private instantane(interrompue: boolean): ResultatRecherche {
    const lignes = [...this.lignes.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      lignes,
      meilleurCoup: lignes[0]?.pv[0] ?? null,
      ponder: lignes[0]?.pv[1] ?? null,
      profondeur: this.profondeurCourante,
      interrompue,
    };
  }

  private terminerTache(meilleurCoup: string | null, ponder: string | null): void {
    const tache = this.tacheCourante;
    if (!tache) return;

    this.tacheCourante = null;
    if (this.garde) {
      clearTimeout(this.garde);
      this.garde = null;
    }

    const resultat = this.instantane(this.arretDemande);
    // Stockfish connaît le meilleur coup même quand aucune PV n'a été émise
    // (position forcée, recherche très courte) : on ne le perd pas.
    if (meilleurCoup && !resultat.meilleurCoup) {
      resultat.meilleurCoup = meilleurCoup;
      resultat.ponder = ponder;
    }
    this.arretDemande = false;

    if (tache.annulee) {
      tache.rejeter(new DOMException('Analyse annulée.', 'AbortError'));
    } else {
      tache.resoudre(resultat);
    }

    this.emettre({ etat: 'pret' });
    void this.avancerFile();
  }

  /**
   * Lance une recherche. Les appels successifs sont sérialisés :
   * la promesse ne se résout qu'une fois le `bestmove` reçu.
   */
  analyser(params: ParametresRecherche): Promise<ResultatRecherche> {
    return new Promise<ResultatRecherche>((resoudre, rejeter) => {
      const tache: Tache = { params, resoudre, rejeter, annulee: false };

      if (params.signal) {
        if (params.signal.aborted) {
          rejeter(new DOMException('Analyse annulée.', 'AbortError'));
          return;
        }
        params.signal.addEventListener(
          'abort',
          () => {
            tache.annulee = true;
            if (this.tacheCourante === tache) {
              this.arreter();
            } else {
              const i = this.file.indexOf(tache);
              if (i >= 0) {
                this.file.splice(i, 1);
                rejeter(new DOMException('Analyse annulée.', 'AbortError'));
              }
            }
          },
          { once: true },
        );
      }

      this.file.push(tache);
      void this.avancerFile();
    });
  }

  private async avancerFile(): Promise<void> {
    if (this.tacheCourante || this.file.length === 0) return;

    try {
      await this.demarrer();
    } catch (e) {
      const erreur = e instanceof Error ? e : new Error(String(e));
      for (const t of this.file.splice(0)) t.rejeter(erreur);
      return;
    }

    if (this.tacheCourante) return;
    const tache = this.file.shift();
    if (!tache) return;
    if (tache.annulee) {
      tache.rejeter(new DOMException('Analyse annulée.', 'AbortError'));
      void this.avancerFile();
      return;
    }

    this.tacheCourante = tache;
    this.lignes.clear();
    this.profondeurCourante = 0;
    this.arretDemande = false;
    this.emettre({ etat: 'recherche' });

    const w = this.worker;
    if (!w) {
      this.surEchecWorker('Le moteur a été arrêté avant le lancement de la recherche.');
      return;
    }

    const p = tache.params;

    const multiPV = Math.max(1, Math.min(5, p.multiPV ?? 1));
    if (multiPV !== this.multiPVActuel) {
      w.postMessage(`setoption name MultiPV value ${multiPV}`);
      this.multiPVActuel = multiPV;
    }

    // Limite de force : Skill Level plafonne la qualité du choix sans
    // brider la recherche, ce qui reste plus naturel qu'une profondeur réduite.
    const niveau = p.niveau ?? null;
    if (niveau !== this.niveauActuel) {
      if (niveau === null) {
        w.postMessage('setoption name Skill Level value 20');
        w.postMessage('setoption name UCI_LimitStrength value false');
      } else {
        w.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, niveau))}`);
      }
      this.niveauActuel = niveau;
    }

    const position = p.coups?.length
      ? `position fen ${p.fen} moves ${p.coups.join(' ')}`
      : `position fen ${p.fen}`;
    w.postMessage(position);

    let commande: string;
    if (p.infinie) commande = 'go infinite';
    else if (p.tempsMs) commande = `go movetime ${Math.round(p.tempsMs)}`;
    else commande = `go depth ${p.profondeur ?? this.profil.profondeurParDefaut}`;
    w.postMessage(commande);

    // Chien de garde : une recherche infinie n'expire pas, les autres oui.
    if (!p.infinie) {
      const budget = (p.tempsMs ?? 0) + DELAI_GARDE_MS;
      this.garde = setTimeout(() => {
        if (this.tacheCourante === tache) {
          this.surEchecWorker("Le moteur n'a pas renvoyé de coup dans le délai imparti.");
        }
      }, budget);
    }
  }

  /** Interrompt la recherche en cours. Le `bestmove` reçu résout la promesse. */
  arreter(): void {
    if (!this.tacheCourante || !this.worker) return;
    this.arretDemande = true;
    this.worker.postMessage('stop');
  }

  /** Vide la file et interrompt la recherche courante. */
  toutArreter(): void {
    for (const t of this.file.splice(0)) {
      t.annulee = true;
      t.rejeter(new DOMException('Analyse annulée.', 'AbortError'));
    }
    this.arreter();
  }

  /** Signale une nouvelle partie : vide les tables de transposition. */
  nouvellePartie(): void {
    this.worker?.postMessage('ucinewgame');
  }

  private detruireWorker(): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage('quit');
    } catch {
      // Le worker est peut-être déjà mort.
    }
    try {
      this.worker.terminate();
    } catch {
      // Idem.
    }
    this.worker = null;
    this.multiPVActuel = 1;
    this.niveauActuel = null;
    this.resolveurUciok = null;
    this.resolveurReadyok = null;
  }

  /** Arrête tout et libère le worker. */
  detruire(): void {
    this.toutArreter();
    this.detruireWorker();
    this.promesseDemarrage = null;
    this.emettre({ etat: 'arrete' });
  }
}

/**
 * Instance unique partagée par l'application.
 * Un seul moteur en mémoire : sur mobile, deux instances du WASM font
 * dépasser le budget mémoire et l'onglet est rechargé par le système.
 */
let instance: Moteur | null = null;

export function moteurPartage(): Moteur {
  if (!instance) instance = new Moteur();
  return instance;
}
