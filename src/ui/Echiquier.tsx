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
  /**
   * UNE flèche au plus, jamais davantage.
   *
   * La propriété est volontairement au singulier : plusieurs flèches
   * simultanées rendent l'échiquier illisible, on ne sait plus laquelle
   * regarder. Passer par un tableau laisserait la porte ouverte à la
   * régression ; ici la règle tient par construction.
   */
  fleche?: FlecheEchiquier | null;
  /** Cases à surligner (analyse, correction). */
  surlignages?: { case: string; classe: string }[];
  coordonnees?: boolean;
  animations?: boolean;
  onCoup?: (depuis: string, vers: string) => void;
  /** Clic simple sur une case, utilisé par l'écran de correction. */
  onClicCase?: (caseCliquee: string) => void;
  /** Taille maximale de l'échiquier, en unités CSS. */
  tailleMax?: string;
  /**
   * Force la réapplication de la position, même si le FEN n'a pas changé.
   *
   * Chessground déplace la pièce dès que l'utilisateur la lâche, sans
   * attendre notre accord. Quand on refuse ce coup et qu'on revient au MÊME
   * FEN, React ne voit aucun changement et l'échiquier reste dans l'état
   * refusé. Incrémenter ce compteur le remet en place.
   */
  revision?: number;
}

export function Echiquier({
  fen,
  orientation,
  destinations,
  couleurJouable,
  trait,
  dernierCoup,
  echec,
  fleche,
  surlignages,
  coordonnees = true,
  animations = true,
  onCoup,
  onClicCase,
  tailleMax = 'min(88vw, 62vh, 34rem)',
  revision = 0,
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
      fleche
        ? [
            {
              orig: fleche.depuis as Key,
              dest: fleche.vers as Key,
              brush: fleche.couleur ?? 'green',
            },
          ]
        : [],
    // Les champs sont listés un par un : l'objet change d'identité à chaque
    // rendu du parent, alors que la flèche ne bouge pas. Sans cela,
    // Chessground redessinerait la flèche plusieurs fois par seconde pendant
    // une analyse, ce qui la fait clignoter.
    [fleche?.depuis, fleche?.vers, fleche?.couleur],
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
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        // Pinceaux réaccordés pour le plateau en noyer. Le vert d'origine
        // (#15781B) est presque aussi sombre que les cases foncées : la
        // flèche s'y perdait. Ces teintes sont celles des couleurs
        // sémantiques de l'application, remontées en luminosité pour tenir
        // sur le bois.
        brushes: {
          green: { key: 'g', color: '#3fbf63', opacity: 0.95, lineWidth: 10 },
          red: { key: 'r', color: '#e0503f', opacity: 0.95, lineWidth: 10 },
          blue: { key: 'b', color: '#3f9ed6', opacity: 0.95, lineWidth: 10 },
          yellow: { key: 'y', color: '#e9b949', opacity: 0.95, lineWidth: 10 },
          paleBlue: { key: 'pb', color: '#3f9ed6', opacity: 0.4, lineWidth: 15 },
          paleGreen: { key: 'pg', color: '#3fbf63', opacity: 0.4, lineWidth: 15 },
          paleRed: { key: 'pr', color: '#e0503f', opacity: 0.4, lineWidth: 15 },
          paleGrey: { key: 'pgr', color: '#8a8177', opacity: 0.35, lineWidth: 15 },
          purple: { key: 'purple', color: '#a877c9', opacity: 0.65, lineWidth: 10 },
        },
      },
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

  // `.cg-wrap` est créé par Chessground : on ne peut pas lui passer de
  // classe par JSX, il faut la poser après coup.
  useEffect(() => {
    const wrap = conteneur.current?.querySelector('.cg-wrap');
    wrap?.classList.toggle('sans-fioritures', !animations);
  }, [animations]);

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
    revision,
  ]);

  return (
    <div
      className="zone-echiquier mx-auto w-full"
      style={{ maxWidth: tailleMax }}
      aria-label="Échiquier"
      id={idZone}
    >
      {/* Le rapport d'aspect garantit un carré parfait sans calcul en JS.
          Il réserve aussi la place du plateau avant que Chessground n'ait
          rendu quoi que ce soit : la page ne bouge pas au montage. */}
      <div className="plateau-cadre relative aspect-square w-full max-w-full">
        <div ref={conteneur} className="absolute inset-0" />
      </div>
    </div>
  );
}
