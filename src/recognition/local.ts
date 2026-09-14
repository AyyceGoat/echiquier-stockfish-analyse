/**
 * Reconnaissance locale, sans réseau.
 *
 * Choix d'implémentation — pourquoi pas un CNN TensorFlow.js :
 * un classifieur 13 classes suppose un jeu de données étiqueté et un
 * entraînement, qu'on ne peut ni produire ni embarquer ici ; et un modèle
 * pré-entraîné ajouterait plusieurs Mo à télécharger, contre le budget de
 * performance mobile. On utilise donc une chaîne géométrique classique :
 *
 *   1. détection de la grille par énergie de gradient (9 lignes par axe) ;
 *   2. découpage en 64 cases ;
 *   3. extraction du « trait » de la pièce par écart à la couleur de case ;
 *   4. classification par comparaison de silhouettes (intersection sur union)
 *      avec des gabarits rendus à partir des glyphes d'échecs Unicode.
 *
 * Résultat : très correct sur capture d'écran d'échiquier numérique (le cas
 * le plus fréquent), moyen sur photo d'échiquier en bois, faible sur photo
 * de biais. Les cases douteuses ressortent avec une confiance basse et
 * l'écran de correction prend le relais. Aucun octet ne quitte l'appareil.
 */

import {
  ErreurReconnaissance,
  plateauVide,
  type CaseReconnue,
  type OptionsReconnaissance,
  type PositionRecognizer,
  type ResultatReconnaissance,
} from './types.ts';

