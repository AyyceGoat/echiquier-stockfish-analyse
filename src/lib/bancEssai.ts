/**
 * Surface d'essai, exposée au harnais de matchs entre paliers.
 *
 * Pourquoi ce module existe : `scripts/test-matchs-niveaux.mjs` fait jouer
 * les paliers les uns contre les autres dans un vrai navigateur. Il doit
 * appliquer EXACTEMENT la logique de choix de coup du jeu, faute de quoi il
 * mesurerait une réimplémentation et non le produit. Plutôt que de recopier
 * `choisirCoup` dans le script — où elle divergerait au premier réglage —, le
 * harnais importe ce module depuis le serveur de développement.
 *
 * Le navigateur ne sait pas résoudre un import nu comme `chess.js` ; c'est
 * Vite qui s'en charge à la transformation. D'où la réexportation ici.
 *
 * Ce fichier n'est importé par aucun code applicatif : il ne part donc pas
 * dans le bundle de production, que Rollup construit à partir des seuls
 * modules effectivement atteints depuis `main.tsx`.
 */

export { Chess } from 'chess.js';
export { choisirCoup, pertesParCandidat, probabilites } from './choixCoup.ts';
export type { CandidatCoup, ReglagesChoix } from './choixCoup.ts';
export { NIVEAUX, niveauParId, libelleNiveau } from './niveaux.ts';
export type { NiveauMoteur } from './niveaux.ts';
