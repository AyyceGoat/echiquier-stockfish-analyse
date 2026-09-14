/**
 * Historique des parties enregistrées, avec leurs analyses.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  historiqueDisponible,
  listerParties,
  supprimerPartie,
  viderHistorique,
  type PartieEnregistree,
} from '../db/parties.ts';
import { Alerte, Bouton, Carte, Etiquette } from '../ui/composants.tsx';

export function Historique({ naviguer }: { naviguer: (v: string) => void }) {
  const [parties, setParties] = useState<PartieEnregistree[]>([]);
  const [chargement, setChargement] = useState(true);
  const [disponible, setDisponible] = useState(true);
  const [confirmationVidage, setConfirmation] = useState(false);

  const recharger = useCallback(async () => {
    setChargement(true);
    const dispo = await historiqueDisponible();
    setDisponible(dispo);
    setParties(dispo ? await listerParties() : []);
    setChargement(false);
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  if (chargement) {
    return <p className="py-16 text-center text-[var(--color-texte-doux)]">Chargement…</p>;
  }

  if (!disponible) {
    return (
      <div className="mx-auto max-w-lg pt-4">
        <Alerte titre="L’historique n’est pas disponible sur cet appareil" ton="alerte">
          <p>
            Le stockage local est bloqué, probablement à cause d’une navigation privée ou d’un
            réglage du navigateur. Les parties restent jouables et analysables, mais elles ne
            seront pas conservées.
          </p>
        </Alerte>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div>
          <h1 className="text-2xl font-semibold">Historique</h1>
          <p className="mt-1 text-sm text-[var(--color-texte-doux)]">
            {parties.length === 0
              ? 'Aucune partie enregistrée pour l’instant.'
              : `${parties.length} partie${parties.length > 1 ? 's' : ''} enregistrée${
                  parties.length > 1 ? 's' : ''
                }.`}
          </p>
        </div>
        {parties.length > 0 ? (
          confirmationVidage ? (
            <div className="flex gap-2">
              <Bouton
                variante="danger"
                onClick={async () => {
                  await viderHistorique();
                  setConfirmation(false);
                  void recharger();
                }}
              >
                Confirmer la suppression
              </Bouton>
              <Bouton onClick={() => setConfirmation(false)}>Annuler</Bouton>
            </div>
          ) : (
            <Bouton variante="discret" onClick={() => setConfirmation(true)}>
              Tout effacer
            </Bouton>
          )
        ) : null}
      </div>

      {parties.length === 0 ? (
        <Carte>
          <p className="text-sm text-[var(--color-texte-doux)]">
            Les parties terminées en mode libre ou assisté apparaissent ici automatiquement, avec
            leur analyse une fois celle-ci lancée.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Bouton variante="principal" onClick={() => naviguer('/libre')}>
              Jouer une partie
            </Bouton>
          </div>
        </Carte>
      ) : (
        <ul className="space-y-2">
          {parties.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--color-bordure)] bg-[var(--color-fond-2)]"
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => naviguer(`/rapport/${p.id}`)}
                  className="min-w-0 flex-1 rounded-l-2xl p-4 text-left hover:bg-[var(--color-fond-3)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {p.blanc} — {p.noir}
                    </span>
                    <span className="font-mono text-sm">{p.resultat}</span>
                    {p.rapport ? <Etiquette ton="succes">Analysée</Etiquette> : null}
                    <Etiquette>
                      {p.mode === 'libre'
                        ? 'Partie libre'
                        : p.mode === 'assiste'
                          ? 'Jeu assisté'
                          : 'Analyse'}
                    </Etiquette>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-texte-doux)]">
                    {new Date(p.date).toLocaleString('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}{' '}
                    · {p.coupsSan.length} demi-coups · {p.finPar}
                    {p.rapport?.precisionBlancs !== undefined &&
                    p.rapport?.precisionBlancs !== null ? (
                      <>
                        {' '}
                        · précision {p.rapport.precisionBlancs.toFixed(0)} %/
                        {p.rapport.precisionNoirs?.toFixed(0) ?? '—'} %
                      </>
                    ) : null}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer la partie du ${new Date(p.date).toLocaleDateString('fr-FR')}`}
                  onClick={async () => {
                    await supprimerPartie(p.id);
                    void recharger();
                  }}
                  className="cible-tactile rounded-r-2xl px-4 text-[var(--color-texte-doux)] hover:bg-red-500/10 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
