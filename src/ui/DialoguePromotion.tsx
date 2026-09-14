/**
 * Choix de la pièce de promotion.
 * Boutons volontairement larges : c'est une action tactile fréquente
 * et une erreur de choix n'est pas rattrapable sans annuler le coup.
 */

import type { Promotion } from '../hooks/usePartie.ts';

const CHOIX: { valeur: Promotion; libelle: string; glyphe: string }[] = [
  { valeur: 'q', libelle: 'Dame', glyphe: '♕' },
  { valeur: 'r', libelle: 'Tour', glyphe: '♖' },
  { valeur: 'b', libelle: 'Fou', glyphe: '♗' },
  { valeur: 'n', libelle: 'Cavalier', glyphe: '♘' },
];

export function DialoguePromotion({
  couleur,
  onChoisir,
  onAnnuler,
}: {
  couleur: 'w' | 'b';
  onChoisir: (p: Promotion) => void;
  onAnnuler: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choix de la pièce de promotion"
      onClick={onAnnuler}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-[var(--color-bordure)] bg-[var(--color-fond-2)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm text-[var(--color-texte-doux)]">
          Promouvoir le pion en :
        </p>
        <div className="grid grid-cols-4 gap-2">
          {CHOIX.map((c) => (
            <button
              key={c.valeur}
              type="button"
              onClick={() => onChoisir(c.valeur)}
              aria-label={c.libelle}
              className="cible-tactile flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-[var(--color-fond-3)] hover:bg-[var(--color-bordure)]"
            >
              <span
                aria-hidden
                className={`text-3xl leading-none ${
                  couleur === 'w' ? 'text-neutral-100' : 'text-neutral-900'
                }`}
                style={{ textShadow: couleur === 'w' ? '0 0 2px #000' : '0 0 2px #fff' }}
              >
                {c.glyphe}
              </span>
              <span className="text-[0.65rem] text-[var(--color-texte-doux)]">{c.libelle}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAnnuler}
          className="cible-tactile mt-3 w-full rounded-xl py-2 text-sm text-[var(--color-texte-doux)] hover:bg-[var(--color-fond-3)]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
