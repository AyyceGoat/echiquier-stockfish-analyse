/**
 * Analyse complète d'une partie, coup par coup.
 *
 * L'analyse est incrémentale par construction : chaque position est évaluée
 * puis publiée immédiatement via `surCoupAnalyse`. Sur mobile, c'est ce qui
 * évite le calcul bloquant — l'interface affiche le rapport qui se remplit
 * au lieu d'attendre la fin.
 *
 * Coût : N+1 recherches pour N coups. L'évaluation de la position d'arrivée
 * d'un coup sert de position de départ au coup suivant, on ne la calcule
 * donc qu'une fois.
 */

import { Chess } from 'chess.js';
import {
  classerCoup,
  momentsCharnieres,
  pdgBlancs,
  eloEstime,
  PLAFOND_PERTE,
  precisionCoup,
  precisionPartie,
  SEUILS_PAR_DEFAUT,
  type Classement,
  type SeuilsClassification,
} from '../lib/classification.ts';
import {
  expliquerCoup,
  uciVersSan,
  variantEnSan,
  type Explication,
} from '../lib/explications.ts';
import { estCoupDeTheorie, trouverOuverture } from '../lib/ouvertures.ts';
import {
  evaluationEnCp,
  versPointDeVueBlanc,
  type Evaluation,
} from '../lib/uci.ts';
import type { Moteur, ResultatRecherche } from '../engine/moteur.ts';

export interface CoupAnalyse {
  /** Index du demi-coup depuis le début de la partie analysée. */
  ply: number;
  san: string;
  uci: string;
  couleur: 'w' | 'b';
  /** FEN avant le coup. */
  fenAvant: string;
  /** FEN après le coup. */
  fenApres: string;
  /** Évaluation avant, du point de vue du joueur qui joue ce coup. */
  avant: Evaluation;
  /** Évaluation après, du point de vue du même joueur. */
  apres: Evaluation;
  /** Évaluations ramenées au point de vue des blancs, pour le graphique. */
  cpAvantBlancs: number;
  cpApresBlancs: number;
  classement: Classement;
  perteCp: number;
  pertePdg: number;
  precision: number;
  meilleurUci: string | null;
  meilleurSan: string | null;
  /** Variante recommandée, en SAN, sur 4 à 5 coups. */
  varianteSan: string[];
  /** Variante recommandée, en UCI, pour la rejouer sur l'échiquier. */
  varianteUci: string[];
  explication: Explication;
  estMeilleurCoup: boolean;
}

