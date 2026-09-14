/**
 * Contexte applicatif : réglages partagés et routeur par fragment d'URL.
 *
 * Le routeur tient en quelques lignes et évite une dépendance de routage
 * complète, qui ne rendrait aucun service ici : six écrans, pas de rendu
 * serveur, pas de chargement de données par route. Le fragment (`#/…`) est
 * préféré au chemin pour que l'application reste navigable même si un
 * hébergeur ne réécrit pas les URL.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  chargerReglages,
  enregistrerReglages,
  REGLAGES_PAR_DEFAUT,
  type Reglages,
} from './lib/reglages.ts';

interface ValeurContexte {
  reglages: Reglages;
  majReglages: (partiel: Partial<Reglages>) => void;
  reinitialiserReglages: () => void;
  /** false si `localStorage` refuse d'écrire (navigation privée). */
  stockageDisponible: boolean;
}

const Contexte = createContext<ValeurContexte | null>(null);

export function FournisseurReglages({ children }: { children: ReactNode }) {
  const [reglages, setReglages] = useState<Reglages>(() => chargerReglages());
  const [stockageDisponible, setStockage] = useState(true);

  const majReglages = useCallback((partiel: Partial<Reglages>) => {
    setReglages((precedents) => {
      const suivants = { ...precedents, ...partiel };
      setStockage(enregistrerReglages(suivants));
      return suivants;
    });
  }, []);

  const reinitialiserReglages = useCallback(() => {
    setReglages(REGLAGES_PAR_DEFAUT);
    setStockage(enregistrerReglages(REGLAGES_PAR_DEFAUT));
  }, []);

  // Application du thème à chaque changement.
  useEffect(() => {
    const resolu =
      reglages.theme === 'systeme'
        ? matchMedia('(prefers-color-scheme: light)').matches
          ? 'clair'
          : 'sombre'
        : reglages.theme;
    document.documentElement.dataset.theme = resolu;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolu === 'clair' ? '#f6f7fb' : '#0b1020');
  }, [reglages.theme]);

  // Suit les changements de préférence système quand « Système » est choisi.
  useEffect(() => {
    if (reglages.theme !== 'systeme') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const surChangement = () => {
      document.documentElement.dataset.theme = mq.matches ? 'clair' : 'sombre';
    };
    // `addEventListener` sur MediaQueryList n'existe pas sur Safari < 14.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', surChangement);
      return () => mq.removeEventListener('change', surChangement);
    }
    mq.addListener(surChangement);
    return () => mq.removeListener(surChangement);
  }, [reglages.theme]);

  const valeur = useMemo(
    () => ({ reglages, majReglages, reinitialiserReglages, stockageDisponible }),
    [reglages, majReglages, reinitialiserReglages, stockageDisponible],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useReglages(): ValeurContexte {
  const v = useContext(Contexte);
  if (!v) throw new Error('useReglages doit être utilisé dans FournisseurReglages.');
  return v;
}

/** Route courante, dérivée du fragment d'URL. */
export function useRoute(): { chemin: string; segments: string[]; naviguer: (v: string) => void } {
  const lire = () => window.location.hash.replace(/^#/, '') || '/';
  const [chemin, setChemin] = useState(lire);

  useEffect(() => {
    const surChangement = () => setChemin(lire());
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);

  const naviguer = useCallback((vers: string) => {
    window.location.hash = vers;
    // Toute navigation ramène en haut : sans cela, on arrive au milieu
    // d'un écran après avoir fait défiler le précédent.
    window.scrollTo({ top: 0 });
  }, []);

  const segments = useMemo(() => chemin.split('/').filter(Boolean), [chemin]);

  return { chemin, segments, naviguer };
}
