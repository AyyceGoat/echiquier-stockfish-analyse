/**
 * Enveloppe React autour de Chessground.
 *
 * Chessground est le moteur de rendu de Lichess : il anime les pièces par
 * `transform` uniquement et gère nativement le glisser-déposer tactile,
 * les flèches et les pré-coups. C'est ce qui permet de tenir 60 images par
 * seconde sur un téléphone d'entrée de gamme, là où un rendu React par case
 * provoquerait un rendu complet à chaque déplacement du doigt.
 *
 * Le composant ne recrée jamais l'instance Chessground : il lui applique
 * des mises à jour ciblées via `set()`.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';

export interface FlecheEchiquier {
  depuis: string;
  vers: string;
  couleur?: 'green' | 'red' | 'blue' | 'yellow';
}

export interface ProprietesEchiquier {
  fen: string;
  orientation: 'white' | 'black';
  /** Coups légaux : case de départ -> cases d'arrivée. */
  destinations?: Map<string, string[]>;
  /** Camp autorisé à jouer : `undefined` = échiquier en lecture seule. */
  couleurJouable?: 'white' | 'black' | 'both';
  trait?: 'white' | 'black';
  dernierCoup?: [string, string] | null;
  /** Camp en échec, s'il y en a un : Chessground surligne son roi lui-même. */
  echec?: 'white' | 'black' | null;
  fleches?: FlecheEchiquier[];
  /** Cases à surligner (analyse, correction). */
  surlignages?: { case: string; classe: string }[];
  coordonnees?: boolean;
  animations?: boolean;
  onCoup?: (depuis: string, vers: string) => void;
  /** Clic simple sur une case, utilisé par l'écran de correction. */
  onClicCase?: (caseCliquee: string) => void;
  /** Taille maximale de l'échiquier, en unités CSS. */
  tailleMax?: string;
}

export function Echiquier({
  fen,
  orientation,
  destinations,
  couleurJouable,
  trait,
  dernierCoup,
  echec,
  fleches,
  surlignages,
  coordonnees = true,
  animations = true,
  onCoup,
  onClicCase,
  tailleMax = 'min(88vw, 62vh, 34rem)',
}: ProprietesEchiquier) {
  const conteneur = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const rappelCoup = useRef(onCoup);
  const rappelClic = useRef(onClicCase);
  const idZone = useId();

  // On garde les rappels dans des refs : Chessground n'est configuré qu'une
  // fois, mais doit toujours appeler la version la plus récente.
  rappelCoup.current = onCoup;
  rappelClic.current = onClicCase;

  const formes: DrawShape[] = useMemo(
    () =>
      (fleches ?? []).map((f) => ({
        orig: f.depuis as Key,
        dest: f.vers as Key,
        brush: f.couleur ?? 'green',
      })),
    [fleches],
  );

  const dests = useMemo(() => {
    if (!destinations) return undefined;
    const m = new Map<Key, Key[]>();
    for (const [depuis, vers] of destinations) m.set(depuis as Key, vers as Key[]);
    return m;
  }, [destinations]);

  // Création unique.
  useEffect(() => {
    if (!conteneur.current) return;
    const instance = Chessground(conteneur.current, {
      fen,
      orientation,
      coordinates: coordonnees,
      addPieceZIndex: true,
      // La durée d'animation reste courte : au-delà, le jeu paraît mou
      // et la file de coups s'accumule pendant une navigation rapide.
      animation: { enabled: animations, duration: 180 },
      movable: {
        free: false,
        showDests: true,
        // `movable.events.after` ne se déclenche que sur un coup de
        // l'utilisateur ; `events.move` se déclencherait aussi sur les coups
        // appliqués par le code, ce qui créerait une boucle.
        events: { after: (depuis, vers) => rappelCoup.current?.(depuis, vers) },
      },
      draggable: { enabled: true, showGhost: true, distance: 3 },
      selectable: { enabled: true },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true, defaultSnapToValidMove: true },
      events: {
        select: (caseCliquee) => rappelClic.current?.(caseCliquee),
      },
    });
    api.current = instance;
    return () => {
      instance.destroy();
      api.current = null;
    };
    // Volontairement sans dépendances : l'instance ne doit jamais être recréée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const custom = useMemo(() => {
    const m = new Map<Key, string>();
    for (const s of surlignages ?? []) m.set(s.case as Key, s.classe);
    return m;
  }, [surlignages]);

  // Mises à jour ciblées. Une seule passe `set()` : Chessground recalcule
  // son rendu une fois, au lieu d'une fois par propriété modifiée.
  useEffect(() => {
    const cg = api.current;
    if (!cg) return;

    const config: Config = {
      fen,
      orientation,
      coordinates: coordonnees,
      animation: { enabled: animations, duration: 180 },
      turnColor: trait ?? 'white',
      check: echec ?? false,
      lastMove: dernierCoup ? [dernierCoup[0] as Key, dernierCoup[1] as Key] : undefined,
      movable: {
        free: false,
        color: couleurJouable,
        dests,
        showDests: true,
      },
      highlight: { lastMove: true, check: true, custom },
      drawable: { autoShapes: formes },
    };
    cg.set(config);
  }, [
    fen,
    orientation,
    coordonnees,
    animations,
    trait,
    echec,
    dernierCoup,
    couleurJouable,
    dests,
    formes,
    custom,
  ]);

  return (
    <div
      className="zone-echiquier mx-auto w-full"
      style={{ maxWidth: tailleMax }}
      aria-label="Échiquier"
      id={idZone}
    >
      {/* Le rapport d'aspect garantit un carré parfait sans calcul en JS. */}
      <div className="relative aspect-square w-full max-w-full">
        <div ref={conteneur} className="absolute inset-0" />
      </div>
    </div>
  );
}
