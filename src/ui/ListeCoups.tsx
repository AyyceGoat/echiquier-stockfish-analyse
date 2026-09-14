/**
 * Liste des coups, avec navigation au clic et annotations d'analyse.
 * Fait défiler automatiquement jusqu'au coup courant.
 */

import { useEffect, useRef } from 'react';
import { COULEURS, SYMBOLES, type Classement } from '../lib/classification.ts';

export interface EntreeListe {
  san: string;
  classement?: Classement;
}

export function ListeCoups({
  coups,
  indexActif,
  onSelection,
  plyDepart = 0,
  compacte = false,
}: {
  coups: EntreeListe[];
  indexActif: number;
  onSelection: (index: number) => void;
  plyDepart?: number;
  compacte?: boolean;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const actif = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = actif.current;
    const boite = conteneur.current;
    if (!el || !boite) return;
    // `scrollIntoView` ferait défiler toute la page sur mobile : on ajuste
    // uniquement le défilement interne de la liste.
    const hautEl = el.offsetTop;
    const basEl = hautEl + el.offsetHeight;
    if (hautEl < boite.scrollTop || basEl > boite.scrollTop + boite.clientHeight) {
      boite.scrollTop = hautEl - boite.clientHeight / 2 + el.offsetHeight / 2;
    }
  }, [indexActif]);

  if (coups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--color-texte-doux)]">
        Aucun coup joué pour l’instant.
      </p>
    );
  }

  // Regroupement par coup complet (blanc + noir).
  const lignes: { numero: number; blanc?: EntreeListe & { i: number }; noir?: EntreeListe & { i: number } }[] =
    [];
  coups.forEach((c, i) => {
    const ply = plyDepart + i;
    const numero = Math.floor(ply / 2) + 1;
    let ligne = lignes.find((l) => l.numero === numero);
    if (!ligne) {
      ligne = { numero };
      lignes.push(ligne);
    }
    if (ply % 2 === 0) ligne.blanc = { ...c, i };
    else ligne.noir = { ...c, i };
  });

  const cellule = (entree: (EntreeListe & { i: number }) | undefined) => {
    if (!entree) return <span className="px-2" />;
    const estActif = entree.i === indexActif;
    return (
      <button
        ref={estActif ? actif : undefined}
        type="button"
        onClick={() => onSelection(entree.i)}
        className={`w-full rounded-md px-2 py-1.5 text-left font-mono text-sm transition-colors ${
          estActif
            ? 'bg-[var(--color-accent)] text-white'
            : 'hover:bg-[var(--color-fond-3)]'
        }`}
      >
        <span>{entree.san}</span>
        {entree.classement && SYMBOLES[entree.classement] ? (
          <span className={estActif ? 'text-white' : COULEURS[entree.classement]}>
            {SYMBOLES[entree.classement]}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      ref={conteneur}
      className={`overflow-y-auto overscroll-contain ${compacte ? 'max-h-40' : 'max-h-72'}`}
    >
      <ol className="space-y-0.5">
        {lignes.map((l) => (
          <li key={l.numero} className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1">
            <span className="text-right font-mono text-xs text-[var(--color-texte-doux)]">
              {l.numero}.
            </span>
            {cellule(l.blanc)}
            {cellule(l.noir)}
          </li>
        ))}
      </ol>
    </div>
  );
}
