/**
 * Accès au moteur depuis React.
 *
 * `useEtatMoteur` expose l'état de chargement (téléchargement, démarrage,
 * échec) pour que l'interface ne reste jamais muette.
 * `useAnalyseContinue` maintient une analyse en cours sur une position et la
 * relance proprement à chaque changement, sans jamais empiler deux recherches.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { moteurPartage, type EvenementMoteur, type LignePv } from '../engine/moteur.ts';

export function useMoteur() {
  return moteurPartage();
}

export function useEtatMoteur(): EvenementMoteur {
  const moteur = moteurPartage();
  const [etat, setEtat] = useState<EvenementMoteur>({ etat: 'arrete' });
  useEffect(() => moteur.surEtat(setEtat), [moteur]);
  return etat;
}

export interface AnalyseEnCours {
  lignes: LignePv[];
  profondeur: number;
  enCours: boolean;
  erreur: string | null;
}

/**
 * Analyse en continu la position donnée.
 * Passer `actif = false` arrête l'analyse (mode partie libre, où le moteur
 * ne doit rien afficher).
 */
export function useAnalyseContinue(
  fen: string | null,
  actif: boolean,
  multiPV: number,
  profondeurMax?: number,
): AnalyseEnCours {
  const moteur = moteurPartage();
  const [etat, setEtat] = useState<AnalyseEnCours>({
    lignes: [],
    profondeur: 0,
    enCours: false,
    erreur: null,
  });
  const controleur = useRef<AbortController | null>(null);

  useEffect(() => {
    controleur.current?.abort();

    if (!actif || !fen) {
      setEtat({ lignes: [], profondeur: 0, enCours: false, erreur: null });
      return;
    }

    const ctrl = new AbortController();
    controleur.current = ctrl;
    setEtat((e) => ({ ...e, enCours: true, erreur: null }));

    moteur
      .analyser({
        fen,
        multiPV,
        // Sans profondeur maximale, l'analyse est perpétuelle : c'est ce
        // qu'on veut pour l'étude d'une position.
        infinie: profondeurMax === undefined,
        profondeur: profondeurMax,
        signal: ctrl.signal,
        surProgression: (r) => {
          if (ctrl.signal.aborted) return;
          setEtat({
            lignes: r.lignes,
            profondeur: r.profondeur,
            enCours: true,
            erreur: null,
          });
        },
      })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setEtat({ lignes: r.lignes, profondeur: r.profondeur, enCours: false, erreur: null });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        setEtat({
          lignes: [],
          profondeur: 0,
          enCours: false,
          erreur: e instanceof Error ? e.message : 'Erreur du moteur.',
        });
      });

    return () => ctrl.abort();
  }, [fen, actif, multiPV, profondeurMax, moteur]);

  return etat;
}

/** Demande un coup au moteur, à un niveau de force donné. */
export function useCoupDuMoteur() {
  const moteur = moteurPartage();
  const controleur = useRef<AbortController | null>(null);

  const demander = useCallback(
    async (
      fen: string,
      niveau: number,
      tempsMs: number,
    ): Promise<{ coup: string | null; erreur: string | null }> => {
      controleur.current?.abort();
      const ctrl = new AbortController();
      controleur.current = ctrl;
      try {
        const r = await moteur.analyser({
          fen,
          niveau,
          tempsMs,
          multiPV: 1,
          signal: ctrl.signal,
        });
        return { coup: r.meilleurCoup, erreur: null };
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return { coup: null, erreur: null };
        }
        return {
          coup: null,
          erreur: e instanceof Error ? e.message : 'Le moteur n’a pas pu jouer.',
        };
      }
    },
    [moteur],
  );

  const annuler = useCallback(() => controleur.current?.abort(), []);

  useEffect(() => () => controleur.current?.abort(), []);

  return { demander, annuler };
}
