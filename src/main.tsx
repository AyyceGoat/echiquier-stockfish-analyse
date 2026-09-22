/**
 * Point d'entrée.
 *
 * Trois responsabilités, dans cet ordre : appliquer le thème avant le premier
 * rendu (pour éviter un flash clair), monter l'application, puis enregistrer
 * le service worker — jamais l'inverse, un échec d'enregistrement ne doit
 * pas empêcher l'application de s'afficher.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { chargerReglages } from './lib/reglages.ts';
import './styles.css';

function appliquerTheme(): void {
  try {
    const { theme } = chargerReglages();
    const resolu =
      theme === 'systeme'
        ? matchMedia('(prefers-color-scheme: light)').matches
          ? 'clair'
          : 'sombre'
        : theme;
    document.documentElement.dataset.theme = resolu;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolu === 'clair' ? '#f4efe6' : '#14120f');
  } catch {
    document.documentElement.dataset.theme = 'sombre';
  }
}

appliquerTheme();

/**
 * Écran de lancement : l'API est posée par le document lui-même, avant le
 * bundle. On la sollicite ici plutôt que d'inventer un minuteur — la jauge
 * doit refléter le vrai chargement, sinon elle ment.
 */
const lancement = (window as unknown as {
  __lancement?: { avancer: (v: number, t?: string) => void; terminer: () => void };
}).__lancement;

lancement?.avancer(0.7, 'Interface…');

const racine = document.getElementById('racine');
if (racine) {
  createRoot(racine).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // On attend la première image RÉELLEMENT peinte par React, et non le
  // simple retour de `render` : à ce moment-là le DOM existe mais n'est pas
  // encore à l'écran, et la transition découvrirait une page blanche.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lancement?.avancer(0.95, 'Presque prêt…');
      // Les portraits des professeurs sont les seules images que l'accueil
      // n'affiche pas : on ne les attend pas. Le plateau de vitrine, lui,
      // est déjà peint à ce stade.
      lancement?.terminer();
    });
  });
} else {
  lancement?.terminer();
}

/**
 * Enregistrement du service worker.
 *
 * `updateViaCache: 'none'` empêche le navigateur de servir un sw.js périmé,
 * ce qui est la cause la plus fréquente d'une application figée sur une
 * ancienne version après déploiement. Les binaires du moteur ne sont jamais
 * pré-cachés : ils sont sur une URL versionnée et mis en cache à l'usage.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((enregistrement) => {
        enregistrement.addEventListener('updatefound', () => {
          const nouveau = enregistrement.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', () => {
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('echiquier:maj-disponible'));
            }
          });
        });
      })
      .catch((e) => {
        // Le mode hors ligne sera indisponible, mais l'application fonctionne.
        console.warn("Le service worker n'a pas pu être enregistré :", e);
      });
  });
}
