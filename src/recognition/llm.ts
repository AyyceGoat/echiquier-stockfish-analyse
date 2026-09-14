/**
 * Reconnaissance par modèle multimodal.
 *
 * L'image ne part jamais directement vers l'API du modèle : elle transite par
 * une fonction serverless de l'hébergeur, qui détient la clé. Aucune clé n'est
 * présente dans le bundle. Si l'hébergeur n'a pas de clé configurée, la
 * fonction accepte celle que l'utilisateur a saisie dans les réglages, qui
 * reste stockée uniquement sur son appareil.
 */

import { chargerReglages } from '../lib/reglages.ts';
import { preparerImage, versBase64 } from './image.ts';
import {
  ErreurReconnaissance,
  plateauVide,
  type OptionsReconnaissance,
  type PositionRecognizer,
  type ResultatReconnaissance,
} from './types.ts';

const POINT_DE_TERMINAISON = '/api/reconnaitre';
const PIECES_VALIDES = new Set(['p', 'n', 'b', 'r', 'q', 'k', 'P', 'N', 'B', 'R', 'Q', 'K']);

interface ReponseApi {
  plateau?: unknown;
  confiances?: unknown;
  orientation?: unknown;
  trait?: unknown;
  remarques?: unknown;
  erreur?: string;
  conseil?: string;
}

/** Vérifie et normalise le plateau renvoyé par le modèle. */
function normaliserPlateau(brut: unknown): (string | null)[][] {
  if (!Array.isArray(brut) || brut.length !== 8) {
    throw new ErreurReconnaissance(
      "Le modèle n'a pas renvoyé un échiquier de 8 rangées.",
      "Réessayez avec une photo plus nette, ou corrigez la position à la main.",
    );
  }
  return brut.map((rangee) => {
    if (!Array.isArray(rangee) || rangee.length !== 8) {
      throw new ErreurReconnaissance("Une rangée ne contient pas 8 cases.");
    }
    return rangee.map((c) => {
      if (typeof c !== 'string' || c === '' || c === '.') return null;
      return PIECES_VALIDES.has(c) ? c : null;
    });
  });
}

function normaliserConfiances(brut: unknown): number[][] {
  if (!Array.isArray(brut) || brut.length !== 8) {
    return Array.from({ length: 8 }, () => Array<number>(8).fill(0.5));
  }
  return brut.map((rangee) => {
    const r = Array.isArray(rangee) ? rangee : [];
    return Array.from({ length: 8 }, (_, i) => {
      const v = r[i];
      return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    });
  });
}

export class ReconnaissanceParLlm implements PositionRecognizer {
  readonly id = 'llm';
  readonly nom = 'Vision par modèle de langage';
  readonly description =
    "Envoie l'image à un modèle multimodal. La plus fiable sur photo d'échiquier réel, mais nécessite une connexion.";
  readonly horsLigne = false;

  async verifierDisponibilite(): Promise<{ disponible: boolean; raison?: string }> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { disponible: false, raison: 'Aucune connexion réseau.' };
    }
    try {
      const rep = await fetch(POINT_DE_TERMINAISON, { method: 'GET' });
      if (rep.ok) {
        const info = (await rep.json()) as { cleServeur?: boolean };
        if (info.cleServeur) return { disponible: true };
        const { cleApi } = chargerReglages();
        return cleApi
          ? { disponible: true }
          : {
              disponible: false,
              raison:
                "Aucune clé d'API configurée. Ajoutez la vôtre dans les réglages pour activer la reconnaissance par image.",
            };
      }
      return {
        disponible: false,
        raison: "Le service de reconnaissance ne répond pas (fonction serverless indisponible).",
      };
    } catch {
      return { disponible: false, raison: 'Le service de reconnaissance est injoignable.' };
    }
  }

  async reconnaitre(
    image: Blob,
    options: OptionsReconnaissance = {},
  ): Promise<ResultatReconnaissance> {
    const { signal, surProgression } = options;

    surProgression?.(0.1, "Préparation de l'image…");
    // Compression obligatoire avant l'envoi : c'est ce qui rend l'opération
    // supportable en connexion lente.
    const preparee = await preparerImage(image, 1024);
    URL.revokeObjectURL(preparee.url);

    surProgression?.(0.3, "Envoi de l'image…");
    const base64 = await versBase64(preparee.blob);

    const { cleApi } = chargerReglages();
    const entetes: Record<string, string> = { 'content-type': 'application/json' };
    if (cleApi) entetes['x-cle-api'] = cleApi;

    let rep: Response;
    try {
      rep = await fetch(POINT_DE_TERMINAISON, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({ image: base64, typeMime: preparee.typeMime }),
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ErreurReconnaissance(
        "Impossible de joindre le service de reconnaissance.",
        'Vérifiez votre connexion, ou utilisez la reconnaissance locale dans les réglages.',
      );
    }

    surProgression?.(0.7, 'Lecture de la position…');

    let donnees: ReponseApi;
    try {
      donnees = (await rep.json()) as ReponseApi;
    } catch {
      throw new ErreurReconnaissance('Réponse illisible du service de reconnaissance.');
    }

    if (!rep.ok) {
      throw new ErreurReconnaissance(
        donnees.erreur ?? `Le service a répondu ${rep.status}.`,
        donnees.conseil,
      );
    }

    const plateau = normaliserPlateau(donnees.plateau);
    const confiances = normaliserConfiances(donnees.confiances);
    const orientation =
      donnees.orientation === 'noirs-en-bas' ? 'noirs-en-bas' : 'blancs-en-bas';
    const trait = donnees.trait === 'b' ? 'b' : donnees.trait === 'w' ? 'w' : undefined;
    const remarques = Array.isArray(donnees.remarques)
      ? donnees.remarques.filter((r): r is string => typeof r === 'string')
      : [];

    const toutes = confiances.flat();
    const confianceGlobale = toutes.length
      ? toutes.reduce((a, b) => a + b, 0) / toutes.length
      : 0.5;

    surProgression?.(1, 'Position reconnue');

    return {
      plateau: plateau.length ? plateau : plateauVide(),
      confiances,
      orientation,
      trait,
      confianceGlobale,
      remarques,
      source: this.id,
    };
  }
}
