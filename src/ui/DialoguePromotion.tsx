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
      className="voile-entre fixed inset-0 z-50 flex items-center justify-center bg-[rgb(10_7_4/0.68)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choix de la pièce de promotion"
      onClick={onAnnuler}
    >
      <div
        className="panneau-entre w-full max-w-xs rounded-[var(--radius-lg)] border border-[var(--color-bordure)] bg-[var(--color-fond-2)] p-4 shadow-[var(--ombre-relief)]"
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
              className="cible-tactile flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-bordure)] bg-[var(--color-fond-3)] transition-[background-color,transform] duration-[var(--t-rapide)] hover:border-[var(--color-accent)] active:scale-95"
            >
              <span
                aria-hidden
                className="text-3xl leading-none"
                style={{
                  // Les glyphes sont pleins : on les peint à la couleur du
                  // camp, avec un liseré de l'autre pour rester lisibles sur
                  // les deux thèmes.
                  color: couleur === 'w' ? '#f7f2e8' : '#15110d',
                  textShadow: couleur === 'w' ? '0 0 2px #15110d' : '0 0 2px #f7f2e8',
                }}
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
          className="cible-tactile mt-3 w-full rounded-[var(--radius-md)] py-2 text-sm text-[var(--color-texte-doux)] transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-fond-3)] hover:text-[var(--color-texte)]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
