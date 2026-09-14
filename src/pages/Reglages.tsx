/**
 * Réglages.
 *
 * La clé d'API mérite une explication : elle n'est utilisée que si
 * l'hébergeur n'en a pas configuré une. Elle reste dans le stockage local de
 * l'appareil, n'est jamais incluse dans le code de l'application, et transite
 * uniquement vers la fonction serverless du site.
 */

import { useEffect, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import { SEUILS_PAR_DEFAUT } from '../lib/classification.ts';
import { moteursReconnaissance } from '../recognition/index.ts';
import { ChoixNiveau } from '../ui/ChoixNiveau.tsx';
import {
  Alerte,
  Bouton,
  Carte,
  ChampTexte,
  Curseur,
  Interrupteur,
  Segmente,
} from '../ui/composants.tsx';

export function Reglages({ naviguer }: { naviguer: (v: string) => void }) {
  const { reglages, majReglages, reinitialiserReglages, stockageDisponible } = useReglages();
  const [cleVisible, setCleVisible] = useState(false);
  const [cleServeur, setCleServeur] = useState<boolean | null>(null);

  // On demande au service s'il dispose déjà d'une clé : inutile d'en réclamer
  // une à l'utilisateur si l'hébergeur en a configuré une.
  useEffect(() => {
    let vivant = true;
    fetch('/api/reconnaitre')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cleServeur?: boolean } | null) => {
        if (vivant) setCleServeur(d?.cleServeur ?? false);
      })
      .catch(() => {
        if (vivant) setCleServeur(false);
      });
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold">Réglages</h1>
      </div>

      {!stockageDisponible ? (
        <Alerte titre="Les réglages ne peuvent pas être enregistrés" ton="alerte">
          Le stockage local est bloqué sur ce navigateur. Vos choix s’appliquent à cette session
          mais seront perdus au rechargement.
        </Alerte>
      ) : null}

      <Carte titre="Apparence">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">Thème</p>
            <Segmente
              valeur={reglages.theme}
              ariaLabel="Thème"
              onChange={(v) => majReglages({ theme: v })}
              options={[
                { valeur: 'sombre', libelle: 'Sombre' },
                { valeur: 'clair', libelle: 'Clair' },
                { valeur: 'systeme', libelle: 'Système' },
              ]}
            />
          </div>
          <Interrupteur
            libelle="Coordonnées sur l’échiquier"
            actif={reglages.coordonnees}
            onChange={(v) => majReglages({ coordonnees: v })}
          />
          <Interrupteur
            libelle="Animer les pièces"
            description="À désactiver sur un appareil ancien si le jeu saccade."
            actif={reglages.animations}
            onChange={(v) => majReglages({ animations: v })}
          />
        </div>
      </Carte>

      <Carte titre="Moteur">
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">
              Niveau du moteur en partie
            </p>
            <ChoixNiveau
              valeur={reglages.niveauMoteur}
              onChange={(id) => majReglages({ niveauMoteur: id })}
            />
          </div>

          <Curseur
            libelle="Variantes affichées (MultiPV)"
            valeur={reglages.multiPV}
            min={1}
            max={5}
            onChange={(v) => majReglages({ multiPV: v })}
          />

          <div>
            <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">
              Profondeur d’analyse complète
            </p>
            <Segmente
              valeur={reglages.profondeurAnalyse === null ? 'auto' : 'manuelle'}
              ariaLabel="Profondeur"
              onChange={(v) =>
                majReglages({ profondeurAnalyse: v === 'auto' ? null : 16, tempsParCoupMs: null })
              }
              options={[
                { valeur: 'auto', libelle: 'Selon l’appareil' },
                { valeur: 'manuelle', libelle: 'Manuelle' },
              ]}
            />
            {reglages.profondeurAnalyse !== null ? (
              <div className="mt-3">
                <Curseur
                  libelle="Profondeur"
                  valeur={reglages.profondeurAnalyse}
                  min={8}
                  max={24}
                  onChange={(v) => majReglages({ profondeurAnalyse: v })}
                />
                <p className="mt-1 text-xs text-[var(--color-texte-doux)]">
                  Au-delà de 18, l’analyse d’une partie complète devient longue sur mobile.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-texte-doux)]">
                L’application choisit un temps de réflexion par coup adapté à la puissance de
                l’appareil, pour une durée d’analyse prévisible.
              </p>
            )}
          </div>
        </div>
      </Carte>

      <Carte titre="Assistance et classification">
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm text-[var(--color-texte-doux)]">
              Niveau d’assistance en jeu assisté
            </p>
            <Segmente
              valeur={reglages.niveauAssistance}
              ariaLabel="Niveau d’assistance"
              onChange={(v) => majReglages({ niveauAssistance: v })}
              options={[
                { valeur: 'chaque-coup', libelle: 'Chaque coup' },
                { valeur: 'erreurs-graves', libelle: 'Erreurs graves' },
              ]}
            />
          </div>

          <div className="space-y-4 border-t border-[var(--color-bordure)] pt-4">
            <p className="text-sm text-[var(--color-texte-doux)]">
              Seuils de classification, en centipions perdus par rapport au meilleur coup. Un coup
              n’est classé dans une catégorie que s’il perd aussi suffisamment en probabilité de
              gain : perdre 300 centipions quand on est déjà largement gagnant n’est pas une gaffe.
            </p>
            <Curseur
              libelle="Imprécision à partir de"
              valeur={reglages.seuils.imprecision.cp}
              min={20}
              max={120}
              pas={5}
              suffixe=" cp"
              onChange={(v) =>
                majReglages({
                  seuils: { ...reglages.seuils, imprecision: { ...reglages.seuils.imprecision, cp: v } },
                })
              }
            />
            <Curseur
              libelle="Erreur à partir de"
              valeur={reglages.seuils.erreur.cp}
              min={80}
              max={300}
              pas={10}
              suffixe=" cp"
              onChange={(v) =>
                majReglages({
                  seuils: { ...reglages.seuils, erreur: { ...reglages.seuils.erreur, cp: v } },
                })
              }
            />
            <Curseur
              libelle="Gaffe à partir de"
              valeur={reglages.seuils.gaffe.cp}
              min={150}
              max={600}
              pas={25}
              suffixe=" cp"
              onChange={(v) =>
                majReglages({
                  seuils: { ...reglages.seuils, gaffe: { ...reglages.seuils.gaffe, cp: v } },
                })
              }
            />
            <Bouton
              variante="discret"
              onClick={() => majReglages({ seuils: SEUILS_PAR_DEFAUT })}
            >
              Rétablir les seuils par défaut
            </Bouton>
          </div>
        </div>
      </Carte>

      <Carte titre="Reconnaissance par image">
        <div className="space-y-3">
          {moteursReconnaissance().map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => majReglages({ reconnaissance: m.id })}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                reglages.reconnaissance === m.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                  : 'border-[var(--color-bordure)]'
              }`}
            >
              <span className="block text-sm font-medium">{m.nom}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
                {m.description}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 border-t border-[var(--color-bordure)] pt-4">
          {cleServeur === true ? (
            <Alerte titre="Clé d’API fournie par l’hébergeur" ton="info">
              La reconnaissance par modèle fonctionne sans configuration de votre part. Vous
              pouvez tout de même saisir votre propre clé ci-dessous pour l’utiliser à la place.
            </Alerte>
          ) : cleServeur === false ? (
            <Alerte titre="Aucune clé configurée côté serveur" ton="alerte">
              Pour activer la reconnaissance par modèle, saisissez votre clé d’API Anthropic. Elle
              est stockée uniquement sur cet appareil et n’est jamais incluse dans le code de
              l’application. La reconnaissance locale, elle, fonctionne sans clé.
            </Alerte>
          ) : null}

          <div className="mt-3">
            <ChampTexte
              libelle="Clé d’API Anthropic (facultative)"
              valeur={reglages.cleApi}
              onChange={(v) => majReglages({ cleApi: v.trim() })}
              type={cleVisible ? 'text' : 'password'}
              placeholder="sk-ant-…"
              mono
              aide="Conservée dans le stockage local de cet appareil uniquement."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Bouton variante="discret" onClick={() => setCleVisible((v) => !v)}>
                {cleVisible ? 'Masquer' : 'Afficher'}
              </Bouton>
              {reglages.cleApi ? (
                <Bouton variante="discret" onClick={() => majReglages({ cleApi: '' })}>
                  Effacer la clé
                </Bouton>
              ) : null}
            </div>
          </div>
        </div>
      </Carte>

      <Carte titre="Diagnostic et remise à zéro">
        <div className="space-y-2">
          <Bouton className="w-full" onClick={() => naviguer('/diagnostic')}>
            Ouvrir la page de diagnostic
          </Bouton>
          <Bouton variante="discret" className="w-full" onClick={reinitialiserReglages}>
            Rétablir tous les réglages par défaut
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}
