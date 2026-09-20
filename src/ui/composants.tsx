/**
 * Briques d'interface partagées.
 *
 * Toutes respectent la taille de cible tactile minimale (44 px) et puisent
 * leurs couleurs dans les variables de thème — jamais dans une classe
 * Tailwind figée. C'est la condition pour que les thèmes clair et sombre
 * restent tous les deux lisibles : `text-emerald-400` tombe à 1,9:1 sur
 * l'ivoire, alors que `var(--color-succes)` bascule avec le thème.
 */

import type { ReactNode } from 'react';
import { COULEURS, LIBELLES, type Classement } from '../lib/classification.ts';
import { CP_MAT, formaterEvaluation, type Evaluation } from '../lib/uci.ts';

/**
 * Jetons d'une couleur sémantique : sa teinte pleine, son voile de fond et
 * son trait de bordure.
 *
 * Les trois sont des variables écrites en clair dans la feuille de style,
 * et non des mélanges calculés : `color-mix()` n'arrive qu'avec Safari 16.2
 * et Chrome 111, alors que l'application vise Safari 15 et Chrome 80.
 */
const TONS = {
  succes: { vif: 'var(--color-succes)', voile: 'var(--voile-succes)', bord: 'var(--bord-succes)' },
  alerte: { vif: 'var(--color-alerte)', voile: 'var(--voile-alerte)', bord: 'var(--bord-alerte)' },
  danger: { vif: 'var(--color-danger)', voile: 'var(--voile-danger)', bord: 'var(--bord-danger)' },
  info: { vif: 'var(--color-info)', voile: 'var(--voile-info)', bord: 'var(--bord-info)' },
  accent: { vif: 'var(--color-accent)', voile: 'var(--voile-accent)', bord: 'var(--color-accent)' },
} as const;

export type Ton = keyof typeof TONS;

/* ==========================================================================
   STRUCTURE
   ========================================================================== */

/**
 * En-tête d'écran : titre en serif, sous-titre en une phrase, action
 * éventuelle à droite.
 *
 * Centralisé parce que chaque page le réécrivait à sa façon — d'où des
 * tailles de titre et des marges hautes qui ne tombaient jamais pareil
 * d'un écran à l'autre.
 */
