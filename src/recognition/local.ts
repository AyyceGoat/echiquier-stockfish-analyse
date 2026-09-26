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

import { SILHOUETTES } from './gabarits-pieces.ts';
import {
  ErreurReconnaissance,
  plateauVide,
  type CaseReconnue,
  type OptionsReconnaissance,
  type PositionRecognizer,
  type ResultatReconnaissance,
} from './types.ts';

const TAILLE_TRAVAIL = 512;
const TAILLE_GABARIT = 64;
const TYPES: readonly string[] = ['k', 'q', 'r', 'b', 'n', 'p'];

interface Grille {
  x: number[];
  y: number[];
  pas: number;
  /**
   * Qualité de l'ajustement, 0–1.
   *
   * Elle manquait, et c'est ce qui rendait la reconnaissance dangereuse :
   * mesurée sur une image rognée de 4 %, la lecture tombait à trente-deux
   * cases justes sur soixante-quatre tout en annonçant 0,95 de confiance.
   * L'écran de correction ne signalait donc rien, et le joueur repartait avec
   * une position fausse qu'il croyait vérifiée.
   *
   * Deux signes trahissent une grille mal posée : les deux axes ne
   * s'accordent pas sur le même pas, et la grille ne couvre pas l'image.
   */
  ajustement: number;
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
    // `<=` et non `<` : une capture d'écran rognée sur l'échiquier le fait
    // occuper l'image entière. Exclure ce cas faisait verrouiller la
    // détection sur un demi-pas, et sept cases sur huit disparaissaient.
    if (etendue > taille) break;
    for (let debut = 0; debut + etendue <= taille; debut += 1) {
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
      // Aucune normalisation par le pas : le score additionne toujours neuf
      // échantillons, quel que soit l'écartement, il n'y a donc pas de biais
      // de taille à corriger. En diviser le score pénalisait au contraire la
      // vraie grille — sur une capture rognée, l'énergie aux bonnes lignes
      // vaut sept fois celle du reste de l'image, elle gagne d'elle-même.
      // À égalité, on retient le plus grand pas : une grille deux fois trop
      // fine décrit le même dessin mais découpe un quart de l'échiquier.
      if (!meilleur || score > meilleur.score || (score === meilleur.score && pas > meilleur.pas)) {
        meilleur = { debut, pas, score };
      }
    }
  }
  return meilleur;
}

function detecterGrille(gris: Float32Array, l: number, h: number): Grille {
  const { x, y } = energies(gris, l, h);

  const pasMin = Math.max(8, Math.floor(Math.min(l, h) / 40));
  // Le pas maximal doit inclure le cas où l'échiquier occupe toute l'image.
  const pasMaxX = Math.floor(l / 8);
  const pasMaxY = Math.floor(h / 8);

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

  // Accord entre les deux axes : sur un échiquier vu de face et cadré, les
  // pas détectés horizontalement et verticalement sont presque identiques.
  const accord = Math.min(px.pas, py.pas) / Math.max(px.pas, py.pas);
  // Couverture : un échiquier photographié occupe l'essentiel de l'image. Une
  // grille qui n'en couvre qu'une fraction a été posée sur autre chose.
  const couverture = Math.min(1, (pas * 8) / Math.min(l, h));
  const ajustement = Math.max(0, Math.min(1, accord * couverture));

  return {
    x: Array.from({ length: 9 }, (_, i) => Math.min(debutX + i * pas, l - 1)),
    y: Array.from({ length: 9 }, (_, i) => Math.min(debutY + i * pas, h - 1)),
    pas,
    ajustement,
  };
}

/** Gabarits de silhouettes, rendus une seule fois puis mémorisés. */
let gabarits: Map<string, Uint8Array> | null = null;
let constructionEnCours: Promise<Map<string, Uint8Array>> | null = null;

/**
 * Rend les silhouettes du jeu cburnett en masques binaires.
 *
 * La silhouette est prise sur le canal ALPHA, pas sur la luminance : le SVG
 * d'une pièce blanche est un aplat blanc cerné de noir, et le binariser sur
 * la luminance ne garderait que le contour. L'alpha donne exactement la
 * surface occupée par la pièce, ce que produit aussi le masque d'une case.
 */