/** Moyenne simple, ou `null` si la série est vide. */
function moyenne(v: number[]): number | null {
  if (v.length === 0) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

/** Elo estimé d'un camp, d'après ses pertes en positions non décidées. */
function eloDe(pertes: number[]): number | null {
  const m = moyenne(pertes);
  return m === null ? null : eloEstime(m, pertes.length);
}

export interface RapportAnalyse {
  fenDepart: string;
  coups: CoupAnalyse[];
  precisionBlancs: number | null;
  precisionNoirs: number | null;
  /** Perte moyenne en centipions, par camp. */
  perteMoyenneBlancs: number | null;
  perteMoyenneNoirs: number | null;
  /** Elo estimé auquel chaque camp a joué cette partie. */
  eloBlancs: number | null;
  eloNoirs: number | null;
  /**
   * Nombre de coups DISPUTÉS retenus par camp.
   *
   * C'est lui qui décide si le rapport annonce une valeur unique, un
   * intervalle, ou rien du tout. Le conserver évite de devoir refaire
   * l'analyse quand la présentation change.
   */
  coupsRetenusBlancs: number;
  coupsRetenusNoirs: number;
  /** Nombre de coups par classement, pour chaque camp. */
  bilanBlancs: Record<Classement, number>;
  bilanNoirs: Record<Classement, number>;
  momentsCles: CoupAnalyse[];
  ouverture: { eco: string; nom: string } | null;
  /** Profondeur ou temps réellement utilisés. */
  reglages: { profondeur?: number; tempsMs?: number };
  complet: boolean;
}

export interface OptionsAnalyse {
  fenDepart: string;
  /** Coups de la partie en SAN. */
  coupsSan: string[];
  profondeur?: number;
  tempsMs?: number;
  seuils?: SeuilsClassification;
  signal?: AbortSignal;
  /** Appelé après chaque coup analysé, avec l'avancement (0–1). */
  surCoupAnalyse?: (coup: CoupAnalyse, avancement: number) => void;
  surProgression?: (avancement: number, etape: string) => void;
}

function bilanVide(): Record<Classement, number> {
  return {
    theorie: 0,
    unique: 0,
    excellent: 0,
    bon: 0,
    imprecision: 0,
    erreur: 0,
    gaffe: 0,
  };
}

/** Évaluation d'une position terminale, du point de vue du camp au trait. */
function evaluationTerminale(jeu: Chess): Evaluation | null {
  if (jeu.isCheckmate()) return { type: 'mat', valeur: 0 };
  if (jeu.isDraw() || jeu.isStalemate() || jeu.isInsufficientMaterial()) {
    return { type: 'cp', valeur: 0 };
  }
  return null;
}

/** Laisse respirer le thread principal entre deux coups, pour un rendu fluide. */
function cederLeThread(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Analyse la partie. Publie chaque coup dès qu'il est prêt.
 * Lance `AbortError` si `signal` est déclenché : l'appelant peut alors
 * conserver les coups déjà reçus.
 */
/**
 * Borne appliquée à l'évaluation avant d'en tirer une perte.
 *
 * Dix pions : au-delà, la partie est gagnée et l'écart exact n'apprend plus
 * rien sur la qualité du jeu. Borner plutôt qu'exclure garde tous les coups
 * dans l'échantillon — voir `perteBornee`.
 */
const PLAFOND_EVALUATION = 1000;

export async function analyserPartie(
  moteur: Moteur,
  options: OptionsAnalyse,
): Promise<RapportAnalyse> {
  const {
    fenDepart,
    coupsSan,
    seuils = SEUILS_PAR_DEFAUT,
    signal,
    surCoupAnalyse,
    surProgression,
  } = options;

  // Sans réglage explicite, on suit le profil de l'appareil : le temps fixe
  // par coup donne une durée totale prévisible, ce qui compte sur mobile.
  const profondeur = options.profondeur;
  const tempsMs =
    options.tempsMs ?? (profondeur === undefined ? moteur.profil.tempsParCoupMs : undefined);

  // 1. Reconstruit toutes les positions de la partie.
  const jeu = new Chess(fenDepart);
  const positions: string[] = [jeu.fen()];
  const coupsUci: string[] = [];
  const nbCoupsLegaux: number[] = [jeu.moves().length];

  for (const san of coupsSan) {
    const coup = jeu.move(san);
    if (!coup) break; // Partie tronquée : on analyse ce qui est jouable.
    coupsUci.push(`${coup.from}${coup.to}${coup.promotion ?? ''}`);
    positions.push(jeu.fen());
    nbCoupsLegaux.push(jeu.moves().length);
  }

  const nbCoups = coupsUci.length;
  const coups: CoupAnalyse[] = [];

  if (nbCoups === 0) {
    return {
      fenDepart,
      coups,
      precisionBlancs: null,
      precisionNoirs: null,
      perteMoyenneBlancs: null,
      perteMoyenneNoirs: null,
      eloBlancs: null,
      eloNoirs: null,
      coupsRetenusBlancs: 0,
      coupsRetenusNoirs: 0,
      bilanBlancs: bilanVide(),
      bilanNoirs: bilanVide(),
      momentsCles: [],
      ouverture: null,
      reglages: { profondeur, tempsMs },
      complet: true,
    };
  }

  // 2. Évalue chaque position, en réutilisant le résultat d'un coup à l'autre.
  const evaluer = async (index: number): Promise<ResultatRecherche | 'terminale'> => {
    const vue = new Chess(positions[index]);
    if (evaluationTerminale(vue)) return 'terminale';
    return moteur.analyser({
      fen: positions[index],
      profondeur,
      tempsMs,
      multiPV: 2,
      signal,
    });
  };

  const traitDe = (index: number): 'w' | 'b' => (new Chess(positions[index]).turn() === 'w' ? 'w' : 'b');

  /** Évaluation d'une position, du point de vue du camp au trait. */
  const evalDe = (r: ResultatRecherche | 'terminale', index: number): Evaluation => {
    if (r === 'terminale') {
      return evaluationTerminale(new Chess(positions[index])) ?? { type: 'cp', valeur: 0 };
    }
    return r.lignes[0]?.evaluation ?? { type: 'cp', valeur: 0 };
  };

  surProgression?.(0, 'Préparation de l’analyse…');
  let precedent = await evaluer(0);

  const precisionsBlancs: number[] = [];
  const precisionsNoirs: number[] = [];
  // Probabilités de gain alignées sur chaque camp, pour la pondération par
  // volatilité. Une série commune aux deux camps était doublement fausse :
  // elle alternait les points de vue à chaque demi-coup, et son index ne
  // correspondait pas à celui des précisions d'un seul camp.
  const pdgSuiteBlancs: number[] = [];
  const pdgSuiteNoirs: number[] = [];
  // Pertes en centipions, pour l'Elo estimé. Les positions déjà décidées
  // sont écartées plus bas : perdre 300 cp quand on est à +2000 ne dit rien
  // de la force du joueur, et gonflerait la perte moyenne.
  const pertesBlancs: number[] = [];
  const pertesNoirs: number[] = [];
  const bilanBlancs = bilanVide();
  const bilanNoirs = bilanVide();

  for (let i = 0; i < nbCoups; i++) {
    if (signal?.aborted) {
      throw new DOMException('Analyse annulée.', 'AbortError');
    }

    const suivant = await evaluer(i + 1);

    const couleur = traitDe(i);
    const avant = evalDe(precedent, i);
    // L'évaluation de la position d'arrivée est au point de vue de l'adversaire :
    // on l'inverse pour rester du point de vue du joueur qui vient de jouer.
    const apresAdversaire = evalDe(suivant, i + 1);
    const apres: Evaluation =
      apresAdversaire.type === 'cp'
        ? { type: 'cp', valeur: -apresAdversaire.valeur }
        : { type: 'mat', valeur: -apresAdversaire.valeur };

    const meilleurUci = precedent === 'terminale' ? null : precedent.meilleurCoup;
    const pvMeilleure = precedent === 'terminale' ? [] : (precedent.lignes[0]?.pv ?? []);
    const estMeilleurCoup = meilleurUci === coupsUci[i];

    // Écart entre le meilleur coup et le deuxième : sert à repérer
    // les positions où un seul coup tient.
    let ecartDeuxiemeCoup: number | undefined;
    if (precedent !== 'terminale' && precedent.lignes.length >= 2) {
      ecartDeuxiemeCoup =
        evaluationEnCp(precedent.lignes[0].evaluation) -
        evaluationEnCp(precedent.lignes[1].evaluation);
    } else if (nbCoupsLegaux[i] === 1) {
      ecartDeuxiemeCoup = seuils.ecartCoupUnique;
    }

    const dansLaTheorie = i < 20 && estCoupDeTheorie(coupsSan.slice(0, i + 1));

    const { classement, perteCp, pertePdg } = classerCoup({
      avant,
      apres,
      estMeilleurCoup,
      nbCoupsLegaux: nbCoupsLegaux[i],
      ecartDeuxiemeCoup,
      dansLaTheorie,
      seuils,
    });

    const cpAvantBlancs = evaluationEnCp(versPointDeVueBlanc(avant, couleur));
    const cpApresBlancs = evaluationEnCp(versPointDeVueBlanc(apres, couleur));

    // `avant` et `apres` sont déjà au point de vue du joueur qui vient de jouer :
    // la chute de probabilité de gain se lit directement.
    const cpAvantJoueur = evaluationEnCp(avant);
    const cpApresJoueur = evaluationEnCp(apres);

    /**
     * Coups RETENUS pour les moyennes : ceux joués en position encore disputée.
     *
     * Trois méthodes ont été mesurées, sur de vraies parties entre paliers de
     * forces différentes. Aucune n'est parfaite, et il faut dire laquelle on
     * retient et pourquoi.
     *
     *  1. Tout compter, sans borne. La perte explose dès qu'un mat entre en
     *     jeu et n'a plus de rapport avec la force du joueur.
     *
     *  2. Tout compter, sur des évaluations bornées à ±10 pions. Dans la
     *     phase décidée, les deux camps enregistrent une perte nulle coup
     *     après coup. La moyenne se dilue d'autant plus que la partie a été
     *     tranchée tôt — donc d'autant plus que l'adversaire était faible.
     *     Mesuré : un palier 400 et un palier 1600 ressortaient tous deux
     *     autour de 68 cp. Les paliers ne se séparaient plus du tout.
     *
     *  3. Ne compter que les coups joués en position disputée, celle que
     *     retiennent aussi Lichess et Chess.com. Les paliers se séparent
     *     nettement en partie équilibrée — 176 cp pour le plus faible, 4 cp
     *     pour le plus fort. La limite est ailleurs : contre un adversaire
     *     très supérieur, la fenêtre disputée est courte, et l'estimation
     *     porte sur trop peu de coups pour valoir quelque chose.
     *
     * On retient la troisième, et on refuse de se prononcer quand la fenêtre
     * est trop courte (voir `COUPS_MIN_ELO`). Mieux vaut ne rien annoncer
     * qu'annoncer un chiffre que la partie ne porte pas.
     *
     * Point essentiel : le filtre s'applique aux DEUX mesures et porte sur la
     * position, non sur le joueur. Les deux camps sont donc notés sur
     * exactement le même ensemble de coups, ce qui interdit qu'ils se
     * contredisent.
     */
    const pertinent = Math.abs(cpAvantBlancs) < PLAFOND_EVALUATION;

    const borne = (cp: number) => Math.max(-PLAFOND_EVALUATION, Math.min(PLAFOND_EVALUATION, cp));
    const perteBornee = Math.min(
      PLAFOND_PERTE,
      Math.max(0, borne(cpAvantJoueur) - borne(cpApresJoueur)),
    );

    // La précision découle de la MÊME grandeur que la perte moyenne : c'est
    // ce qui garantit qu'elles ne peuvent plus se contredire.
    const precision = precisionCoup(perteBornee);

    const varianteUci = pvMeilleure.slice(0, 5);
    const analyse: CoupAnalyse = {
      ply: i,
      san: coupsSan[i],
      uci: coupsUci[i],
      couleur,
      fenAvant: positions[i],
      fenApres: positions[i + 1],
      avant,
      apres,
      cpAvantBlancs,
      cpApresBlancs,
      classement,
      perteCp,
      pertePdg,
      precision,
      meilleurUci,
      meilleurSan: meilleurUci ? uciVersSan(positions[i], meilleurUci) : null,
      varianteSan: variantEnSan(positions[i], varianteUci, 5),
      varianteUci,
      explication: expliquerCoup({
        fenAvant: positions[i],
        coupJoue: coupsUci[i],
        meilleurCoup: meilleurUci,
        pvMeilleure,
        // La variante calculée sur la position d'arrivée est exactement la
        // réfutation du coup joué : c'est elle qui révèle fourchettes et
        // pièces en prise.
        pvApresCoupJoue: suivant === 'terminale' ? [] : (suivant.lignes[0]?.pv ?? []),
        avant,
        apres,
        nbCoupsLegaux: nbCoupsLegaux[i],
      }),
      estMeilleurCoup,
    };

    coups.push(analyse);
    if (couleur === 'w') {
      if (pertinent) {
        precisionsBlancs.push(precision);
        pertesBlancs.push(perteBornee);
        pdgSuiteBlancs.push(pdgBlancs(avant));
      }
      bilanBlancs[classement] += 1;
    } else {
      if (pertinent) {
        precisionsNoirs.push(precision);
        pertesNoirs.push(perteBornee);
        pdgSuiteNoirs.push(pdgBlancs(avant));
      }
      bilanNoirs[classement] += 1;
    }

    const avancement = (i + 1) / nbCoups;
    surCoupAnalyse?.(analyse, avancement);
    surProgression?.(avancement, `Coup ${i + 1} sur ${nbCoups}`);

    precedent = suivant;
    await cederLeThread();
  }

  const ouverture = trouverOuverture(coupsSan);

  return {
    fenDepart,
    coups,
    precisionBlancs: precisionPartie(precisionsBlancs, pdgSuiteBlancs),
    precisionNoirs: precisionPartie(precisionsNoirs, pdgSuiteNoirs),
    perteMoyenneBlancs: moyenne(pertesBlancs),
    perteMoyenneNoirs: moyenne(pertesNoirs),
    eloBlancs: eloDe(pertesBlancs),
    eloNoirs: eloDe(pertesNoirs),
    coupsRetenusBlancs: pertesBlancs.length,
    coupsRetenusNoirs: pertesNoirs.length,
    bilanBlancs,
    bilanNoirs,
    momentsCles: momentsCharnieres(coups, 3),
    ouverture: ouverture ? { eco: ouverture.eco, nom: ouverture.nom } : null,
    reglages: { profondeur, tempsMs },
    complet: true,
  };
}
