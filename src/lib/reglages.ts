/**
 * Réglages de l'application, conservés dans `localStorage`.
 *
 * `localStorage` peut lever (navigation privée, stockage bloqué) : tous les
 * accès sont protégés et l'application fonctionne avec les valeurs par défaut
 * si l'écriture échoue.
 *
 * La clé d'API éventuellement saisie par l'utilisateur reste ici et n'est
 * jamais incluse dans le bundle : elle est transmise à la fonction serverless
 * au coup par coup, en en-tête, et sert uniquement si l'hébergeur n'a pas sa
 * propre clé configurée.
 */

import { SEUILS_PAR_DEFAUT, type SeuilsClassification } from './classification.ts';
import { NIVEAU_PAR_DEFAUT, niveauDepuisAncienneValeur } from './niveaux.ts';

export type NiveauAssistance = 'chaque-coup' | 'erreurs-graves';
export type Theme = 'sombre' | 'clair' | 'systeme';

export interface Reglages {
  theme: Theme;
  /** Identifiant du palier de force du moteur. */
  niveauMoteur: string;
  /** Profondeur d'analyse demandée, ou `null` pour suivre le profil appareil. */
  profondeurAnalyse: number | null;
  /** Temps par coup en analyse complète (ms), ou `null` pour le profil appareil. */
  tempsParCoupMs: number | null;
  niveauAssistance: NiveauAssistance;
  /** Nombre de variantes affichées en mode assisté. */
  multiPV: number;
  seuils: SeuilsClassification;
  /** Identifiant du moteur de reconnaissance choisi. */
  reconnaissance: string;
  /** Clé d'API saisie par l'utilisateur (facultative). */
  cleApi: string;
  /** Autoriser les coordonnées autour de l'échiquier. */
  coordonnees: boolean;
  /** Jouer un son sur les coups. */
  sons: boolean;
  /** Animation des pièces (désactivable sur appareil lent). */
  animations: boolean;
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  theme: 'sombre',
  niveauMoteur: NIVEAU_PAR_DEFAUT,
  profondeurAnalyse: null,
  tempsParCoupMs: null,
  niveauAssistance: 'chaque-coup',
  multiPV: 3,
  seuils: SEUILS_PAR_DEFAUT,
  reconnaissance: 'llm',
  cleApi: '',
  coordonnees: true,
  sons: false,
  animations: true,
};

const CLE = 'echiquier.reglages.v1';

function lireBrut(): unknown {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

/** Charge les réglages, en complétant les champs absents ou invalides. */
export function chargerReglages(): Reglages {
  const brut = lireBrut();
  if (!brut || typeof brut !== 'object') return { ...REGLAGES_PAR_DEFAUT };
  const o = brut as Partial<Reglages>;
  return {
    ...REGLAGES_PAR_DEFAUT,
    ...o,
    // Les seuils sont fusionnés champ à champ : une ancienne version stockée
    // ne doit pas faire disparaître un seuil ajouté depuis.
    seuils: { ...SEUILS_PAR_DEFAUT, ...(o.seuils ?? {}) },
    // Un réglage enregistré par une version antérieure stockait un nombre :
    // on le convertit plutôt que de le perdre.
    niveauMoteur:
      typeof o.niveauMoteur === 'string'
        ? o.niveauMoteur
        : niveauDepuisAncienneValeur(o.niveauMoteur),
    multiPV: borner(o.multiPV, 1, 5, REGLAGES_PAR_DEFAUT.multiPV),
  };
}

function borner(v: unknown, min: number, max: number, defaut: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : defaut;
}

/** Enregistre les réglages. Renvoie false si le stockage est indisponible. */
export function enregistrerReglages(r: Reglages): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

/** Efface la clé d'API stockée. */
export function effacerCleApi(): void {
  const r = chargerReglages();
  enregistrerReglages({ ...r, cleApi: '' });
}
