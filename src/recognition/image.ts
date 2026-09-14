/**
 * Préparation des images avant reconnaissance.
 *
 * Une photo de téléphone pèse couramment 3 à 8 Mo. L'envoyer telle quelle en
 * 4G lente coûte plusieurs secondes et n'apporte rien : un échiquier est
 * parfaitement lisible en 1024 px. On redimensionne donc systématiquement
 * côté client, avant tout appel réseau.
 */

export const TAILLE_MAX_PAR_DEFAUT = 1024;

export interface ImagePreparee {
  blob: Blob;
  largeur: number;
  hauteur: number;
  /** URL d'objet à révoquer après usage. */
  url: string;
  typeMime: string;
  octets: number;
}

/**
 * Décode une image en respectant son orientation EXIF.
 * `createImageBitmap` gère l'EXIF sur les navigateurs récents ; on retombe
 * sur `HTMLImageElement` ailleurs (Safari plus ancien), qui applique
 * l'orientation nativement depuis iOS 13.
 */
async function decoder(source: Blob): Promise<{
  dessiner: (ctx: CanvasRenderingContext2D, l: number, h: number) => void;
  largeur: number;
  hauteur: number;
  liberer: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
      return {
        dessiner: (ctx, l, h) => ctx.drawImage(bitmap, 0, 0, l, h),
        largeur: bitmap.width,
        hauteur: bitmap.height,
        liberer: () => bitmap.close?.(),
      };
    } catch {
      // Option `imageOrientation` non reconnue : on passe à la méthode suivante.
    }
  }

  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resoudre, rejeter) => {
      const el = new Image();
      el.onload = () => resoudre(el);
      el.onerror = () => rejeter(new Error("L'image n'a pas pu être décodée."));
      el.src = url;
    });
    return {
      dessiner: (ctx, l, h) => ctx.drawImage(img, 0, 0, l, h),
      largeur: img.naturalWidth,
      hauteur: img.naturalHeight,
      liberer: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Redimensionne et recompresse une image, en conservant ses proportions. */
export async function preparerImage(
  source: Blob,
  tailleMax = TAILLE_MAX_PAR_DEFAUT,
): Promise<ImagePreparee> {
  const decodee = await decoder(source);
  try {
    const { largeur: l0, hauteur: h0 } = decodee;
    if (!l0 || !h0) throw new Error("L'image est vide ou illisible.");

    const facteur = Math.min(1, tailleMax / Math.max(l0, h0));
    const largeur = Math.max(1, Math.round(l0 * facteur));
    const hauteur = Math.max(1, Math.round(h0 * facteur));

    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error("Le navigateur n'autorise pas le rendu sur canvas.");

    // Fond blanc : un PNG transparent deviendrait noir en JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    decodee.dessiner(ctx, largeur, hauteur);

    const blob = await versBlob(canvas, 'image/jpeg', 0.85);
    return {
      blob,
      largeur,
      hauteur,
      url: URL.createObjectURL(blob),
      typeMime: blob.type || 'image/jpeg',
      octets: blob.size,
    };
  } finally {
    decodee.liberer();
  }
}

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob> {
  return new Promise((resoudre, rejeter) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (b) => (b ? resoudre(b) : rejeter(new Error("L'image n'a pas pu être encodée."))),
        type,
        qualite,
      );
      return;
    }
    // Repli pour les WebView anciennes sans `toBlob`.
    try {
      const dataUrl = canvas.toDataURL(type, qualite);
      const [entete, donnees] = dataUrl.split(',');
      const binaire = atob(donnees);
      const octets = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
      resoudre(new Blob([octets], { type: entete.match(/:(.*?);/)?.[1] ?? type }));
    } catch (e) {
      rejeter(e instanceof Error ? e : new Error("L'image n'a pas pu être encodée."));
    }
  });
}

/** Encode un blob en base64 sans data-URL, pour l'envoi à l'API. */
export async function versBase64(blob: Blob): Promise<string> {
  const tampon = await blob.arrayBuffer();
  const octets = new Uint8Array(tampon);
  // On encode par tranches : `String.fromCharCode(...)` dépasse la pile
  // sur les gros tableaux.
  let binaire = '';
  const tranche = 0x8000;
  for (let i = 0; i < octets.length; i += tranche) {
    binaire += String.fromCharCode(...octets.subarray(i, i + tranche));
  }
  return btoa(binaire);
}

/** Récupère une image depuis un événement de collage, s'il y en a une. */
export function imageDuPressePapiers(e: ClipboardEvent): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** Récupère une image depuis un glisser-déposer. */
export function imageDuDepot(e: DragEvent): Blob | null {
  const fichiers = e.dataTransfer?.files;
  if (fichiers) {
    for (const f of fichiers) {
      if (f.type.startsWith('image/')) return f;
    }
  }
  return null;
}
