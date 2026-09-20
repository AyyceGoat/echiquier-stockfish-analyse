/**
 * Page de diagnostic.
 *
 * Sert à décrire précisément un appareil qui pose problème : tout ce qui
 * conditionne le comportement de l'application y figure, et le rapport est
 * copiable en un geste.
 */

import { useCallback, useEffect, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import { estimerStockage, historiqueDisponible } from '../db/parties.ts';
import {
  detecterCapacites,
  nomVariante,
  VERSION_SF18,
  VERSION_SF19,
  type Capacites,
} from '../engine/capacites.ts';
import { useEtatMoteur, useMoteur } from '../hooks/useMoteur.ts';
import { moteurReconnaissance } from '../recognition/index.ts';
import { Alerte, Bouton, Carte, EnTetePage, Etiquette, type Ton } from '../ui/composants.tsx';

function Ligne({ cle, valeur, ton }: { cle: string; valeur: string; ton?: Ton }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-bordure)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-texte-doux)]">{cle}</span>
      {ton ? (
        <Etiquette ton={ton}>{valeur}</Etiquette>
      ) : (
        <span className="chiffres text-right text-sm">{valeur}</span>
      )}
    </div>
  );
}

const ouiNon = (v: boolean) => (v ? 'Oui' : 'Non');

