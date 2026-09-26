/**
 * Analyse de position : point d'entrée pour étudier une position précise.
 *
 * Trois sources d'entrée — image, FEN, PGN — et une fois la position chargée,
 * une analyse continue avec exploration libre des variantes. Depuis ici, on
 * peut basculer en partie libre ou en jeu assisté pour continuer à jouer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { qualifierCoup } from '../lib/qualiteCoup.ts';
import type { ResultatReconnaissance } from '../recognition/index.ts';
import { Echiquier, type FlecheEchiquier } from '../ui/Echiquier.tsx';
import { DialoguePromotion } from '../ui/DialoguePromotion.tsx';
import { EcranCorrection } from '../ui/EcranCorrection.tsx';
import { ImportImage } from '../ui/ImportImage.tsx';
import { LibelleMeilleurCoup } from '../ui/LibelleMeilleurCoup.tsx';
import { ListeCoups } from '../ui/ListeCoups.tsx';
import {
  AffichageEval,
  Alerte,
  BarreEval,
  Bouton,
  Carte,
  ChampTexte,
  EnTetePage,
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
  /** Index MultiPV dont la fleche est affichee : 0 = le meilleur coup. */
  const [ligneAffichee, setLigneAffichee] = useState(0);
  const [alternativesOuvertes, setAlternativesOuvertes] = useState(false);

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

  /**
   * Ligne dont la fleche est montree. Par defaut le meilleur coup ;
   * l'utilisateur peut lui substituer une alternative, qui la REMPLACE.
   */
  const ligneMontree = analyse.lignes[ligneAffichee] ?? analyse.lignes[0];
  const coupMontre = ligneMontree?.pv[0] ?? null;

  // La fleche ne depend que des quatre caracteres du coup : tant que le
  // meilleur coup ne change pas, l'objet reste identique et Chessground ne
  // redessine rien, meme si la profondeur progresse dix fois par seconde.
  const fleche: FlecheEchiquier | null = useMemo(
    () =>
      coupMontre
        ? { depuis: coupMontre.slice(0, 2), vers: coupMontre.slice(2, 4), couleur: 'green' }
        : null,
    [coupMontre],
  );

  const qualite = useMemo(() => {
    if (!coupMontre || !ligneMontree) return 'meilleur' as const;
    return qualifierCoup({
      fen: partie.fen,
      uci: coupMontre,
      pv: ligneMontree.pv,
      evaluation: ligneMontree.evaluation,
      evaluationSeconde: analyse.lignes[1]?.evaluation,
    });
  }, [coupMontre, ligneMontree, partie.fen, analyse.lignes]);

  const sanMontre = useMemo(
    () => (coupMontre ? (variantEnSan(partie.fen, [coupMontre], 1)[0] ?? null) : null),
    [coupMontre, partie.fen],
  );

  // On revient au meilleur coup des que la position change : une alternative
  // choisie sur la position precedente n'a plus de sens ici.
  useEffect(() => {
    setLigneAffichee(0);
  }, [partie.fen]);

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
        <EnTetePage titre="Analyse de position">
          Importez une position par photo, par FEN ou par PGN, puis explorez-la librement.
        </EnTetePage>

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
        <Alerte titre="L’analyse n’a pas pu démarrer">
          <p>{etatMoteur.erreur}</p>
          <p className="mt-1">
            L’échiquier reste utilisable pour explorer la position sans évaluation.
          </p>
        </Alerte>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={zoneEchiquier}>
          <div className="mx-auto flex w-full max-w-[min(97vw,72vh,44rem)] gap-2">
            <div className="flex-1">
              <Echiquier
                fen={partie.fen}
                orientation={partie.orientation}
                destinations={partie.destinations}
                couleurJouable={partie.surLeDernierCoup ? 'both' : undefined}
                trait={partie.traitAffiche === 'w' ? 'white' : 'black'}
                dernierCoup={partie.dernierCoup}
                echec={partie.echec}
                fleche={analyseActive ? fleche : null}
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

          {analyseActive ? (
            <LibelleMeilleurCoup
              san={sanMontre}
              evaluation={ligneMontree?.evaluation}
              qualite={qualite}
              profondeur={analyse.profondeur}
              estUneAlternative={ligneAffichee !== 0}
              onRevenirAuMeilleur={() => setLigneAffichee(0)}
            />
          ) : null}

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
              <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{analyse.erreur}</p>
            ) : !analyseActive ? (
              <p className="mt-2 text-sm text-[var(--color-texte-doux)]">
                Analyse en pause. <kbd className="font-mono">Espace</kbd> pour la relancer.
              </p>
            ) : analyse.lignes.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-texte-doux)]">Recherche en cours…</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  <span className="font-mono font-semibold">{sanMontre}</span>{' '}
                  <span className="text-[var(--color-texte-doux)]">
                    {variantEnSan(partie.fen, ligneMontree?.pv ?? [], 6).slice(1).join(' ')}
                  </span>
                </p>

                {/* Les alternatives restent du TEXTE, repliees par defaut :
                    elles ne dessinent jamais de fleche tant qu'on ne les
                    choisit pas explicitement, et la fleche choisie remplace
                    la principale au lieu de s'y ajouter. */}
                {analyse.lignes.length > 1 ? (
                  <div className="mt-3 border-t border-[var(--color-bordure)] pt-3">
                    <button
                      type="button"
                      onClick={() => setAlternativesOuvertes((o) => !o)}
                      aria-expanded={alternativesOuvertes}
                      className="cible-tactile w-full text-left text-sm text-[var(--color-accent)]"
                    >
                      {alternativesOuvertes ? 'Masquer les alternatives' : 'Voir les alternatives'}
                    </button>

                    {alternativesOuvertes ? (
                      <ol className="mt-2 space-y-1.5">
                        {analyse.lignes.map((l, i) => (
                          <li key={l.multipv}>
                            <button
                              type="button"
                              onClick={() => setLigneAffichee(i)}
                              aria-pressed={ligneAffichee === i}
                              className={`w-full rounded-lg px-2 py-1.5 text-left ${
                                ligneAffichee === i
                                  ? 'bg-[var(--color-fond-3)]'
                                  : 'hover:bg-[var(--color-fond-3)]'
                              }`}
                            >
                              <span className="font-mono text-sm font-semibold text-[var(--color-accent)]">
                                {formaterEvaluation(l.evaluation)}
                              </span>
                              <span className="ml-2 font-mono text-xs text-[var(--color-texte-doux)]">
                                {variantEnSan(partie.fen, l.pv, 6).join(' ')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                ) : null}
              </>
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
