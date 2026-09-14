/**
 * Interface commune aux moteurs de reconnaissance de position.
 *
 * Les implémentations sont interchangeables et sélectionnables depuis les
 * réglages. Toutes renvoient la même chose : un plateau 8x8, une confiance
 * par case, et de quoi remplir l'écran de correction. Aucune implémentation
 * ne renvoie un FEN directement utilisable sans passer par la validation.
 */

/** Symbole FEN d'une pièce, ou `null` pour une case vide. */
export type CaseReconnue = string | null;

export interface ResultatReconnaissance {
  /** Plateau 8x8, rangée 8 en premier, colonne a en premier. */
  plateau: CaseReconnue[][];
  /** Confiance par case, 0–1, même disposition que `plateau`. */
  confiances: number[][];
  /** Orientation détectée : le camp affiché en bas de l'image. */
  orientation: 'blancs-en-bas' | 'noirs-en-bas';
  /** Trait proposé, si le moteur a pu le déduire. */
  trait?: 'w' | 'b';
  /** Confiance globale, 0–1. */
  confianceGlobale: number;
  /** Remarques affichables (qualité de l'image, ambiguïtés…). */
  remarques: string[];
  /** Identifiant du moteur qui a produit le résultat. */
  source: string;
}

export interface OptionsReconnaissance {
  signal?: AbortSignal;
  /** Rappel de progression, 0–1. */
  surProgression?: (avancement: number, etape: string) => void;
}

export interface PositionRecognizer {
  /** Identifiant stable, utilisé dans les réglages et le diagnostic. */
  readonly id: string;
  readonly nom: string;
  readonly description: string;
  /** Fonctionne sans réseau ? */
  readonly horsLigne: boolean;
  /**
   * Vérifie que le moteur est utilisable ici (clé d'API présente, WebGL…).
   * Renvoie une raison si ce n'est pas le cas.
   */
  verifierDisponibilite(): Promise<{ disponible: boolean; raison?: string }>;
  reconnaitre(image: Blob, options?: OptionsReconnaissance): Promise<ResultatReconnaissance>;
}

/** Erreur de reconnaissance porteuse d'un message affichable en français. */
export class ErreurReconnaissance extends Error {
  readonly conseil: string | undefined;
  constructor(message: string, conseil?: string) {
    super(message);
    this.name = 'ErreurReconnaissance';
    this.conseil = conseil;
  }
}

/** Plateau vide, utilisé comme point de départ de la saisie manuelle. */
export function plateauVide(): CaseReconnue[][] {
  return Array.from({ length: 8 }, () => Array<CaseReconnue>(8).fill(null));
}
