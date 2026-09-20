/**
 * Section Apprendre.
 *
 * Trois entrées, dans l'ordre où l'on en a besoin :
 *  - les bases, pour qui ne connaît pas encore les règles ;
 *  - la tactique, classée par motif ;
 *  - ses propres erreurs, tirées des parties déjà analysées, avec les
 *    exercices qui y correspondent.
 *
 * Rien ici ne dépend du réseau : les exercices sont embarqués et l'analyse
 * des parties vient de Stockfish et du générateur d'explications.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listerParties } from '../db/parties.ts';
import { LIBELLE_MOTIF, type MotifExplication } from '../lib/explications.ts';
import {
  EXERCICES,
  exercicesParCategorie,
  exercicesParMotif,
  type Exercice as TypeExercice,
} from '../lib/exercices.ts';
import { Exercice } from '../ui/Exercice.tsx';
import { Bouton, Carte, EnTetePage, Etiquette, Segmente, Squelette } from '../ui/composants.tsx';

type Onglet = 'bases' | 'tactique' | 'erreurs';

const CLE_PROGRES = 'echiquier.exercices-reussis.v1';

function chargerProgres(): Set<string> {
  try {
    const brut = localStorage.getItem(CLE_PROGRES);
    return new Set(brut ? (JSON.parse(brut) as string[]) : []);
  } catch {
    return new Set();
  }
}

function enregistrerProgres(ids: Set<string>): void {
  try {
    localStorage.setItem(CLE_PROGRES, JSON.stringify([...ids]));
  } catch {
    // Stockage indisponible : la progression ne survivra pas à la session,
    // ce qui n'empêche pas de faire les exercices.
  }
}

/** Motifs à compter : ceux qui désignent une erreur, pas un constat neutre. */
const MOTIFS_ERREUR: MotifExplication[] = [
  'piece-en-prise',
  'occasion-manquee',
  'menace-ignoree',
  'fourchette',
  'clouage',
  'enfilade',
  'mat-manque',
  'mat-subi',
];

