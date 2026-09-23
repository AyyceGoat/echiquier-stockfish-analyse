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
import {
  compterMesParties,
  regrouperMesErreurs,
  type GroupeErreur,
} from '../lib/mesErreurs.ts';
import { MesErreurs } from '../ui/MesErreurs.tsx';
import {
  EXERCICES,
  exercicesParCategorie,
  type Exercice as TypeExercice,
} from '../lib/exercices.ts';
import { Exercice } from '../ui/Exercice.tsx';
import { Bouton, Carte, EnTetePage, Segmente, Squelette } from '../ui/composants.tsx';

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

export function Apprendre({ naviguer }: { naviguer: (v: string) => void }) {
  const [onglet, setOnglet] = useState<Onglet>('bases');
  const [reussis, setReussis] = useState<Set<string>>(() => chargerProgres());
  const [index, setIndex] = useState(0);
  const [groupes, setGroupes] = useState<GroupeErreur[] | null>(null);
  const [mesParties, setMesParties] = useState<number | null>(null);

  /**
   * Erreurs du JOUEUR dans SES parties.
   *
   * Le décompte portait auparavant sur tous les coups de la partie : les
   * bévues du moteur étaient comptées comme celles du joueur. Le regroupement
   * vit maintenant dans `mesErreurs.ts`, où il est vérifié sans navigateur.
   */
  useEffect(() => {
    let vivant = true;
    listerParties().then((parties) => {
      if (!vivant) return;
      setMesParties(compterMesParties(parties));
      setGroupes(regrouperMesErreurs(parties));
    });
    return () => {
      vivant = false;
    };
  }, []);

  const liste: TypeExercice[] = useMemo(() => {
    if (onglet === 'bases') return exercicesParCategorie('bases');
    if (onglet === 'tactique') return exercicesParCategorie('tactique');
    // L'onglet « mes erreurs » n'a plus d'exercices : il montre les positions
    // réelles du joueur, ce qu'aucun exercice du catalogue ne peut faire.
    return [];
  }, [onglet]);

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
        mesParties === null || groupes === null ? (
          // La place est réservée : sans cela, la carte grandissait d'une
          // ligne à l'autre au moment où l'historique arrivait.
          <Carte titre="Ce que vos parties révèlent">
            <div className="space-y-2" role="status" aria-label="Lecture de l’historique">
              <Squelette hauteur="1rem" largeur="70%" />
              <Squelette hauteur="1.75rem" largeur="45%" className="rounded-full" />
            </div>
          </Carte>
        ) : mesParties === 0 ? (
          <Carte titre="Ce que vos parties révèlent">
            <p className="text-sm text-[var(--color-texte-doux)]">
              Aucune de vos parties n’est encore analysée. Jouez une partie, lancez son analyse, et
              vos erreurs apparaîtront ici, sur vos propres positions.
            </p>
            <Bouton variante="principal" className="mt-3" onClick={() => naviguer('/libre')}>
              Jouer une partie
            </Bouton>
          </Carte>
        ) : groupes.length === 0 ? (
          <Carte titre="Ce que vos parties révèlent">
            <p className="text-sm text-[var(--color-texte-doux)]">
              Sur {mesParties} partie{mesParties > 1 ? 's' : ''} analysée
              {mesParties > 1 ? 's' : ''}, aucun motif d’erreur ne ressort dans vos coups. Continuez
              à jouer.
            </p>
          </Carte>
        ) : (
          <MesErreurs groupes={groupes} naviguer={naviguer} />
        )
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
