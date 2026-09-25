/**
 * Lecture des voix des professeurs.
 *
 * Trois sources, dans cet ordre, et un silence assumé en dernier recours :
 *
 *  1. Le texte INVARIABLE — accueils, discours de fin de partie, registres de
 *     commentaires — est pré-généré par `npm run voix` et livré avec
 *     l'application. Il couvre l'essentiel de ce qu'un professeur dit.
 *
 *  2. Le texte variable déjà entendu vient du cache local, conservé
 *     définitivement : une phrase déjà dite n'est jamais regénérée.
 *
 *  3. Sinon, la synthèse est demandée à la fonction serverless, qui relaie
 *     edge-tts. Le résultat entre au cache.
 *
 * Et si rien n'aboutit à temps, le professeur se tait. Le repli sur la
 * synthèse du navigateur a été explicitement écarté : elle est mécanique et
 * n'offre qu'une voix par genre, ce qui faisait sonner les quatre
 * professeurs comme deux.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import manifeste from './voixManifeste.json';

/** Association empreinte → fichier livré, produite par `npm run voix`. */
const FIGEES = manifeste as Record<string, string>;

/**
 * Délai au-delà duquel on renonce et on se tait.
 *
 * Le commentaire s'écrit à l'écran pendant ce temps : une voix qui
 * démarrerait après coup parlerait sur un texte déjà lu.
 */
const DELAI_MAX_MS = 2500;

interface SchemaVoix extends DBSchema {
  repliques: {
    key: string;
    value: { empreinte: string; audio: Blob; date: number };
  };
}

let promesseBase: Promise<IDBPDatabase<SchemaVoix>> | null = null;

function base(): Promise<IDBPDatabase<SchemaVoix>> {
  promesseBase ??= openDB<SchemaVoix>('echiquier-voix', 1, {
    upgrade(b) {
      if (!b.objectStoreNames.contains('repliques')) {
        b.createObjectStore('repliques', { keyPath: 'empreinte' });
      }
    },
  }).catch((e) => {
    promesseBase = null;
    throw e;
  });
  return promesseBase;
}

/**
 * Empreinte d'une réplique.
 *
 * Même formule que le script de préparation, sinon le manifeste ne
 * correspondrait à rien. `SubtleCrypto` n'est disponible qu'en contexte
 * sécurisé, ce qui est le cas partout où l'application tourne.
 */
export async function empreinteReplique(voix: string, texte: string): Promise<string> {
  const donnees = new TextEncoder().encode(`${voix}|+0%|+0Hz|${texte}`);
  const brut = await crypto.subtle.digest('SHA-256', donnees);
  return [...new Uint8Array(brut)]
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

/** URL d'objet déjà créées, pour ne pas les recréer à chaque réplique. */
const urlsCache = new Map<string, string>();

async function depuisLeCache(cle: string): Promise<string | null> {
  const dejaLa = urlsCache.get(cle);
  if (dejaLa) return dejaLa;
  try {
    const entree = await base().then((b) => b.get('repliques', cle));
    if (!entree) return null;
    const url = URL.createObjectURL(entree.audio);
    urlsCache.set(cle, url);
    return url;
  } catch {
    return null;
  }
}

async function versLeCache(cle: string, audio: Blob): Promise<void> {
  try {
    const b = await base();
    await b.put('repliques', { empreinte: cle, audio, date: Date.now() });
  } catch {
    // Stockage indisponible : la réplique sera redemandée la prochaine fois.
  }
}

/**
 * Découpe un commentaire en phrases.
 *
 * C'est l'unité de synthèse. Un commentaire est assemblé à partir de
 * fragments qui sont chacun une phrase complète : les pré-générer phrase par
 * phrase rend l'ensemble couvrable, là où pré-générer chaque combinaison
 * serait impossible. L'enchaînement s'entend comme une diction normale,
 * puisque ce sont de vraies phrases et non des morceaux.
 */
export function phrasesDe(texte: string): string[] {
  return texte
    .split(/(?<=[.!?…])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Audio de chaque phrase d'un commentaire, dans l'ordre.
 *
 * Une phrase manquante devient `null` : elle est sautée à la lecture plutôt
 * que d'interrompre tout le commentaire.
 */
export async function repliquesAudio(voix: string, texte: string): Promise<(string | null)[]> {
  return Promise.all(phrasesDe(texte).map((p) => urlAudio(voix, p)));
}

/**
 * Où trouver l'audio d'un texte, ou `null` s'il faut se taire.
 *
 * Ne lève jamais : un défaut de voix ne doit pas interrompre une partie.
 */
export async function urlAudio(voix: string, texte: string): Promise<string | null> {
  const propre = texte.trim();
  if (!voix || propre === '') return null;

  let cle: string;
  try {
    cle = await empreinteReplique(voix, propre);
  } catch {
    return null;
  }

  // 1. Pré-généré et livré.
  const figee = FIGEES[cle];
  if (figee) return figee;

  // 2. Déjà entendu.
  const enCache = await depuisLeCache(cle);
  if (enCache) return enCache;

  // 3. Synthèse à la demande, avec renoncement au-delà du délai.
  const abandon = new AbortController();
  const minuteur = setTimeout(() => abandon.abort(), DELAI_MAX_MS);
  try {
    const reponse = await fetch('/api/voix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voix, texte: propre }),
      signal: abandon.signal,
    });
    if (!reponse.ok) return null;
    const audio = await reponse.blob();
    if (audio.size === 0) return null;
    await versLeCache(cle, audio);
    const url = URL.createObjectURL(audio);
    urlsCache.set(cle, url);
    return url;
  } catch {
    // Réseau absent, délai dépassé, service indisponible : on se tait.
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Nombre de répliques conservées localement. Affiché dans les réglages. */
export async function compterRepliquesEnCache(): Promise<number> {
  try {
    return await base().then((b) => b.count('repliques'));
  } catch {
    return 0;
  }
}

/** Vide le cache des répliques synthétisées à la demande. */
export async function viderCacheVoix(): Promise<void> {
  try {
    const b = await base();
    await b.clear('repliques');
    for (const url of urlsCache.values()) URL.revokeObjectURL(url);
    urlsCache.clear();
  } catch {
    // Rien à faire.
  }
}
