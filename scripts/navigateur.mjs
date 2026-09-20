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

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 * `userDataDir` est imposé, pour deux raisons cumulées :
 *
 *  - sans profil explicite, le lanceur de Chrome délègue à la fenêtre déjà
 *    ouverte de l'utilisateur au lieu de démarrer une instance pilotable ;
 *  - le profil doit être NEUF à chaque lancement. Un dossier fixe conservait
 *    le `localStorage` d'un scénario à l'autre : `test-interactions` laissait
 *    le thème sur « clair » et le scénario suivant échouait sur « mode sombre
 *    par défaut », de façon intermittente et selon l'ordre d'exécution.
 *
 * Le dossier temporaire est laissé au système, qui le nettoiera : le
 * supprimer ici obligerait chaque appelant à fermer proprement le navigateur
 * avant de rendre la main.
 */
export function optionsLancement(extra = {}) {
  return {
    executablePath: trouverNavigateur(),
    headless: 'new',
    userDataDir: mkdtempSync(join(tmpdir(), 'echiquier-profil-')),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    ...extra,
  };
}