export function EnTetePage({
  titre,
  children,
  action,
}: {
  titre: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-1 pb-1">
      <div className="min-w-0 flex-1">
        <h1 className="titre-ecran text-[1.75rem] sm:text-[2rem]">{titre}</h1>
        {children ? (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--color-texte-doux)]">
            {children}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function Carte({
  titre,
  action,
  children,
  className = '',
  /** Retire la gouttière intérieure, pour un contenu qui gère la sienne. */
  sansMarge = false,
  /**
   * Le titre est du CONTENU, pas une étiquette de section.
   *
   * Les intitulés de section sont en petites capitales : « MOTEUR »,
   * « PROGRESSION ». Mais quand le titre est une donnée — le nom d'un
   * exercice, un coup, les joueurs d'une partie — les capitales le
   * déforment : « LE PION AVANCE » se lit moins bien que « Le pion
   * avance », et le texte copié ressort en majuscules.
   */
  titreContenu = false,
}: {
  titre?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  sansMarge?: boolean;
  titreContenu?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-bordure)] bg-[var(--color-fond-2)] shadow-[var(--ombre-carte)] ${className}`}
    >
      {(titre || action) && (
        <header className="flex min-h-[2.875rem] items-center justify-between gap-3 border-b border-[var(--color-bordure)] px-4 py-2.5">
          <h2
            className={
              titreContenu ? 'titre truncate text-[0.9375rem] font-semibold' : 'sur-titre truncate'
            }
          >
            {titre}
          </h2>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={sansMarge ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/**
 * Bloc repliable, fermé par défaut.
 *
 * Bâti sur `<details>` natif : le clavier, le lecteur d'écran et la
 * recherche dans la page fonctionnent sans une ligne de JavaScript, là où
 * un dépliant fait main demanderait aria-expanded, gestion du focus et
 * gestion des touches.
 */
export function Repliable({
  titre,
  apercu,
  children,
}: {
  titre: string;
  apercu?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-[var(--color-bordure)]">
      <summary className="cible-tactile flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-fond-3)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-medium">{titre}</span>
          {apercu ? (
            <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">{apercu}</span>
          ) : null}
        </span>
        {/* Chevron pivoté plutôt qu'un marqueur natif, dont le dessin change
            d'un navigateur à l'autre. */}
        <svg
          viewBox="0 0 24 24"
          width="1.1em"
          height="1.1em"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-[var(--color-texte-doux)] transition-transform duration-[var(--t-normal)] group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-[var(--color-bordure)] p-3">{children}</div>
    </details>
  );
}

/* ==========================================================================
   ACTIONS
   ========================================================================== */

export function Bouton({
  children,
  onClick,
  variante = 'neutre',
  disabled,
  className = '',
  type = 'button',
  ariaLabel,
  /** Affiche un état d'attente et neutralise le bouton. */
  occupe = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'principal' | 'neutre' | 'discret' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  occupe?: boolean;
}) {
  const styles: Record<string, string> = {
    // Le texte du bouton principal est sombre sur le laiton : du blanc y
    // tomberait à 2,4:1.
    principal:
      'bg-[var(--color-accent)] text-[var(--color-sur-accent)] shadow-[var(--ombre-carte)] hover:bg-[var(--color-accent-fort)]',
    neutre:
      'bg-[var(--color-fond-3)] text-[var(--color-texte)] border border-[var(--color-bordure)] hover:border-[var(--color-bordure-forte)] hover:bg-[var(--color-bordure)]',
    discret:
      'bg-transparent text-[var(--color-texte-doux)] hover:bg-[var(--color-fond-3)] hover:text-[var(--color-texte)]',
    danger:
      'bg-transparent text-[var(--color-danger)] border border-[var(--bord-danger)] hover:bg-[var(--voile-danger)]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || occupe}
      aria-label={ariaLabel}
      aria-busy={occupe || undefined}
      className={`cible-tactile inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium transition-[background-color,border-color,transform,box-shadow] duration-[var(--t-rapide)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 ${styles[variante]} ${className}`}
    >
      {occupe ? <Points /> : null}
      {children}
    </button>
  );
}

/**
 * Trois points qui respirent, plutôt qu'un disque qui tourne : le disque
 * annonce une attente longue, alors que le moteur répond en une seconde.
 */
export function Points({ libelle }: { libelle?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role={libelle ? 'status' : undefined}>
      {libelle ? <span className="sr-only">{libelle}</span> : null}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="point-reflechit inline-block h-1 w-1 rounded-full bg-current"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

/* ==========================================================================
   ÉTATS : CHARGEMENT, VIDE, ERREUR
   ========================================================================== */

/**
 * Bloc gris qui occupe EXACTEMENT la place du contenu à venir.
 *
 * C'est la seule façon d'éviter que la page se réorganise sous le doigt
 * quand une lecture d'IndexedDB se termine.
 */
export function Squelette({
  hauteur = '1rem',
  largeur = '100%',
  className = '',
}: {
  hauteur?: string;
  largeur?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`squelette block ${className}`}
      style={{ height: hauteur, width: largeur }}
    />
  );
}

/** Liste de lignes en attente, à la hauteur réelle des lignes finales. */
export function SqueletteListe({ lignes = 3, hauteur = '3.25rem' }: { lignes?: number; hauteur?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Chargement en cours">
      {Array.from({ length: lignes }, (_, i) => (
        <Squelette key={i} hauteur={hauteur} className="rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}

/**
 * État vide : ce qui manque, pourquoi, et le geste qui le remplit.
 * Un écran vide sans action à proposer est une impasse.
 */
export function EtatVide({
  icone,
  titre,
  children,
  action,
}: {
  icone?: ReactNode;
  titre: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icone ? (
        <span
          aria-hidden
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--voile-accent)] text-xl text-[var(--color-accent)]"
        >
          {icone}
        </span>
      ) : null}
      <p className="titre text-base font-semibold">{titre}</p>
      {children ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--color-texte-doux)]">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
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
  ton?: Ton;
  action?: ReactNode;
}) {
  const t = TONS[ton];

  return (
    <div
      className="panneau-entre rounded-[var(--radius-md)] border px-4 py-3 text-sm"
      role="alert"
      style={{ backgroundColor: t.voile, borderColor: t.bord }}
    >
      <p className="font-semibold" style={{ color: t.vif }}>
        {titre}
      </p>
      {children ? (
        <div className="mt-1 leading-relaxed text-[var(--color-texte)]">{children}</div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ==========================================================================
   AFFICHAGE
   ========================================================================== */

export function Etiquette({
  children,
  ton = 'neutre',
}: {
  children: ReactNode;
  ton?: 'neutre' | Ton;
}) {
  if (ton === 'neutre') {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--color-bordure)] bg-[var(--color-fond-3)] px-2.5 py-1 text-xs font-medium text-[var(--color-texte-doux)]">
        {children}
      </span>
    );
  }
  const t = TONS[ton];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: t.voile, color: t.vif }}
    >
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
      className="relative h-full w-3 shrink-0 overflow-hidden rounded-full border border-[var(--color-bordure)] sm:w-4"
      style={{ backgroundColor: 'var(--color-case-sombre)' }}
      role="img"
      aria-label={`Évaluation : ${cpBlancs === null ? 'inconnue' : (cpBlancs / 100).toFixed(2)}`}
    >
      <div
        className="barre-eval absolute w-full"
        style={{
          backgroundColor: 'var(--color-case-claire)',
          height: `${hauteurBlancs}%`,
          [enBas ? 'bottom' : 'top']: 0,
        }}
      />
      {/* Repère de l'égalité : sans lui, on ne sait pas si la barre penche. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        style={{ backgroundColor: 'rgb(0 0 0 / 0.35)' }}
      />
    </div>
  );
}

export function ClassementCoup({ classement }: { classement: Classement }) {
  return (
    <span className="text-xs font-semibold" style={{ color: COULEURS[classement] }}>
      {LIBELLES[classement]}
    </span>
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
      <span className="chiffres text-2xl font-semibold">{formaterEvaluation(evaluation)}</span>
      {/* La profondeur garde sa place même absente : elle apparaît dès la
          première itération et ferait sinon sauter la ligne. */}
      <span className="min-h-[1rem] text-xs text-[var(--color-texte-doux)]">
        {profondeur ? `prof. ${profondeur}` : ' '}
      </span>
    </div>
  );
}

export function BarreProgression({ valeur, libelle }: { valeur: number; libelle?: string }) {
  const pct = Math.max(0, Math.min(100, valeur * 100));
  return (
    <div>
      {libelle ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-[var(--color-texte-doux)]">
          <span className="min-w-0 truncate">{libelle}</span>
          <span className="chiffres shrink-0">{Math.round(pct)} %</span>
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
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-[var(--t-ample)] ease-[var(--courbe)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   SAISIE
   ========================================================================== */

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
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 text-[var(--color-texte-doux)]">{libelle}</span>
        <span className="chiffres shrink-0 font-medium text-[var(--color-texte)]">
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
      className="cible-tactile -mx-2 flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-fond-3)]"
    >
      <span className="min-w-0">
        <span className="block text-sm">{libelle}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-texte-doux)]">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-[var(--t-normal)] ${
          actif
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
            : 'border-[var(--color-bordure-forte)] bg-[var(--color-fond-3)]'
        }`}
      >
        <span
          className="absolute top-[3px] h-5 w-5 rounded-full shadow-[var(--ombre-carte)] transition-transform duration-[var(--t-normal)] ease-[var(--courbe)]"
          style={{
            backgroundColor: actif ? 'var(--color-sur-accent)' : 'var(--color-texte-doux)',
            transform: actif ? 'translateX(1.5rem)' : 'translateX(3px)',
          }}
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
        className={`cible-tactile w-full rounded-[var(--radius-md)] border border-[var(--color-bordure)] bg-[var(--color-fond)] px-3 py-2.5 text-sm outline-none transition-colors duration-[var(--t-rapide)] placeholder:text-[var(--color-texte-doux)] focus:border-[var(--color-accent)] ${
          mono ? 'chiffres' : ''
        }`}
      />
      {aide ? (
        <span className="mt-1.5 block text-xs leading-relaxed text-[var(--color-texte-doux)]">
          {aide}
        </span>
      ) : null}
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
      className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-bordure)] bg-[var(--color-fond-3)] p-1"
    >
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          role="radio"
          aria-checked={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`cible-tactile min-w-0 flex-1 rounded-[var(--radius-sm)] px-2 py-2 text-sm font-medium transition-colors duration-[var(--t-rapide)] ${
            valeur === o.valeur
              ? 'bg-[var(--color-accent)] text-[var(--color-sur-accent)] shadow-[var(--ombre-carte)]'
              : 'text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]'
          }`}
        >
          {/* `truncate` plutôt qu'un retour à la ligne : trois libellés sur
              360 px passent à l'étroit, mais une puce qui double de hauteur
              décalerait tout ce qui suit. */}
          <span className="block truncate">{o.libelle}</span>
        </button>
      ))}
    </div>
  );
}