export function Diagnostic({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages } = useReglages();
  const moteur = useMoteur();
  const etatMoteur = useEtatMoteur();

  const [capacites] = useState<Capacites>(() => detecterCapacites());
  const [stockage, setStockage] = useState<{ utiliseMo: number; quotaMo: number } | null>(null);
  const [idbOk, setIdbOk] = useState<boolean | null>(null);
  const [swActif, setSwActif] = useState<boolean | null>(null);
  const [copie, setCopie] = useState(false);
  const [testEnCours, setTest] = useState(false);
  const [resultatTest, setResultatTest] = useState<string | null>(null);

  useEffect(() => {
    void estimerStockage().then(setStockage);
    void historiqueDisponible().then(setIdbOk);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((r) => setSwActif(Boolean(r?.active)));
    } else {
      setSwActif(false);
    }
  }, []);

  const recognizer = moteurReconnaissance(reglages.reconnaissance);

  /** Lance une recherche courte pour vérifier que le moteur répond vraiment. */
  const testerMoteur = useCallback(async () => {
    setTest(true);
    setResultatTest(null);
    const debut = performance.now();
    try {
      const r = await moteur.analyser({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        profondeur: 10,
        multiPV: 1,
      });
      const duree = Math.round(performance.now() - debut);
      setResultatTest(
        r.meilleurCoup
          ? `Le moteur a répondu « ${r.meilleurCoup} » en profondeur ${r.profondeur}, en ${duree} ms.`
          : `Le moteur a répondu sans proposer de coup (${duree} ms).`,
      );
    } catch (e) {
      setResultatTest(
        `Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}.`,
      );
    } finally {
      setTest(false);
    }
  }, [moteur]);

  const rapportTexte = [
    `Navigateur : ${capacites.navigateur}`,
    `User-Agent : ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`,
    `Mobile : ${ouiNon(capacites.mobile)} — iOS/WebKit : ${ouiNon(capacites.ios)}`,
    `SharedArrayBuffer : ${ouiNon(capacites.sharedArrayBuffer)}`,
    `Contexte isolé (COOP/COEP) : ${ouiNon(capacites.isole)}`,
    `Threads WebAssembly : ${ouiNon(capacites.wasmThreads)}`,
    `Cœurs logiques : ${capacites.coeurs}`,
    `Mémoire annoncée : ${capacites.memoireGo ?? 'inconnue'} Go`,
    `Build Stockfish : ${moteur.varianteChargee ? nomVariante(moteur.varianteChargee) : 'non chargé'}`,
    `Threads actifs : ${moteur.profil.threads}`,
    `Table de hachage : ${moteur.profil.hash} Mo`,
    `Profondeur par défaut : ${moteur.profil.profondeurParDefaut}`,
    `Nom rapporté par le moteur : ${moteur.nomMoteur}`,
    `État du moteur : ${etatMoteur.etat}`,
    `Mode réduit : ${moteur.profil.raisonModeReduit ?? 'non'}`,
    `Reconnaissance active : ${recognizer.nom}`,
    `Service worker : ${swActif === null ? 'inconnu' : ouiNon(swActif)}`,
    `IndexedDB : ${idbOk === null ? 'inconnu' : ouiNon(idbOk)}`,
    `Réseau économe : ${ouiNon(capacites.reseauLent)}`,
    `Animations réduites demandées : ${ouiNon(capacites.animationsReduites)}`,
    stockage ? `Stockage : ${stockage.utiliseMo.toFixed(1)} Mo / ${stockage.quotaMo.toFixed(0)} Mo` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EnTetePage titre="Diagnostic">
        Ces informations décrivent ce que l’application a détecté sur cet appareil.
      </EnTetePage>

      {moteur.profil.raisonModeReduit ? (
        <Alerte titre="Le moteur tourne en mode réduit" ton="alerte">
          <p>{moteur.profil.raisonModeReduit}</p>
          <p className="mt-1">
            Stockfish fonctionne normalement, sur un seul thread. L’analyse est simplement plus
            lente à profondeur égale.
          </p>
        </Alerte>
      ) : null}

      <Carte titre="Navigateur et appareil">
        <Ligne cle="Navigateur détecté" valeur={capacites.navigateur} />
        <Ligne cle="Appareil mobile" valeur={ouiNon(capacites.mobile)} />
        <Ligne cle="Moteur WebKit (iOS)" valeur={ouiNon(capacites.ios)} />
        <Ligne cle="Cœurs logiques" valeur={String(capacites.coeurs)} />
        <Ligne
          cle="Mémoire annoncée"
          valeur={capacites.memoireGo !== null ? `${capacites.memoireGo} Go` : 'non communiquée'}
        />
        <Ligne cle="Connexion économe" valeur={ouiNon(capacites.reseauLent)} />
        <Ligne cle="Animations réduites demandées" valeur={ouiNon(capacites.animationsReduites)} />
      </Carte>

      <Carte titre="Capacités WebAssembly">
        <Ligne
          cle="SharedArrayBuffer"
          valeur={ouiNon(capacites.sharedArrayBuffer)}
          ton={capacites.sharedArrayBuffer ? 'succes' : 'alerte'}
        />
        <Ligne
          cle="Contexte isolé (COOP/COEP)"
          valeur={ouiNon(capacites.isole)}
          ton={capacites.isole ? 'succes' : 'alerte'}
        />
        <Ligne
          cle="Threads WebAssembly"
          valeur={ouiNon(capacites.wasmThreads)}
          ton={capacites.wasmThreads ? 'succes' : 'alerte'}
        />
        <Ligne
          cle="WebAssembly"
          valeur={ouiNon(capacites.webAssembly)}
          ton={capacites.webAssembly ? 'succes' : 'danger'}
        />
      </Carte>

      <Carte
        titre="Moteur Stockfish"
        action={
          <Bouton variante="discret" onClick={testerMoteur} disabled={testEnCours}>
            {testEnCours ? 'Test en cours…' : 'Tester'}
          </Bouton>
        }
      >
        <Ligne
          cle="Version"
          valeur={
            moteur.varianteChargee === 'sf19'
              ? `Stockfish ${VERSION_SF19}`
              : `Stockfish ${VERSION_SF18} (lite)`
          }
        />
        <Ligne
          cle="Build chargé"
          valeur={
            moteur.varianteChargee
              ? nomVariante(moteur.varianteChargee)
              : `prévu : ${nomVariante(moteur.profil.variante)}`
          }
        />
        <Ligne cle="Threads actifs" valeur={String(moteur.profil.threads)} />
        <Ligne cle="Table de hachage" valeur={`${moteur.profil.hash} Mo`} />
        <Ligne cle="Profondeur par défaut" valeur={String(moteur.profil.profondeurParDefaut)} />
        <Ligne cle="Temps par coup (analyse)" valeur={`${moteur.profil.tempsParCoupMs} ms`} />
        <Ligne
          cle="Moteurs embarqués"
          valeur={`SF ${VERSION_SF19} (~1,7 Mo) et SF ${VERSION_SF18} (~7 Mo)`}
        />
        <Ligne cle="Nom rapporté" valeur={moteur.nomMoteur} />
        <Ligne
          cle="État"
          valeur={etatMoteur.etat}
          ton={
            etatMoteur.etat === 'pret' || etatMoteur.etat === 'recherche'
              ? 'succes'
              : etatMoteur.etat === 'echec'
                ? 'danger'
                : 'info'
          }
        />
        {etatMoteur.erreur ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{etatMoteur.erreur}</p>
        ) : null}
        {resultatTest ? (
          <p className="mt-3 rounded-lg bg-[var(--color-fond-3)] p-3 text-sm">{resultatTest}</p>
        ) : null}
      </Carte>

      <Carte titre="Stockage et hors ligne">
        <Ligne cle="Reconnaissance active" valeur={recognizer.nom} />
        <Ligne cle="Fonctionne hors ligne" valeur={ouiNon(recognizer.horsLigne)} />
        <Ligne
          cle="Service worker"
          valeur={swActif === null ? 'inconnu' : ouiNon(swActif)}
          ton={swActif ? 'succes' : 'alerte'}
        />
        <Ligne
          cle="IndexedDB (historique)"
          valeur={idbOk === null ? 'inconnu' : ouiNon(idbOk)}
          ton={idbOk ? 'succes' : 'alerte'}
        />
        {stockage ? (
          <Ligne
            cle="Espace utilisé"
            valeur={`${stockage.utiliseMo.toFixed(1)} Mo sur ${stockage.quotaMo.toFixed(0)} Mo`}
          />
        ) : null}
      </Carte>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Bouton
          variante="principal"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(rapportTexte);
              setCopie(true);
              setTimeout(() => setCopie(false), 2500);
            } catch {
              // `clipboard` peut être refusé : le rapport reste lisible ci-dessous.
              setCopie(false);
            }
          }}
        >
          {copie ? 'Rapport copié' : 'Copier le rapport'}
        </Bouton>
        <Bouton className="flex-1" onClick={() => naviguer('/reglages')}>
          Retour aux réglages
        </Bouton>
      </div>

      <details>
        <summary className="cible-tactile cursor-pointer text-sm text-[var(--color-texte-doux)]">
          Voir le rapport en texte brut
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--color-fond-2)] p-3 text-xs">
          {rapportTexte}
        </pre>
      </details>
    </div>
  );
}
