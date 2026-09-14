/**
 * Petit répertoire d'ouvertures, en notation algébrique abrégée (SAN).
 *
 * On n'embarque pas une base ECO complète (plusieurs Mo) : sur mobile le coût
 * de chargement ne se justifie pas. Ces ~130 lignes couvrent l'essentiel de ce
 * qu'un joueur rencontre réellement, et servent à deux choses :
 *  - nommer l'ouverture jouée,
 *  - éviter de reprocher une « imprécision » sur un coup de théorie connu.
 */

export interface Ouverture {
  eco: string;
  nom: string;
  /** Coups en SAN, séparés par des espaces. */
  coups: string;
}

export const OUVERTURES: Ouverture[] = [
  { eco: 'A00', nom: 'Ouverture Polonaise', coups: 'b4' },
  { eco: 'A01', nom: 'Ouverture Nimzowitsch-Larsen', coups: 'b3' },
  { eco: 'A02', nom: "Ouverture Bird", coups: 'f4' },
  { eco: 'A04', nom: 'Ouverture Réti', coups: 'Nf3' },
  { eco: 'A07', nom: "Attaque indienne du Roi", coups: 'Nf3 d5 g3' },
  { eco: 'A10', nom: 'Ouverture anglaise', coups: 'c4' },
  { eco: 'A15', nom: 'Anglaise, défense anglo-indienne', coups: 'c4 Nf6' },
  { eco: 'A20', nom: 'Anglaise, variante du Roi', coups: 'c4 e5' },
  { eco: 'A30', nom: 'Anglaise symétrique', coups: 'c4 c5' },
  { eco: 'A40', nom: 'Ouverture du pion Dame', coups: 'd4' },
  { eco: 'A45', nom: 'Défense indienne', coups: 'd4 Nf6' },
  { eco: 'A46', nom: 'Partie indienne, système de Londres', coups: 'd4 Nf6 Nf3 e6 Bf4' },
  { eco: 'D02', nom: 'Système de Londres', coups: 'd4 d5 Nf3 Nf6 Bf4' },
  { eco: 'A48', nom: "Défense est-indienne, système de Torre", coups: 'd4 Nf6 Nf3 g6 Bg5' },
  { eco: 'A56', nom: 'Défense Benoni', coups: 'd4 Nf6 c4 c5' },
  { eco: 'A57', nom: 'Gambit Benko', coups: 'd4 Nf6 c4 c5 d5 b5' },
  { eco: 'A80', nom: 'Défense hollandaise', coups: 'd4 f5' },
  { eco: 'A84', nom: 'Hollandaise, variante classique', coups: 'd4 f5 c4 e6' },
  { eco: 'A87', nom: 'Hollandaise Leningrad', coups: 'd4 f5 c4 Nf6 g3 g6' },

  { eco: 'B00', nom: 'Ouverture du pion Roi', coups: 'e4' },
  { eco: 'B00', nom: 'Défense Nimzowitsch', coups: 'e4 Nc6' },
  { eco: 'B01', nom: 'Défense scandinave', coups: 'e4 d5' },
  { eco: 'B01', nom: 'Scandinave, variante principale', coups: 'e4 d5 exd5 Qxd5 Nc3 Qa5' },
  { eco: 'B02', nom: "Défense Alekhine", coups: 'e4 Nf6' },
  { eco: 'B06', nom: 'Défense moderne', coups: 'e4 g6' },
  { eco: 'B07', nom: 'Défense Pirc', coups: 'e4 d6 d4 Nf6 Nc3' },
  { eco: 'B10', nom: 'Défense Caro-Kann', coups: 'e4 c6' },
  { eco: 'B12', nom: 'Caro-Kann, variante d’avance', coups: 'e4 c6 d4 d5 e5' },
  { eco: 'B13', nom: "Caro-Kann, variante d'échange", coups: 'e4 c6 d4 d5 exd5 cxd5' },
  { eco: 'B15', nom: 'Caro-Kann, variante classique', coups: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { eco: 'B18', nom: 'Caro-Kann, variante Karpov', coups: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7' },
  { eco: 'B20', nom: 'Défense sicilienne', coups: 'e4 c5' },
  { eco: 'B21', nom: 'Sicilienne, gambit Smith-Morra', coups: 'e4 c5 d4 cxd4 c3' },
  { eco: 'B22', nom: 'Sicilienne, variante Alapine', coups: 'e4 c5 c3' },
  { eco: 'B23', nom: 'Sicilienne fermée', coups: 'e4 c5 Nc3' },
  { eco: 'B27', nom: 'Sicilienne, variante Hyper-accélérée', coups: 'e4 c5 Nf3 g6' },
  { eco: 'B30', nom: 'Sicilienne, variante Rossolimo', coups: 'e4 c5 Nf3 Nc6 Bb5' },
  { eco: 'B32', nom: 'Sicilienne, variante Kalachnikov', coups: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5' },
  { eco: 'B33', nom: 'Sicilienne, variante Sveshnikov', coups: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5' },
  { eco: 'B40', nom: 'Sicilienne, variante Paulsen', coups: 'e4 c5 Nf3 e6' },
  { eco: 'B44', nom: 'Sicilienne, variante Taïmanov', coups: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6' },
  { eco: 'B50', nom: 'Sicilienne, variante Moscou', coups: 'e4 c5 Nf3 d6 Bb5+' },
  { eco: 'B54', nom: 'Sicilienne ouverte', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4' },
  { eco: 'B70', nom: 'Sicilienne, variante du Dragon', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6' },
  { eco: 'B76', nom: 'Dragon, attaque yougoslave', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3' },
  { eco: 'B80', nom: 'Sicilienne, variante Scheveningue', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6' },
  { eco: 'B90', nom: 'Sicilienne, variante Najdorf', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { eco: 'B92', nom: 'Najdorf, variante Opotchenski', coups: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2' },

  { eco: 'C00', nom: 'Défense française', coups: 'e4 e6' },
  { eco: 'C02', nom: "Française, variante d'avance", coups: 'e4 e6 d4 d5 e5' },
  { eco: 'C03', nom: 'Française, variante Tarrasch', coups: 'e4 e6 d4 d5 Nd2' },
  { eco: 'C10', nom: 'Française, variante Rubinstein', coups: 'e4 e6 d4 d5 Nc3 dxe4' },
  { eco: 'C11', nom: 'Française, variante classique', coups: 'e4 e6 d4 d5 Nc3 Nf6' },
  { eco: 'C15', nom: 'Française, variante Winawer', coups: 'e4 e6 d4 d5 Nc3 Bb4' },
  { eco: 'C20', nom: 'Partie du pion Roi', coups: 'e4 e5' },
  { eco: 'C21', nom: 'Gambit du Centre', coups: 'e4 e5 d4 exd4' },
  { eco: 'C23', nom: 'Partie du Fou', coups: 'e4 e5 Bc4' },
  { eco: 'C25', nom: 'Partie viennoise', coups: 'e4 e5 Nc3' },
  { eco: 'C30', nom: 'Gambit du Roi', coups: 'e4 e5 f4' },
  { eco: 'C33', nom: 'Gambit du Roi accepté', coups: 'e4 e5 f4 exf4' },
  { eco: 'C41', nom: 'Défense Philidor', coups: 'e4 e5 Nf3 d6' },
  { eco: 'C42', nom: 'Défense russe (Petroff)', coups: 'e4 e5 Nf3 Nf6' },
  { eco: 'C44', nom: 'Partie écossaise', coups: 'e4 e5 Nf3 Nc6 d4' },
  { eco: 'C45', nom: 'Écossaise, variante principale', coups: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
  { eco: 'C46', nom: 'Partie des trois Cavaliers', coups: 'e4 e5 Nf3 Nc6 Nc3' },
  { eco: 'C47', nom: 'Partie des quatre Cavaliers', coups: 'e4 e5 Nf3 Nc6 Nc3 Nf6' },
  { eco: 'C50', nom: 'Partie italienne', coups: 'e4 e5 Nf3 Nc6 Bc4' },
  { eco: 'C50', nom: 'Giuoco Piano', coups: 'e4 e5 Nf3 Nc6 Bc4 Bc5' },
  { eco: 'C53', nom: 'Italienne, variante classique', coups: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3' },
  { eco: 'C55', nom: 'Défense des deux Cavaliers', coups: 'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { eco: 'C57', nom: 'Deux Cavaliers, attaque Fried Liver', coups: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5' },
  { eco: 'C60', nom: 'Partie espagnole (Ruy Lopez)', coups: 'e4 e5 Nf3 Nc6 Bb5' },
  { eco: 'C63', nom: 'Espagnole, défense Schliemann', coups: 'e4 e5 Nf3 Nc6 Bb5 f5' },
  { eco: 'C64', nom: 'Espagnole, défense classique', coups: 'e4 e5 Nf3 Nc6 Bb5 Bc5' },
  { eco: 'C65', nom: 'Espagnole, défense berlinoise', coups: 'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { eco: 'C68', nom: "Espagnole, variante d'échange", coups: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6' },
  { eco: 'C70', nom: 'Espagnole, variante Morphy', coups: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4' },
  { eco: 'C78', nom: 'Espagnole, attaque Archangelsk', coups: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O b5 Bb3 Bb7' },
  { eco: 'C84', nom: 'Espagnole fermée', coups: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7' },
  { eco: 'C88', nom: 'Espagnole, variante Marshall', coups: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5' },

  { eco: 'D00', nom: 'Gambit Dame refusé, variante Veresov', coups: 'd4 d5 Nc3' },
  { eco: 'D00', nom: 'Attaque Trompowsky', coups: 'd4 Nf6 Bg5' },
  { eco: 'D01', nom: 'Partie du pion Dame', coups: 'd4 d5' },
  { eco: 'D06', nom: 'Gambit Dame', coups: 'd4 d5 c4' },
  { eco: 'D07', nom: 'Gambit Dame, défense Tchigorine', coups: 'd4 d5 c4 Nc6' },
  { eco: 'D08', nom: 'Gambit Dame, contre-gambit Albin', coups: 'd4 d5 c4 e5' },
  { eco: 'D10', nom: 'Défense slave', coups: 'd4 d5 c4 c6' },
  { eco: 'D15', nom: 'Slave, variante principale', coups: 'd4 d5 c4 c6 Nf3 Nf6 Nc3' },
  { eco: 'D20', nom: 'Gambit Dame accepté', coups: 'd4 d5 c4 dxc4' },
  { eco: 'D30', nom: 'Gambit Dame refusé', coups: 'd4 d5 c4 e6' },
  { eco: 'D32', nom: 'GDR, défense Tarrasch', coups: 'd4 d5 c4 e6 Nc3 c5' },
  { eco: 'D35', nom: "GDR, variante d'échange", coups: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5' },
  { eco: 'D37', nom: 'GDR, variante classique', coups: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7' },
  { eco: 'D43', nom: 'Semi-slave', coups: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6' },
  { eco: 'D80', nom: 'Défense Grünfeld', coups: 'd4 Nf6 c4 g6 Nc3 d5' },
  { eco: 'D85', nom: "Grünfeld, variante d'échange", coups: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5' },

  { eco: 'E00', nom: 'Ouverture catalane', coups: 'd4 Nf6 c4 e6 g3' },
  { eco: 'E10', nom: 'Défense Bogo-indienne', coups: 'd4 Nf6 c4 e6 Nf3 Bb4+' },
  { eco: 'E12', nom: 'Défense ouest-indienne', coups: 'd4 Nf6 c4 e6 Nf3 b6' },
  { eco: 'E20', nom: 'Défense nimzo-indienne', coups: 'd4 Nf6 c4 e6 Nc3 Bb4' },
  { eco: 'E32', nom: 'Nimzo-indienne, variante classique', coups: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2' },
  { eco: 'E60', nom: 'Défense est-indienne', coups: 'd4 Nf6 c4 g6' },
  { eco: 'E62', nom: 'Est-indienne, système du fianchetto', coups: 'd4 Nf6 c4 g6 Nc3 Bg7 Nf3 d6 g3' },
  { eco: 'E90', nom: 'Est-indienne, variante classique', coups: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3' },
  { eco: 'E97', nom: 'Est-indienne, attaque Mar del Plata', coups: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7' },
];

/** Index construit une seule fois : suite exacte de coups SAN -> ouverture. */
let index: Map<string, Ouverture> | null = null;
/** Toutes les suites qui sont un début de ligne connue. */
let prefixes: Set<string> | null = null;

function construireIndex(): void {
  if (index && prefixes) return;
  index = new Map();
  prefixes = new Set();
  for (const o of OUVERTURES) {
    const coups = o.coups.split(' ');
    const cle = coups.join(' ');
    const existante = index.get(cle);
    if (!existante || existante.coups.length < o.coups.length) index.set(cle, o);
    // Chaque début de ligne est mémorisé : c'est ce qui permet de dire si
    // un coup précis prolonge encore la théorie, sans confondre avec le fait
    // qu'une position ANTÉRIEURE était théorique.
    for (let i = 1; i <= coups.length; i++) {
      prefixes.add(coups.slice(0, i).join(' '));
    }
  }
}

function obtenirIndex(): Map<string, Ouverture> {
  construireIndex();
  return index as Map<string, Ouverture>;
}

/**
 * Cherche l'ouverture correspondant à une suite de coups SAN.
 * Renvoie la ligne connue la plus longue qui est un préfixe de la partie.
 */
export function trouverOuverture(coupsSan: string[]): Ouverture | null {
  const idx = obtenirIndex();
  let meilleure: Ouverture | null = null;
  // On ne cherche pas au-delà de 24 demi-coups : la théorie embarquée s'arrête bien avant.
  const max = Math.min(coupsSan.length, 24);
  for (let i = 1; i <= max; i++) {
    const trouvee = idx.get(coupsSan.slice(0, i).join(' '));
    if (trouvee) meilleure = trouvee;
  }
  return meilleure;
}

/**
 * Le coup joué prolonge-t-il encore une ligne connue ?
 *
 * On exige que la suite complète, coup inclus, soit le début d'une ligne du
 * répertoire. Se contenter de chercher la plus longue ouverture connue
 * marquerait « théorie » tout coup joué après une ouverture identifiée, même
 * s'il sort du livre — ce qui reviendrait à excuser n'importe quelle
 * imprécision de la 5e à la 20e demi-coup.
 */
export function estCoupDeTheorie(coupsSanJusquAuCoupInclus: string[]): boolean {
  if (coupsSanJusquAuCoupInclus.length === 0) return false;
  construireIndex();
  return (prefixes as Set<string>).has(coupsSanJusquAuCoupInclus.join(' '));
}