function construireGabarits(): Promise<Map<string, Uint8Array>> {
  if (gabarits) return Promise.resolve(gabarits);
  if (constructionEnCours) return constructionEnCours;

  constructionEnCours = (async () => {
    const m = new Map<string, Uint8Array>();
    const canvas = document.createElement('canvas');
    canvas.width = TAILLE_GABARIT;
    canvas.height = TAILLE_GABARIT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return m;

    for (const type of TYPES) {
      const b64 = SILHOUETTES[type];
      if (!b64) continue;
      try {
        const img = await new Promise<HTMLImageElement>((resoudre, rejeter) => {
          const el = new Image();
          el.onload = () => resoudre(el);
          el.onerror = () => rejeter(new Error(type));
          el.src = `data:image/svg+xml;base64,${b64}`;
        });

        ctx.clearRect(0, 0, TAILLE_GABARIT, TAILLE_GABARIT);
        ctx.drawImage(img, 0, 0, TAILLE_GABARIT, TAILLE_GABARIT);
        const px = ctx.getImageData(0, 0, TAILLE_GABARIT, TAILLE_GABARIT).data;
        const masque = new Uint8Array(TAILLE_GABARIT * TAILLE_GABARIT);
        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          masque[j] = px[i + 3] > 64 ? 1 : 0;
        }
        m.set(type, recadrer(masque, TAILLE_GABARIT, TAILLE_GABARIT));
      } catch {
        // Une silhouette manquante dégrade la précision sans empêcher
        // la reconnaissance : les autres types restent comparables.
      }
    }

    gabarits = m;
    return m;
  })();

  return constructionEnCours;
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

/** Intersection sur union entre deux masques de même taille, sur une bande. */
function iouBande(a: Uint8Array, b: Uint8Array, ligneDebut: number, ligneFin: number): number {
  let inter = 0;
  let union = 0;
  for (let y = ligneDebut; y < ligneFin; y++) {
    for (let x = 0; x < TAILLE_GABARIT; x++) {
      const i = y * TAILLE_GABARIT + x;
      const p = a[i];
      const q = b[i];
      if (p || q) union += 1;
      if (p && q) inter += 1;
    }
  }
  return union === 0 ? 0 : inter / union;
}

/**
 * Profil de largeur : part de pixels remplis sur chacune des 8 bandes
 * horizontales de la silhouette. Décrit la forme générale de la pièce —
 * une tour a des flancs parallèles, une dame s'évase à la base et se
 * resserre au col — là où l'intersection sur union ne voit qu'un
 * recouvrement global.
 */
function profilLargeur(masque: Uint8Array): number[] {
  const bandes = 8;
  const hauteurBande = TAILLE_GABARIT / bandes;
  const profil: number[] = [];
  for (let k = 0; k < bandes; k++) {
    let compte = 0;
    const debut = Math.round(k * hauteurBande);
    const fin = Math.round((k + 1) * hauteurBande);
    for (let y = debut; y < fin; y++) {
      for (let x = 0; x < TAILLE_GABARIT; x++) {
        if (masque[y * TAILLE_GABARIT + x]) compte += 1;
      }
    }
    profil.push(compte / Math.max(1, (fin - debut) * TAILLE_GABARIT));
  }
  return profil;
}

/**
 * Ressemblance entre une case et un gabarit.
 *
 * Trois signaux complémentaires :
 *  - l'intersection sur union globale, qui mesure le recouvrement ;
 *  - la même mesure sur le tiers supérieur, seul endroit où le roi et la
 *    dame diffèrent (une croix contre une couronne à pointes) ;
 *  - le profil de largeur, qui sépare la dame de la tour — recouvrement
 *    voisin, mais silhouettes de formes différentes.
 */