export function Apprendre({ naviguer }: { naviguer: (v: string) => void }) {
  const [onglet, setOnglet] = useState<Onglet>('bases');
  const [reussis, setReussis] = useState<Set<string>>(() => chargerProgres());
  const [index, setIndex] = useState(0);
  const [erreurs, setErreurs] = useState<{ motif: MotifExplication; nombre: number }[]>([]);
  const [partiesAnalysees, setPartiesAnalysees] = useState<number | null>(null);

  // Comptage des motifs d'erreur dans les parties déjà analysées.
  useEffect(() => {
    let vivant = true;
    listerParties().then((parties) => {
      if (!vivant) return;
      const avecRapport = parties.filter((p) => p.rapport);
      const compte = new Map<MotifExplication, number>();
      for (const p of avecRapport) {
        for (const c of p.rapport?.coups ?? []) {
          // On ne compte que les coups réellement fautifs : un motif détecté
          // sur un bon coup n'est pas une erreur à travailler.
          if (c.classement !== 'imprecision' && c.classement !== 'erreur' && c.classement !== 'gaffe') {
            continue;
          }
          const m = c.explication?.motif;
          if (m && MOTIFS_ERREUR.includes(m)) compte.set(m, (compte.get(m) ?? 0) + 1);
        }
      }
      setPartiesAnalysees(avecRapport.length);
      setErreurs([...compte.entries()].map(([motif, nombre]) => ({ motif, nombre })).sort((a, b) => b.nombre - a.nombre));
    });
    return () => {
      vivant = false;
    };
  }, []);

  const liste: TypeExercice[] = useMemo(() => {
    if (onglet === 'bases') return exercicesParCategorie('bases');
    if (onglet === 'tactique') return exercicesParCategorie('tactique');
    // Onglet « mes erreurs » : les exercices des motifs les plus fréquents,
    // dans l'ordre de fréquence.
    const vus = new Set<string>();
    const out: TypeExercice[] = [];
    for (const e of erreurs) {
      for (const ex of exercicesParMotif(e.motif)) {
        if (!vus.has(ex.id)) {
          vus.add(ex.id);
          out.push(ex);
        }
      }
    }
    return out;
  }, [onglet, erreurs]);

  // Changer d'onglet repart du premier exercice non réussi.
  useEffect(() => {
    const premierNonFait = liste.findIndex((e) => !reussis.has(e.id));
    setIndex(premierNonFait >= 0 ? premierNonFait : 0);
    // `reussis` est volontairement hors dépendances : réussir un exercice ne
    // doit pas faire sauter l'affichage avant que l'utilisateur ait lu la leçon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, liste.length]);

  const marquerReussi = useCallback((id: string) => {
    setReussis((precedents) => {
      if (precedents.has(id)) return precedents;
      const suite = new Set(precedents);
      suite.add(id);
      enregistrerProgres(suite);
      return suite;
    });
  }, []);

  const faits = liste.filter((e) => reussis.has(e.id)).length;
  const courant = liste[index];

  return (
    <div className="space-y-4">
      <EnTetePage titre="Apprendre">
        Des exercices à jouer sur l’échiquier. {reussis.size} réussi
        {reussis.size > 1 ? 's' : ''} sur {EXERCICES.length}.
      </EnTetePage>

      <Segmente
        valeur={onglet}
        ariaLabel="Type d’exercices"
        onChange={setOnglet}
        options={[
          { valeur: 'bases', libelle: 'Les bases' },
          { valeur: 'tactique', libelle: 'Tactique' },
          { valeur: 'erreurs', libelle: 'Mes erreurs' },
        ]}
      />

      {onglet === 'erreurs' ? (
        <Carte titre="Ce que vos parties révèlent">
          {partiesAnalysees === null ? (
            // La place est réservée : sans cela, la carte grandissait d'une
            // ligne à l'autre au moment où l'historique arrivait.
            <div className="space-y-2" role="status" aria-label="Lecture de l’historique">
              <Squelette hauteur="1rem" largeur="70%" />
              <Squelette hauteur="1.75rem" largeur="45%" className="rounded-full" />
            </div>
          ) : partiesAnalysees === 0 ? (
            <>
              <p className="text-sm text-[var(--color-texte-doux)]">
                Aucune partie analysée pour l’instant. Jouez une partie, lancez son analyse, et vos
                erreurs récurrentes apparaîtront ici avec les exercices correspondants.
              </p>
              <Bouton variante="principal" className="mt-3" onClick={() => naviguer('/libre')}>
                Jouer une partie
              </Bouton>
            </>
          ) : erreurs.length === 0 ? (
            <p className="text-sm text-[var(--color-texte-doux)]">
              Sur {partiesAnalysees} partie{partiesAnalysees > 1 ? 's' : ''} analysée
              {partiesAnalysees > 1 ? 's' : ''}, aucun motif d’erreur ne ressort. Continuez à jouer.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-texte-doux)]">
                Sur {partiesAnalysees} partie{partiesAnalysees > 1 ? 's' : ''} analysée
                {partiesAnalysees > 1 ? 's' : ''} :
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {erreurs.slice(0, 5).map((e) => (
                  <li key={e.motif}>
                    <Etiquette ton="alerte">
                      {LIBELLE_MOTIF[e.motif]} — {e.nombre} fois
                    </Etiquette>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Carte>
      ) : null}

      {courant ? (
        <>
          <Exercice
            exercice={courant}
            numero={index + 1}
            total={liste.length}
            onReussite={marquerReussi}
            onSuivant={index + 1 < liste.length ? () => setIndex(index + 1) : undefined}
          />

          <Carte titre="Progression">
            {/* `flex-wrap` et non une rangée figée : en 360 px, « 0 sur 13
                dans cette série » et les deux boutons ne tiennent pas côte à
                côte, et le texte se retrouvait coupé en deux lignes contre
                les boutons. */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
              <span className="text-[var(--color-texte-doux)]">
                {faits} sur {liste.length} dans cette série
              </span>
              <span className="flex gap-1">
                <Bouton
                  variante="discret"
                  onClick={() => setIndex(Math.max(0, index - 1))}
                  disabled={index === 0}
                >
                  Précédent
                </Bouton>
                <Bouton
                  variante="discret"
                  onClick={() => setIndex(Math.min(liste.length - 1, index + 1))}
                  disabled={index + 1 >= liste.length}
                >
                  Suivant
                </Bouton>
              </span>
            </div>

            {/* Accès direct : sur une série de treize, revenir en arrière par
                « Précédent » serait pénible. */}
            <ol className="flex flex-wrap gap-1.5">
              {liste.map((e, i) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`${e.titre}${reussis.has(e.id) ? ', réussi' : ''}`}
                    aria-current={i === index}
                    className={`cible-tactile h-9 w-9 rounded-lg text-xs font-medium ${
                      i === index
                        ? 'bg-[var(--color-accent)] text-[var(--color-sur-accent)]'
                        : reussis.has(e.id)
                          ? 'bg-[var(--voile-succes)] text-[var(--color-succes)]'
                          : 'bg-[var(--color-fond-3)] text-[var(--color-texte-doux)]'
                    }`}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
          </Carte>
        </>
      ) : onglet !== 'erreurs' ? (
        <Carte>
          <p className="text-sm text-[var(--color-texte-doux)]">
            Aucun exercice dans cette série.
          </p>
        </Carte>
      ) : null}
    </div>
  );
}
