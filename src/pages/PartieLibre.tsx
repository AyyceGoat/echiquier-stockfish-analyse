/**
 * Partie libre — mode par défaut.
 *
 * Règle absolue de cet écran : aucune information venant du moteur n'est
 * affichée tant que la partie n'est pas terminée. Pas d'évaluation, pas de
 * flèche, pas de barre. Le moteur n'est sollicité que pour jouer ses propres
 * coups, et son résultat ne transparaît nulle part dans l'interface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import { enregistrerPartie, nouvelIdentifiant } from '../db/parties.ts';
import { useCoupDuMoteur, useEtatMoteur } from '../hooks/useMoteur.ts';
import { useBalayage, useRaccourcisClavier } from '../hooks/useRaccourcis.ts';
import { usePartie, type Promotion } from '../hooks/usePartie.ts';
import { FEN_INITIALE } from '../lib/fen.ts';
import { niveauParId } from '../lib/niveaux.ts';
import { recupererPosition } from '../lib/positionPartagee.ts';
import { Echiquier } from '../ui/Echiquier.tsx';
import { DialoguePromotion } from '../ui/DialoguePromotion.tsx';
import { ListeCoups } from '../ui/ListeCoups.tsx';
import { ChoixNiveau, NiveauActif } from '../ui/ChoixNiveau.tsx';
import { Alerte, Bouton, Carte, Segmente } from '../ui/composants.tsx';

type Adversaire = 'moteur' | 'humain';
type CouleurChoisie = 'blancs' | 'noirs' | 'hasard';

export function PartieLibre({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages, majReglages } = useReglages();
  // Une position peut arriver de l'écran d'analyse : elle est consommée une
  // seule fois, au montage, pour ne pas réapparaître à la partie suivante.
  const [fenDepart, setFenDepart] = useState<string>(() => recupererPosition() ?? FEN_INITIALE);
  const partie = usePartie(fenDepart);
  const etatMoteur = useEtatMoteur();
  const { demander, annuler } = useCoupDuMoteur();

  const [configuree, setConfiguree] = useState(false);
  const [adversaire, setAdversaire] = useState<Adversaire>('moteur');
  const [couleurChoisie, setCouleurChoisie] = useState<CouleurChoisie>('blancs');
  const [monCamp, setMonCamp] = useState<'w' | 'b'>('w');
  const [promotionEnAttente, setPromotion] = useState<{ depuis: string; vers: string } | null>(null);
  const [erreurMoteur, setErreurMoteur] = useState<string | null>(null);
  const [moteurReflechit, setReflechit] = useState(false);
  const [idPartie] = useState(() => nouvelIdentifiant());
  const [enregistree, setEnregistree] = useState(false);

  const zoneEchiquier = useRef<HTMLDivElement>(null);

  const { jouerCoup, fin, trait, fenCourante, coups } = partie;

  // --- Coup du moteur ---
  // Se déclenche quand c'est au tour du moteur et que la partie n'est pas finie.
  useEffect(() => {
    if (!configuree || adversaire !== 'moteur' || fin) return;
    if (trait === monCamp) return;

    let annule = false;
    setReflechit(true);
    setErreurMoteur(null);

    demander(fenCourante, niveauParId(reglages.niveauMoteur))
      .then(({ coup, erreur }) => {
        if (annule) return;
        setReflechit(false);
        if (erreur) {
          setErreurMoteur(erreur);
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
    adversaire,
    fin,
    trait,
    monCamp,
    fenCourante,
    reglages.niveauMoteur,
    demander,
    jouerCoup,
  ]);

  // --- Enregistrement automatique en fin de partie ---
  useEffect(() => {
    if (!fin || enregistree || coups.length === 0) return;
    setEnregistree(true);
    void enregistrerPartie({
      id: idPartie,
      date: Date.now(),
      mode: 'libre',
      blanc: adversaire === 'moteur' && monCamp === 'b' ? `Stockfish (${niveauParId(reglages.niveauMoteur).libelle})` : 'Moi',
      noir: adversaire === 'moteur' && monCamp === 'w' ? `Stockfish (${niveauParId(reglages.niveauMoteur).libelle})` : adversaire === 'humain' ? 'Adversaire' : 'Moi',
      resultat: fin.resultat,
      finPar: fin.raison,
      fenDepart: partie.fenDepart,
      coupsSan: partie.coupsSan,
      niveauMoteur: adversaire === 'moteur' ? reglages.niveauMoteur : undefined,
    });
  }, [fin, enregistree, coups.length, idPartie, adversaire, monCamp, reglages.niveauMoteur, partie.fenDepart, partie.coupsSan]);

  const surCoup = useCallback(
    (depuis: string, vers: string) => {
      if (partie.demandePromotion(depuis, vers)) {
        setPromotion({ depuis, vers });
        return;
      }
      jouerCoup(depuis, vers);
    },
    [jouerCoup, partie],
  );

  const demarrer = useCallback(() => {
    const camp: 'w' | 'b' =
      couleurChoisie === 'hasard'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : couleurChoisie === 'blancs'
          ? 'w'
          : 'b';
    setMonCamp(camp);
    partie.definirOrientation(camp === 'w' ? 'white' : 'black');
    partie.reinitialiser(fenDepart);
    setConfiguree(true);
    setEnregistree(false);
    setErreurMoteur(null);
  }, [couleurChoisie, fenDepart, partie]);

  const nouvellePartie = useCallback(() => {
    annuler();
    setConfiguree(false);
    setReflechit(false);
    // Une nouvelle partie repart toujours de la position initiale : la
    // position importée n'a de sens que pour la première.
    setFenDepart(FEN_INITIALE);
    partie.reinitialiser(FEN_INITIALE);
  }, [annuler, partie]);

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

  // --- Écran de configuration ---
  if (!configuree) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-semibold">Partie libre</h1>
          <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
            Aucune assistance pendant le jeu. L’analyse complète est proposée à la fin.
          </p>
        </div>

        <Carte titre="Adversaire">
          <Segmente
            valeur={adversaire}
            ariaLabel="Adversaire"
            onChange={setAdversaire}
            options={[
              { valeur: 'moteur', libelle: 'Stockfish' },
              { valeur: 'humain', libelle: 'Deux joueurs' },
            ]}
          />

          {adversaire === 'moteur' ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">Niveau</p>
                <ChoixNiveau
                  valeur={reglages.niveauMoteur}
                  onChange={(id) => majReglages({ niveauMoteur: id })}
                />
              </div>

              <div>
                <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">Je joue avec les</p>
                <Segmente
                  valeur={couleurChoisie}
                  ariaLabel="Couleur"
                  onChange={setCouleurChoisie}
                  options={[
                    { valeur: 'blancs', libelle: 'Blancs' },
                    { valeur: 'noirs', libelle: 'Noirs' },
                    { valeur: 'hasard', libelle: 'Au hasard' },
                  ]}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--color-texte-doux)]">
              Les deux joueurs utilisent le même écran. L’échiquier ne se retourne pas
              automatiquement ; la touche <kbd className="font-mono">F</kbd> ou le bouton dédié
              permet de le faire.
            </p>
          )}
        </Carte>

        <Bouton variante="principal" className="w-full" onClick={demarrer}>
          Commencer la partie
        </Bouton>
      </div>
    );
  }

  // --- Partie en cours ---
  const couleurJouable =
    fin || !partie.surLeDernierCoup
      ? undefined
      : adversaire === 'humain'
        ? 'both'
        : monCamp === 'w'
          ? 'white'
          : 'black';

  return (
    <div className="space-y-4">
      {erreurMoteur ? (
        <Alerte titre="Le moteur n’a pas pu jouer">
          <p>{erreurMoteur}</p>
          <p className="mt-1">
            Vous pouvez continuer à deux joueurs, ou recharger la page pour relancer le moteur.
          </p>
        </Alerte>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={zoneEchiquier}>
          <Echiquier
            fen={partie.fen}
            orientation={partie.orientation}
            destinations={partie.destinations}
            couleurJouable={couleurJouable}
            trait={partie.traitAffiche === 'w' ? 'white' : 'black'}
            dernierCoup={partie.dernierCoup}
            echec={partie.echec}
            coordonnees={reglages.coordonnees}
            animations={reglages.animations}
            onCoup={surCoup}
          />

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

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {adversaire === 'moteur' ? <NiveauActif id={reglages.niveauMoteur} /> : null}
            {moteurReflechit ? (
              <span className="text-sm text-[var(--color-texte-doux)]">Stockfish réfléchit…</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          {/* Sous l'échiquier, pas au-dessus : ce bandeau disparaît au bout
              de quelques secondes et ferait remonter le plateau en pleine
              partie s'il occupait le haut de la page. */}
          {etatMoteur.etat === 'telechargement' && adversaire === 'moteur' ? (
            <Alerte titre="Téléchargement du moteur" ton="info">
              Environ 7 Mo, une seule fois. La partie commencera dès qu’il sera prêt.
            </Alerte>
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
              <div className="mt-4 space-y-2">
                <Bouton
                  variante="principal"
                  className="w-full"
                  onClick={() => naviguer(`/rapport/${idPartie}`)}
                >
                  Analyser la partie
                </Bouton>
                <Bouton className="w-full" onClick={nouvellePartie}>
                  Nouvelle partie
                </Bouton>
              </div>
            </Carte>
          ) : null}

          <Carte titre="Coups">
            <ListeCoups
              coups={partie.coupsSan.map((san) => ({ san }))}
              indexActif={partie.indexAffiche}
              onSelection={partie.aller}
            />
          </Carte>

          {!fin ? (
            <Carte titre="Partie">
              <div className="space-y-2">
                {adversaire === 'humain' || partie.trait === monCamp ? (
                  <Bouton
                    className="w-full"
                    onClick={partie.annulerDernierCoup}
                    disabled={partie.coups.length === 0}
                  >
                    Annuler le dernier coup
                  </Bouton>
                ) : null}
                <Bouton className="w-full" variante="danger" onClick={nouvellePartie}>
                  Abandonner et recommencer
                </Bouton>
              </div>
              <p className="mt-3 text-xs text-[var(--color-texte-doux)]">
                Ce mode n’affiche volontairement aucune évaluation. Pour un retour pendant la
                partie, utilisez le jeu assisté.
              </p>
            </Carte>
          ) : null}
        </div>
      </div>

      {promotionEnAttente ? (
        <DialoguePromotion
          couleur={partie.trait}
          onChoisir={(p) => {
            jouerCoup(promotionEnAttente.depuis, promotionEnAttente.vers, p);
            setPromotion(null);
          }}
          onAnnuler={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}
