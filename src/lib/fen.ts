/**
 * Validation de FEN — syntaxe puis légalité.
 *
 * Deux niveaux volontairement séparés :
 *  - `validateFenSyntax` ne dépend de rien et vérifie la forme du FEN.
 *  - `validateFenLegality` ajoute les règles d'échecs (rois, pions, roques).
 * La reconnaissance d'image produit des FEN potentiellement absurdes :
 * on refuse d'afficher un FEN qui n'a pas passé les deux niveaux.
 */

export const FEN_INITIALE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FEN_VIDE = '8/8/8/8/8/8/8/8 w - - 0 1';

export interface ResultatValidation {
  valide: boolean;
  /** Erreurs bloquantes : le FEN ne peut pas être utilisé. */
  erreurs: string[];
  /** Anomalies non bloquantes : on corrige et on prévient. */
  avertissements: string[];
  /** FEN normalisé (champs manquants complétés, roques impossibles retirés). */
  fenNormalise?: string;
}

const PIECES = 'pnbrqkPNBRQK';

/** Découpe un FEN en champs, en tolérant les espaces multiples. */
function champs(fen: string): string[] {
  return fen.trim().split(/\s+/);
}

/**
 * Vérifie uniquement la forme : 8 rangées, 8 colonnes par rangée,
 * caractères autorisés, trait, roques, prise en passant, compteurs.
 */
export function validateFenSyntax(fen: string): ResultatValidation {
  const erreurs: string[] = [];
  const avertissements: string[] = [];

  if (typeof fen !== 'string' || fen.trim() === '') {
    return { valide: false, erreurs: ['FEN vide.'], avertissements };
  }

  const f = champs(fen);
  const placement = f[0];
  let trait = f[1] ?? 'w';
  let roques = f[2] ?? '-';
  let ep = f[3] ?? '-';
  let demiCoups = f[4] ?? '0';
  let coupComplet = f[5] ?? '1';

  if (f.length < 4) {
    avertissements.push('Champs manquants dans le FEN : valeurs par défaut appliquées.');
  }
  if (f.length > 6) {
    avertissements.push('Champs surnuméraires ignorés.');
  }

  // --- Placement des pièces ---
  const rangees = placement.split('/');
  if (rangees.length !== 8) {
    erreurs.push(`Le placement doit compter 8 rangées (${rangees.length} trouvée(s)).`);
  }
  rangees.forEach((rangee, i) => {
    let largeur = 0;
    let videPrecedent = false;
    for (const c of rangee) {
      if (c >= '1' && c <= '8') {
        if (videPrecedent) {
          erreurs.push(`Rangée ${8 - i} : deux nombres consécutifs.`);
        }
        largeur += Number(c);
        videPrecedent = true;
      } else if (PIECES.includes(c)) {
        largeur += 1;
        videPrecedent = false;
      } else {
        erreurs.push(`Rangée ${8 - i} : caractère invalide.`);
        return;
      }
    }
    if (largeur !== 8) {
      erreurs.push(`Rangée ${8 - i} : ${largeur} cases au lieu de 8.`);
    }
  });

  // --- Trait ---
  if (trait !== 'w' && trait !== 'b') {
    erreurs.push('Trait invalide (attendu « w » ou « b »).');
    trait = 'w';
  }

  // --- Droits de roque ---
  if (roques !== '-' && !/^K?Q?k?q?$/.test(roques)) {
    avertissements.push('Droits de roque invalides : ignorés.');
    roques = '-';
  }
  if (roques === '') roques = '-';

  // --- Prise en passant ---
  if (ep !== '-') {
    if (!/^[a-h][36]$/.test(ep)) {
      avertissements.push('Case de prise en passant invalide : ignorée.');
      ep = '-';
    } else if ((trait === 'w' && ep[1] !== '6') || (trait === 'b' && ep[1] !== '3')) {
      avertissements.push('Prise en passant incohérente avec le trait : ignorée.');
      ep = '-';
    }
  }

  // --- Compteurs ---
  if (!/^\d+$/.test(demiCoups)) {
    avertissements.push('Compteur de demi-coups invalide : remis à 0.');
    demiCoups = '0';
  }
  if (!/^\d+$/.test(coupComplet) || Number(coupComplet) < 1) {
    avertissements.push('Numéro de coup invalide : remis à 1.');
    coupComplet = '1';
  }

  const valide = erreurs.length === 0;
  return {
    valide,
    erreurs,
    avertissements,
    fenNormalise: valide
      ? `${placement} ${trait} ${roques} ${ep} ${demiCoups} ${coupComplet}`
      : undefined,
  };
}

/** Compte les pièces présentes sur l'échiquier, par symbole FEN. */
export function compterPieces(placement: string): Record<string, number> {
  const total: Record<string, number> = {};
  for (const c of placement) {
    if (PIECES.includes(c)) total[c] = (total[c] ?? 0) + 1;
  }
  return total;
}

/** Lit le contenu d'une case (ex. « e1 ») dans un champ de placement FEN. */
export function lireCase(placement: string, sq: string): string {
  const rangees = placement.split('/');
  const col = sq.charCodeAt(0) - 97;
  const idx = 8 - Number(sq[1]);
  const rangee = rangees[idx];
  if (!rangee) return '';
  let i = 0;
  for (const c of rangee) {
    if (c >= '1' && c <= '8') {
      i += Number(c);
      if (i > col) return '';
    } else {
      if (i === col) return c;
      i += 1;
    }
  }
  return '';
}

