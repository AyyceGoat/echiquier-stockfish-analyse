/**
 * État d'une partie : règles, historique, navigation.
 *
 * Toute la légalité passe par `chess.js` — l'application ne réimplémente
 * aucune règle. Le hook ajoute la navigation dans l'historique et la
 * distinction entre « position affichée » et « position courante », dont les
 * trois modes de jeu ont besoin.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { FEN_INITIALE } from '../lib/fen.ts';

export type Promotion = 'q' | 'r' | 'b' | 'n';

export interface CoupJoue {
  san: string;
  uci: string;
  depuis: string;
  vers: string;
  couleur: 'w' | 'b';
  /** FEN après ce coup. */
  fen: string;
}

export interface FinDePartie {
  resultat: '1-0' | '0-1' | '1/2-1/2';
  raison: string;
}

export interface EtatPartie {
  /** FEN de la position affichée (peut être une position passée). */
  fen: string;
  /** FEN de la position courante, à la fin de la liste des coups. */
  fenCourante: string;
  fenDepart: string;
  coups: CoupJoue[];
  /** Index du coup affiché : -1 = position de départ. */
  indexAffiche: number;
  /** L'affichage est-il sur le dernier coup ? */
  surLeDernierCoup: boolean;
  trait: 'w' | 'b';
  /** Trait de la position affichée. */
  traitAffiche: 'w' | 'b';
  destinations: Map<string, string[]>;
  dernierCoup: [string, string] | null;
  echec: 'white' | 'black' | null;
  fin: FinDePartie | null;
  orientation: 'white' | 'black';
}

export interface ApiPartie extends EtatPartie {
  jouerCoup: (depuis: string, vers: string, promotion?: Promotion) => CoupJoue | null;
  /** Le coup demande-t-il de choisir une pièce de promotion ? */
  demandePromotion: (depuis: string, vers: string) => boolean;
  annulerDernierCoup: () => void;
  aller: (index: number) => void;
  precedent: () => void;
  suivant: () => void;
  debut: () => void;
  finListe: () => void;
  retourner: () => void;
  definirOrientation: (o: 'white' | 'black') => void;
  reinitialiser: (fenDepart?: string) => void;
  /** Charge une partie existante (FEN de départ + coups en SAN). */
  charger: (fenDepart: string, coupsSan: string[]) => void;
  coupsSan: string[];
  pgn: string;
}

function detecterFin(jeu: Chess): FinDePartie | null {
  if (!jeu.isGameOver()) return null;
  if (jeu.isCheckmate()) {
    // Le camp au trait est mat : c'est l'autre qui gagne.
    return jeu.turn() === 'w'
      ? { resultat: '0-1', raison: 'Échec et mat' }
      : { resultat: '1-0', raison: 'Échec et mat' };
  }
  if (jeu.isStalemate()) return { resultat: '1/2-1/2', raison: 'Pat' };
  if (jeu.isInsufficientMaterial()) {
    return { resultat: '1/2-1/2', raison: 'Matériel insuffisant' };
  }
  if (jeu.isThreefoldRepetition()) {
    return { resultat: '1/2-1/2', raison: 'Triple répétition' };
  }
  return { resultat: '1/2-1/2', raison: 'Règle des 50 coups' };
}

function calculerDestinations(jeu: Chess): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const coup of jeu.moves({ verbose: true })) {
    const liste = m.get(coup.from);
    if (liste) liste.push(coup.to);
    else m.set(coup.from, [coup.to]);
  }
  return m;
}

