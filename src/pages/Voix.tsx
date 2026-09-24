/**
 * Page d'écoute des voix.
 *
 * Demandée avant intégration : entendre les quatre professeurs dire la même
 * phrase, pour juger les timbres côte à côte. Elle sert aussi de diagnostic,
 * parce que la qualité dépend entièrement de l'appareil — très correcte sur
 * iOS et macOS, franchement mécanique sur Windows. Autant le montrer que le
 * laisser découvrir.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  choisirVoix,
  debloquerVoix,
  dire,
  repartirVoix,
  taire,
  timbreDe,
  voixFrancaises,
  voixNavigateurDisponible,
} from '../lib/voix.ts';
import { PROFESSEURS } from '../lib/professeurs.ts';
import { PortraitProfesseur } from '../ui/PortraitProfesseur.tsx';
import { Alerte, Bouton, Carte, EnTetePage, Etiquette } from '../ui/composants.tsx';

/** Même phrase pour tous : c'est le timbre qu'on compare, pas le texte. */
const PHRASE = 'Ce coup laisse votre cavalier en prise. Il fallait jouer la tour en d1.';

export function Voix({ naviguer }: { naviguer: (v: string) => void }) {
  const [voix, setVoix] = useState<SpeechSynthesisVoice[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);

  /**
   * La liste des voix arrive de façon asynchrone sur la plupart des
   * navigateurs : vide au premier appel, remplie ensuite. On écoute donc
   * l'événement plutôt que de lire une fois.
   */
  useEffect(() => {
    if (!voixNavigateurDisponible()) return;
    const relire = () => setVoix(voixFrancaises());
    relire();
    speechSynthesis.addEventListener('voiceschanged', relire);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', relire);
      taire();
    };
  }, []);

  const attribuees = repartirVoix(
    PROFESSEURS.map((p) => p.id),
    voix,
  );

  const ecouter = useCallback(
    (id: string) => {
      debloquerVoix();
      setEnCours(id);
      dire({
        idProfesseur: id,
        texte: PHRASE,
        voix: attribuees[id] ?? undefined,
        surFin: () => setEnCours(null),
      });
    },
    [attribuees],
  );

  const indisponible = !voixNavigateurDisponible();

  return (
    <div className="space-y-4">
      <EnTetePage titre="Les voix des professeurs">
        Les quatre professeurs disent la même phrase. Ce qui change, c’est le timbre, la hauteur
        et le débit.
      </EnTetePage>

      {indisponible ? (
        <Alerte titre="Ce navigateur ne sait pas parler" ton="alerte">
          <p>
            La synthèse vocale n’est pas disponible ici. Les professeurs continueront de
            s’exprimer par écrit.
          </p>
        </Alerte>
      ) : voix.length === 0 ? (
        <Alerte titre="Aucune voix française installée" ton="alerte">
          <p>
            Cet appareil ne propose aucune voix française. Sur Windows, elles s’ajoutent depuis
            Paramètres puis Heure et langue. Sur Android, depuis les paramètres de synthèse
            vocale.
          </p>
        </Alerte>
      ) : (
        <Carte titre="Ce que cet appareil propose">
          <p className="text-sm text-[var(--color-texte-doux)]">
            {voix.length} voix française{voix.length > 1 ? 's' : ''} détectée
            {voix.length > 1 ? 's' : ''}. Quand l’appareil en offre moins de quatre, plusieurs
            professeurs partagent la même voix : seuls la hauteur et le débit les distinguent
            alors.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {voix.map((v) => (
              <li key={v.name}>
                <Etiquette>{v.name}</Etiquette>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {PROFESSEURS.map((prof) => {
          const timbre = timbreDe(prof.id);
          const attribuee = attribuees[prof.id] ?? choisirVoix(timbre, voix);
          return (
            <Carte key={prof.id} titre={prof.nom}>
              <div className="flex items-start gap-3">
                <div className="w-20 shrink-0">
                  <PortraitProfesseur
                    prof={prof}
                    parle={enCours === prof.id}
                    cleEntree={prof.id}
                    className="pp-pastille"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-texte-doux)]">{prof.role}</p>
                  <p className="mt-1 text-xs text-[var(--color-texte-doux)]">
                    Voix : {attribuee?.name ?? 'aucune'} · hauteur{' '}
                    {timbre.hauteur.toFixed(2).replace('.', ',')} · débit{' '}
                    {timbre.debit.toFixed(2).replace('.', ',')}
                  </p>
                  <Bouton
                    variante="principal"
                    className="mt-3"
                    disabled={indisponible || voix.length === 0}
                    onClick={() => ecouter(prof.id)}
                  >
                    {enCours === prof.id ? 'En train de parler…' : 'Écouter'}
                  </Bouton>
                </div>
              </div>
            </Carte>
          );
        })}
      </div>

      <Carte titre="Pourquoi la qualité varie">
        <p className="text-sm text-[var(--color-texte-doux)]">
          Ces voix viennent du système, pas de l’application : elles sont gratuites, fonctionnent
          hors ligne et ne dépendent d’aucun service. En contrepartie, leur naturel dépend
          entièrement de l’appareil. Sur iPhone et sur Mac, les voix françaises sont bonnes. Sur
          Windows, le résultat reste mécanique, et aucun réglage de hauteur ne le corrigera.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bouton variante="discret" onClick={() => taire()}>
            Couper le son
          </Bouton>
          <Bouton variante="discret" onClick={() => naviguer('/reglages')}>
            Aller aux réglages
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}
