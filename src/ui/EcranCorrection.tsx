/**
 * Écran de correction d'une position reconnue.
 *
 * La reconnaissance n'est jamais fiable à 100 % : cet écran est le garde-fou.
 * Il met en évidence les cases dont la confiance est basse, permet de
 * corriger une pièce en deux gestes (choisir dans la palette, toucher la
 * case), de retourner l'échiquier, et de renseigner tout ce qu'une image ne
 * peut pas dire : le trait, les roques, la prise en passant, le numéro de coup.
 *
 * Rien ne sort d'ici sans avoir passé `validateFenLegality`.
 *
 * Le contrôle de cohérence matérielle est SÉPARÉ et purement consultatif :
 * une position peut être inhabituelle sans être impossible, et seule
 * l'impossibilité arithmétique est signalée. Même dans ce cas, rien n'est
 * corrigé d'office — l'écran propose, l'utilisateur tranche.
 */

import { createElement, useMemo, useState } from 'react';
import {
  coherenceDuPlateau,
  fenDepuisPlateau,
  proposerCorrectionMateriel,
  retournerPlateau,
  roquesPlausibles,
  type CaseReconnue,
  type ResultatReconnaissance,
} from '../recognition/index.ts';
import { Alerte, Bouton, Carte, ChampTexte, Segmente } from './composants.tsx';

const ROLES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PALETTE: (string | null)[] = [
  'K', 'Q', 'R', 'B', 'N', 'P',
  'k', 'q', 'r', 'b', 'n', 'p',
];

const COLONNES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Rend une pièce avec les images de Chessground. */
function Piece({ symbole }: { symbole: string }) {
  const role = ROLES[symbole.toLowerCase()];
  const couleur = symbole === symbole.toUpperCase() ? 'white' : 'black';
  return (
    <div className="cg-wrap piece-editeur">
      {createElement('piece', { className: `${role} ${couleur}` })}
    </div>
  );
}

export interface PositionValidee {
  fen: string;
  avertissements: string[];
}