/**
 * Règles d'échecs : un roi par camp, pas de pion sur la 1re/8e rangée,
 * effectifs plausibles, roques cohérents avec la position des rois et tours.
 * Les roques impossibles sont retirés au lieu de faire échouer la validation :
 * c'est l'erreur la plus fréquente sur une position reconnue depuis une photo.
 */
export function validateFenLegality(fen: string): ResultatValidation {
  const base = validateFenSyntax(fen);
  if (!base.valide || !base.fenNormalise) return base;

  const erreurs = [...base.erreurs];
  const avertissements = [...base.avertissements];
  const f = champs(base.fenNormalise);
  const placement = f[0];
  const trait = f[1];
  let roques = f[2];
  let ep = f[3];
  const rangees = placement.split('/');

  const n = compterPieces(placement);
  const nb = (c: string) => n[c] ?? 0;

  // Rois
  if (nb('K') !== 1) erreurs.push(`Les blancs ont ${nb('K')} roi(s) au lieu d'un seul.`);
  if (nb('k') !== 1) erreurs.push(`Les noirs ont ${nb('k')} roi(s) au lieu d'un seul.`);

  // Pions sur les rangées extrêmes
  if (/[pP]/.test(rangees[0])) erreurs.push('Un pion se trouve sur la 8e rangée.');
  if (/[pP]/.test(rangees[7])) erreurs.push('Un pion se trouve sur la 1re rangée.');

  // Effectifs
  if (nb('P') > 8) erreurs.push(`${nb('P')} pions blancs (maximum 8).`);
  if (nb('p') > 8) erreurs.push(`${nb('p')} pions noirs (maximum 8).`);

  // Un pion promu libère un pion : pions + promotions excédentaires <= 8.
  const surnombre = (pion: number, d: number, c: number, t: number, fo: number) =>
    pion + Math.max(0, d - 1) + Math.max(0, c - 2) + Math.max(0, t - 2) + Math.max(0, fo - 2);
  if (surnombre(nb('P'), nb('Q'), nb('N'), nb('R'), nb('B')) > 8) {
    erreurs.push('Trop de pièces blanches au regard des promotions possibles.');
  }
  if (surnombre(nb('p'), nb('q'), nb('n'), nb('r'), nb('b')) > 8) {
    erreurs.push('Trop de pièces noires au regard des promotions possibles.');
  }

  // Roques : le roi et la tour concernés doivent être sur leur case initiale.
  const roquesValides = [...roques]
    .filter((r) => r !== '-')
    .filter((r) => {
      if (r === 'K') return lireCase(placement, 'e1') === 'K' && lireCase(placement, 'h1') === 'R';
      if (r === 'Q') return lireCase(placement, 'e1') === 'K' && lireCase(placement, 'a1') === 'R';
      if (r === 'k') return lireCase(placement, 'e8') === 'k' && lireCase(placement, 'h8') === 'r';
      if (r === 'q') return lireCase(placement, 'e8') === 'k' && lireCase(placement, 'a8') === 'r';
      return false;
    })
    .join('');

  if (roquesValides !== roques.replace('-', '')) {
    avertissements.push('Droits de roque impossibles au vu de la position : retirés.');
  }
  roques = roquesValides === '' ? '-' : roquesValides;

  // Prise en passant : il faut un pion adverse qui vient de passer.
  if (ep !== '-') {
    const col = ep[0];
    const pionAttendu = trait === 'w' ? 'p' : 'P';
    const caseDuPion = trait === 'w' ? `${col}5` : `${col}4`;
    if (lireCase(placement, caseDuPion) !== pionAttendu) {
      avertissements.push('Prise en passant sans pion correspondant : ignorée.');
      ep = '-';
    }
  }

  const fenNormalise = `${placement} ${trait} ${roques} ${ep} ${f[4]} ${f[5]}`;
  return { valide: erreurs.length === 0, erreurs, avertissements, fenNormalise };
}

/** Retourne le placement d'un FEN (échiquier vu depuis l'autre camp). */
export function retournerPlacement(placement: string): string {
  return placement
    .split('/')
    .reverse()
    .map((r) => [...r].reverse().join(''))
    .join('/');
}

/** Convertit un plateau 8x8 (rangée 8 en premier) en champ de placement FEN. */
export function plateauVersPlacement(plateau: (string | null)[][]): string {
  return plateau
    .map((rangee) => {
      let out = '';
      let vides = 0;
      for (const c of rangee) {
        if (!c) {
          vides += 1;
        } else {
          if (vides) {
            out += String(vides);
            vides = 0;
          }
          out += c;
        }
      }
      if (vides) out += String(vides);
      return out || '8';
    })
    .join('/');
}

/** Convertit un champ de placement FEN en plateau 8x8 (rangée 8 en premier). */
export function placementVersPlateau(placement: string): (string | null)[][] {
  return placement.split('/').map((rangee) => {
    const out: (string | null)[] = [];
    for (const c of rangee) {
      if (c >= '1' && c <= '8') {
        for (let i = 0; i < Number(c); i++) out.push(null);
      } else {
        out.push(c);
      }
    }
    while (out.length < 8) out.push(null);
    return out.slice(0, 8);
  });
}
