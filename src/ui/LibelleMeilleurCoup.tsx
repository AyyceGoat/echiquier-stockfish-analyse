/**
 * Libellé du meilleur coup, affiché sous l'échiquier.
 *
 * Une seule ligne : le coup, sa qualité, son évaluation. La qualité vient en
 * premier parce que c'est l'information qu'on lit sans y penser ; le chiffre
 * vient en dernier, en plus petit, pour ceux qui le lisent.
 */

import { LIBELLE_QUALITE, type QualiteCoup } from '../lib/qualiteCoup.ts';
import { formaterEvaluation, type Evaluation } from '../lib/uci.ts';

const COULEUR_QUALITE: Record<QualiteCoup, string> = {
  meilleur: 'text-emerald-400',
  brillant: 'text-violet-400',
  force: 'text-sky-400',
};

export function LibelleMeilleurCoup({
  san,
  evaluation,
  qualite,
  profondeur,
  estUneAlternative,
  onRevenirAuMeilleur,
}: {
  san: string | null;
  evaluation?: Evaluation;
  qualite: QualiteCoup;
  profondeur?: number;
  /** true si la flèche montre une ligne choisie à la main, pas le meilleur coup. */
  estUneAlternative?: boolean;
  onRevenirAuMeilleur?: () => void;
}) {
  if (!san) {
    return (
      <p className="mt-3 text-center text-sm text-[var(--color-texte-doux)]">
        Recherche du meilleur coup…
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
      <span
        className={`text-sm font-semibold ${
          estUneAlternative ? 'text-[var(--color-texte-doux)]' : COULEUR_QUALITE[qualite]
        }`}
      >
        {estUneAlternative ? 'Variante affichée' : LIBELLE_QUALITE[qualite]}
      </span>
      <span className="font-mono text-lg font-semibold">{san}</span>
      <span className="font-mono text-sm text-[var(--color-texte-doux)] tabular-nums">
        {formaterEvaluation(evaluation)}
      </span>
      {profondeur ? (
        <span className="text-xs text-[var(--color-texte-doux)]">prof. {profondeur}</span>
      ) : null}
      {estUneAlternative && onRevenirAuMeilleur ? (
        <button
          type="button"
          onClick={onRevenirAuMeilleur}
          className="cible-tactile rounded-lg px-2 text-xs text-[var(--color-accent)] underline"
        >
          Revenir au meilleur coup
        </button>
      ) : null}
    </div>
  );
}
