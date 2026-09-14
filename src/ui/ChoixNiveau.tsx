/**
 * Choix du niveau du moteur.
 *
 * Une liste de paliers nommés, avec leur ordre de grandeur Elo et ce à quoi
 * s'attendre. Un curseur de 0 à 20 n'apprenait rien : « niveau 7 » ne dit pas
 * si l'on affronte un débutant ou un joueur de club.
 */

import { libelleNiveau, NIVEAUX, niveauParId } from '../lib/niveaux.ts';

export function ChoixNiveau({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Niveau du moteur">
      {NIVEAUX.map((n) => {
        const actif = n.id === valeur;
        return (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(n.id)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              actif
                ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                : 'border-[var(--color-bordure)] hover:border-[var(--color-texte-doux)]'
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{n.libelle}</span>
              <span className="font-mono text-xs text-[var(--color-texte-doux)]">
                {n.elo === null ? 'pleine force' : `~${n.elo} Elo`}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
              {n.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Bandeau discret rappelant le niveau affronté, visible pendant toute la partie. */
export function NiveauActif({ id }: { id: string }) {
  const n = niveauParId(id);
  return (
    <span className="rounded-full bg-[var(--color-fond-3)] px-2.5 py-1 text-xs text-[var(--color-texte-doux)]">
      Niveau : <span className="font-medium text-[var(--color-texte)]">{libelleNiveau(n)}</span>
    </span>
  );
}
