/**
 * Briques d'interface partagées.
 * Toutes respectent la taille de cible tactile minimale (44 px).
 */

import type { ReactNode } from 'react';
import { COULEURS, LIBELLES, type Classement } from '../lib/classification.ts';
import { CP_MAT, formaterEvaluation, type Evaluation } from '../lib/uci.ts';

export function Carte({
  titre,
  action,
  children,
  className = '',
}: {
  titre?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[var(--color-bordure)] bg-[var(--color-fond-2)] ${className}`}
    >
      {(titre || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-bordure)] px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--color-texte)]">{titre}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Bouton({
  children,
  onClick,
  variante = 'neutre',
  disabled,
  className = '',
  type = 'button',
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'principal' | 'neutre' | 'discret' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}) {
  const styles: Record<string, string> = {
    principal:
      'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-fort)] active:scale-[0.98]',
    neutre:
      'bg-[var(--color-fond-3)] text-[var(--color-texte)] hover:bg-[var(--color-bordure)] active:scale-[0.98]',
    discret:
      'bg-transparent text-[var(--color-texte-doux)] hover:text-[var(--color-texte)] hover:bg-[var(--color-fond-3)]',
    danger: 'bg-red-600/90 text-white hover:bg-red-600 active:scale-[0.98]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`cible-tactile inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[background-color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${styles[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Etiquette({ children, ton = 'neutre' }: { children: ReactNode; ton?: string }) {
  const tons: Record<string, string> = {
    neutre: 'bg-[var(--color-fond-3)] text-[var(--color-texte-doux)]',
    succes: 'bg-emerald-500/15 text-emerald-300',
    alerte: 'bg-amber-500/15 text-amber-300',
    danger: 'bg-red-500/15 text-red-300',
    info: 'bg-sky-500/15 text-sky-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tons[ton] ?? tons.neutre}`}>
      {children}
    </span>
  );
}

/** Barre d'évaluation verticale, du point de vue des blancs. */
export function BarreEval({
  cpBlancs,
  orientation,
}: {
  cpBlancs: number | null;
  orientation: 'white' | 'black';
}) {
  // Échelle non linéaire : les premiers centipions comptent beaucoup plus
  // qu'un écart de 800 à 900, comme sur une barre d'évaluation classique.
  const part =
    cpBlancs === null
      ? 50
      : Math.abs(cpBlancs) >= CP_MAT - 1000
        ? cpBlancs > 0
          ? 100
          : 0
        : 50 + 50 * Math.tanh(cpBlancs / 400);

  const hauteurBlancs = Math.max(2, Math.min(98, part));
  const enBas = orientation === 'white';

  return (
    <div
      className="relative h-full w-3 shrink-0 overflow-hidden rounded-full bg-neutral-900 sm:w-4"
      role="img"
      aria-label={`Évaluation : ${cpBlancs === null ? 'inconnue' : (cpBlancs / 100).toFixed(2)}`}
    >
      <div
        className="barre-eval absolute w-full bg-neutral-100"
        style={{
          height: `${hauteurBlancs}%`,
          [enBas ? 'bottom' : 'top']: 0,
        }}
      />
    </div>
  );
}

export function ClassementCoup({ classement }: { classement: Classement }) {
  return (
    <span className={`text-xs font-semibold ${COULEURS[classement]}`}>{LIBELLES[classement]}</span>
  );
}

export function AffichageEval({
  evaluation,
  profondeur,
}: {
  evaluation?: Evaluation;
  profondeur?: number;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-2xl font-semibold tabular-nums">
        {formaterEvaluation(evaluation)}
      </span>
      {profondeur ? (
        <span className="text-xs text-[var(--color-texte-doux)]">prof. {profondeur}</span>
      ) : null}
    </div>
  );
}

/** Message d'erreur explicite, avec conseil de résolution. */
export function Alerte({
  titre,
  children,
  ton = 'danger',
  action,
}: {
  titre: string;
  children?: ReactNode;
  ton?: 'danger' | 'alerte' | 'info';
  action?: ReactNode;
}) {
  const tons = {
    danger: 'border-red-500/40 bg-red-500/10 text-red-200',
    alerte: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tons[ton]}`} role="alert">
      <p className="font-semibold">{titre}</p>
      {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function BarreProgression({ valeur, libelle }: { valeur: number; libelle?: string }) {
  const pct = Math.max(0, Math.min(100, valeur * 100));
  return (
    <div>
      {libelle ? (
        <div className="mb-1.5 flex justify-between text-xs text-[var(--color-texte-doux)]">
          <span>{libelle}</span>
          <span className="tabular-nums">{Math.round(pct)} %</span>
        </div>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-fond-3)]"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas = 1,
  onChange,
  suffixe,
}: {
  libelle: string;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  onChange: (v: number) => void;
  suffixe?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-[var(--color-texte-doux)]">{libelle}</span>
        <span className="font-mono tabular-nums">
          {valeur}
          {suffixe ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

export function Interrupteur({
  libelle,
  description,
  actif,
  onChange,
}: {
  libelle: string;
  description?: string;
  actif: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={() => onChange(!actif)}
      className="cible-tactile flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left"
    >
      <span>
        <span className="block text-sm">{libelle}</span>
        {description ? (
          <span className="block text-xs text-[var(--color-texte-doux)]">{description}</span>
        ) : null}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          actif ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-fond-3)]'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
            actif ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

export function ChampTexte({
  libelle,
  valeur,
  onChange,
  placeholder,
  type = 'text',
  aide,
  mono,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  aide?: ReactNode;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-[var(--color-texte-doux)]">{libelle}</span>
      <input
        type={type}
        value={valeur}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={`cible-tactile w-full rounded-xl border border-[var(--color-bordure)] bg-[var(--color-fond)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] ${
          mono ? 'font-mono' : ''
        }`}
      />
      {aide ? <span className="mt-1.5 block text-xs text-[var(--color-texte-doux)]">{aide}</span> : null}
    </label>
  );
}

export function Segmente<T extends string>({
  valeur,
  options,
  onChange,
  ariaLabel,
}: {
  valeur: T;
  options: { valeur: T; libelle: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-xl bg-[var(--color-fond-3)] p-1"
    >
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          role="radio"
          aria-checked={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`cible-tactile flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            valeur === o.valeur
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]'
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}