function ressemblance(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const global = iouBande(a, b, 0, TAILLE_GABARIT);
  const sommet = iouBande(a, b, 0, Math.round(TAILLE_GABARIT * 0.38));

  const pa = profilLargeur(a);
  const pb = profilLargeur(b);
  let ecart = 0;
  for (let i = 0; i < pa.length; i++) ecart += Math.abs(pa[i] - pb[i]);
  const profil = Math.max(0, 1 - ecart / pa.length / 0.35);

  return 0.58 * global + 0.3 * sommet + 0.12 * profil;
}

interface CaseAnalysee {
  occupee: boolean;
  masque: Uint8Array;
  /** Luminance médiane du trait de la pièce. */
  lumPiece: number;
  /** Luminance de fond de la case. */
  lumFond: number;
  ratioTrait: number;
  /** Part de la case plus claire que son fond. */
  partClaire: number;
  /** Part de la case plus sombre que son fond. */
  partSombre: number;
  /**
   * 75e centile de la luminance de l'INTÉRIEUR de la pièce (masque érodé).
   *
   * Pourquoi le 75e centile et non la médiane : les pièces sont dessinées
   * avec un aplat et un réseau de traits internes de la couleur opposée.
   * Sur une pièce claire, ces traits tirent la médiane vers le bas de façon
   * imprévisible — mesurée entre 34 et 255 selon le type de pièce — alors
   * que le 75e centile vaut 255 pour toute pièce claire et reste sous 20
   * pour toute pièce foncée. La séparation est nette et ne dépend ni du
   * type de pièce ni de la couleur de la case.
   */
  lumInterieur: number | null;
}

/** Géométrie utile d'une case : zone intérieure, hors lignes de grille. */
function zoneInterieure(x0: number, y0: number, pas: number) {
  const marge = Math.max(1, Math.round(pas * 0.12));
  return { dx: x0 + marge, dy: y0 + marge, cote: Math.max(2, pas - 2 * marge) };
}

/**
 * Couleur de fond d'une case, estimée sur son anneau de bordure.
 * Sert de PREMIÈRE passe : les valeurs des 64 cases sont ensuite regroupées
 * par parité pour obtenir les deux couleurs de l'échiquier.
 */
function fondDeCase(gris: Float32Array, l: number, x0: number, y0: number, pas: number): number {
  const { dx, dy, cote } = zoneInterieure(x0, y0, pas);
  const m2 = Math.max(1, Math.round(cote * 0.16));
  const bordure: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (x >= m2 && y >= m2 && x < cote - m2 && y < cote - m2) continue;
      const v = gris[(dy + y) * l + (dx + x)];
      if (Number.isFinite(v)) bordure.push(v);
    }
  }
  if (bordure.length === 0) return 128;
  bordure.sort((a, b) => a - b);
  return bordure[Math.floor(bordure.length / 2)];
}

/**
 * Analyse d'une case, avec un fond et un seuil imposés.
 *
 * Le seuil ne peut pas être estimé sur la case elle-même : les pièces du jeu
 * cburnett débordent sur l'anneau de bordure, ce qui gonflait le seuil au
 * point d'exclure le remplissage blanc d'une pièce claire sur case claire —
 * seul son trait noir restait, et toute la rangée des blancs était lue comme
 * noire. Les deux paramètres viennent donc d'une analyse globale de l'image.
 */
