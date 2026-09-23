/**
 * « Mes erreurs » : les fautes du joueur, sur ses propres positions.
 *
 * Ce que cet écran remplace : un compteur de motifs suivi d'exercices tirés
 * du catalogue — toujours les mêmes diagrammes, sans aucun rapport avec les
 * parties jouées. Un joueur qui laisse ses pièces en prise y voyait une
 * finale de manuel.
 *
 * Ici, chaque motif ouvre ses occurrences réelles : la position exacte avant
 * la faute, le coup joué en rouge, le coup attendu en vert, et de quelle
 * partie cela vient. Quand l'erreur s'est répétée, on parcourt les
 * occurrences une à une.
 */

import { useEffect, useMemo, useState } from 'react';
import { Echiquier, type FlecheEchiquier } from './Echiquier.tsx';
import { Bouton, Carte, Etiquette } from './composants.tsx';
import { numeroCoup, type GroupeErreur } from '../lib/mesErreurs.ts';
import { COULEURS, LIBELLES } from '../lib/classification.ts';
import { LIBELLE_MOTIF, type MotifExplication } from '../lib/explications.ts';

/** Conseil court attaché au motif, pour que la position serve à quelque chose. */
const A_RETENIR: Partial<Record<MotifExplication, string>> = {
  'piece-en-prise':
    'Avant de jouer, comptez les attaquants et les défenseurs de la case d’arrivée.',
  'menace-ignoree':
    'Après chaque coup adverse, demandez-vous ce qu’il menace avant de poursuivre votre plan.',
  fourchette: 'Repérez les cases d’où un cavalier toucherait deux de vos pièces à la fois.',
  clouage: 'Une pièce placée entre votre roi et une pièce à longue portée ne peut plus bouger.',
  enfilade: 'Deux pièces de valeur sur une même ligne s’enfilent : décalez-en une.',
  'mat-manque': 'Quand le roi adverse a peu de cases, cherchez le mat avant de prendre du matériel.',
  'mat-subi': 'Comptez les cases de fuite de votre roi avant d’ouvrir une ligne devant lui.',
  'occasion-manquee': 'Avant de consolider, vérifiez s’il n’y a pas un coup qui gagne sur-le-champ.',
};

export function MesErreurs({
  groupes,
  naviguer,
}: {
  groupes: GroupeErreur[];
  naviguer: (v: string) => void;
}) {
  const [motifActif, setMotifActif] = useState(0);
  const [occurrenceActive, setOccurrenceActive] = useState(0);

  // Changer de motif repart de l'occurrence la plus récente.
  useEffect(() => {
    setOccurrenceActive(0);
  }, [motifActif]);

  const groupe = groupes[Math.min(motifActif, groupes.length - 1)];
  const occurrence = groupe?.occurrences[Math.min(occurrenceActive, groupe.occurrences.length - 1)];

  /**
   * Deux flèches : ce qui a été joué, ce qu'il fallait jouer.
   *
   * Le coup joué passe en rouge et le coup attendu en vert — sans cette
   * distinction, la position montre une faute sans dire laquelle.
   */
  const fleches: FlecheEchiquier[] = useMemo(() => {
    if (!occurrence) return [];
    const out: FlecheEchiquier[] = [
      {
        depuis: occurrence.uci.slice(0, 2),
        vers: occurrence.uci.slice(2, 4),
        couleur: 'red',
      },
    ];
    if (occurrence.meilleurUci && occurrence.meilleurUci !== occurrence.uci) {
      out.push({
        depuis: occurrence.meilleurUci.slice(0, 2),
        vers: occurrence.meilleurUci.slice(2, 4),
        couleur: 'green',
      });
    }
    return out;
  }, [occurrence]);

  if (!groupe || !occurrence) return null;

  const total = groupe.occurrences.length;

  return (
    <>
      <Carte titre="Ce que vos parties révèlent">
        <p className="text-sm text-[var(--color-texte-doux)]">
          Vos propres coups uniquement, dans les parties que vous avez analysées.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {groupes.map((g, i) => (
            <li key={g.motif}>
              <button
                type="button"
                onClick={() => setMotifActif(i)}
                aria-current={i === motifActif}
                className={`cible-tactile rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--t-rapide)] ${
                  i === motifActif
                    ? 'bg-[var(--color-accent)] text-[var(--color-sur-accent)]'
                    : 'bg-[var(--color-fond-3)] text-[var(--color-texte-doux)] hover:text-[var(--color-texte)]'
                }`}
              >
                {LIBELLE_MOTIF[g.motif]} — {g.occurrences.length} fois
              </button>
            </li>
          ))}
        </ul>
      </Carte>

      <Carte
        titre={LIBELLE_MOTIF[groupe.motif]}
        action={
          total > 1 ? (
            <span className="chiffres text-xs text-[var(--color-texte-doux)]">
              {occurrenceActive + 1} sur {total}
            </span>
          ) : undefined
        }
      >
        {/* La position d'abord : c'est elle qu'on est venu voir. */}
        <div className="mx-auto w-full max-w-[26rem]">
          <Echiquier
            fen={occurrence.fenAvant}
            orientation={occurrence.couleur === 'w' ? 'white' : 'black'}
            trait={occurrence.couleur === 'w' ? 'white' : 'black'}
            fleches={fleches}
            animations={false}
            tailleMax="100%"
          />
        </div>

        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-mono">
            {numeroCoup(occurrence.ply, occurrence.couleur)} {occurrence.san}
          </span>
          <span className="text-xs font-medium" style={{ color: COULEURS[occurrence.classement] }}>
            {LIBELLES[occurrence.classement]}
          </span>
          {occurrence.meilleurSan ? (
            <span className="text-[var(--color-texte-doux)]">
              — il fallait jouer{' '}
              <span className="font-mono text-[var(--color-succes)]">{occurrence.meilleurSan}</span>
            </span>
          ) : null}
        </p>

        <p className="mt-1 text-sm text-[var(--color-texte-doux)]">{occurrence.phrase}</p>

        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-texte-doux)]">
          <Etiquette>
            {new Date(occurrence.date).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
            })}
          </Etiquette>
          <span>contre {occurrence.adversaire}</span>
        </p>

        {A_RETENIR[groupe.motif] ? (
          <p className="mt-3 rounded-xl bg-[var(--color-fond-3)] px-3 py-2 text-sm">
            <span className="font-medium">À retenir : </span>
            {A_RETENIR[groupe.motif]}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {total > 1 ? (
            <>
              <Bouton
                variante="discret"
                onClick={() => setOccurrenceActive((i) => Math.max(0, i - 1))}
                disabled={occurrenceActive === 0}
              >
                Précédente
              </Bouton>
              <Bouton
                variante="discret"
                onClick={() => setOccurrenceActive((i) => Math.min(total - 1, i + 1))}
                disabled={occurrenceActive + 1 >= total}
              >
                Suivante
              </Bouton>
            </>
          ) : null}
          <Bouton
            variante="discret"
            onClick={() => naviguer(`/rapport/${occurrence.partieId}?coup=${occurrence.ply}`)}
          >
            Revoir dans la partie
          </Bouton>
        </div>
      </Carte>
    </>
  );
}
