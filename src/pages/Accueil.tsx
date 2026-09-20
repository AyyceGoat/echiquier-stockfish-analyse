/**
 * Accueil.
 *
 * Deux règles ont guidé cet écran :
 *
 *  1. Une seule action évidente. « Jouer une partie » est le seul bouton
 *     plein de la page ; tout le reste est secondaire visuellement. Un
 *     visiteur qui ne lit rien doit malgré tout savoir où appuyer.
 *  2. Rien ne bouge après le chargement. La carte « Reprendre » dépend
 *     d'une lecture d'IndexedDB : sa place est réservée par un squelette de
 *     la même hauteur, sinon la liste des modes descendait d'un cran une
 *     demi-seconde après l'affichage — juste au moment où le doigt arrive.
 *
 * Les trois modes de jeu restent présentés par leur différence essentielle :
 * le moment où le moteur intervient.
 */

import { useEffect, useState } from 'react';
import { listerParties, type PartieEnregistree } from '../db/parties.ts';
import { useEtatMoteur, useMoteur } from '../hooks/useMoteur.ts';
import { nomVariante } from '../engine/capacites.ts';
import { Echiquier } from '../ui/Echiquier.tsx';
import { Bouton, Carte, Etiquette, Squelette } from '../ui/composants.tsx';
import {
  IconeCourbe,
  IconeLivre,
  IconePion,
  IconePionAssiste,
} from '../ui/Icones.tsx';

/**
 * Partie de l'Opéra (Morphy, 1858), juste AVANT le mat : les blancs jouent
 * et Td8 est mat.
 *
 * Une vraie position, et non l'échiquier de départ : elle montre du premier
 * coup d'œil ce que fait l'application — un plateau soigné et l'unique
 * flèche du meilleur coup, qui est la signature de l'interface.
 *
 * La position est celle d'avant le coup, pas d'après : une flèche qui
 * désigne un coup déjà joué ne veut rien dire.
 */
const POSITION_VITRINE = '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17';
const MEILLEUR_COUP_VITRINE = { depuis: 'd1', vers: 'd8', couleur: 'green' } as const;

const MODES = [
  {
    chemin: '/libre',
    titre: 'Partie libre',
    accroche: 'Aucune assistance pendant le jeu.',
    detail:
      'Ni évaluation, ni flèche, ni indice. Exactement comme une vraie partie. L’analyse complète est proposée à la fin.',
    Icone: IconePion,
  },
  {
    chemin: '/assiste',
    titre: 'Jeu assisté',
    accroche: 'Stockfish commente pendant que vous jouez.',
    detail:
      'Retour immédiat sur chaque coup, meilleur coup affiché en cas d’erreur, et possibilité de reprendre votre coup.',
    Icone: IconePionAssiste,
  },
  {
    chemin: '/analyse',
    titre: 'Analyse de position',
    accroche: 'Étudier une position précise.',
    detail:
      'Import par photo, FEN collé ou PGN chargé. Analyse continue et exploration libre des variantes.',
    Icone: IconeCourbe,
  },
  {
    chemin: '/apprendre',
    titre: 'Apprendre',
    accroche: 'Les règles et la tactique, en exercices.',
    detail:
      'Le déplacement de chaque pièce, le roque, la prise en passant, puis les motifs tactiques — et les exercices qui correspondent aux erreurs de vos parties.',
    Icone: IconeLivre,
  },
];

