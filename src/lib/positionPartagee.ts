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
/**
 * Position déjà consommée pendant cette visite.
 *
 * Défaut corrigé : la lecture effaçait la clé, et elle était appelée depuis
 * l'initialiseur d'un `useState`. React invoque cet initialiseur deux fois en
 * mode strict : le second appel ne trouvait plus rien, et selon l'instance
 * conservée la position partagée était perdue. On mémorise donc la valeur
 * pour la durée de la page, ce qui rend la fonction idempotente.
 */
let dejaRecuperee: string | null | undefined;

export function recupererPosition(): string | null {
  if (dejaRecuperee !== undefined) return dejaRecuperee;
  try {
    const fen = sessionStorage.getItem(CLE);
    if (!fen) {
      dejaRecuperee = null;
      return null;
    }
    sessionStorage.removeItem(CLE);
    // On revalide : le contenu de `sessionStorage` peut être modifié à la main.
    dejaRecuperee = validateFenLegality(fen).valide ? fen : null;
    return dejaRecuperee;
  } catch {
    dejaRecuperee = null;
    return null;
  }
}
