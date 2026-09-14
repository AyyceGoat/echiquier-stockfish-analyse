/**
 * Jeu assisté — apprendre en jouant.
 *
 * Après chaque coup du joueur, l'application compare l'évaluation de la
 * position avant et après, classe le coup, et affiche le meilleur coup
 * lorsqu'il y avait mieux. Le joueur peut reprendre son coup ou le garder.
 *
 * Point d'attention : l'évaluation « avant » doit venir d'une recherche
 * comparable à celle d'« après », sinon la perte mesurée reflète la différence
 * de profondeur et non la qualité du coup. Les deux positions sont donc
 * évaluées à la même profondeur au moment du verdict, sans réutiliser
 * l'analyse continue du panneau latéral, qui court à une profondeur variable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import { enregistrerPartie, nouvelIdentifiant } from '../db/parties.ts';
import { useAnalyseContinue, useCoupDuMoteur, useEtatMoteur, useMoteur } from '../hooks/useMoteur.ts';
import { useBalayage, useRaccourcisClavier } from '../hooks/useRaccourcis.ts';
import { usePartie, type Promotion } from '../hooks/usePartie.ts';
import {
  classerCoup,
  formaterPerte,
  LIBELLES,
  COULEURS,
  type Classement,
} from '../lib/classification.ts';
import { expliquerCoup, uciVersSan, variantEnSan } from '../lib/explications.ts';
import { FEN_INITIALE } from '../lib/fen.ts';
import { recupererPosition } from '../lib/positionPartagee.ts';
import { estCoupDeTheorie } from '../lib/ouvertures.ts';
import { formaterEvaluation, type Evaluation } from '../lib/uci.ts';
import { Echiquier, type FlecheEchiquier } from '../ui/Echiquier.tsx';
import { DialoguePromotion } from '../ui/DialoguePromotion.tsx';
import { ListeCoups } from '../ui/ListeCoups.tsx';
import {
  AffichageEval,
  Alerte,
  BarreEval,
  Bouton,
  Carte,
  Curseur,
  Segmente,
} from '../ui/composants.tsx';
import { Chess } from 'chess.js';

interface Verdict {
  classement: Classement;
  perteCp: number;
  /** Perte déjà mise en forme, ou null si l'afficher n'apprendrait rien. */
  perteAffichee: string | null;
  coupJoue: string;
  meilleurUci: string | null;
  meilleurSan: string | null;
  varianteSan: string[];
  explication: string;
  /** FEN de la position d'où le coup a été joué, pour la flèche. */
  fenAvant: string;
}

const PROFONDEUR_VERDICT_MOBILE = 12;

