/**
 * Coque de l'application : en-tête, navigation, aiguillage des écrans.
 *
 * Les écrans lourds (analyse, reconnaissance d'image, diagnostic) sont
 * chargés paresseusement : la première visite ne télécharge que l'accueil
 * et l'échiquier, ce qui raccourcit nettement le démarrage en réseau lent.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { FournisseurReglages, useRoute } from './contexte.tsx';
import { Accueil } from './pages/Accueil.tsx';
import { PartieLibre } from './pages/PartieLibre.tsx';
import { Bouton } from './ui/composants.tsx';

const JeuAssiste = lazy(() =>
  import('./pages/JeuAssiste.tsx').then((m) => ({ default: m.JeuAssiste })),
);
const AnalysePosition = lazy(() =>
  import('./pages/AnalysePosition.tsx').then((m) => ({ default: m.AnalysePosition })),
);
const Historique = lazy(() =>
  import('./pages/Historique.tsx').then((m) => ({ default: m.Historique })),
);
const Reglages = lazy(() => import('./pages/Reglages.tsx').then((m) => ({ default: m.Reglages })));
const Diagnostic = lazy(() =>
  import('./pages/Diagnostic.tsx').then((m) => ({ default: m.Diagnostic })),
);
const Rapport = lazy(() => import('./pages/Rapport.tsx').then((m) => ({ default: m.Rapport })));

const ONGLETS = [
  { chemin: '/', libelle: 'Accueil', icone: '♟' },
  { chemin: '/libre', libelle: 'Partie libre', icone: '♙' },
  { chemin: '/assiste', libelle: 'Jeu assisté', icone: '★' },
  { chemin: '/analyse', libelle: 'Analyse', icone: '▦' },
  { chemin: '/historique', libelle: 'Historique', icone: '☰' },
];

function Chargement({ quoi = 'Chargement…' }: { quoi?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <p className="text-sm text-[var(--color-texte-doux)]">{quoi}</p>
    </div>
  );
}

/** Bandeau discret proposant de recharger quand une mise à jour est prête. */
function BandeauMiseAJour() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const surMaj = () => setVisible(true);
    window.addEventListener('echiquier:maj-disponible', surMaj);
    return () => window.removeEventListener('echiquier:maj-disponible', surMaj);
  }, []);

  if (!visible) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[var(--color-accent)] px-4 py-2 text-sm text-white">
      <span>Une nouvelle version est disponible.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="cible-tactile rounded-lg bg-white/20 px-3 py-1.5 font-medium"
      >
        Recharger
      </button>
    </div>
  );
}

function Coque() {
  const { chemin, segments, naviguer } = useRoute();

  const rendu = (() => {
    const racine = segments[0] ?? '';
    switch (racine) {
      case '':
        return <Accueil naviguer={naviguer} />;
      case 'libre':
        return <PartieLibre naviguer={naviguer} />;
      case 'assiste':
        return <JeuAssiste naviguer={naviguer} />;
      case 'analyse':
        return <AnalysePosition naviguer={naviguer} />;
      case 'historique':
        return <Historique naviguer={naviguer} />;
      case 'reglages':
        return <Reglages naviguer={naviguer} />;
      case 'diagnostic':
        return <Diagnostic naviguer={naviguer} />;
      case 'rapport':
        return <Rapport identifiant={segments[1] ?? ''} naviguer={naviguer} />;
      default:
        return (
          <div className="py-16 text-center">
            <p className="mb-4 text-[var(--color-texte-doux)]">Cet écran n’existe pas.</p>
            <Bouton variante="principal" onClick={() => naviguer('/')}>
              Revenir à l’accueil
            </Bouton>
          </div>
        );
    }
  })();

  const ongletActif = (c: string) =>
    c === '/' ? chemin === '/' : chemin.startsWith(c);

  return (
    <div className="flex min-h-full flex-col">
      <BandeauMiseAJour />

      <header className="haut-sur avec-marges-sures sticky top-0 z-20 border-b border-[var(--color-bordure)] bg-[var(--color-fond)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between py-3">
          <button
            type="button"
            onClick={() => naviguer('/')}
            className="flex items-center gap-2 text-left"
          >
            <span aria-hidden className="text-xl">
              &#9822;
            </span>
            <span className="text-base font-semibold">Échiquier</span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {ONGLETS.slice(1).map((o) => (
              <button
                key={o.chemin}
                type="button"
                onClick={() => naviguer(o.chemin)}
                className={`cible-tactile rounded-lg px-3 py-2 text-sm transition-colors ${
                  ongletActif(o.chemin)
                    ? 'bg-[var(--color-fond-3)] font-medium text-[var(--color-texte)]'
                    : 'text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]'
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => naviguer('/reglages')}
            aria-label="Réglages"
            className="cible-tactile rounded-lg px-3 py-2 text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]"
          >
            <span aria-hidden className="text-lg">
              &#9881;
            </span>
          </button>
        </div>
      </header>

      <main className="avec-marges-sures mx-auto w-full max-w-6xl flex-1 pb-24 pt-4 md:pb-8">
        <Suspense fallback={<Chargement />}>{rendu}</Suspense>
      </main>

      {/* Navigation basse : sur mobile, c'est la zone la plus accessible au pouce. */}
      <nav className="barre-basse fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-bordure)] bg-[var(--color-fond-2)] md:hidden">
        <ul className="mx-auto flex max-w-2xl">
          {ONGLETS.map((o) => (
            <li key={o.chemin} className="flex-1">
              <button
                type="button"
                onClick={() => naviguer(o.chemin)}
                className={`cible-tactile flex w-full flex-col items-center gap-0.5 py-2 text-[0.68rem] ${
                  ongletActif(o.chemin)
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-texte-doux)]'
                }`}
              >
                <span aria-hidden className="text-base leading-none">
                  {o.icone}
                </span>
                {o.libelle}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function App() {
  return (
    <FournisseurReglages>
      <Coque />
    </FournisseurReglages>
  );
}