export function usePartie(fenDepartInitial: string = FEN_INITIALE): ApiPartie {
  // L'instance `chess.js` est mutable et vit dans une ref : la recréer à
  // chaque rendu coûterait cher et casserait la détection de répétition,
  // qui dépend de l'historique interne.
  const jeu = useRef<Chess>(new Chess(fenDepartInitial));
  const [fenDepart, setFenDepart] = useState(fenDepartInitial);
  const [coups, setCoups] = useState<CoupJoue[]>([]);
  const [indexAffiche, setIndexAffiche] = useState(-1);
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    new Chess(fenDepartInitial).turn() === 'b' ? 'black' : 'white',
  );
  // Compteur de révision : force le recalcul des valeurs dérivées après
  // une mutation de l'instance `chess.js`.
  const [revision, setRevision] = useState(0);

  const surLeDernierCoup = indexAffiche === coups.length - 1;

  const fenCourante = coups.length ? coups[coups.length - 1].fen : fenDepart;
  const fen = indexAffiche < 0 ? fenDepart : coups[indexAffiche].fen;

  const derive = useMemo(() => {
    // `revision` n'est pas lu mais conditionne le recalcul après mutation.
    void revision;
    const surDernier = indexAffiche === coups.length - 1;
    const vueCourante = new Chess(fenCourante);
    // On n'instancie une seconde position que si l'affichage est en arrière.
    const vueAffichee = surDernier ? vueCourante : new Chess(fen);

    return {
      trait: vueCourante.turn() as 'w' | 'b',
      traitAffiche: vueAffichee.turn() as 'w' | 'b',
      // On ne propose des coups que sur la position courante : jouer depuis
      // une position passée réécrirait la partie sans que ce soit demandé.
      destinations: surDernier ? calculerDestinations(vueCourante) : new Map<string, string[]>(),
      fin: detecterFin(vueCourante),
      echec: vueAffichee.isCheck()
        ? ((vueAffichee.turn() === 'w' ? 'white' : 'black') as 'white' | 'black')
        : null,
    };
  }, [fen, fenCourante, indexAffiche, coups.length, revision]);

  const dernierCoup = useMemo<[string, string] | null>(() => {
    if (indexAffiche < 0) return null;
    const c = coups[indexAffiche];
    return c ? [c.depuis, c.vers] : null;
  }, [coups, indexAffiche]);

  const demandePromotion = useCallback(
    (depuis: string, vers: string): boolean => {
      const vue = new Chess(fenCourante);
      const piece = vue.get(depuis as Square);
      if (!piece || piece.type !== 'p') return false;
      const rangee = vers[1];
      return (piece.color === 'w' && rangee === '8') || (piece.color === 'b' && rangee === '1');
    },
    [fenCourante],
  );

  const jouerCoup = useCallback(
    (depuis: string, vers: string, promotion: Promotion = 'q'): CoupJoue | null => {
      // Si l'affichage est en arrière, on revient d'abord sur la position
      // courante : jouer ne doit jamais écraser silencieusement des coups.
      if (indexAffiche !== coups.length - 1) {
        setIndexAffiche(coups.length - 1);
        return null;
      }
      try {
        const coup = jeu.current.move({
          from: depuis as Square,
          to: vers as Square,
          promotion,
        });
        if (!coup) return null;
        const joue: CoupJoue = {
          san: coup.san,
          uci: `${coup.from}${coup.to}${coup.promotion ?? ''}`,
          depuis: coup.from,
          vers: coup.to,
          couleur: coup.color as 'w' | 'b',
          fen: jeu.current.fen(),
        };
        setCoups((precedents) => {
          const suite = [...precedents, joue];
          setIndexAffiche(suite.length - 1);
          return suite;
        });
        setRevision((r) => r + 1);
        return joue;
      } catch {
        // `chess.js` lève sur un coup illégal : l'échiquier se resynchronise
        // au rendu suivant puisqu'il reçoit toujours le FEN de référence.
        return null;
      }
    },
    [coups.length, indexAffiche],
  );

  const annulerDernierCoup = useCallback(() => {
    if (coups.length === 0) return;
    jeu.current.undo();
    setCoups((precedents) => {
      const suite = precedents.slice(0, -1);
      setIndexAffiche(suite.length - 1);
      return suite;
    });
    setRevision((r) => r + 1);
  }, [coups.length]);

  const aller = useCallback(
    (index: number) => {
      setIndexAffiche(Math.max(-1, Math.min(coups.length - 1, index)));
    },
    [coups.length],
  );

  const precedent = useCallback(() => setIndexAffiche((i) => Math.max(-1, i - 1)), []);
  const suivant = useCallback(
    () => setIndexAffiche((i) => Math.min(coups.length - 1, i + 1)),
    [coups.length],
  );
  const debut = useCallback(() => setIndexAffiche(-1), []);
  const finListe = useCallback(() => setIndexAffiche(coups.length - 1), [coups.length]);

  const retourner = useCallback(
    () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
    [],
  );

  const reinitialiser = useCallback((nouveauFen: string = FEN_INITIALE) => {
    jeu.current = new Chess(nouveauFen);
    setFenDepart(nouveauFen);
    setCoups([]);
    setIndexAffiche(-1);
    setRevision((r) => r + 1);
  }, []);

  const charger = useCallback((depart: string, coupsSan: string[]) => {
    const instance = new Chess(depart);
    const liste: CoupJoue[] = [];
    for (const san of coupsSan) {
      try {
        const coup = instance.move(san);
        if (!coup) break;
        liste.push({
          san: coup.san,
          uci: `${coup.from}${coup.to}${coup.promotion ?? ''}`,
          depuis: coup.from,
          vers: coup.to,
          couleur: coup.color as 'w' | 'b',
          fen: instance.fen(),
        });
      } catch {
        break;
      }
    }
    jeu.current = instance;
    setFenDepart(depart);
    setCoups(liste);
    setIndexAffiche(liste.length - 1);
    setRevision((r) => r + 1);
  }, []);

  const coupsSan = useMemo(() => coups.map((c) => c.san), [coups]);
  const pgn = useMemo(() => {
    void revision;
    return jeu.current.pgn();
  }, [revision]);

  return {
    fen,
    fenCourante,
    fenDepart,
    coups,
    indexAffiche,
    surLeDernierCoup,
    trait: derive.trait,
    traitAffiche: derive.traitAffiche,
    destinations: derive.destinations,
    dernierCoup,
    echec: derive.echec,
    fin: derive.fin,
    orientation,
    jouerCoup,
    demandePromotion,
    annulerDernierCoup,
    aller,
    precedent,
    suivant,
    debut,
    finListe,
    retourner,
    definirOrientation: setOrientation,
    reinitialiser,
    charger,
    coupsSan,
    pgn,
  };
}