function analyserCase(
  gris: Float32Array,
  l: number,
  x0: number,
  y0: number,
  pas: number,
  lumFond: number,
  seuil: number,
): CaseAnalysee {
  const { dx, dy, cote } = zoneInterieure(x0, y0, pas);

  const valeurs: number[] = [];
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const v = gris[(dy + y) * l + (dx + x)];
      // Une case en bord d'image peut déborder de quelques pixels : on
      // ignore ces lectures plutôt que d'injecter des NaN dans les calculs.
      if (Number.isFinite(v)) valeurs.push(v);
    }
  }
  if (valeurs.length === 0) {
    return {
      occupee: false,
      masque: new Uint8Array(0),
      lumPiece: 0,
      lumFond,
      ratioTrait: 0,
      partClaire: 0,
      partSombre: 0,
      lumInterieur: null,
    };
  }

  const hauteur = Math.max(1, Math.floor(valeurs.length / cote));
  const brut = new Uint8Array(valeurs.length);
  const lumsTrait: number[] = [];
  let compte = 0;
  for (let i = 0; i < valeurs.length; i++) {
    if (Math.abs(valeurs[i] - lumFond) > seuil) {
      brut[i] = 1;
      lumsTrait.push(valeurs[i]);
      compte += 1;
    }
  }

  // La couleur se lit sur l'INTÉRIEUR de la pièce, pas sur toute sa surface.
  // Les jeux de pièces dessinent un aplat cerné d'un trait épais de la
  // couleur opposée : compter toute la surface faisait basculer les tours et
  // les fous blancs du côté noir, parce que leur trait couvre presque autant
  // de pixels que leur remplissage. Une érosion fait disparaître ce trait et
  // ne laisse que l'aplat, qui porte la vraie couleur.
  let clairs = 0;
  let sombres = 0;
  const interieur: number[] = [];
  for (let y = 1; y < hauteur - 1; y++) {
    for (let x = 1; x < cote - 1; x++) {
      const i = y * cote + x;
      if (!brut[i]) continue;
      if (!brut[i - 1] || !brut[i + 1] || !brut[i - cote] || !brut[i + cote]) continue;
      interieur.push(valeurs[i]);
      if (valeurs[i] > lumFond) clairs += 1;
      else sombres += 1;
    }
  }
  interieur.sort((a, b) => a - b);

  const ratioTrait = compte / valeurs.length;
  const lumsTriees = lumsTrait.sort((a, b) => a - b);
  const lumPiece = lumsTriees.length ? lumsTriees[Math.floor(lumsTriees.length / 2)] : lumFond;

  return {
    // En dessous de 6 % de pixels marqués, il ne s'agit que de bruit ou
    // d'un liseré de case, pas d'une pièce.
    occupee: ratioTrait > 0.06 && ratioTrait < 0.92,
    masque: recadrer(brut, cote, hauteur),
    lumPiece,
    lumFond,
    ratioTrait,
    partClaire: clairs / valeurs.length,
    partSombre: sombres / valeurs.length,
    lumInterieur: interieur.length >= 8 ? interieur[Math.floor(interieur.length * 0.75)] : null,
  };
}

