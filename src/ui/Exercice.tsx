/**
 * Un exercice, joué sur l'échiquier.
 *
 * Rien ne s'apprend en lisant une règle : on la joue. Le composant accepte
 * n'importe quelle solution correcte — pas seulement celle qui était prévue —
 * et explique en français ce qui manque quand la tentative échoue.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { evaluerTentative, type Exercice as TypeExercice } from '../lib/exercices.ts';
import { uciVersSan } from '../lib/explications.ts';
import { Echiquier, type FlecheEchiquier } from '../ui/Echiquier.tsx';
import { DialoguePromotion } from './DialoguePromotion.tsx';
import { Bouton, Carte } from './composants.tsx';
import type { Promotion } from '../hooks/usePartie.ts';

type Etat =
  | { phase: 'a-jouer' }
  | { phase: 'echoue'; message: string }
  | { phase: 'reussi'; message: string };

export function Exercice({
  exercice,
  onReussite,
  onSuivant,
  numero,
  total,
}: {
  exercice: TypeExercice;
  onReussite: (id: string) => void;
  onSuivant?: () => void;
  numero: number;
  total: number;
}) {
  const [etat, setEtat] = useState<Etat>({ phase: 'a-jouer' });
  const [indiceVisible, setIndiceVisible] = useState(false);
  const [solutionVisible, setSolutionVisible] = useState(false);
  const [fenAffichee, setFenAffichee] = useState(exercice.fen);
  const [promotion, setPromotion] = useState<{ depuis: string; vers: string } | null>(null);
  /** Incrémenté à chaque tentative, pour remettre l'échiquier en place. */
  const [revision, setRevision] = useState(0);

  // Un nouvel exercice remet tout à zéro : sans cela on garderait l'indice
  // et le verdict du précédent.
  useEffect(() => {
    setEtat({ phase: 'a-jouer' });
    setIndiceVisible(false);
    setSolutionVisible(false);
    setFenAffichee(exercice.fen);
    setPromotion(null);
    setRevision((r) => r + 1);
  }, [exercice.id, exercice.fen]);

  const jeu = useMemo(() => new Chess(exercice.fen), [exercice.fen]);
  const trait = jeu.turn() === 'w' ? 'white' : 'black';

  const destinations = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of jeu.moves({ verbose: true })) {
      const l = m.get(c.from);
      if (l) l.push(c.to);
      else m.set(c.from, [c.to]);
    }
    return m;
  }, [jeu]);

  const demandePromotion = useCallback(
    (depuis: string, vers: string) => {
      const p = jeu.get(depuis as Square);
      if (!p || p.type !== 'p') return false;
      return (p.color === 'w' && vers[1] === '8') || (p.color === 'b' && vers[1] === '1');
    },
    [jeu],
  );

  const essayer = useCallback(
    (depuis: string, vers: string, promo?: Promotion) => {
      if (etat.phase === 'reussi') return;
      if (!promo && demandePromotion(depuis, vers)) {
        setPromotion({ depuis, vers });
        return;
      }
      const uci = `${depuis}${vers}${promo ?? ''}`;
      const verdict = evaluerTentative(exercice, uci);
      // Toute tentative resynchronise l'échiquier : Chessground a déjà bougé
      // la pièce de son côté, qu'on accepte le coup ou non.
      setRevision((r) => r + 1);

      if (verdict.reussi) {
        // On laisse la position jouée à l'écran : voir le résultat fait
        // partie de la leçon.
        const apres = new Chess(exercice.fen);
        apres.move({
          from: depuis as Square,
          to: vers as Square,
          promotion: promo,
        });
        setFenAffichee(apres.fen());
        setEtat({ phase: 'reussi', message: verdict.message });
        onReussite(exercice.id);
      } else {
        // On remet la position de départ : réessayer doit être immédiat.
        setFenAffichee(exercice.fen);
        setEtat({ phase: 'echoue', message: verdict.message });
      }
    },
    [demandePromotion, etat.phase, exercice, onReussite],
  );

  const fleche: FlecheEchiquier | null = useMemo(
    () =>
      solutionVisible && etat.phase !== 'reussi'
        ? {
            depuis: exercice.solution.slice(0, 2),
            vers: exercice.solution.slice(2, 4),
            couleur: 'green',
          }
        : null,
    [solutionVisible, etat.phase, exercice.solution],
  );

  const solutionSan = useMemo(
    () => uciVersSan(exercice.fen, exercice.solution),
    [exercice.fen, exercice.solution],
  );

  return (
    <div className="space-y-4">
      <Carte
        titre={exercice.titre}
        titreContenu
        action={
          <span className="text-xs text-[var(--color-texte-doux)]">
            {numero} / {total}
          </span>
        }
      >
        <p className="text-sm">{exercice.consigne}</p>

        <div className="mt-4">
          <Echiquier
            fen={fenAffichee}
            orientation={trait}
            destinations={etat.phase === 'reussi' ? undefined : destinations}
            couleurJouable={etat.phase === 'reussi' ? undefined : trait}
            trait={trait}
            echec={jeu.isCheck() ? trait : null}
            fleche={fleche}
            onCoup={(d, v) => essayer(d, v)}
            tailleMax="min(88vw, 55vh, 26rem)"
            revision={revision}
          />
        </div>

        {/* Zone de verdict à hauteur réservée : sans cela, l'apparition du
            message ferait sauter les boutons sous le doigt. */}
        <div className="mt-3 min-h-[3.5rem]">
          {etat.phase === 'reussi' ? (
            <div className="panneau-entre rounded-[var(--radius-md)] border border-[var(--bord-succes)] bg-[var(--voile-succes)] p-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-succes)' }}>
                {etat.message}
              </p>
              <p className="mt-1 text-sm text-[var(--color-texte)]">{exercice.lecon}</p>
            </div>
          ) : etat.phase === 'echoue' ? (
            <div className="panneau-entre rounded-[var(--radius-md)] border border-[var(--bord-alerte)] bg-[var(--voile-alerte)] p-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-alerte)' }}>
                {etat.message}
              </p>
              <p className="mt-1 text-xs text-[var(--color-texte-doux)]">
                Réessayez : la position est rétablie.
              </p>
            </div>
          ) : indiceVisible ? (
            <p className="panneau-entre rounded-[var(--radius-md)] bg-[var(--color-fond-3)] p-3 text-sm text-[var(--color-texte-doux)]">
              {exercice.indice}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {etat.phase === 'reussi' ? (
            onSuivant ? (
              <Bouton variante="principal" onClick={onSuivant}>
                Exercice suivant
              </Bouton>
            ) : null
          ) : (
            <>
              <Bouton onClick={() => setIndiceVisible(true)} disabled={indiceVisible}>
                Un indice
              </Bouton>
              <Bouton variante="discret" onClick={() => setSolutionVisible(true)}>
                Montrer la solution
              </Bouton>
            </>
          )}
          {solutionVisible && etat.phase !== 'reussi' && solutionSan ? (
            <span className="self-center text-sm text-[var(--color-texte-doux)]">
              La solution est <span className="chiffres font-semibold">{solutionSan}</span>.
            </span>
          ) : null}
        </div>
      </Carte>

      {promotion ? (
        <DialoguePromotion
          couleur={jeu.turn()}
          onChoisir={(p) => {
            const { depuis, vers } = promotion;
            setPromotion(null);
            essayer(depuis, vers, p);
          }}
          onAnnuler={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}
