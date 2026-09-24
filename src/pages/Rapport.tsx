/**
 * Rapport d'analyse d'une partie.
 *
 * L'analyse est lancée coup par coup et le rapport se remplit au fur et à
 * mesure : sur mobile, on peut lire les premiers coups pendant que la fin
 * est encore en cours de calcul. Interrompre l'analyse conserve ce qui a
 * déjà été calculé.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import { analyserPartie, type CoupAnalyse, type RapportAnalyse } from '../analysis/analyseur.ts';
import { attacherRapport, lirePartie, type PartieEnregistree } from '../db/parties.ts';
import { useEtatMoteur, useMoteur } from '../hooks/useMoteur.ts';
import { useBalayage, useRaccourcisClavier } from '../hooks/useRaccourcis.ts';
import { COULEURS, formaterPerte, LIBELLES, type Classement } from '../lib/classification.ts';
import { construirePgnAnnote, telechargerTexte } from '../lib/pgn.ts';
import { formaterEvaluation } from '../lib/uci.ts';
import {
  COUPS_MIN_ELO,
  COUPS_VALEUR_UNIQUE,
  estimationElo,
} from '../lib/classification.ts';
import { Echiquier, type FlecheEchiquier } from '../ui/Echiquier.tsx';
import { GraphiqueEval } from '../ui/GraphiqueEval.tsx';
import { ListeCoups } from '../ui/ListeCoups.tsx';
import {
  Alerte,
  BarreProgression,
  Bouton,
  Carte,
  EnTetePage,
  Etiquette,
  EtatVide,
  Squelette,
} from '../ui/composants.tsx';
import { IconeHorloge } from '../ui/Icones.tsx';
import { Chess } from 'chess.js';

const ORDRE_BILAN: Classement[] = [
  'theorie',
  'unique',
  'excellent',
  'bon',
  'imprecision',
  'erreur',
  'gaffe',
];

export function Rapport({
  identifiant,
  coupDemande = null,
  naviguer,
}: {
  identifiant: string;
  /** Demi-coup à ouvrir directement, venu de `?coup=` — « mes erreurs » y renvoie. */
  coupDemande?: string | null;
  naviguer: (v: string) => void;
}) {
  const { reglages } = useReglages();
  const moteur = useMoteur();
  const etatMoteur = useEtatMoteur();

  const [partie, setPartie] = useState<PartieEnregistree | null>(null);
  const [chargement, setChargement] = useState(true);
  const [coups, setCoups] = useState<CoupAnalyse[]>([]);
  const [rapport, setRapport] = useState<RapportAnalyse | null>(null);
  const [avancement, setAvancement] = useState(0);
  const [etape, setEtape] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [index, setIndex] = useState(-1);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [indexVariante, setIndexVariante] = useState(0);

  const controleur = useRef<AbortController | null>(null);
  const zoneEchiquier = useRef<HTMLDivElement>(null);

  // --- Chargement de la partie ---
  useEffect(() => {
    let vivant = true;
    lirePartie(identifiant).then((p) => {
      if (!vivant) return;
      setPartie(p);
      setChargement(false);
      if (p?.rapport) {
        setRapport(p.rapport);
        setCoups(p.rapport.coups);
        setAvancement(1);
      }
    });
    return () => {
      vivant = false;
    };
  }, [identifiant]);

  // --- Lancement de l'analyse ---
  const lancer = useCallback(async () => {
    if (!partie || enCours) return;
    controleur.current?.abort();
    const ctrl = new AbortController();
    controleur.current = ctrl;

    setEnCours(true);
    setErreur(null);
    setCoups([]);
    setAvancement(0);

    try {
      const resultat = await analyserPartie(moteur, {
        fenDepart: partie.fenDepart,
        coupsSan: partie.coupsSan,
        profondeur: reglages.profondeurAnalyse ?? undefined,
        tempsMs: reglages.tempsParCoupMs ?? undefined,
        seuils: reglages.seuils,
        signal: ctrl.signal,
        surCoupAnalyse: (coup) => {
          // Rendu progressif : chaque coup analysé apparaît immédiatement.
          setCoups((precedents) => [...precedents, coup]);
        },
        surProgression: (a, e) => {
          setAvancement(a);
          setEtape(e);
        },
      });
      if (ctrl.signal.aborted) return;
      setRapport(resultat);
      void attacherRapport(partie.id, resultat);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        setEtape('Analyse interrompue.');
        return;
      }
      setErreur(e instanceof Error ? e.message : "L'analyse a échoué.");
    } finally {
      setEnCours(false);
    }
  }, [partie, enCours, moteur, reglages.profondeurAnalyse, reglages.tempsParCoupMs, reglages.seuils]);

  // Lance l'analyse automatiquement si la partie n'en a pas encore.
  const dejaLancee = useRef(false);
  useEffect(() => {
    if (chargement || !partie || rapport || dejaLancee.current) return;
    dejaLancee.current = true;
    void lancer();
  }, [chargement, partie, rapport, lancer]);

  useEffect(() => () => controleur.current?.abort(), []);

  const coupActif = index >= 0 ? coups[index] : null;

  // Position affichée : soit un coup de la partie, soit un coup de la
  // variante recommandée si l'utilisateur la fait défiler.
  const fenAffichee = useMemo(() => {
    if (!coupActif) return partie?.fenDepart ?? 'start';
    if (indexVariante === 0) return coupActif.fenApres;
    const jeu = new Chess(coupActif.fenAvant);
    for (const uci of coupActif.varianteUci.slice(0, indexVariante)) {
      try {
        jeu.move({
          from: uci.slice(0, 2) as never,
          to: uci.slice(2, 4) as never,
          promotion: (uci[4] as never) ?? undefined,
        });
      } catch {
        break;
      }
    }
    return jeu.fen();
  }, [coupActif, indexVariante, partie?.fenDepart]);

  /**
   * UNE flèche : celle du meilleur coup quand il a été manqué, sinon celle du
   * coup joué. Montrer les deux — le coup joué en rouge, le meilleur en vert —
   * obligeait à deviner laquelle regarder.
   */
  const uciFleche =
    !coupActif || indexVariante > 0
      ? null
      : coupActif.estMeilleurCoup
        ? coupActif.uci
        : (coupActif.meilleurUci ?? coupActif.uci);

  const fleche: FlecheEchiquier | null = useMemo(
    () =>
      uciFleche
        ? { depuis: uciFleche.slice(0, 2), vers: uciFleche.slice(2, 4), couleur: 'green' }
        : null,
    [uciFleche],
  );

  const allerA = useCallback((i: number) => {
    setIndex(i);
    setIndexVariante(0);
  }, []);

  /**
   * Ouverture directe sur un coup précis.
   *
   * « Mes erreurs » renvoie ici avec le demi-coup en question : arriver au
   * début de la partie obligerait à le retrouver à la main, alors que c'est
   * précisément lui qu'on venait revoir. On oriente aussi l'échiquier du
   * côté de celui qui a joué ce coup.
   */
  const coupOuvert = useRef(false);
  useEffect(() => {
    if (coupOuvert.current || coupDemande === null || coups.length === 0) return;
    const ply = Number(coupDemande);
    if (!Number.isFinite(ply)) return;
    const i = coups.findIndex((c) => c.ply === ply);
    if (i < 0) return;
    coupOuvert.current = true;
    setOrientation(coups[i].couleur === 'w' ? 'white' : 'black');
    allerA(i);
  }, [coupDemande, coups, allerA]);

  useRaccourcisClavier({
    precedent: () => allerA(Math.max(-1, index - 1)),
    suivant: () => allerA(Math.min(coups.length - 1, index + 1)),
    debut: () => allerA(-1),
    fin: () => allerA(coups.length - 1),
    retourner: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
  });

  useBalayage(zoneEchiquier, {
    versLaGauche: () => allerA(Math.min(coups.length - 1, index + 1)),
    versLaDroite: () => allerA(Math.max(-1, index - 1)),
  });

  const exporterPgn = useCallback(() => {
    if (!partie || coups.length === 0) return;
    const pgn = construirePgnAnnote(
      coups.map((c) => ({
        ply: c.ply,
        san: c.san,
        classement: c.classement,
        perteCp: c.perteCp,
        evaluation: c.avant,
        evaluationApres: c.apres,
        meilleurSan: c.meilleurSan,
        varianteSan: c.varianteSan,
        explication: c.explication.phrase,
      })),
      {
        Event: 'Partie analysée',
        Site: 'Échiquier',
        Date: new Date(partie.date).toISOString().slice(0, 10).replace(/-/g, '.'),
        White: partie.blanc,
        Black: partie.noir,
        Result: partie.resultat,
        ...(partie.fenDepart !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          ? { FEN: partie.fenDepart, SetUp: '1' }
          : {}),
      },
    );
    telechargerTexte(`partie-${new Date(partie.date).toISOString().slice(0, 10)}.pgn`, pgn);
  }, [coups, partie]);

  if (chargement) {
    return (
      <div className="space-y-4" role="status" aria-label="Chargement du rapport">
        <Squelette hauteur="2rem" largeur="60%" />
        <Squelette hauteur="1rem" largeur="40%" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Squelette hauteur="9rem" className="rounded-[var(--radius-lg)]" />
          <Squelette hauteur="9rem" className="rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }

  if (!partie) {
    return (
      <Carte>
        <EtatVide
          icone={<IconeHorloge />}
          titre="Cette partie est introuvable"
          action={
            <Bouton variante="principal" onClick={() => naviguer('/historique')}>
              Voir l’historique
            </Bouton>
          }
        >
          Elle a peut-être été supprimée, ou elle a été enregistrée sur un autre appareil : les
          parties ne quittent jamais celui sur lequel elles ont été jouées.
        </EtatVide>
      </Carte>
    );
  }

  const pointsGraphique = coups.map((c) => ({
    ply: c.ply,
    cpBlancs: c.cpApresBlancs,
    classement: c.classement,
  }));

  return (
    <div className="space-y-4">
      <EnTetePage
        titre={
          <span className="text-[1.375rem] sm:text-[1.625rem]">
            {partie.blanc} — {partie.noir}
          </span>
        }
        action={
          <>
            {enCours ? (
              <Bouton onClick={() => controleur.current?.abort()}>Interrompre</Bouton>
            ) : (
              <Bouton variante={rapport ? 'neutre' : 'principal'} onClick={lancer}>
                {rapport ? 'Relancer' : 'Analyser'}
              </Bouton>
            )}
            <Bouton onClick={exporterPgn} disabled={coups.length === 0}>
              Exporter en PGN
            </Bouton>
          </>
        }
      >
        {new Date(partie.date).toLocaleString('fr-FR', {
          dateStyle: 'long',
          timeStyle: 'short',
        })}{' '}
        · {partie.resultat} · {partie.finPar}
      </EnTetePage>

      {erreur ? (
        <Alerte titre="L’analyse a échoué">
          <p>{erreur}</p>
          {etatMoteur.etat === 'echec' && etatMoteur.erreur ? (
            <p className="mt-1">{etatMoteur.erreur}</p>
          ) : null}
        </Alerte>
      ) : null}

      {enCours ? (
        <Carte>
          <BarreProgression valeur={avancement} libelle={etape || 'Analyse en cours…'} />
          <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
            Le rapport se remplit au fur et à mesure : vous pouvez déjà consulter les coups
            analysés.
          </p>
        </Carte>
      ) : null}

      {rapport ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Carte titre="Précision">
            <div className="flex items-start justify-around gap-3">
              {(
                [
                  [
                    partie.blanc,
                    'Blancs',
                    rapport.precisionBlancs,
                    rapport.perteMoyenneBlancs,
                    rapport.coupsRetenusBlancs,
                  ],
                  [
                    partie.noir,
                    'Noirs',
                    rapport.precisionNoirs,
                    rapport.perteMoyenneNoirs,
                    rapport.coupsRetenusNoirs,
                  ],
                ] as const
              ).map(([nom, camp, precision, perte, coupsRetenus]) => {
                const estimation =
                  perte !== null ? estimationElo(perte, coupsRetenus ?? 0) : null;
                return (
                <div key={camp} className="min-w-0 text-center">
                  <p className="chiffres text-3xl font-semibold">
                    {precision !== null ? `${precision.toFixed(1).replace('.', ',')} %` : '—'}
                  </p>
                  {/* Le NOM du joueur, pas seulement sa couleur : « Blancs »
                      et « Noirs » obligeaient à se rappeler de quel côté on
                      avait joué pour savoir quelle colonne était la sienne. */}
                  <p className="mt-0.5 truncate text-sm font-medium">{nom}</p>
                  <p className="text-xs text-[var(--color-texte-doux)]">{camp}</p>
                  {/* Elo estimé : la force à laquelle ce camp a joué CETTE
                      partie, déduite de sa perte moyenne. Ce n'est pas un
                      classement, et le dire évite de le prendre pour tel. */}
                  {estimation !== null ? (
                    <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
                      niveau joué
                      <br />
                      <span className="chiffres text-base font-semibold text-[var(--color-texte)]">
                        {estimation.intervalle
                          ? `${estimation.bas} – ${estimation.haut}`
                          : `~${estimation.valeur}`}{' '}
                        Elo
                      </span>
                      {perte !== null ? (
                        <>
                          <br />
                          <span className="chiffres">{perte} cp perdus par coup</span>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    // Dire pourquoi, plutôt que de laisser un blanc : une
                    // partie tranchée tôt ne laisse pas assez de coups
                    // disputés pour que la moyenne veuille dire quelque chose.
                    <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
                      niveau joué
                      <br />
                      <span>
                        trop peu de coups
                        <br />
                        disputés
                      </span>
                    </p>
                  )}
                </div>
                );
              })}
            </div>
            {/* Une ligne pour expliquer l'intervalle : sans elle, un lecteur
                y voit un défaut d'affichage plutôt qu'une incertitude
                assumée. */}
            {[rapport.coupsRetenusBlancs, rapport.coupsRetenusNoirs].some(
              (n) => n >= COUPS_MIN_ELO && n < COUPS_VALEUR_UNIQUE,
            ) ? (
              <p className="mt-3 text-center text-xs text-[var(--color-texte-doux)]">
                Un intervalle est donné quand la partie a été tranchée tôt : trop peu de coups
                ont été réellement disputés pour avancer une valeur unique.
              </p>
            ) : null}
            {rapport.ouverture ? (
              <p className="mt-3 text-center text-sm">
                <span className="font-mono text-[var(--color-texte-doux)]">
                  {rapport.ouverture.eco}
                </span>{' '}
                {rapport.ouverture.nom}
              </p>
            ) : null}
          </Carte>

          <Carte titre="Bilan des coups">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--color-texte-doux)]">
                  <th className="text-left font-normal">Type</th>
                  <th className="w-16 text-right font-normal">
                    <span className="block truncate">{partie.blanc}</span>
                  </th>
                  <th className="w-16 text-right font-normal">
                    <span className="block truncate">{partie.noir}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDRE_BILAN.filter(
                  (c) => rapport.bilanBlancs[c] > 0 || rapport.bilanNoirs[c] > 0,
                ).map((c) => (
                  <tr key={c}>
                    <td className="py-1" style={{ color: COULEURS[c] }}>
                      {LIBELLES[c]}
                    </td>
                    <td className="text-right font-mono tabular-nums">{rapport.bilanBlancs[c]}</td>
                    <td className="text-right font-mono tabular-nums">{rapport.bilanNoirs[c]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Carte>
        </div>
      ) : null}

      {rapport && rapport.momentsCles.length > 0 ? (
        <Carte titre="Moments charnières">
          <ul className="space-y-2">
            {rapport.momentsCles.map((m) => (
              <li key={m.ply}>
                <button
                  type="button"
                  onClick={() => allerA(coups.findIndex((c) => c.ply === m.ply))}
                  className="w-full rounded-xl px-2 py-2 text-left hover:bg-[var(--color-fond-3)]"
                >
                  <span className="font-mono text-sm">
                    {Math.floor(m.ply / 2) + 1}
                    {m.couleur === 'w' ? '.' : '…'} {m.san}
                  </span>
                  <span className="ml-2 text-xs font-medium" style={{ color: COULEURS[m.classement] }}>
                    {LIBELLES[m.classement]}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
                    {m.explication.phrase}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      {coups.length > 0 ? (
        <Carte titre="Évaluation au fil de la partie">
          <GraphiqueEval points={pointsGraphique} indexActif={index} onSelection={allerA} />
        </Carte>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={zoneEchiquier}>
          <Echiquier
            fen={fenAffichee}
            orientation={orientation}
            fleche={fleche}
            coordonnees={reglages.coordonnees}
            animations={reglages.animations}
          />
          <div className="mx-auto mt-3 flex max-w-md items-center justify-between gap-2">
            <Bouton onClick={() => allerA(-1)} ariaLabel="Début de la partie">
              &#124;&#9664;
            </Bouton>
            <Bouton onClick={() => allerA(Math.max(-1, index - 1))} ariaLabel="Coup précédent">
              &#9664;
            </Bouton>
            <Bouton
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              ariaLabel="Retourner l’échiquier"
            >
              &#8645;
            </Bouton>
            <Bouton
              onClick={() => allerA(Math.min(coups.length - 1, index + 1))}
              ariaLabel="Coup suivant"
            >
              &#9654;
            </Bouton>
            <Bouton onClick={() => allerA(coups.length - 1)} ariaLabel="Dernier coup">
              &#9654;&#124;
            </Bouton>
          </div>
        </div>

        <div className="space-y-4">
          {coupActif ? (
            <Carte
              titreContenu
              titre={`Coup ${Math.floor(coupActif.ply / 2) + 1}${coupActif.couleur === 'w' ? '.' : '…'} ${coupActif.san}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="titre text-base font-semibold"
                  style={{ color: COULEURS[coupActif.classement] }}
                >
                  {LIBELLES[coupActif.classement]}
                </span>
                <Etiquette>{formaterEvaluation(coupActif.apres)}</Etiquette>
                {(() => {
                  const perte = formaterPerte(coupActif.perteCp, coupActif.avant, coupActif.apres);
                  return perte ? <Etiquette ton="alerte">{perte}</Etiquette> : null;
                })()}
              </div>

              <p className="mt-2 text-sm">{coupActif.explication.phrase}</p>
              {coupActif.explication.complement ? (
                <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
                  {coupActif.explication.complement}
                </p>
              ) : null}

              {!coupActif.estMeilleurCoup && coupActif.meilleurSan ? (
                <div className="mt-3 rounded-xl bg-[var(--color-fond-3)] p-3">
                  <p className="text-xs text-[var(--color-texte-doux)]">Le meilleur coup était</p>
                  <p className="chiffres mt-0.5 text-base font-semibold" style={{ color: 'var(--color-succes)' }}>
                    {coupActif.meilleurSan}
                  </p>
                  {coupActif.varianteSan.length > 0 ? (
                    <>
                      <p className="mt-2 font-mono text-xs text-[var(--color-texte-doux)]">
                        {coupActif.varianteSan.map((san, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setIndexVariante(i + 1)}
                            className={`mr-1 rounded px-1 ${
                              indexVariante === i + 1
                                ? 'bg-[var(--color-accent)] text-[var(--color-sur-accent)]'
                                : 'hover:bg-[var(--color-bordure)]'
                            }`}
                          >
                            {san}
                          </button>
                        ))}
                      </p>
                      {indexVariante > 0 ? (
                        <Bouton
                          variante="discret"
                          className="mt-2"
                          onClick={() => setIndexVariante(0)}
                        >
                          Revenir à la partie
                        </Bouton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </Carte>
          ) : (
            <Carte titre="Rapport">
              <p className="text-sm text-[var(--color-texte-doux)]">
                Choisissez un coup dans la liste ou sur le graphique pour voir son analyse.
              </p>
            </Carte>
          )}

          <Carte titre="Coups">
            <ListeCoups
              coups={coups.map((c) => ({ san: c.san, classement: c.classement }))}
              indexActif={index}
              onSelection={allerA}
            />
            {coups.length < partie.coupsSan.length ? (
              <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
                {coups.length} coup(s) analysé(s) sur {partie.coupsSan.length}.
              </p>
            ) : null}
          </Carte>
        </div>
      </div>
    </div>
  );
}