/** Médiane d'une liste, sans la modifier. */
function mediane(v: number[]): number {
  if (v.length === 0) return 128;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

/**
 * Sépare les pièces en deux groupes de luminance (claires / foncées).
 * Ne sert plus que de recours quand la comparaison locale au fond de la
 * case est trop serrée pour trancher.
 */
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
    const gab = await construireGabarits();

    surProgression?.(0.5, 'Lecture des cases…');

    // Passe 1 : couleur de fond de chaque case, regroupée par parité.
    // Un échiquier n'a que deux couleurs de case : les estimer sur les 64
    // cases à la fois est bien plus robuste que case par case, où une grande
    // pièce fausse l'estimation.
    const fondsPairs: number[] = [];
    const fondsImpairs: number[] = [];
    const fondsBruts: number[][] = [];
    for (let r = 0; r < 8; r++) {
      const rangee: number[] = [];
      for (let c = 0; c < 8; c++) {
        const f = fondDeCase(gris, l, grille.x[c], grille.y[r], grille.pas);
        rangee.push(f);
        ((r + c) % 2 === 0 ? fondsPairs : fondsImpairs).push(f);
      }
      fondsBruts.push(rangee);
    }
    const fondPair = mediane(fondsPairs);
    const fondImpair = mediane(fondsImpairs);
    // Le seuil se règle sur le contraste entre les deux couleurs de case :
    // assez bas pour distinguer une pièce claire d'une case claire, assez
    // haut pour ignorer le bruit de compression.
    const contraste = Math.abs(fondPair - fondImpair);
    // Le seuil se règle sur le contraste entre les deux couleurs de case :
    // assez bas pour distinguer une pièce claire d'une case claire, assez
    // haut pour ignorer le bruit de compression. Mesuré : l'abaisser
    // davantage fait entrer le dégradé des bords dans la silhouette et
    // dégrade la reconnaissance au lieu de l'améliorer.
    const seuil = Math.max(18, Math.min(55, contraste * 0.55));

    // Passe 2 : occupation, aires et silhouettes.
    const cases: CaseAnalysee[][] = [];
    for (let r = 0; r < 8; r++) {
      const rangee: CaseAnalysee[] = [];
      for (let c = 0; c < 8; c++) {
        const fondAttendu = (r + c) % 2 === 0 ? fondPair : fondImpair;
        // Si la case s'écarte franchement de sa couleur théorique (ombre,
        // surbrillance du dernier coup), on lui laisse sa propre estimation.
        const fond =
          Math.abs(fondsBruts[r][c] - fondAttendu) > 45 ? fondsBruts[r][c] : fondAttendu;
        rangee.push(analyserCase(gris, l, grille.x[c], grille.y[r], grille.pas, fond, seuil));
      }
      cases.push(rangee);
      if (signal?.aborted) throw new DOMException('Reconnaissance annulée.', 'AbortError');
      // On rend la main entre chaque rangée : l'interface reste réactive.
      await cederLeThread();
    }

    // Sur un échiquier, les intérieurs de pièces ne prennent que deux
    // valeurs : très clair ou très foncé, indépendamment de la case. Les
    // regrouper sur l'ensemble de l'image sépare les deux camps bien plus
    // sûrement qu'une comparaison case par case, qui se fait piéger par les
    // pièces à contour épais comme la tour ou le fou.
    const interieurs = cases
      .flat()
      .filter((c) => c.occupee && c.lumInterieur !== null)
      .map((c) => c.lumInterieur as number);
    const seuilCouleur = separerCouleurs(interieurs);
    // Deux groupes trop proches = un seul camp présent, ou une image trop
    // plate : le regroupement n'a alors rien à dire et on retombe sur la
    // comparaison locale.
    const groupesSepares =
      interieurs.length >= 4 &&
      Math.max(...interieurs) - Math.min(...interieurs) >= 60;

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
          const s = ressemblance(info.masque, modele);
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

        // Couleur : le regroupement global tranche en premier, la
        // comparaison locale des aires ne sert que de recours.
        const ecartAires = info.partClaire - info.partSombre;
        const claire =
          groupesSepares && info.lumInterieur !== null
            ? info.lumInterieur >= seuilCouleur
            : Math.abs(ecartAires) > 0.01
              ? ecartAires > 0
              : info.lumPiece >= seuilCouleur;
        plateau[r][c] = claire ? meilleur.toUpperCase() : meilleur;

        // La confiance combine trois signaux : la qualité de l'appariement,
        // l'écart au deuxième candidat (deux silhouettes proches valent un
        // doute), et la netteté de la couleur — une case où les aires claire
        // et sombre s'équilibrent doit être vérifiée à l'œil.
        const marge = scoreMeilleur - scoreSecond;
        const nettete = Math.min(1, Math.abs(ecartAires) / 0.08);
        confiances[r][c] = Math.max(
          0.05,
          Math.min(0.95, (scoreMeilleur * 0.7 + Math.min(0.3, marge * 2)) * (0.55 + 0.45 * nettete)),
        );
      }
      await cederLeThread();
    }

    const confiancesPlates = confiances.flat();
    const moyenneCases =
      confiancesPlates.reduce((a, b) => a + b, 0) / confiancesPlates.length;
    /**
     * La confiance globale tient compte de la GRILLE, pas seulement des cases.
     *
     * Une grille mal posée produit soixante-quatre lectures chacune
     * plausible — chaque découpe contient bien quelque chose — mais toutes
     * décalées. La moyenne par case reste alors élevée et ment. On la
     * multiplie donc par la qualité de l'ajustement.
     */
    const confianceGlobale = moyenneCases * grille.ajustement;

    const remarques: string[] = [
      'Reconnaissance locale : les types de pièces sont déduits de leur silhouette. Vérifiez chaque case signalée.',
    ];
    if (grille.ajustement < 0.85) {
      remarques.push(
        "Le quadrillage n'a pas été retrouvé franchement : l'échiquier est peut-être rogné, vu de biais, ou ne remplit pas l'image. Vérifiez chaque case.",
      );
    }
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
