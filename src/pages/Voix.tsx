/**
 * Page d'écoute et d'attribution des voix.
 *
 * La synthèse du navigateur a été abandonnée : mécanique sur Windows, et
 * surtout limitée en pratique à une voix par genre, si bien que les quatre
 * professeurs sonnaient comme deux personnes parlant à des vitesses
 * différentes. Les voix viennent maintenant des voix neuronales de Microsoft,
 * pré-générées par `npm run voix`.
 *
 * Cette page ne décide rien : elle fait entendre les vingt-trois voix
 * capables de parler français — treize françaises et dix multilingues —
 * disant le MÊME commentaire réel, et laisse attribuer les quatre.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import apercu from '../lib/voixApercu.json';
import { useReglages } from '../contexte.tsx';
import { PROFESSEURS } from '../lib/professeurs.ts';
import { PortraitProfesseur } from '../ui/PortraitProfesseur.tsx';
import { Alerte, Bouton, Carte, EnTetePage, Etiquette } from '../ui/composants.tsx';

interface VoixApercu {
  id: string;
  libelle: string;
  pays: string;
  genre: string;
  /** Voix entraînée sur plusieurs langues, et non sur le seul français. */
  multilingue?: boolean;
  fichier: string;
}

const VOIX = apercu as VoixApercu[];

/** Le commentaire lu par toutes les voix, reproduit ici pour le lire à l'écran. */
const PHRASE =
  'Non, c’est une faute grave. Ce coup laisse votre cavalier en e4 en prise, et la tour en d1 ' +
  'était le seul coup qui tenait. Reprenez l’initiative maintenant, ou cette partie est déjà écrite.';

export function Voix({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages, majReglages } = useReglages();
  const [enCours, setEnCours] = useState<string | null>(null);
  const lecteur = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      lecteur.current?.pause();
      lecteur.current = null;
    };
  }, []);

  const ecouter = useCallback((v: VoixApercu) => {
    lecteur.current?.pause();
    const audio = new Audio(v.fichier);
    lecteur.current = audio;
    setEnCours(v.id);
    audio.onended = () => setEnCours(null);
    audio.onerror = () => setEnCours(null);
    void audio.play().catch(() => setEnCours(null));
  }, []);

  const attribuees = reglages.voixProfesseurs ?? {};
  // Les multilingues en premier : ce sont les plus récentes du service, et
  // les deux meilleures voix françaises — Rémy et Vivienne — sont justement
  // de ce type.
  const parPays = [
    'Multilingue',
    ...[...new Set(VOIX.map((v) => v.pays))].filter((p) => p !== 'Multilingue'),
  ].filter((p) => VOIX.some((v) => v.pays === p));

  /** Une voix attribuée deux fois ferait sonner deux professeurs pareil. */
  const doublons = Object.values(attribuees).filter(
    (id, i, tous) => id && tous.indexOf(id) !== i,
  );

  return (
    <div className="space-y-4">
      <EnTetePage titre="Les voix des professeurs">
        Vingt-trois voix capables de parler français disent le même commentaire : treize
        françaises et dix multilingues. Écoutez-les, puis attribuez-en une à chaque professeur.
      </EnTetePage>

      <Carte titre="Le commentaire lu">
        <p className="text-sm italic text-[var(--color-texte-doux)]">« {PHRASE} »</p>
        <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
          Un vrai commentaire, et non une phrase neutre : on entend ainsi comment chaque voix dit
          la notation et gère la ponctuation.
        </p>
      </Carte>

      {doublons.length > 0 ? (
        <Alerte titre="Deux professeurs partagent la même voix" ton="alerte">
          <p>
            C’est exactement ce qu’il fallait éviter. Attribuez une voix différente à chacun.
          </p>
        </Alerte>
      ) : null}

      {/* --- Attribution ---------------------------------------------------- */}
      <Carte titre="Qui parle avec quelle voix">
        <div className="space-y-4">
          {PROFESSEURS.map((prof) => {
            const choisie = VOIX.find((v) => v.id === attribuees[prof.id]) ?? null;
            return (
              <div key={prof.id} className="flex items-start gap-3">
                <div className="w-16 shrink-0">
                  <PortraitProfesseur
                    prof={prof}
                    parle={enCours !== null && choisie?.id === enCours}
                    cleEntree={prof.id}
                    className="pp-pastille"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{prof.nom}</p>
                  <p className="text-xs text-[var(--color-texte-doux)]">{prof.role}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={attribuees[prof.id] ?? ''}
                      onChange={(e) =>
                        majReglages({
                          voixProfesseurs: { ...attribuees, [prof.id]: e.target.value },
                        })
                      }
                      aria-label={`Voix de ${prof.nom}`}
                      className="cible-tactile min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-bordure)] bg-[var(--color-fond)] px-3 py-2 text-sm"
                    >
                      <option value="">— aucune voix —</option>
                      {VOIX.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.libelle} · {v.genre} · {v.pays}
                        </option>
                      ))}
                    </select>
                    {choisie ? (
                      <Bouton variante="discret" onClick={() => ecouter(choisie)}>
                        {enCours === choisie.id ? 'Parle…' : 'Écouter'}
                      </Bouton>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Carte>

      {/* --- Toutes les voix ------------------------------------------------ */}
      {parPays.map((pays) => (
        <Carte
          key={pays}
          titre={pays === 'Multilingue' ? 'Voix multilingues' : `Voix de ${pays}`}
        >
          {pays === 'Multilingue' ? (
            <p className="mb-3 text-sm text-[var(--color-texte-doux)]">
              Entraînées sur plusieurs langues plutôt que sur le seul français. Ce sont les plus
              récentes du service, et elles prononcent le français correctement malgré une langue
              d’origine différente — Rémy et Vivienne, les deux voix françaises qui se détachent,
              sont exactement de ce type.
            </p>
          ) : null}
          <ul className="space-y-2">
            {VOIX.filter((v) => v.pays === pays).map((v) => {
              const pour = PROFESSEURS.filter((p) => attribuees[p.id] === v.id);
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <Bouton variante="discret" onClick={() => ecouter(v)}>
                    {enCours === v.id ? '▌▌ Parle…' : '▶ Écouter'}
                  </Bouton>
                  <span className="text-sm font-medium">{v.libelle}</span>
                  <Etiquette>{v.genre}</Etiquette>
                  <span className="font-mono text-xs text-[var(--color-texte-doux)]">{v.id}</span>
                  {pour.map((p) => (
                    <Etiquette key={p.id} ton="succes">
                      {p.nom}
                    </Etiquette>
                  ))}
                </li>
              );
            })}
          </ul>
        </Carte>
      ))}

      <Carte titre="Ce qu’il se passe ensuite">
        <p className="text-sm text-[var(--color-texte-doux)]">
          Une fois les quatre voix attribuées, tout le texte invariable — accueils, discours de
          fin de partie, registres de commentaires — est pré-généré et livré avec l’application.
          Le texte variable est synthétisé à la demande puis conservé définitivement : une phrase
          déjà dite n’est jamais regénérée.
        </p>
        <p className="mt-2 text-sm text-[var(--color-texte-doux)]">
          Si l’audio n’est pas prêt à temps, le professeur reste silencieux. Il ne bascule jamais
          sur la voix du navigateur.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bouton
            variante="discret"
            onClick={() => {
              lecteur.current?.pause();
              setEnCours(null);
            }}
          >
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
