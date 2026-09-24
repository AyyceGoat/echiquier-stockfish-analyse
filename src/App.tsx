/**
 * Coque de l'application : en-tête, navigation, aiguillage des écrans.
 *
 * Les écrans lourds (analyse, reconnaissance d'image, diagnostic) sont
 * chargés paresseusement : la première visite ne télécharge que l'accueil
 * et l'échiquier, ce qui raccourcit nettement le démarrage en réseau lent.
 */

import { Suspense, lazy, useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { FournisseurReglages, useRoute } from './contexte.tsx';
import { Accueil } from './pages/Accueil.tsx';
import { PartieLibre } from './pages/PartieLibre.tsx';
import { Bouton, Squelette } from './ui/composants.tsx';
import {
  IconeCourbe,
  IconeCurseurs,
  IconeHorloge,
  IconeLivre,
  IconePion,
  IconePionAssiste,
  MarqueEchiquier,
} from './ui/Icones.tsx';

const JeuAssiste = lazy(() =>
  import('./pages/JeuAssiste.tsx').then((m) => ({ default: m.JeuAssiste })),
);
const AnalysePosition = lazy(() =>
  import('./pages/AnalysePosition.tsx').then((m) => ({ default: m.AnalysePosition })),
);
const Historique = lazy(() =>
  import('./pages/Historique.tsx').then((m) => ({ default: m.Historique })),
);
const Apprendre = lazy(() =>
  import('./pages/Apprendre.tsx').then((m) => ({ default: m.Apprendre })),
);
const Reglages = lazy(() => import('./pages/Reglages.tsx').then((m) => ({ default: m.Reglages })));
const Voix = lazy(() => import('./pages/Voix.tsx').then((m) => ({ default: m.Voix })));
const Diagnostic = lazy(() =>
  import('./pages/Diagnostic.tsx').then((m) => ({ default: m.Diagnostic })),
);
const Rapport = lazy(() => import('./pages/Rapport.tsx').then((m) => ({ default: m.Rapport })));

/**
 * Cinq entrées, pas six.
 *
 * L'accueil a quitté la barre : le titre en haut y ramène, et six libellés
 * ne tiennent pas lisiblement sur un écran de 360 px — ils passaient à deux
 * lignes ou se tronquaient. Cinq laissent 72 px par onglet, au-dessus de la
 * cible tactile recommandée.
 */
const ONGLETS: {
  chemin: string;
  libelle: string;
  Icone: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { chemin: '/libre', libelle: 'Jouer', Icone: IconePion },
  { chemin: '/assiste', libelle: 'Assisté', Icone: IconePionAssiste },
  { chemin: '/apprendre', libelle: 'Apprendre', Icone: IconeLivre },
  { chemin: '/analyse', libelle: 'Analyse', Icone: IconeCourbe },
  { chemin: '/historique', libelle: 'Historique', Icone: IconeHorloge },
];

/**
 * Attente d'un écran chargé paresseusement.
 *
 * Un squelette à la forme approximative de l'écran, et non un « Chargement… »
 * centré : le texte occupait 48 px de haut là où l'écran en fait 600, si
 * bien que toute la page sautait au moment où le module arrivait.
 */
function Chargement() {
  return (
    <div className="ecran-entre space-y-4 pt-1" role="status" aria-label="Chargement de l’écran">
      <Squelette hauteur="2.25rem" largeur="60%" />
      <Squelette hauteur="1rem" largeur="85%" />
      <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Squelette
          hauteur="min(88vw, 62vh, 34rem)"
          largeur="min(88vw, 62vh, 34rem)"
          className="mx-auto max-w-full rounded-[var(--radius-md)]"
        />
        <div className="hidden space-y-4 lg:block">
          <Squelette hauteur="9rem" className="rounded-[var(--radius-lg)]" />
          <Squelette hauteur="14rem" className="rounded-[var(--radius-lg)]" />
        </div>
      </div>
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
    <div className="panneau-entre sticky top-0 z-30 flex items-center justify-between gap-3 bg-[var(--color-accent)] px-4 py-2 text-sm text-[var(--color-sur-accent)]">
      <span className="min-w-0">Une nouvelle version est disponible.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="cible-tactile shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-sur-accent)]/15 px-3 py-1.5 font-semibold transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-sur-accent)]/25"
      >
        Recharger
      </button>
    </div>
  );
}

function Coque() {
  const { chemin, segments, requete, naviguer } = useRoute();

  const racine = segments[0] ?? '';

  const rendu = (() => {
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
      case 'apprendre':
        return <Apprendre naviguer={naviguer} />;
      case 'reglages':
        return <Reglages naviguer={naviguer} />;
      case 'voix':
        return <Voix naviguer={naviguer} />;
      case 'diagnostic':
        return <Diagnostic naviguer={naviguer} />;
      case 'rapport':
        return (
          <Rapport
            identifiant={segments[1] ?? ''}
            coupDemande={requete.get('coup')}
            naviguer={naviguer}
          />
        );
      default:
        return (
          <div className="py-16 text-center">
            <p className="titre mb-1 text-lg font-semibold">Cet écran n’existe pas.</p>
            <p className="mb-5 text-sm text-[var(--color-texte-doux)]">
              L’adresse <span className="chiffres">{chemin}</span> ne correspond à aucun écran.
            </p>
            <Bouton variante="principal" onClick={() => naviguer('/')}>
              Revenir à l’accueil
            </Bouton>
          </div>
        );
    }
  })();

  const ongletActif = (c: string) => (c === '/' ? chemin === '/' : chemin.startsWith(c));
  const surAccueil = chemin === '/';

  return (
    <div className="flex min-h-full flex-col">
      <BandeauMiseAJour />

      <header className="haut-sur avec-marges-sures sticky top-0 z-20 border-b border-[var(--color-bordure)] bg-[var(--color-fond)]/88 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 py-2.5">
          <button
            type="button"
            onClick={() => naviguer('/')}
            aria-current={surAccueil ? 'page' : undefined}
            className="cible-tactile -ml-2 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 text-left transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-fond-2)]"
          >
            <span className="flex items-center text-[1.4rem] leading-none">
              <MarqueEchiquier />
            </span>
            <span className="titre text-[1.0625rem] font-semibold tracking-tight">Échiquier</span>
          </button>

          <nav aria-label="Navigation principale" className="hidden items-center gap-0.5 md:flex">
            {ONGLETS.map((o) => {
              const actif = ongletActif(o.chemin);
              return (
                <button
                  key={o.chemin}
                  type="button"
                  onClick={() => naviguer(o.chemin)}
                  aria-current={actif ? 'page' : undefined}
                  className={`cible-tactile relative flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--t-rapide)] ${
                    actif
                      ? 'bg-[var(--color-fond-2)] font-semibold text-[var(--color-texte)]'
                      : 'text-[var(--color-texte-doux)] hover:bg-[var(--color-fond-2)] hover:text-[var(--color-texte)]'
                  }`}
                >
                  <o.Icone
                    className="text-[1.05rem]"
                    style={{ color: actif ? 'var(--color-accent)' : undefined }}
                  />
                  {o.libelle}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => naviguer('/reglages')}
            aria-label="Réglages"
            aria-current={chemin.startsWith('/reglages') ? 'page' : undefined}
            className={`cible-tactile -mr-2 flex items-center justify-center rounded-[var(--radius-md)] px-3 text-[1.15rem] transition-colors duration-[var(--t-rapide)] ${
              chemin.startsWith('/reglages')
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]'
            }`}
          >
            <IconeCurseurs />
          </button>
        </div>
      </header>

      <main className="avec-marges-sures mx-auto w-full max-w-6xl flex-1 pt-4 pb-24 md:pb-10">
        {/* La clé force le remontage à chaque écran : c'est ce qui rejoue
            l'animation d'entrée, et ce qui garantit qu'un écran ne réutilise
            jamais l'état du précédent. */}
        <Suspense fallback={<Chargement />}>
          <div key={racine} className="ecran-entre">
            {rendu}
          </div>
        </Suspense>
      </main>

      {/* Navigation basse : sur mobile, c'est la zone la plus accessible au pouce. */}
      <nav
        aria-label="Navigation principale"
        className="barre-basse fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-bordure)] bg-[var(--color-fond-2)]/95 backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto flex max-w-2xl">
          {ONGLETS.map((o) => {
            const actif = ongletActif(o.chemin);
            return (
              <li key={o.chemin} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => naviguer(o.chemin)}
                  aria-current={actif ? 'page' : undefined}
                  className={`cible-tactile relative flex w-full flex-col items-center justify-center gap-1 px-0.5 py-2 transition-colors duration-[var(--t-rapide)] ${
                    actif ? 'text-[var(--color-accent)]' : 'text-[var(--color-texte-doux)]'
                  }`}
                >
                  {/* Trait sous l'onglet actif : la couleur seule ne suffit pas
                      à le repérer d'un coup d'œil, ni pour qui distingue mal
                      les couleurs. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--color-accent)] transition-opacity duration-[var(--t-normal)]"
                    style={{ opacity: actif ? 1 : 0 }}
                  />
                  <o.Icone className="text-[1.2rem]" />
                  {/* 0,68 rem : « Historique » tient sur une ligne à 360 px,
                      soit 72 px par onglet. Au-dessus, il passait à deux
                      lignes et décalait la barre entière. */}
                  <span
                    className={`w-full truncate text-center text-[0.68rem] leading-none ${
                      actif ? 'font-semibold' : ''
                    }`}
                  >
                    {o.libelle}
                  </span>
                </button>
              </li>
            );
          })}
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
