/**
 * Localisation du navigateur pour les tests Puppeteer.
 *
 * Centralisé ici parce que la liste des chemins était recopiée dans huit
 * scripts, et qu'elle y était incomplète : sur une machine où Chrome a
 * téléchargé une mise à jour sans encore l'avoir appliquée, `chrome.exe`
 * n'est plus qu'un lanceur. Il rend la main immédiatement en déléguant à la
 * session déjà ouverte, Puppeteer voit le processus se fermer aussitôt et
 * échoue sur « Failed to launch the browser process: Code: 0 ». Le vrai
 * binaire est alors `new_chrome.exe`, qu'on essaie donc en premier.
 *
 * `trouverNavigateur()` renvoie le premier chemin existant, et lève une
 * erreur explicite plutôt que de laisser Puppeteer se plaindre d'un
 * `executablePath` indéfini.
 */

import { existsSync } from 'node:fs';

const CHEMINS = [
  'C:/Program Files (x86)/Google/Chrome/Application/new_chrome.exe',
  'C:/Program Files/Google/Chrome/Application/new_chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

export function trouverNavigateur() {
  const chemin = CHEMINS.find((c) => existsSync(c));
  if (!chemin) {
    throw new Error(
      'Aucun navigateur Chromium trouvé. Chemins essayés :\n  ' + CHEMINS.join('\n  '),
    );
  }
  return chemin;
}

/**
 * Options de lancement communes.
 *
 * `userDataDir` est imposé : sans profil dédié, le lanceur de Chrome
 * délègue à la fenêtre déjà ouverte de l'utilisateur au lieu de démarrer
 * une instance pilotable.
 */
export function optionsLancement(extra = {}) {
  return {
    executablePath: trouverNavigateur(),
    headless: 'new',
    userDataDir: 'C:/Users/Public/.echiquier-profil-tests',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    ...extra,
  };
}