export function EcranCorrection({
  resultat,
  apercu,
  onValider,
  onAnnuler,
  seuilConfiance = 0.6,
}: {
  resultat: ResultatReconnaissance;
  /** URL de l'image d'origine, affichée à côté pour comparer. */
  apercu?: string | null;
  onValider: (position: PositionValidee) => void;
  onAnnuler: () => void;
  seuilConfiance?: number;
}) {
  const [plateau, setPlateau] = useState<CaseReconnue[][]>(resultat.plateau);
  const [confiances, setConfiances] = useState<number[][]>(resultat.confiances);
  const [vueNoirsEnBas, setVueNoirsEnBas] = useState(resultat.orientation === 'noirs-en-bas');
  const [pieceActive, setPieceActive] = useState<string | null>('P');
  const [trait, setTrait] = useState<'w' | 'b'>(resultat.trait ?? 'w');
  const [roques, setRoques] = useState(() => roquesPlausibles(resultat.plateau));
  const [priseEnPassant, setPriseEnPassant] = useState('-');
  const [numeroCoup, setNumeroCoup] = useState('1');
  const [coherenceIgnoree, setCoherenceIgnoree] = useState(false);

  const coherence = useMemo(() => coherenceDuPlateau(plateau), [plateau]);

  // Cases désignées par le contrôle, pour le surlignage orange.
  const casesSuspectes = useMemo(
    () => new Set(coherence.problemes.flatMap((p) => p.cases)),
    [coherence],
  );

  const appliquerCorrection = () => {
    const { plateau: corrige, casesRetirees } = proposerCorrectionMateriel(plateau, confiances);
    setPlateau(corrige);
    // Les cases vidées redeviennent certaines : c'est un choix explicite.
    setConfiances((precedent) => {
      const suite = precedent.map((r) => [...r]);
      for (const caseAlg of casesRetirees) {
        const r = 8 - Number(caseAlg[1]);
        const c = caseAlg.charCodeAt(0) - 97;
        if (suite[r]) suite[r][c] = 1;
      }
      return suite;
    });
    setCoherenceIgnoree(false);
  };

  const validation = useMemo(
    () =>
      fenDepuisPlateau(plateau, {
        trait,
        roques,
        priseEnPassant,
        numeroCoup: Math.max(1, Number(numeroCoup) || 1),
      }),
    [plateau, trait, roques, priseEnPassant, numeroCoup],
  );

  const nbDouteuses = useMemo(
    () => confiances.flat().filter((c) => c < seuilConfiance).length,
    [confiances, seuilConfiance],
  );

  /** Le plateau tel qu'il est affiché, selon l'orientation choisie. */
  const plateauAffiche = vueNoirsEnBas ? retournerPlateau(plateau) : plateau;
  const confiancesAffichees = vueNoirsEnBas ? retournerPlateau(confiances) : confiances;

  const modifierCase = (ligneAffichee: number, colonneAffichee: number) => {
    // On repasse en coordonnées réelles avant d'écrire.
    const r = vueNoirsEnBas ? 7 - ligneAffichee : ligneAffichee;
    const c = vueNoirsEnBas ? 7 - colonneAffichee : colonneAffichee;

    setPlateau((precedent) => {
      const suite = precedent.map((rangee) => [...rangee]);
      // Toucher une case qui contient déjà la pièce choisie l'efface :
      // cela évite d'avoir à sélectionner la gomme pour une correction simple.
      suite[r][c] = suite[r][c] === pieceActive ? null : pieceActive;
      return suite;
    });
    // Une case corrigée à la main n'est plus douteuse.
    setConfiances((precedent) => {
      const suite = precedent.map((rangee) => [...rangee]);
      suite[r][c] = 1;
      return suite;
    });
  };

  const nomDeCase = (ligneAffichee: number, colonneAffichee: number): string => {
    const r = vueNoirsEnBas ? 7 - ligneAffichee : ligneAffichee;
    const c = vueNoirsEnBas ? 7 - colonneAffichee : colonneAffichee;
    return `${COLONNES[c]}${8 - r}`;
  };

  const basculerRoque = (lettre: string) => {
    setRoques((precedent) => {
      const actuels = precedent === '-' ? '' : precedent;
      const suite = actuels.includes(lettre)
        ? actuels.replace(lettre, '')
        : `${actuels}${lettre}`;
      // On conserve l'ordre canonique KQkq.
      const ordonne = ['K', 'Q', 'k', 'q'].filter((l) => suite.includes(l)).join('');
      return ordonne || '-';
    });
  };

  return (
    <div className="space-y-4">
      <Carte
        titre="Vérifier la position"
        action={
          <span className="text-xs text-[var(--color-texte-doux)]">
            {nbDouteuses > 0
              ? `${nbDouteuses} case${nbDouteuses > 1 ? 's' : ''} à vérifier`
              : 'Toutes les cases sont sûres'}
          </span>
        }
      >
        {resultat.remarques.length > 0 ? (
          <div className="mb-3">
            <Alerte titre="Remarques de la reconnaissance" ton="info">
              <ul className="list-inside list-disc space-y-0.5">
                {resultat.remarques.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Alerte>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            {/* Échiquier éditable. Chaque case est un bouton : cible tactile
                d'au moins 40 px sur un écran de 360 px de large. */}
            <div
              className="mx-auto grid aspect-square w-full max-w-[min(88vw,60vh,30rem)] grid-cols-8 overflow-hidden rounded-lg"
              role="grid"
              aria-label="Position à corriger"
            >
              {plateauAffiche.map((rangee, r) =>
                rangee.map((symbole, c) => {
                  const claire = (r + c) % 2 === 0;
                  const douteuse = confiancesAffichees[r][c] < seuilConfiance;
                  const suspecte = casesSuspectes.has(nomDeCase(r, c));
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => modifierCase(r, c)}
                      aria-label={`Case ${nomDeCase(r, c)}${
                        symbole ? `, contient ${symbole}` : ', vide'
                      }${douteuse ? ', à vérifier' : ''}${
                        suspecte ? ', effectif impossible' : ''
                      }`}
                      className={`relative aspect-square ${
                        claire ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'
                      } ${suspecte ? 'case-impossible' : douteuse ? 'case-douteuse' : ''}`}
                    >
                      {symbole ? <Piece symbole={symbole} /> : null}
                    </button>
                  );
                }),
              )}
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Bouton onClick={() => setVueNoirsEnBas((v) => !v)}>
                Retourner l’échiquier
              </Bouton>
              <Bouton
                onClick={() => {
                  setPlateau(retournerPlateau(plateau));
                  setConfiances(retournerPlateau(confiances));
                }}
              >
                Pivoter la position
              </Bouton>
              <Bouton
                variante="discret"
                onClick={() => {
                  setPlateau(Array.from({ length: 8 }, () => Array<CaseReconnue>(8).fill(null)));
                  setConfiances(Array.from({ length: 8 }, () => Array<number>(8).fill(1)));
                }}
              >
                Vider
              </Bouton>
            </div>

            {apercu ? (
              <details className="mt-3">
                <summary className="cible-tactile cursor-pointer text-sm text-[var(--color-texte-doux)]">
                  Comparer avec l’image d’origine
                </summary>
                <img
                  src={apercu}
                  alt="Image importée"
                  className="mt-2 w-full rounded-lg border border-[var(--color-bordure)]"
                />
              </details>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">
                Pièce à poser (touchez ensuite une case)
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {PALETTE.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPieceActive(p)}
                    aria-label={`Choisir ${p}`}
                    aria-pressed={pieceActive === p}
                    className={`aspect-square rounded-lg border-2 p-0.5 ${
                      pieceActive === p
                        ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                        : 'border-transparent bg-[var(--color-fond-3)]/50'
                    }`}
                  >
                    {p ? <Piece symbole={p} /> : null}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPieceActive(null)}
                  aria-label="Gomme"
                  aria-pressed={pieceActive === null}
                  className={`col-span-6 cible-tactile rounded-lg border-2 py-2 text-sm ${
                    pieceActive === null
                      ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                      : 'border-transparent bg-[var(--color-fond-3)]/50'
                  }`}
                >
                  Gomme (vider une case)
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">Trait</p>
              <Segmente
                valeur={trait}
                ariaLabel="Trait"
                onChange={setTrait}
                options={[
                  { valeur: 'w', libelle: 'Aux blancs' },
                  { valeur: 'b', libelle: 'Aux noirs' },
                ]}
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">Droits de roque</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { lettre: 'K', libelle: 'Blancs, petit' },
                  { lettre: 'Q', libelle: 'Blancs, grand' },
                  { lettre: 'k', libelle: 'Noirs, petit' },
                  { lettre: 'q', libelle: 'Noirs, grand' },
                ].map((r) => (
                  <button
                    key={r.lettre}
                    type="button"
                    onClick={() => basculerRoque(r.lettre)}
                    aria-pressed={roques.includes(r.lettre)}
                    className={`cible-tactile rounded-lg px-2 py-2 text-xs ${
                      roques.includes(r.lettre)
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-fond-3)] text-[var(--color-texte-doux)]'
                    }`}
                  >
                    {r.libelle}
                  </button>
                ))}
              </div>
            </div>

            <ChampTexte
              libelle="Prise en passant"
              valeur={priseEnPassant}
              onChange={(v) => setPriseEnPassant(v.trim() || '-')}
              placeholder="-"
              mono
              aide="Case de destination, par exemple e6. Laissez « - » s’il n’y en a pas."
            />

            <ChampTexte
              libelle="Numéro de coup"
              valeur={numeroCoup}
              onChange={setNumeroCoup}
              type="number"
              mono
            />
          </div>
        </div>
      </Carte>

      {!coherence.possible && !coherenceIgnoree ? (
        <Alerte titre="Cet effectif est impossible sur un échiquier" ton="alerte">
          <ul className="list-inside list-disc space-y-0.5">
            {coherence.problemes.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
          <p className="mt-2">
            Les cases concernées sont encadrées en orange. Une position inhabituelle n’est pas
            forcément fausse : trois tours ou cinq cavaliers sont légaux après des promotions.
            Seul un effectif arithmétiquement impossible est signalé ici.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Bouton variante="principal" onClick={appliquerCorrection}>
              Appliquer la correction
            </Bouton>
            <Bouton onClick={() => setCoherenceIgnoree(true)}>Garder tel quel</Bouton>
          </div>
        </Alerte>
      ) : null}

      {validation.erreurs.length > 0 ? (
        <Alerte titre="Cette position n’est pas valide">
          <ul className="list-inside list-disc space-y-0.5">
            {validation.erreurs.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alerte>
      ) : validation.avertissements.length > 0 ? (
        <Alerte titre="Position corrigée automatiquement" ton="alerte">
          <ul className="list-inside list-disc space-y-0.5">
            {validation.avertissements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Alerte>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Bouton
          variante="principal"
          className="flex-1"
          disabled={!validation.valide}
          onClick={() =>
            validation.fenNormalise &&
            onValider({
              fen: validation.fenNormalise,
              avertissements: validation.avertissements,
            })
          }
        >
          Valider la position
        </Bouton>
        <Bouton className="flex-1" onClick={onAnnuler}>
          Annuler
        </Bouton>
      </div>

      {validation.fenNormalise ? (
        <p className="break-all text-center font-mono text-xs text-[var(--color-texte-doux)]">
          {validation.fenNormalise}
        </p>
      ) : null}
    </div>
  );
}
