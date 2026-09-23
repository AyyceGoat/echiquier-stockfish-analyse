/**
 * Historique des parties et de leurs analyses (IndexedDB via `idb`).
 *
 * IndexedDB peut être indisponible (navigation privée sur certains WebKit,
 * stockage bloqué). Toutes les fonctions échouent alors proprement et
 * l'application continue à fonctionner sans historique : une partie non
 * enregistrée reste jouable et analysable.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RapportAnalyse } from '../analysis/analyseur.ts';

export type ModePartie = 'libre' | 'assiste' | 'analyse';

export interface PartieEnregistree {
  id: string;
  /** Horodatage de création, en millisecondes. */
  date: number;
  mode: ModePartie;
  blanc: string;
  noir: string;
  /** Résultat PGN : « 1-0 », « 0-1 », « 1/2-1/2 » ou « * ». */
  resultat: string;
  /** Raison de fin, en français, pour l'affichage. */
  finPar: string;
  fenDepart: string;
  coupsSan: string[];
  /** Palier du moteur utilisé, si l'adversaire était l'ordinateur. */
  niveauMoteur?: string;
  /**
   * Camp tenu par le joueur.
   *
   * Sans ce champ, « de quel côté jouait-il ? » se déduisait du nom « Moi »,
   * ce qui n'a rien d'une garantie : la section « mes erreurs » comptait les
   * coups des deux camps et présentait les bévues du moteur comme celles du
   * joueur. Absent sur les parties enregistrées avant cet ajout, et sur les
   * parties importées où le joueur ne figure d'aucun côté.
   */
  monCamp?: 'w' | 'b';
  rapport?: RapportAnalyse;
}

interface SchemaEchiquier extends DBSchema {
  parties: {
    key: string;
    value: PartieEnregistree;
    indexes: { 'par-date': number };
  };
}

const NOM_BASE = 'echiquier';
const VERSION = 1;

let promesseBase: Promise<IDBPDatabase<SchemaEchiquier>> | null = null;

function ouvrir(): Promise<IDBPDatabase<SchemaEchiquier>> {
  if (!promesseBase) {
    promesseBase = openDB<SchemaEchiquier>(NOM_BASE, VERSION, {
      upgrade(base) {
        if (!base.objectStoreNames.contains('parties')) {
          const magasin = base.createObjectStore('parties', { keyPath: 'id' });
          magasin.createIndex('par-date', 'date');
        }
      },
      blocked() {
        console.warn("Une autre page bloque la mise à jour de la base de l'historique.");
      },
    }).catch((e) => {
      promesseBase = null;
      throw e;
    });
  }
  return promesseBase;
}

/** L'historique est-il utilisable sur cet appareil ? */
export async function historiqueDisponible(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    await ouvrir();
    return true;
  } catch {
    return false;
  }
}

export function nouvelIdentifiant(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Enregistre ou met à jour une partie. Renvoie false si le stockage a échoué. */
export async function enregistrerPartie(partie: PartieEnregistree): Promise<boolean> {
  try {
    const base = await ouvrir();
    await base.put('parties', partie);
    return true;
  } catch (e) {
    console.warn("La partie n'a pas pu être enregistrée :", e);
    return false;
  }
}

/** Liste les parties, de la plus récente à la plus ancienne. */
export async function listerParties(limite = 200): Promise<PartieEnregistree[]> {
  try {
    const base = await ouvrir();
    const toutes = await base.getAllFromIndex('parties', 'par-date');
    return toutes.reverse().slice(0, limite);
  } catch {
    return [];
  }
}

export async function lirePartie(id: string): Promise<PartieEnregistree | null> {
  try {
    const base = await ouvrir();
    return (await base.get('parties', id)) ?? null;
  } catch {
    return null;
  }
}

export async function supprimerPartie(id: string): Promise<boolean> {
  try {
    const base = await ouvrir();
    await base.delete('parties', id);
    return true;
  } catch {
    return false;
  }
}

export async function viderHistorique(): Promise<boolean> {
  try {
    const base = await ouvrir();
    await base.clear('parties');
    return true;
  } catch {
    return false;
  }
}

/** Attache un rapport d'analyse à une partie déjà enregistrée. */
export async function attacherRapport(id: string, rapport: RapportAnalyse): Promise<boolean> {
  const partie = await lirePartie(id);
  if (!partie) return false;
  return enregistrerPartie({ ...partie, rapport });
}

/** Estime la place occupée, pour la page de diagnostic. */
export async function estimerStockage(): Promise<{ utiliseMo: number; quotaMo: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { utiliseMo: usage / 1e6, quotaMo: quota / 1e6 };
  } catch {
    return null;
  }
}