export function JeuAssiste({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages, majReglages } = useReglages();
  const moteur = useMoteur();
  const etatMoteur = useEtatMoteur();
  const [fenDepart] = useState<string>(() => recupererPosition() ?? FEN_INITIALE);
  const partie = usePartie(fenDepart);
  const { demander } = useCoupDuMoteur();

  const [configuree, setConfiguree] = useState(false);
  const [monCamp, setMonCamp] = useState<'w' | 'b'>('w');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [promotionEnAttente, setPromotion] = useState<{ depuis: string; vers: string } | null>(null);
  const [verdictEnCours, setVerdictEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [idPartie] = useState(() => nouvelIdentifiant());
  const [enregistree, setEnregistree] = useState(false);
  const [moteurReflechit, setReflechit] = useState(false);

  const zoneEchiquier = useRef<HTMLDivElement>(null);
  const verdictEnAttente = useRef(false);

  const { jouerCoup, fin, trait, fenCourante } = partie;
  const monTour = configuree && !fin && trait === monCamp;

  // Un verdict qui signale un coup perfectible laisse la main au joueur :
  // tant qu'il n'a pas choisi entre reprendre et garder, la partie est en pause.
  const verdictOffreReprise =
    verdict !== null &&
    (verdict.classement === 'imprecision' ||
      verdict.classement === 'erreur' ||
      verdict.classement === 'gaffe') &&
    (reglages.niveauAssistance === 'chaque-coup' ||
      verdict.classement === 'erreur' ||
      verdict.classement === 'gaffe');
  const attendDecision = verdictOffreReprise && !fin;

  // Analyse continue du panneau latéral : uniquement quand c'est à moi de
  // jouer, et jamais pendant qu'un verdict est en cours de calcul (deux
  // recherches simultanées se sérialiseraient et retarderaient le verdict).
  const profondeurVerdict =
    reglages.profondeurAnalyse ??
    Math.min(moteur.profil.profondeurParDefaut, PROFONDEUR_VERDICT_MOBILE);

  const analyse = useAnalyseContinue(
    monTour && !verdictEnCours ? fenCourante : null,
    monTour && !verdictEnCours,
    reglages.multiPV,
  );

  useEffect(() => {
    if (analyse.lignes.length > 0) setEvaluation(analyse.lignes[0].evaluation);
  }, [analyse.lignes]);

  /** Évalue la position avant et après le coup, puis rend son verdict. */
  const calculerVerdict = useCallback(
    async (fenAvant: string, coupUci: string, fenApres: string, coupsSanJusquIci: string[]) => {
      setVerdictEnCours(true);
      setErreur(null);
      try {
        const vueAvant = new Chess(fenAvant);
        const nbCoupsLegaux = vueAvant.moves().length;

        // Les deux recherches partagent la même profondeur : c'est la seule
        // façon d'obtenir une perte en centipions qui ait un sens.
        const avantRes = await moteur.analyser({
          fen: fenAvant,
          profondeur: profondeurVerdict,
          multiPV: 2,
        });

        const vueApres = new Chess(fenApres);
        const apresRes = vueApres.isGameOver()
          ? null
          : await moteur.analyser({
              fen: fenApres,
              profondeur: profondeurVerdict,
              multiPV: 1,
            });

        const avant: Evaluation = avantRes.lignes[0]?.evaluation ?? { type: 'cp', valeur: 0 };
        const brutApres: Evaluation = vueApres.isCheckmate()
          ? { type: 'mat', valeur: 0 }
          : vueApres.isGameOver()
            ? { type: 'cp', valeur: 0 }
            : (apresRes?.lignes[0]?.evaluation ?? { type: 'cp', valeur: 0 });

        // `brutApres` est au point de vue de l'adversaire : on l'inverse.
        const apres: Evaluation =
          brutApres.type === 'cp'
            ? { type: 'cp', valeur: -brutApres.valeur }
            : { type: 'mat', valeur: -brutApres.valeur };

        const meilleurUci = avantRes.meilleurCoup;
        const estMeilleurCoup = meilleurUci === coupUci;

        const { classement, perteCp } = classerCoup({
          avant,
          apres,
          estMeilleurCoup,
          nbCoupsLegaux,
          dansLaTheorie: coupsSanJusquIci.length <= 20 && estCoupDeTheorie(coupsSanJusquIci),
          seuils: reglages.seuils,
        });

        const pvMeilleure = avantRes.lignes[0]?.pv ?? [];

        setVerdict({
          classement,
          perteCp,
          perteAffichee: formaterPerte(perteCp, avant, apres),
          coupJoue: coupUci,
          meilleurUci,
          meilleurSan: meilleurUci ? uciVersSan(fenAvant, meilleurUci) : null,
          varianteSan: variantEnSan(fenAvant, pvMeilleure, 5),
          explication: expliquerCoup({
            fenAvant,
            coupJoue: coupUci,
            meilleurCoup: meilleurUci,
            pvMeilleure,
            avant,
            apres,
            classement,
          }),
          fenAvant,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErreur(
          e instanceof Error ? e.message : "Le moteur n'a pas pu évaluer ce coup.",
        );
      } finally {
        setVerdictEnCours(false);
        verdictEnAttente.current = false;
      }
    },
    [moteur, profondeurVerdict, reglages.seuils],
  );

  const surCoup = useCallback(
    (depuis: string, vers: string, promotion?: Promotion) => {
      if (!promotion && partie.demandePromotion(depuis, vers)) {
        setPromotion({ depuis, vers });
        return;
      }
      const fenAvant = partie.fenCourante;
      const sanAvant = partie.coupsSan;
      const joue = jouerCoup(depuis, vers, promotion);
      if (!joue) return;

      if (joue.couleur === monCamp) {
        verdictEnAttente.current = true;
        setVerdict(null);
        void calculerVerdict(fenAvant, joue.uci, joue.fen, [...sanAvant, joue.san]);
      }
    },
    [calculerVerdict, jouerCoup, monCamp, partie],
  );

  // --- Coup du moteur ---
  // Il attend que le verdict soit rendu, puis, si ce verdict propose une
  // reprise, que le joueur ait tranché. Sans cette attente, Stockfish
  // répondait pendant la lecture du commentaire et « Reprendre » annulait
  // son coup à lui au lieu du coup fautif.
  useEffect(() => {
    if (!configuree || fin || trait === monCamp) return;
    if (verdictEnCours || verdictEnAttente.current) return;
    if (attendDecision) return;

    let annule = false;
    setReflechit(true);
    demander(fenCourante, reglages.niveauMoteur, 400)
      .then(({ coup, erreur: err }) => {
        if (annule) return;
        setReflechit(false);
        if (err) {
          setErreur(err);
          return;
        }
        if (!coup) return;
        jouerCoup(coup.slice(0, 2), coup.slice(2, 4), (coup[4] as Promotion) ?? 'q');
      })
      .catch(() => {
        if (!annule) setReflechit(false);
      });

    return () => {
      annule = true;
    };
  }, [
    configuree,
    fin,
    trait,
    monCamp,
    fenCourante,
    verdictEnCours,
    attendDecision,
    reglages.niveauMoteur,
    demander,
    jouerCoup,
  ]);

  // --- Enregistrement en fin de partie ---
  useEffect(() => {
    if (!fin || enregistree || partie.coups.length === 0) return;
    setEnregistree(true);
    void enregistrerPartie({
      id: idPartie,
      date: Date.now(),
      mode: 'assiste',
      blanc: monCamp === 'w' ? 'Moi' : `Stockfish (niveau ${reglages.niveauMoteur})`,
      noir: monCamp === 'b' ? 'Moi' : `Stockfish (niveau ${reglages.niveauMoteur})`,
      resultat: fin.resultat,
      finPar: fin.raison,
      fenDepart: partie.fenDepart,
      coupsSan: partie.coupsSan,
      niveauMoteur: reglages.niveauMoteur,
    });
  }, [fin, enregistree, partie.coups.length, partie.fenDepart, partie.coupsSan, idPartie, monCamp, reglages.niveauMoteur]);

  const reprendreLeCoup = useCallback(() => {
    // Si le moteur a malgré tout déjà répondu, on remonte jusqu'à rendre
    // la main au joueur : reprendre doit toujours effacer le coup fautif.
    if (partie.coups.length > 0 && partie.coups[partie.coups.length - 1].couleur !== monCamp) {
      partie.annulerDernierCoup();
    }
    partie.annulerDernierCoup();
    setVerdict(null);
  }, [monCamp, partie]);

  const demarrer = useCallback(
    (camp: 'w' | 'b') => {
      setMonCamp(camp);
      partie.definirOrientation(camp === 'w' ? 'white' : 'black');
      partie.reinitialiser(fenDepart);
      setConfiguree(true);
      setVerdict(null);
      setEnregistree(false);
      setErreur(null);
    },
    [fenDepart, partie],
  );

  useRaccourcisClavier(
    {
      precedent: partie.precedent,
      suivant: partie.suivant,
      debut: partie.debut,
      fin: partie.finListe,
      retourner: partie.retourner,
    },
    configuree,
  );

  useBalayage(
    zoneEchiquier,
    { versLaGauche: partie.suivant, versLaDroite: partie.precedent },
    configuree,
  );

  // Affichage du verdict selon le niveau d'assistance choisi.
  const verdictVisible =
    verdict !== null &&
    (reglages.niveauAssistance === 'chaque-coup' ||
      verdict.classement === 'erreur' ||
      verdict.classement === 'gaffe');

  const mauvaisCoup =
    verdict !== null &&
    (verdict.classement === 'imprecision' ||
      verdict.classement === 'erreur' ||
      verdict.classement === 'gaffe');

  // La flèche du meilleur coup n'est montrée que si le coup joué était mauvais
  // et que l'échiquier affiche bien la position d'où il a été joué.
  //
  // Le tableau est mémoïsé : sans cela il change d'identité à chaque rendu,
  // or l'analyse continue en provoque plusieurs par seconde, et Chessground
  // reconfigurerait tout l'échiquier en boucle.
  //
  // Ce calcul reste AVANT la sortie anticipée sur l'écran de configuration :
  // un hook placé après elle ne serait pas appelé au même rang d'un rendu à
  // l'autre, ce que React refuse.
  const fleches: FlecheEchiquier[] = useMemo(() => {
    if (!verdictVisible || !mauvaisCoup || !verdict?.meilleurUci || !partie.surLeDernierCoup) {
      return [];
    }
    return [
      {
        depuis: verdict.meilleurUci.slice(0, 2),
        vers: verdict.meilleurUci.slice(2, 4),
        couleur: 'green',
      },
      {
        depuis: verdict.coupJoue.slice(0, 2),
        vers: verdict.coupJoue.slice(2, 4),
        couleur: 'red',
      },
    ];
  }, [verdictVisible, mauvaisCoup, verdict, partie.surLeDernierCoup]);

  if (!configuree) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-semibold">Jeu assisté</h1>
          <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
            Stockfish commente chacun de vos coups pendant la partie. Vous pouvez reprendre un
            coup ou le garder et continuer.
          </p>
        </div>

        <Carte titre="Niveau d’assistance">
          <Segmente
            valeur={reglages.niveauAssistance}
            ariaLabel="Niveau d’assistance"
            onChange={(v) => majReglages({ niveauAssistance: v })}
            options={[
              { valeur: 'chaque-coup', libelle: 'Chaque coup' },
              { valeur: 'erreurs-graves', libelle: 'Erreurs graves' },
            ]}
          />
          <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
            {reglages.niveauAssistance === 'chaque-coup'
              ? 'Un commentaire s’affiche après chacun de vos coups, bon ou mauvais.'
              : 'Seules les erreurs et les gaffes déclenchent une alerte. Les bons coups passent en silence.'}
          </p>
        </Carte>

        <Carte titre="Adversaire">
          <Curseur
            libelle="Niveau de Stockfish"
            valeur={reglages.niveauMoteur}
            min={0}
            max={20}
            onChange={(v) => majReglages({ niveauMoteur: v })}
          />
          <div className="mt-4">
            <Curseur
              libelle="Variantes affichées (MultiPV)"
              valeur={reglages.multiPV}
              min={1}
              max={5}
              onChange={(v) => majReglages({ multiPV: v })}
            />
          </div>
        </Carte>

        <div className="grid grid-cols-2 gap-2">
          <Bouton variante="principal" onClick={() => demarrer('w')}>
            Jouer les blancs
          </Bouton>
          <Bouton variante="principal" onClick={() => demarrer('b')}>
            Jouer les noirs
          </Bouton>
        </div>
      </div>
    );
  }

  const cpBlancs =
    evaluation === null
      ? null
      : evaluation.type === 'mat'
        ? (evaluation.valeur > 0 ? 1 : -1) * 9000 * (trait === 'w' ? 1 : -1)
        : evaluation.valeur * (trait === 'w' ? 1 : -1);

  return (
    <div className="space-y-4">
      {erreur ? (
        <Alerte titre="Problème avec le moteur">
          <p>{erreur}</p>
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
                couleurJouable={
                  fin || !partie.surLeDernierCoup || trait !== monCamp
                    ? undefined
                    : monCamp === 'w'
                      ? 'white'
                      : 'black'
                }
                trait={partie.traitAffiche === 'w' ? 'white' : 'black'}
                dernierCoup={partie.dernierCoup}
                echec={partie.echec}
                fleches={fleches}
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
            <Bouton onClick={partie.debut} ariaLabel="Premier coup">
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

          {moteurReflechit ? (
            <p className="mt-2 text-center text-sm text-[var(--color-texte-doux)]">
              Stockfish réfléchit…
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {/* Le bandeau de téléchargement vit SOUS l'échiquier, jamais
              au-dessus : il disparaît au bout de quelques secondes, et le
              placer plus haut faisait remonter l'échiquier d'un coup — de
              quoi faire tomber à côté un appui déjà engagé. */}
          {etatMoteur.etat === 'telechargement' ? (
            <Alerte titre="Téléchargement du moteur" ton="info">
              Environ 7 Mo, une seule fois. Il restera ensuite disponible hors ligne.
            </Alerte>
          ) : null}

          {verdictEnCours ? (
            <Carte titre="Votre coup">
              <p className="text-sm text-[var(--color-texte-doux)]">Évaluation en cours…</p>
            </Carte>
          ) : verdictVisible && verdict ? (
            <Carte titre="Votre coup">
              <p className={`text-lg font-semibold ${COULEURS[verdict.classement]}`}>
                {LIBELLES[verdict.classement]}
              </p>
              {verdict.perteAffichee ? (
                <p className="mt-0.5 text-xs text-[var(--color-texte-doux)]">
                  Perte : {verdict.perteAffichee.replace('−', '')} pion(s)
                </p>
              ) : null}

              <p className="mt-2 text-sm">{verdict.explication}</p>

              {mauvaisCoup && verdict.meilleurSan ? (
                <div className="mt-3 rounded-xl bg-[var(--color-fond-3)] p-3">
                  <p className="text-xs text-[var(--color-texte-doux)]">Il y avait mieux</p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-emerald-400">
                    {verdict.meilleurSan}
                  </p>
                  {verdict.varianteSan.length > 1 ? (
                    <p className="mt-1 font-mono text-xs text-[var(--color-texte-doux)]">
                      {verdict.varianteSan.join(' ')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {partie.surLeDernierCoup && !fin ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Bouton onClick={reprendreLeCoup}>Reprendre</Bouton>
                    <Bouton variante="principal" onClick={() => setVerdict(null)}>
                      Garder
                    </Bouton>
                  </div>
                  {attendDecision ? (
                    <p className="mt-2 text-center text-xs text-[var(--color-texte-doux)]">
                      Stockfish attend votre décision avant de répondre.
                    </p>
                  ) : null}
                </>
              ) : null}
            </Carte>
          ) : null}

          {fin ? (
            <Carte titre="Partie terminée">
              <p className="text-lg font-semibold">
                {fin.resultat === '1-0'
                  ? 'Les blancs gagnent'
                  : fin.resultat === '0-1'
                    ? 'Les noirs gagnent'
                    : 'Partie nulle'}
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-texte-doux)]">{fin.raison}</p>
              <Bouton
                variante="principal"
                className="mt-4 w-full"
                onClick={() => naviguer(`/rapport/${idPartie}`)}
              >
                Analyser la partie
              </Bouton>
            </Carte>
          ) : null}

          <Carte titre="Analyse en direct">
            <AffichageEval
              evaluation={analyse.lignes[0]?.evaluation ?? evaluation ?? undefined}
              profondeur={analyse.profondeur}
            />
            {analyse.erreur ? (
              <p className="mt-2 text-sm text-red-400">{analyse.erreur}</p>
            ) : analyse.lignes.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-texte-doux)]">
                {monTour ? 'Recherche en cours…' : 'En attente de votre tour.'}
              </p>
            ) : (
              <ol className="mt-3 space-y-1.5">
                {analyse.lignes.map((l) => (
                  <li key={l.multipv} className="flex gap-2 text-sm">
                    <span className="w-14 shrink-0 font-mono tabular-nums text-[var(--color-accent)]">
                      {formaterEvaluation(l.evaluation)}
                    </span>
                    <span className="min-w-0 truncate font-mono text-xs text-[var(--color-texte-doux)]">
                      {variantEnSan(partie.fenCourante, l.pv, 6).join(' ')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Carte>

          <Carte titre="Coups">
            <ListeCoups
              coups={partie.coupsSan.map((san) => ({ san }))}
              indexActif={partie.indexAffiche}
              onSelection={partie.aller}
              compacte
            />
          </Carte>
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
