/**
 * Raccourcis clavier (bureau) et gestes tactiles (mobile).
 *
 * Les deux vocabulaires couvrent les mêmes actions : naviguer dans les coups,
 * retourner l'échiquier, lancer ou arrêter l'analyse. Les raccourcis sont
 * ignorés dès qu'un champ de saisie a le focus.
 */

import { useEffect, useRef } from 'react';

export interface ActionsRaccourcis {
  precedent?: () => void;
  suivant?: () => void;
  debut?: () => void;
  fin?: () => void;
  retourner?: () => void;
  basculerAnalyse?: () => void;
}

function dansUnChampDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false;
  const balise = cible.tagName;
  return (
    balise === 'INPUT' ||
    balise === 'TEXTAREA' ||
    balise === 'SELECT' ||
    cible.isContentEditable
  );
}

export function useRaccourcisClavier(actions: ActionsRaccourcis, actif = true): void {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    if (!actif) return;
    const surTouche = (e: KeyboardEvent) => {
      if (dansUnChampDeSaisie(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = ref.current;
      switch (e.key) {
        case 'ArrowLeft':
          if (!a.precedent) return;
          e.preventDefault();
          a.precedent();
          break;
        case 'ArrowRight':
          if (!a.suivant) return;
          e.preventDefault();
          a.suivant();
          break;
        case 'ArrowUp':
        case 'Home':
          if (!a.debut) return;
          e.preventDefault();
          a.debut();
          break;
        case 'ArrowDown':
        case 'End':
          if (!a.fin) return;
          e.preventDefault();
          a.fin();
          break;
        case 'f':
        case 'F':
          if (!a.retourner) return;
          e.preventDefault();
          a.retourner();
          break;
        case ' ':
          if (!a.basculerAnalyse) return;
          e.preventDefault();
          a.basculerAnalyse();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [actif]);
}

/**
 * Balayage horizontal pour naviguer dans les coups.
 * Le seuil et la tolérance verticale évitent de déclencher la navigation
 * pendant un défilement de la page ou un glisser-déposer de pièce.
 */
export function useBalayage(
  element: React.RefObject<HTMLElement | null>,
  actions: { versLaGauche?: () => void; versLaDroite?: () => void },
  actif = true,
): void {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const el = element.current;
    if (!el || !actif) return;

    let x0 = 0;
    let y0 = 0;
    let suivi = false;

    const debut = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        suivi = false;
        return;
      }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      suivi = true;
    };

    const fin = (e: TouchEvent) => {
      if (!suivi) return;
      suivi = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      // Le geste doit être franchement horizontal, sinon c'est un défilement.
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      if (dx < 0) ref.current.versLaGauche?.();
      else ref.current.versLaDroite?.();
    };

    el.addEventListener('touchstart', debut, { passive: true });
    el.addEventListener('touchend', fin, { passive: true });
    return () => {
      el.removeEventListener('touchstart', debut);
      el.removeEventListener('touchend', fin);
    };
  }, [element, actif]);
}
