/**
 * Analyse de position : point d'entrée pour étudier une position précise.
 *
 * Trois sources d'entrée — image, FEN, PGN — et une fois la position chargée,
 * une analyse continue avec exploration libre des variantes. Depuis ici, on
 * peut basculer en partie libre ou en jeu assisté pour continuer à jouer.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useReglages } from '../contexte.tsx';
import { useAnalyseContinue, useEtatMoteur } from '../hooks/useMoteur.ts';
import { useBalayage, useRaccourcisClavier } from '../hooks/useRaccourcis.ts';
import { usePartie, type Promotion } from '../hooks/usePartie.ts';
import { variantEnSan } from '../lib/explications.ts';
import { FEN_INITIALE, validateFenLegality } from '../lib/fen.ts';
import { trouverOuverture } from '../lib/ouvertures.ts';
import { deposerPosition } from '../lib/positionPartagee.ts';
import { formaterEvaluation } from '../lib/uci.ts';
import type { ResultatReconnaissance } from '../recognition/index.ts';
import { Echiquier, type FlecheEchiquier } from '../ui/Echiquier.tsx';
import { DialoguePromotion } from '../ui/DialoguePromotion.tsx';
import { EcranCorrection } from '../ui/EcranCorrection.tsx';
import { ImportImage } from '../ui/ImportImage.tsx';
import { ListeCoups } from '../ui/ListeCoups.tsx';
import {
  AffichageEval,
  Alerte,
  BarreEval,
  Bouton,
  Carte,
  ChampTexte,
  Segmente,
} from '../ui/composants.tsx';

type Source = 'image' | 'fen' | 'pgn';

export function AnalysePosition({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages } = useReglages();
  const etatMoteur = useEtatMoteur();
  const partie = usePartie(FEN_INITIALE);

  const [chargee, setChargee] = useState(false);
  const [source, setSource] = useState<Source>('image');
  const [saisieFen, setSaisieFen] = useState('');
  const [saisiePgn, setSaisiePgn] = useState('');
  const [erreurSaisie, setErreurSaisie] = useState<string[]>([]);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [analyseActive, setAnalyseActive] = useState(true);
  const [aCorriger, setACorriger] = useState<{
    resultat: ResultatReconnaissance;
    apercu: string;
  } | null>(null);
  const [promotionEnAttente, setPromotion] = useState<{ depuis: string; vers: string } | null>(null);

  const zoneEchiquier = useRef<HTMLDivElement>(null);

  const analyse = useAnalyseContinue(
    chargee ? partie.fen : null,
    chargee && analyseActive,
    reglages.multiPV,
  );

  const chargerFen = useCallback(
    (fen: string) => {
      const v = validateFenLegality(fen);
      if (!v.valide || !v.fenNormalise) {
        setErreurSaisie(v.erreurs.length ? v.erreurs : ['Ce FEN est invalide.']);
        return false;
      }
      setErreurSaisie([]);
      setAvertissements(v.avertissements);
      partie.reinitialiser(v.fenNormalise);
      partie.definirOrientation(v.fenNormalise.split(' ')[1] === 'b' ? 'black' : 'white');
      setChargee(true);
      return true;
    },
    [partie],
  );

  const chargerPgn = useCallback(() => {
    try {
      const jeu = new Chess();
      jeu.loadPgn(saisiePgn, { strict: false });
      const coupsSan = jeu.history();
      if (coupsSan.length === 0) {
        setErreurSaisie(['Aucun coup lisible dans ce PGN.']);
        return;
      }
      // `loadPgn` gère l'en-tête FEN : on repart de la position de départ
      // réelle de la partie, pas forcément de la position initiale.
      const entetes = jeu.header();
      const depart = entetes.FEN ?? FEN_INITIALE;
      setErreurSaisie([]);
      setAvertissements([]);
      partie.charger(depart, coupsSan);
      setChargee(true);
    } catch (e) {
      setErreurSaisie([
        e instanceof Error ? `PGN illisible : ${e.message}` : 'Ce PGN n’a pas pu être lu.',
      ]);
    }
  }, [partie, saisiePgn]);

  const surCoup = useCallback(
    (depuis: string, vers: string, promotion?: Promotion) => {
      if (!promotion && partie.demandePromotion(depuis, vers)) {
        setPromotion({ depuis, vers });
        return;
      }
      partie.jouerCoup(depuis, vers, promotion);
    },
    [partie],
  );

  useRaccourcisClavier(
    {
      precedent: partie.precedent,
      suivant: partie.suivant,
      debut: partie.debut,
      fin: partie.finListe,
      retourner: partie.retourner,
      basculerAnalyse: () => setAnalyseActive((a) => !a),
    },
    chargee,
  );

  useBalayage(
    zoneEchiquier,
    { versLaGauche: partie.suivant, versLaDroite: partie.precedent },
    chargee,
  );

  const ouverture = useMemo(() => trouverOuverture(partie.coupsSan), [partie.coupsSan]);

  const fleches: FlecheEchiquier[] = useMemo(
    () =>
      analyse.lignes.slice(0, Math.min(3, reglages.multiPV)).map((l, i) => ({
        depuis: l.pv[0]?.slice(0, 2) ?? 'a1',
        vers: l.pv[0]?.slice(2, 4) ?? 'a1',
        couleur: i === 0 ? ('green' as const) : i === 1 ? ('blue' as const) : ('yellow' as const),
      })),
    [analyse.lignes, reglages.multiPV],
  );

  // --- Écran de correction après reconnaissance ---
  if (aCorriger) {
    return (
      <EcranCorrection
        resultat={aCorriger.resultat}
        apercu={aCorriger.apercu}
        onAnnuler={() => setACorriger(null)}
        onValider={({ fen, avertissements: avs }) => {
          setACorriger(null);
          if (chargerFen(fen)) setAvertissements(avs);
        }}
      />
    );
  }

  // --- Écran d'import ---
  if (!chargee) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-semibold">Analyse de position</h1>
          <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
            Importez une position par photo, par FEN ou par PGN, puis explorez-la librement.
          </p>
        </div>

        <Segmente
          valeur={source}
          ariaLabel="Source de la position"
          onChange={setSource}
          options={[
            { valeur: 'image', libelle: 'Image' },
            { valeur: 'fen', libelle: 'FEN' },
            { valeur: 'pgn', libelle: 'PGN' },
          ]}
        />

        {source === 'image' ? (
          <ImportImage onReconnu={(resultat, apercu) => setACorriger({ resultat, apercu })} />
        ) : source === 'fen' ? (
          <Carte titre="Coller un FEN">
            <ChampTexte
              libelle="FEN"
              valeur={saisieFen}
              onChange={setSaisieFen}
              placeholder={FEN_INITIALE}
              mono
              aide="Les champs manquants sont complétés automatiquement."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Bouton variante="principal" onClick={() => chargerFen(saisieFen)}>
                Charger la position
              </Bouton>
              <Bouton onClick={() => setSaisieFen(FEN_INITIALE)}>Position initiale</Bouton>
            </div>
          </Carte>
        ) : (
          <Carte titre="Charger un PGN">
            <label className="block">
              <span className="mb-1.5 block text-sm text-[var(--color-texte-doux)]">PGN</span>
              <textarea
                value={saisiePgn}
                onChange={(e) => setSaisiePgn(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={'[Event "Partie"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'}
                className="w-full rounded-xl border border-[var(--color-bordure)] bg-[var(--color-fond)] p-3 font-mono text-xs outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <Bouton variante="principal" className="mt-3" onClick={chargerPgn}>
              Charger la partie
            </Bouton>
          </Carte>
        )}

        {erreurSaisie.length > 0 ? (
          <Alerte titre="Impossible de charger cette position">
            <ul className="list-inside list-disc space-y-0.5">
              {erreurSaisie.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alerte>
        ) : null}
      </div>
    );
  }

  // --- Écran d'analyse ---
  const cpBlancs =
    analyse.lignes[0] === undefined
      ? null
      : analyse.lignes[0].evaluation.type === 'mat'
        ? (analyse.lignes[0].evaluation.valeur > 0 ? 1 : -1) *
          9000 *
          (partie.traitAffiche === 'w' ? 1 : -1)
        : analyse.lignes[0].evaluation.valeur * (partie.traitAffiche === 'w' ? 1 : -1);

  return (
    <div className="space-y-4">
      {avertissements.length > 0 ? (
        <Alerte titre="Position ajustée" ton="alerte">
          <ul className="list-inside list-disc space-y-0.5">
            {avertissements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Alerte>
      ) : null}

      {etatMoteur.etat === 'echec' ? (
        <Alerte titre="Le moteur n’a pas pu démarrer">
          <p>{etatMoteur.erreur}</p>
          <p className="mt-1">
            L’échiquier reste utilisable pour explorer la position sans évaluation.
          </p>
        </Alerte>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={zoneEchiquier}>
          <div className="mx-auto flex w-full max-w-[min(88vw,62vh,34rem)] gap-2">
            <div className="flex-1">
              <Echiquier
                fen={partie.fen}
                orientation={partie.orientation}
                destinations={partie.destinations}
                couleurJouable={partie.surLeDernierCoup ? 'both' : undefined}
                trait={partie.traitAffiche === 'w' ? 'white' : 'black'}
                dernierCoup={partie.dernierCoup}
                echec={partie.echec}
                fleches={analyseActive ? fleches : []}
                coordonnees={reglages.coordonnees}
                animations={reglages.animations}
                onCoup={(d, v) => surCoup(d, v)}
                tailleMax="100%"
              />
            </div>
            <div className="py-1">
              <BarreEval cpBlancs={cpBlancs} orientation={partie.orientation} />
            </div>
          </div>

          <div className="mx-auto mt-3 flex max-w-md items-center justify-between gap-2">
            <Bouton onClick={partie.debut} ariaLabel="Première position">
              &#124;&#9664;
            </Bouton>
            <Bouton onClick={partie.precedent} ariaLabel="Coup précédent">
              &#9664;
            </Bouton>
            <Bouton onClick={partie.retourner} ariaLabel="Retourner l’échiquier">
              &#8645;
            </Bouton>
            <Bouton onClick={partie.suivant} ariaLabel="Coup suivant">
              &#9654;
            </Bouton>
            <Bouton onClick={partie.finListe} ariaLabel="Dernier coup">
              &#9654;&#124;
            </Bouton>
          </div>
        </div>

        <div className="space-y-4">
          <Carte
            titre="Analyse"
            action={
              <Bouton variante="discret" onClick={() => setAnalyseActive((a) => !a)}>
                {analyseActive ? 'Arrêter' : 'Analyser'}
              </Bouton>
            }
          >
            <AffichageEval
              evaluation={analyse.lignes[0]?.evaluation}
              profondeur={analyse.profondeur}
            />

            {analyse.erreur ? (
              <p className="mt-2 text-sm text-red-400">{analyse.erreur}</p>
            ) : !analyseActive ? (
              <p className="mt-2 text-sm text-[var(--color-texte-doux)]">
                Analyse en pause. <kbd className="font-mono">Espace</kbd> pour la relancer.
              </p>
            ) : analyse.lignes.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-texte-doux)]">Recherche en cours…</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {analyse.lignes.map((l) => {
                  const san = variantEnSan(partie.fen, l.pv, 8);
                  return (
                    <li key={l.multipv}>
                      <button
                        type="button"
                        onClick={() => {
                          const premier = l.pv[0];
                          if (premier) {
                            surCoup(
                              premier.slice(0, 2),
                              premier.slice(2, 4),
                              (premier[4] as Promotion) ?? undefined,
                            );
                          }
                        }}
                        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-[var(--color-fond-3)]"
                      >
                        <span className="font-mono text-sm font-semibold text-[var(--color-accent)]">
                          {formaterEvaluation(l.evaluation)}
                        </span>
                        <span className="ml-2 font-mono text-xs text-[var(--color-texte-doux)]">
                          {san.join(' ')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Carte>

          {ouverture ? (
            <Carte titre="Ouverture">
              <p className="text-sm">
                <span className="font-mono text-[var(--color-texte-doux)]">{ouverture.eco}</span>{' '}
                {ouverture.nom}
              </p>
            </Carte>
          ) : null}

          <Carte titre="Continuer cette position">
            <div className="space-y-2">
              <Bouton
                className="w-full"
                onClick={() => {
                  deposerPosition(partie.fen);
                  naviguer('/libre');
                }}
              >
                Jouer en partie libre
              </Bouton>
              <Bouton
                className="w-full"
                onClick={() => {
                  deposerPosition(partie.fen);
                  naviguer('/assiste');
                }}
              >
                Jouer en mode assisté
              </Bouton>
              <Bouton
                variante="discret"
                className="w-full"
                onClick={() => {
                  setChargee(false);
                  setAvertissements([]);
                }}
              >
                Importer une autre position
              </Bouton>
            </div>
          </Carte>

          {partie.coupsSan.length > 0 ? (
            <Carte titre="Variante explorée">
              <ListeCoups
                coups={partie.coupsSan.map((san) => ({ san }))}
                indexActif={partie.indexAffiche}
                onSelection={partie.aller}
                compacte
              />
            </Carte>
          ) : null}

          <p className="break-all text-center font-mono text-[0.65rem] text-[var(--color-texte-doux)]">
            {partie.fen}
          </p>
        </div>
      </div>

      {promotionEnAttente ? (
        <DialoguePromotion
          couleur={partie.trait}
          onChoisir={(p) => {
            const { depuis, vers } = promotionEnAttente;
            setPromotion(null);
            surCoup(depuis, vers, p);
          }}
          onAnnuler={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}
