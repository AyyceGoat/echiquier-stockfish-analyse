/**
 * Accueil : présente les trois modes et leur différence essentielle,
 * c'est-à-dire le moment où le moteur intervient.
 */

import { useEffect, useState } from 'react';
import { listerParties, type PartieEnregistree } from '../db/parties.ts';
import { useEtatMoteur } from '../hooks/useMoteur.ts';
import { Bouton, Carte, Etiquette } from '../ui/composants.tsx';

const MODES = [
  {
    chemin: '/libre',
    titre: 'Partie libre',
    accroche: 'Aucune assistance pendant le jeu.',
    detail:
      'Ni évaluation, ni flèche, ni indice. Exactement comme une vraie partie. L’analyse complète est proposée à la fin.',
    icone: '♟',
  },
  {
    chemin: '/assiste',
    titre: 'Jeu assisté',
    accroche: 'Stockfish commente pendant que vous jouez.',
    detail:
      'Retour immédiat sur chaque coup, meilleur coup affiché en cas d’erreur, et possibilité de reprendre votre coup.',
    icone: '★',
  },
  {
    chemin: '/analyse',
    titre: 'Analyse de position',
    accroche: 'Étudier une position précise.',
    detail:
      'Import par photo, FEN collé ou PGN chargé. Analyse continue et exploration libre des variantes.',
    icone: '▦',
  },
];

export function Accueil({ naviguer }: { naviguer: (v: string) => void }) {
  const etatMoteur = useEtatMoteur();
  const [recentes, setRecentes] = useState<PartieEnregistree[]>([]);

  useEffect(() => {
    let vivant = true;
    listerParties(3).then((p) => {
      if (vivant) setRecentes(p);
    });
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold">Que voulez-vous faire ?</h1>
        <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
          Les trois modes se distinguent par le moment où le moteur intervient.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.chemin}
            type="button"
            onClick={() => naviguer(m.chemin)}
            className="group rounded-2xl border border-[var(--color-bordure)] bg-[var(--color-fond-2)] p-4 text-left transition-colors hover:border-[var(--color-accent)]"
          >
            <div className="mb-2 flex items-center gap-2">
              <span aria-hidden className="text-xl">
                {m.icone}
              </span>
              <h2 className="text-base font-semibold">{m.titre}</h2>
            </div>
            <p className="text-sm font-medium text-[var(--color-accent)]">{m.accroche}</p>
            <p className="mt-1.5 text-sm text-[var(--color-texte-doux)]">{m.detail}</p>
          </button>
        ))}
      </div>

      {recentes.length > 0 ? (
        <Carte
          titre="Reprendre"
          action={
            <Bouton variante="discret" onClick={() => naviguer('/historique')}>
              Tout voir
            </Bouton>
          }
        >
          <ul className="space-y-2">
            {recentes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => naviguer(`/rapport/${p.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[var(--color-fond-3)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {p.blanc} — {p.noir}
                    </span>
                    <span className="block text-xs text-[var(--color-texte-doux)]">
                      {new Date(p.date).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      · {p.coupsSan.length} demi-coups
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.rapport ? <Etiquette ton="succes">Analysée</Etiquette> : null}
                    <span className="font-mono text-sm">{p.resultat}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <Carte titre="Moteur">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {etatMoteur.etat === 'pret' || etatMoteur.etat === 'recherche' ? (
            <Etiquette ton="succes">Stockfish 18 prêt</Etiquette>
          ) : etatMoteur.etat === 'echec' ? (
            <Etiquette ton="danger">Moteur indisponible</Etiquette>
          ) : etatMoteur.etat === 'arrete' ? (
            <Etiquette>Chargé à la demande</Etiquette>
          ) : (
            <Etiquette ton="info">Préparation du moteur…</Etiquette>
          )}
          <span className="text-[var(--color-texte-doux)]">
            Le moteur se télécharge lors de la première analyse, puis reste disponible hors ligne.
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bouton onClick={() => naviguer('/diagnostic')}>Page de diagnostic</Bouton>
          <Bouton onClick={() => naviguer('/reglages')}>Réglages</Bouton>
        </div>
      </Carte>
    </div>
  );
}
