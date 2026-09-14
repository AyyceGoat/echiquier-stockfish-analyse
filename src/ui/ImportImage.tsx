/**
 * Import d'une image de position.
 *
 * Quatre entrées couvrent tous les usages réels : l'appareil photo
 * (`capture="environment"` ouvre directement la caméra arrière sur mobile),
 * la galerie, le glisser-déposer et le collage depuis le presse-papiers.
 * L'image est redimensionnée avant tout traitement, y compris pour la
 * reconnaissance locale.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReglages } from '../contexte.tsx';
import {
  imageDuDepot,
  imageDuPressePapiers,
  moteurReconnaissance,
  moteursReconnaissance,
  orientationLaPlusPlausible,
  preparerImage,
  ErreurReconnaissance,
  type ResultatReconnaissance,
} from '../recognition/index.ts';
import { Alerte, BarreProgression, Bouton, Carte, Etiquette } from './composants.tsx';

export function ImportImage({
  onReconnu,
}: {
  onReconnu: (resultat: ResultatReconnaissance, apercu: string) => void;
}) {
  const { reglages, majReglages } = useReglages();
  const [enCours, setEnCours] = useState(false);
  const [avancement, setAvancement] = useState(0);
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState<{ message: string; conseil?: string } | null>(null);
  const [survol, setSurvol] = useState(false);

  const champPhoto = useRef<HTMLInputElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  const apercuRef = useRef<string | null>(null);

  const moteurs = moteursReconnaissance();
  const moteurChoisi = moteurReconnaissance(reglages.reconnaissance);

  // Libère l'URL d'objet du dernier aperçu au démontage.
  useEffect(
    () => () => {
      if (apercuRef.current) URL.revokeObjectURL(apercuRef.current);
    },
    [],
  );

  const traiter = useCallback(
    async (fichier: Blob) => {
      if (enCours) return;
      setErreur(null);
      setEnCours(true);
      setAvancement(0);
      setEtape('Préparation…');

      try {
        if (!fichier.type.startsWith('image/')) {
          throw new ErreurReconnaissance(
            "Ce fichier n'est pas une image.",
            'Utilisez une photo ou une capture d’écran.',
          );
        }

        // Redimensionnement systématique : c'est aussi l'aperçu affiché.
        const preparee = await preparerImage(fichier, 1024);
        if (apercuRef.current) URL.revokeObjectURL(apercuRef.current);
        apercuRef.current = preparee.url;

        const dispo = await moteurChoisi.verifierDisponibilite();
        if (!dispo.disponible) {
          throw new ErreurReconnaissance(
            dispo.raison ?? "Ce moteur de reconnaissance n'est pas disponible.",
            moteurChoisi.horsLigne
              ? undefined
              : 'Vous pouvez basculer sur la reconnaissance locale ci-dessous.',
          );
        }

        const brut = await moteurChoisi.reconnaitre(preparee.blob, {
          surProgression: (a, e) => {
            setAvancement(a);
            setEtape(e);
          },
        });

        // L'orientation est redressée avant d'atteindre l'écran de correction :
        // corriger 32 pièces à la main parce que l'échiquier est à l'envers
        // serait le pire résultat possible.
        onReconnu(orientationLaPlusPlausible(brut), preparee.url);
      } catch (e) {
        if (e instanceof ErreurReconnaissance) {
          setErreur({ message: e.message, conseil: e.conseil });
        } else if (e instanceof DOMException && e.name === 'AbortError') {
          // Annulation volontaire : rien à signaler.
        } else {
          setErreur({
            message: e instanceof Error ? e.message : 'La reconnaissance a échoué.',
            conseil: 'Réessayez avec une image plus nette, ou saisissez la position à la main.',
          });
        }
      } finally {
        setEnCours(false);
      }
    },
    [enCours, moteurChoisi, onReconnu],
  );

  // Collage depuis le presse-papiers, au niveau du document.
  useEffect(() => {
    const surCollage = (e: ClipboardEvent) => {
      const image = imageDuPressePapiers(e);
      if (image) {
        e.preventDefault();
        void traiter(image);
      }
    };
    document.addEventListener('paste', surCollage);
    return () => document.removeEventListener('paste', surCollage);
  }, [traiter]);

  return (
    <Carte
      titre="Importer une position depuis une image"
      action={
        <Etiquette ton={moteurChoisi.horsLigne ? 'succes' : 'info'}>
          {moteurChoisi.horsLigne ? 'Hors ligne' : 'En ligne'}
        </Etiquette>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          const image = imageDuDepot(e.nativeEvent);
          if (image) void traiter(image);
          else
            setErreur({
              message: 'Aucune image dans ce dépôt.',
              conseil: 'Déposez un fichier image (JPEG, PNG, WebP).',
            });
        }}
        className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
          survol
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
            : 'border-[var(--color-bordure)]'
        }`}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Bouton
            variante="principal"
            className="w-full"
            disabled={enCours}
            onClick={() => champPhoto.current?.click()}
          >
            Prendre une photo
          </Bouton>
          <Bouton
            className="w-full"
            disabled={enCours}
            onClick={() => champFichier.current?.click()}
          >
            Choisir une image
          </Bouton>
        </div>

        <p className="mt-3 text-center text-xs text-[var(--color-texte-doux)]">
          Vous pouvez aussi glisser-déposer une image ici, ou la coller avec{' '}
          <kbd className="font-mono">Ctrl</kbd> + <kbd className="font-mono">V</kbd>.
        </p>

        {/* `capture="environment"` ouvre l'appareil photo arrière sur mobile.
            Sur ordinateur, l'attribut est ignoré et un sélecteur s'ouvre. */}
        <input
          ref={champPhoto}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void traiter(f);
            e.target.value = '';
          }}
        />
        <input
          ref={champFichier}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void traiter(f);
            e.target.value = '';
          }}
        />
      </div>

      {enCours ? (
        <div className="mt-4">
          <BarreProgression valeur={avancement} libelle={etape} />
        </div>
      ) : null}

      {erreur ? (
        <div className="mt-4">
          <Alerte titre={erreur.message}>
            {erreur.conseil ? <p>{erreur.conseil}</p> : null}
          </Alerte>
        </div>
      ) : null}

      <div className="mt-4 border-t border-[var(--color-bordure)] pt-3">
        <p className="mb-2 text-xs text-[var(--color-texte-doux)]">Moteur de reconnaissance</p>
        <div className="space-y-1.5">
          {moteurs.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => majReglages({ reconnaissance: m.id })}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                reglages.reconnaissance === m.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                  : 'border-[var(--color-bordure)] hover:border-[var(--color-texte-doux)]'
              }`}
            >
              <span className="block text-sm font-medium">{m.nom}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
                {m.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Carte>
  );
}
