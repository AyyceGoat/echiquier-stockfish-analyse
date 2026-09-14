/**
 * Transfert d'une position d'un écran à l'autre.
 *
 * Passer un FEN dans le fragment d'URL le rendrait illisible et fragile
 * (caractères à échapper, longueur). `sessionStorage` suffit : la position
 * ne doit survivre ni à la fermeture de l'onglet, ni au rechargement volontaire.
 */

import { validateFenLegality } from './fen.ts';

const CLE = 'echiquier.position-a-jouer';

export function deposerPosition(fen: string): void {
  try {
    sessionStorage.setItem(CLE, fen);
  } catch {
    // Stockage indisponible : l'écran cible démarrera sur la position initiale.
  }
}

/** Récupère la position déposée et la consomme. */
export function recupererPosition(): string | null {
  try {
    const fen = sessionStorage.getItem(CLE);
    if (!fen) return null;
    sessionStorage.removeItem(CLE);
    // On revalide : le contenu de `sessionStorage` peut être modifié à la main.
    return validateFenLegality(fen).valide ? fen : null;
  } catch {
    return null;
  }
}