export function Accueil({ naviguer }: { naviguer: (v: string) => void }) {
  const etatMoteur = useEtatMoteur();
  const moteur = useMoteur();
  const [recentes, setRecentes] = useState<PartieEnregistree[] | null>(null);

  useEffect(() => {
    let vivant = true;
    listerParties(3)
      .then((p) => {
        if (vivant) setRecentes(p);
      })
      .catch(() => {
        // Stockage indisponible : l'accueil reste complet, simplement sans
        // la reprise de partie.
        if (vivant) setRecentes([]);
      });
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* --- Bandeau d'accueil ------------------------------------------- */}
      <section className="grid items-center gap-6 pt-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
        <div className="min-w-0">
          <p className="sur-titre">Échecs · Stockfish · Hors ligne</p>
          <h1 className="titre-ecran mt-2.5 text-[2.125rem] sm:text-[2.75rem] lg:text-[3.25rem]">
            Jouez. Comprenez.
            <br />
            <span className="text-[var(--color-accent)]">Progressez.</span>
          </h1>
          <p className="mt-3.5 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--color-texte-doux)]">
            Affrontez Stockfish au niveau de votre choix, faites-vous corriger coup par coup, et
            relisez vos parties avec une explication en français plutôt qu’un chiffre.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Bouton
              variante="principal"
              className="min-w-[11rem] flex-1 sm:flex-none"
              onClick={() => naviguer('/libre')}
            >
              Jouer une partie
            </Bouton>
            <Bouton className="flex-1 sm:flex-none" onClick={() => naviguer('/assiste')}>
              Être guidé
            </Bouton>
          </div>

          <p className="mt-3.5 text-xs text-[var(--color-texte-doux)]">
            Aucun compte, aucune publicité. Le moteur tourne sur votre appareil.
          </p>
        </div>

        {/* Plateau de vitrine. Décoratif et non interactif : il est masqué
            aux lecteurs d'écran, qui n'ont rien à y faire. La largeur est
            fixée pour qu'il réserve sa place avant même d'être dessiné. */}
        <div
          aria-hidden
          className="mx-auto w-full max-w-[19rem] lg:w-[19rem]"
          style={{ pointerEvents: 'none' }}
        >
          <Echiquier
            fen={POSITION_VITRINE}
            orientation="white"
            fleche={MEILLEUR_COUP_VITRINE}
            coordonnees={false}
            animations={false}
            tailleMax="100%"
          />
          <p className="mt-2.5 text-center text-xs text-[var(--color-texte-doux)]">
            Partie de l’Opéra, Morphy 1858 — les blancs jouent et matent.
          </p>
        </div>
      </section>

      {/* --- Reprendre ----------------------------------------------------
          Placé avant les modes : quelqu'un qui revient veut d'abord
          retrouver sa dernière partie. Sa place est réservée pendant la
          lecture de l'historique. */}
      {recentes === null ? (
        <Carte titre="Reprendre">
          <div className="space-y-2" role="status" aria-label="Lecture de l’historique">
            <Squelette hauteur="2.75rem" className="rounded-[var(--radius-md)]" />
            <Squelette hauteur="2.75rem" largeur="88%" className="rounded-[var(--radius-md)]" />
          </div>
        </Carte>
      ) : recentes.length > 0 ? (
        <Carte
          titre="Reprendre"
          action={
            <Bouton variante="discret" onClick={() => naviguer('/historique')}>
              Tout voir
            </Bouton>
          }
        >
          <ul className="space-y-1">
            {recentes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => naviguer(`/rapport/${p.id}`)}
                  className="cible-tactile flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors duration-[var(--t-rapide)] hover:bg-[var(--color-fond-3)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {p.blanc} — {p.noir}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
                      {new Date(p.date).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      · {p.coupsSan.length} demi-coups
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.rapport ? <Etiquette ton="succes">Analysée</Etiquette> : null}
                    <span className="chiffres text-sm">{p.resultat}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      {/* --- Les modes ----------------------------------------------------- */}
      <section>
        <h2 className="titre text-lg font-semibold">Quatre façons de travailler</h2>
        <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
          Les trois modes de jeu se distinguent par le moment où le moteur intervient.
        </p>

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.chemin}
              type="button"
              onClick={() => naviguer(m.chemin)}
              className="group flex gap-3.5 rounded-[var(--radius-lg)] border border-[var(--color-bordure)] bg-[var(--color-fond-2)] p-4 text-left shadow-[var(--ombre-carte)] transition-[border-color,transform] duration-[var(--t-normal)] hover:border-[var(--color-accent)] active:scale-[0.995]"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--voile-accent)] text-[1.15rem] text-[var(--color-accent)]">
                <m.Icone />
              </span>
              <span className="min-w-0">
                <span className="titre block text-[0.9375rem] font-semibold">{m.titre}</span>
                <span className="mt-0.5 block text-sm font-medium text-[var(--color-accent)]">
                  {m.accroche}
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-[var(--color-texte-doux)]">
                  {m.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* --- État du moteur -------------------------------------------------
          Une ligne, plus une carte : c'est une information de contexte, pas
          une action. Le diagnostic a rejoint les Réglages, où l'on va une
          fois sur cent. La hauteur est fixe pour que le passage de
          « préparation » à « prêt » ne décale rien. */}
      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--color-bordure)] pt-4 text-xs text-[var(--color-texte-doux)]">
        {etatMoteur.etat === 'pret' || etatMoteur.etat === 'recherche' ? (
          <Etiquette ton="succes">
            {moteur.varianteChargee ? nomVariante(moteur.varianteChargee) : 'Moteur'} prêt
          </Etiquette>
        ) : etatMoteur.etat === 'echec' ? (
          <Etiquette ton="danger">Moteur indisponible</Etiquette>
        ) : etatMoteur.etat === 'telechargement' ? (
          <Etiquette ton="info">Téléchargement du moteur…</Etiquette>
        ) : (
          <Etiquette>Chargé à la demande</Etiquette>
        )}
        <span className="min-w-0">
          Le moteur se télécharge lors de la première analyse, puis reste disponible hors ligne.
        </span>
      </div>
    </div>
  );
}
