/**
 * Mémoire des tournures déjà employées par chaque professeur.
 *
 * Défaut corrigé : l'historique ne vivait qu'à l'intérieur d'une partie. En
 * rejouant trois fois de suite avec Serena, on retrouvait le même accueil, la
 * même conclusion, les mêmes commentaires. Un professeur qui se répète d'une
 * séance à l'autre cesse d'être un personnage.
 *
 * La mémoire persiste donc entre les parties, par professeur, dans le
 * stockage local. Elle retient les PHRASES effectivement prononcées, pas les
 * commentaires assemblés : c'est la phrase qui est l'unité de répétition, et
 * la comparer à l'identique évite la recherche de sous-chaîne, coûteuse et
 * approximative.
 *
 * Elle est bornée : au-delà de `CAPACITE` tournures par professeur, les plus
 * anciennes sortent. Sans cela, tous les registres finiraient épuisés et le
 * professeur n'aurait plus rien à dire — mieux vaut qu'une tournure revienne
 * après une centaine d'autres.
 */

const CLE = 'echiquier.phrases-dites.v1';

/**
 * Nombre de tournures retenues par professeur.
 *
 * Les registres comptent entre huit et quatorze entrées chacun, et une partie
 * en consomme une trentaine. Deux cents laisse donc passer plusieurs parties
 * complètes avant qu'une tournure puisse réapparaître, sans faire enfler le
 * stockage.
 */
const CAPACITE = 200;

export interface MemoirePhrases {
  /** Tournures déjà prononcées, de la plus ancienne à la plus récente. */
  dites: string[];
  /** Tournures retenues pendant la génération en cours, à valider ensuite. */
  nouvelles: string[];
}

type Stockage = Record<string, string[]>;

function lireTout(): Stockage {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return {};
    const objet: unknown = JSON.parse(brut);
    if (!objet || typeof objet !== 'object') return {};
    const sortie: Stockage = {};
    for (const [id, liste] of Object.entries(objet as Record<string, unknown>)) {
      if (Array.isArray(liste)) sortie[id] = liste.filter((x): x is string => typeof x === 'string');
    }
    return sortie;
  } catch {
    // Stockage indisponible ou contenu corrompu : le professeur repart d'une
    // mémoire vide, ce qui n'empêche rien.
    return {};
  }
}

function ecrireTout(tout: Stockage): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(tout));
  } catch {
    // Quota atteint ou stockage refusé : la mémoire ne survivra pas à la
    // session. C'est dégradé, pas cassé.
  }
}

/** Ouvre la mémoire d'un professeur, prête à être consultée et enrichie. */
export function ouvrirMemoire(idProfesseur: string): MemoirePhrases {
  return { dites: lireTout()[idProfesseur] ?? [], nouvelles: [] };
}

/**
 * Enregistre les tournures retenues pendant la génération.
 *
 * Appelé une fois le texte affiché : une tournure préparée mais jamais
 * prononcée — commentaire abandonné parce que l'élève a repris son coup — ne
 * doit pas être comptée comme déjà dite.
 */
export function retenirMemoire(idProfesseur: string, memoire: MemoirePhrases): void {
  if (memoire.nouvelles.length === 0) return;
  const tout = lireTout();
  const fusion = [...(tout[idProfesseur] ?? []), ...memoire.nouvelles];
  tout[idProfesseur] = fusion.slice(-CAPACITE);
  ecrireTout(tout);
  memoire.dites = tout[idProfesseur];
  memoire.nouvelles = [];
}

/** Vide la mémoire de tous les professeurs. Utilisé par les réglages. */
export function oublierToutesLesPhrases(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    // Rien à faire : la mémoire est déjà inaccessible.
  }
}

/** Nombre de tournures mémorisées, tous professeurs confondus. */
export function compterPhrasesDites(): number {
  return Object.values(lireTout()).reduce((total, liste) => total + liste.length, 0);
}