const TAILLE_TRAVAIL = 512;
const TAILLE_GABARIT = 48;
const TYPES: readonly string[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const GLYPHES: Record<string, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

interface Grille {
  x: number[];
  y: number[];
  pas: number;
}

/** Rend l'image dans un canvas de travail et renvoie ses pixels. */
async function pixelsDeLImage(source: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resoudre, rejeter) => {
      const el = new Image();
      el.onload = () => resoudre(el);
      el.onerror = () => rejeter(new ErreurReconnaissance("L'image n'a pas pu être décodée."));
      el.src = url;
    });

    const facteur = Math.min(1, TAILLE_TRAVAIL / Math.max(img.naturalWidth, img.naturalHeight));
    const l = Math.max(8, Math.round(img.naturalWidth * facteur));
    const h = Math.max(8, Math.round(img.naturalHeight * facteur));

    const canvas = document.createElement('canvas');
    canvas.width = l;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ErreurReconnaissance("Le rendu sur canvas n'est pas disponible.");
    ctx.drawImage(img, 0, 0, l, h);
    return ctx.getImageData(0, 0, l, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Luminance perçue, 0–255. */
function versGris(data: ImageData): Float32Array {
  const { width, height, data: px } = data;
  const gris = new Float32Array(width * height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    gris[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  }
  return gris;
}

/** Énergie de gradient par colonne (axe x) et par ligne (axe y). */
function energies(gris: Float32Array, l: number, h: number): { x: Float32Array; y: Float32Array } {
  const x = new Float32Array(l);
  const y = new Float32Array(h);
  for (let j = 0; j < h; j++) {
    for (let i = 1; i < l; i++) {
      const d = Math.abs(gris[j * l + i] - gris[j * l + i - 1]);
      x[i] += d;
    }
  }
  for (let j = 1; j < h; j++) {
    for (let i = 0; i < l; i++) {
      const d = Math.abs(gris[j * l + i] - gris[(j - 1) * l + i]);
      y[j] += d;
    }
  }
  return { x, y };
}

/**
 * Cherche la meilleure progression de 9 lignes équidistantes.
 * On teste tous les couples (origine, pas) plausibles : c'est peu coûteux
 * sur une image de 512 px et bien plus robuste qu'une détection de pics.
 */
function meilleureProgression(
  energie: Float32Array,
  taille: number,
  pasMin: number,
  pasMax: number,
): { debut: number; pas: number; score: number } | null {
  let meilleur: { debut: number; pas: number; score: number } | null = null;

  for (let pas = pasMin; pas <= pasMax; pas += 1) {
    const etendue = pas * 8;
    if (etendue >= taille) break;
    for (let debut = 0; debut + etendue < taille; debut += 1) {
      let score = 0;
      for (let k = 0; k <= 8; k++) {
        const centre = Math.round(debut + k * pas);
        // Tolérance de ±1 px : la grille n'est jamais parfaitement alignée.
        let local = 0;
        for (let d = -1; d <= 1; d++) {
          const i = centre + d;
          if (i >= 0 && i < taille) local = Math.max(local, energie[i]);
        }
        score += local;
      }
      // On divise par le pas : sans cela les grands pas gagnent toujours,
      // puisqu'ils couvrent une bande d'image plus large.
      const normalise = score / Math.sqrt(pas);
      if (!meilleur || normalise > meilleur.score) {
        meilleur = { debut, pas, score: normalise };
      }
    }
  }
  return meilleur;
}

function detecterGrille(gris: Float32Array, l: number, h: number): Grille {
  const { x, y } = energies(gris, l, h);

  const pasMin = Math.max(8, Math.floor(Math.min(l, h) / 40));
  const pasMaxX = Math.floor((l - 1) / 8);
  const pasMaxY = Math.floor((h - 1) / 8);

  const px = meilleureProgression(x, l, pasMin, pasMaxX);
  const py = meilleureProgression(y, h, pasMin, pasMaxY);

  if (!px || !py) {
    throw new ErreurReconnaissance(
      "Aucun échiquier n'a été détecté dans l'image.",
      "Cadrez l'échiquier bien à plat et de face, en remplissant la photo.",
    );
  }

  // L'échiquier est carré : on force le même pas sur les deux axes en
  // retenant celui qui a le meilleur score, puis on recentre l'autre.
  const pas = px.score >= py.score ? px.pas : py.pas;
  const recentrer = (
    debut: number,
    pasOrigine: number,
    taille: number,
  ): number => {
    const centre = debut + (pasOrigine * 8) / 2;
    return Math.max(0, Math.min(taille - pas * 8, Math.round(centre - (pas * 8) / 2)));
  };

  const debutX = px.pas === pas ? px.debut : recentrer(px.debut, px.pas, l);
  const debutY = py.pas === pas ? py.debut : recentrer(py.debut, py.pas, h);

  return {
    x: Array.from({ length: 9 }, (_, i) => debutX + i * pas),
    y: Array.from({ length: 9 }, (_, i) => debutY + i * pas),
    pas,
  };
}

/** Gabarits de silhouettes, rendus une seule fois puis mémorisés. */
let gabarits: Map<string, Uint8Array> | null = null;

function construireGabarits(): Map<string, Uint8Array> {
  if (gabarits) return gabarits;
  const m = new Map<string, Uint8Array>();
  const canvas = document.createElement('canvas');
  canvas.width = TAILLE_GABARIT;
  canvas.height = TAILLE_GABARIT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return m;

  for (const type of TYPES) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TAILLE_GABARIT, TAILLE_GABARIT);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(TAILLE_GABARIT * 0.86)}px "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", serif`;
    ctx.fillText(GLYPHES[type], TAILLE_GABARIT / 2, TAILLE_GABARIT / 2);

    const px = ctx.getImageData(0, 0, TAILLE_GABARIT, TAILLE_GABARIT).data;
    const masque = new Uint8Array(TAILLE_GABARIT * TAILLE_GABARIT);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      masque[j] = px[i] < 128 ? 1 : 0;
    }
    m.set(type, recadrer(masque, TAILLE_GABARIT, TAILLE_GABARIT));
  }

  gabarits = m;
  return m;
}

/** Recadre un masque sur sa boîte englobante puis le remet à l'échelle du gabarit. */
function recadrer(masque: Uint8Array, l: number, h: number): Uint8Array {
  let minX = l;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      if (masque[y * l + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const sortie = new Uint8Array(TAILLE_GABARIT * TAILLE_GABARIT);
  if (maxX < minX || maxY < minY) return sortie;

  const bl = maxX - minX + 1;
  const bh = maxY - minY + 1;
  // On conserve les proportions : un pion écrasé ressemblerait à une tour.
  const cote = Math.max(bl, bh);
  const decX = minX - (cote - bl) / 2;
  const decY = minY - (cote - bh) / 2;

  for (let y = 0; y < TAILLE_GABARIT; y++) {
    for (let x = 0; x < TAILLE_GABARIT; x++) {
      const sx = Math.round(decX + (x * cote) / TAILLE_GABARIT);
      const sy = Math.round(decY + (y * cote) / TAILLE_GABARIT);
      if (sx >= 0 && sx < l && sy >= 0 && sy < h) {
        sortie[y * TAILLE_GABARIT + x] = masque[sy * l + sx];
      }
    }
  }
  return sortie;
}

/** Intersection sur union entre deux masques de même taille. */
function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x || y) union += 1;
    if (x && y) inter += 1;
  }
  return union === 0 ? 0 : inter / union;
}

interface CaseAnalysee {
  occupee: boolean;
  masque: Uint8Array;
  /** Luminance médiane du trait de la pièce. */
  lumPiece: number;
  /** Luminance de fond de la case. */
  lumFond: number;
  ratioTrait: number;
}

function analyserCase(
  gris: Float32Array,
  l: number,
  x0: number,
  y0: number,
  pas: number,
): CaseAnalysee {
  // Marge intérieure : on écarte les bordures, qui portent les lignes de grille.
  const marge = Math.max(1, Math.round(pas * 0.12));
  const dx = x0 + marge;
  const dy = y0 + marge;
  const cote = Math.max(2, pas - 2 * marge);

  const valeurs: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      valeurs.push(gris[(dy + y) * l + (dx + x)]);
    }
  }

  // Le fond de la case est la valeur la plus représentée : on l'approche par
  // la médiane, insensible aux pixels de la pièce tant qu'elle n'occupe pas
  // plus de la moitié de la case.
  const triees = [...valeurs].sort((a, b) => a - b);
  const lumFond = triees[Math.floor(triees.length / 2)];

  // Seuil adaptatif : sur une capture d'écran nette un écart de 25 suffit,
  // sur une photo bruitée il faut monter.
  const ecart = triees[Math.floor(triees.length * 0.9)] - triees[Math.floor(triees.length * 0.1)];
  const seuil = Math.max(22, Math.min(70, ecart * 0.45));

  const brut = new Uint8Array(cote * cote);
  const lumsTrait: number[] = [];
  let compte = 0;
  for (let i = 0; i < valeurs.length; i++) {
    if (Math.abs(valeurs[i] - lumFond) > seuil) {
      brut[i] = 1;
      lumsTrait.push(valeurs[i]);
      compte += 1;
    }
  }

  const ratioTrait = compte / valeurs.length;
  const lumsTriees = lumsTrait.sort((a, b) => a - b);
  const lumPiece = lumsTriees.length
    ? lumsTriees[Math.floor(lumsTriees.length / 2)]
    : lumFond;

  return {
    // En dessous de 6 % de pixels marqués, il ne s'agit que de bruit ou
    // d'un liseré de case, pas d'une pièce.
    occupee: ratioTrait > 0.06 && ratioTrait < 0.92,
    masque: recadrer(brut, cote, cote),
    lumPiece,
    lumFond,
    ratioTrait,
  };
}

/** Sépare les pièces en deux groupes de luminance (claires / foncées). */
function separerCouleurs(lums: number[]): number {
  if (lums.length === 0) return 128;
  const min = Math.min(...lums);
  const max = Math.max(...lums);
  if (max - min < 30) return (min + max) / 2;

  // k-moyennes à deux centres, quelques itérations suffisent.
  let cA = min;
  let cB = max;
  for (let it = 0; it < 12; it++) {
    const gA: number[] = [];
    const gB: number[] = [];
    for (const v of lums) (Math.abs(v - cA) <= Math.abs(v - cB) ? gA : gB).push(v);
    if (gA.length === 0 || gB.length === 0) break;
    cA = gA.reduce((a, b) => a + b, 0) / gA.length;
    cB = gB.reduce((a, b) => a + b, 0) / gB.length;
  }
  return (cA + cB) / 2;
}

function cederLeThread(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export class ReconnaissanceLocale implements PositionRecognizer {
  readonly id = 'locale';
  readonly nom = 'Reconnaissance locale (hors ligne)';
  readonly description =
    "Analyse l'image sur l'appareil, sans aucun envoi réseau. Fiable sur capture d'écran d'échiquier numérique, approximative sur photo d'échiquier physique.";
  readonly horsLigne = true;

  async verifierDisponibilite(): Promise<{ disponible: boolean; raison?: string }> {
    if (typeof document === 'undefined' || !document.createElement('canvas').getContext('2d')) {
      return { disponible: false, raison: "Le rendu sur canvas n'est pas disponible." };
    }
    return { disponible: true };
  }

  async reconnaitre(
    image: Blob,
    options: OptionsReconnaissance = {},
  ): Promise<ResultatReconnaissance> {
    const { signal, surProgression } = options;

    surProgression?.(0.1, "Lecture de l'image…");
    const donnees = await pixelsDeLImage(image);
    const l = donnees.width;
    const h = donnees.height;
    const gris = versGris(donnees);

    surProgression?.(0.3, "Détection de l'échiquier…");
    const grille = detecterGrille(gris, l, h);
    const gab = construireGabarits();

    surProgression?.(0.5, 'Lecture des cases…');

    // Passe 1 : occupation et luminances.
    const cases: CaseAnalysee[][] = [];
    for (let r = 0; r < 8; r++) {
      const rangee: CaseAnalysee[] = [];
      for (let c = 0; c < 8; c++) {
        rangee.push(analyserCase(gris, l, grille.x[c], grille.y[r], grille.pas));
      }
      cases.push(rangee);
      if (signal?.aborted) throw new DOMException('Reconnaissance annulée.', 'AbortError');
      // On rend la main entre chaque rangée : l'interface reste réactive.
      await cederLeThread();
    }

    const lumsPieces = cases.flat().filter((c) => c.occupee).map((c) => c.lumPiece);
    const seuilCouleur = separerCouleurs(lumsPieces);

    surProgression?.(0.8, 'Identification des pièces…');

    const plateau: CaseReconnue[][] = plateauVide();
    const confiances: number[][] = Array.from({ length: 8 }, () => Array<number>(8).fill(1));

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const info = cases[r][c];
        if (!info.occupee) {
          plateau[r][c] = null;
          // Une case franchement vide est très sûre ; une case limite l'est moins.
          confiances[r][c] = info.ratioTrait < 0.03 ? 0.95 : 0.6;
          continue;
        }

        let meilleur = '';
        let scoreMeilleur = 0;
        let scoreSecond = 0;
        for (const type of TYPES) {
          const modele = gab.get(type);
          if (!modele) continue;
          const s = iou(info.masque, modele);
          if (s > scoreMeilleur) {
            scoreSecond = scoreMeilleur;
            scoreMeilleur = s;
            meilleur = type;
          } else if (s > scoreSecond) {
            scoreSecond = s;
          }
        }

        if (!meilleur) {
          plateau[r][c] = null;
          confiances[r][c] = 0.2;
          continue;
        }

        const claire = info.lumPiece >= seuilCouleur;
        plateau[r][c] = claire ? meilleur.toUpperCase() : meilleur;

        // La confiance combine la qualité de l'appariement et l'écart au
        // deuxième candidat : deux silhouettes proches valent un doute.
        const marge = scoreMeilleur - scoreSecond;
        confiances[r][c] = Math.max(
          0.05,
          Math.min(0.95, scoreMeilleur * 0.7 + Math.min(0.3, marge * 2)),
        );
      }
      await cederLeThread();
    }

    const confiancesPlates = confiances.flat();
    const confianceGlobale =
      confiancesPlates.reduce((a, b) => a + b, 0) / confiancesPlates.length;

    const remarques: string[] = [
      'Reconnaissance locale : les types de pièces sont déduits de leur silhouette. Vérifiez chaque case signalée.',
    ];
    if (confianceGlobale < 0.5) {
      remarques.push(
        "La confiance est faible. Sur photo d'échiquier physique, la reconnaissance par modèle donne de bien meilleurs résultats.",
      );
    }

    surProgression?.(1, 'Position reconnue');

    return {
      plateau,
      confiances,
      orientation: 'blancs-en-bas',
      confianceGlobale,
      remarques,
      source: this.id,
    };
  }
}
