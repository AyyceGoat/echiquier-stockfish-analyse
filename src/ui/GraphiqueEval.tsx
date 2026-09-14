/**
 * Graphique d'évaluation sur toute la partie.
 *
 * Rendu en SVG plutôt qu'avec une bibliothèque de graphiques : la courbe est
 * une simple polyligne, et éviter une dépendance de 50 Ko compte dans le
 * budget de chargement mobile. Le SVG est aussi net sur écran haute densité
 * et reste cliquable case par case.
 */

import { useMemo } from 'react';
import { CP_MAT } from '../lib/uci.ts';

export interface PointEval {
  ply: number;
  cpBlancs: number;
  classement?: string;
}

const HAUTEUR = 96;

/** Compresse l'évaluation vers [-1, 1] pour que la courbe reste lisible. */
function normaliser(cp: number): number {
  if (Math.abs(cp) >= CP_MAT - 1000) return cp > 0 ? 1 : -1;
  return Math.tanh(cp / 350);
}

export function GraphiqueEval({
  points,
  indexActif,
  onSelection,
}: {
  points: PointEval[];
  indexActif: number;
  onSelection: (index: number) => void;
}) {
  const largeur = Math.max(points.length, 2);

  const { chemin, aire } = useMemo(() => {
    if (points.length === 0) return { chemin: '', aire: '' };
    const y = (cp: number) => HAUTEUR / 2 - (normaliser(cp) * HAUTEUR) / 2;
    const coords = points.map((p, i) => `${i},${y(p.cpBlancs).toFixed(2)}`);
    return {
      chemin: `M ${coords.join(' L ')}`,
      aire: `M 0,${HAUTEUR / 2} L ${coords.join(' L ')} L ${points.length - 1},${HAUTEUR / 2} Z`,
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--color-texte-doux)]">
        Le graphique apparaîtra au fil de l’analyse.
      </p>
    );
  }

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${largeur - 1} ${HAUTEUR}`}
        preserveAspectRatio="none"
        className="h-24 w-full touch-none"
        role="img"
        aria-label="Courbe d’évaluation de la partie"
      >
        {/* Moitié supérieure : avantage aux blancs. */}
        <rect x={0} y={0} width={largeur} height={HAUTEUR / 2} className="fill-neutral-100/10" />
        <rect
          x={0}
          y={HAUTEUR / 2}
          width={largeur}
          height={HAUTEUR / 2}
          className="fill-neutral-900/40"
        />
        <path d={aire} className="fill-neutral-100/25" />
        <path
          d={chemin}
          className="stroke-neutral-100"
          strokeWidth={0.8}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          y1={HAUTEUR / 2}
          x2={largeur}
          y2={HAUTEUR / 2}
          className="stroke-[var(--color-texte-doux)]"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
        {indexActif >= 0 && indexActif < points.length ? (
          <line
            x1={indexActif}
            y1={0}
            x2={indexActif}
            y2={HAUTEUR}
            className="stroke-[var(--color-accent)]"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {/* Zones cliquables superposées : chaque coup a sa colonne, ce qui
          garantit une cible tactile utilisable même sur une longue partie. */}
      <div className="absolute inset-0 flex">
        {points.map((p, i) => (
          <button
            key={p.ply}
            type="button"
            onClick={() => onSelection(i)}
            aria-label={`Aller au coup ${Math.floor(p.ply / 2) + 1}`}
            className="h-full flex-1 focus:bg-white/10 focus:outline-none"
            style={{ minWidth: 0 }}
          />
        ))}
      </div>
    </div>
  );
}
