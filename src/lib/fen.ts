/**
 * Validation de FEN — syntaxe puis légalité.
 *
 * Deux niveaux volontairement séparés :
 *  - `validateFenSyntax` ne dépend de rien et vérifie la forme du FEN.
 *  - `validateFenLegality` ajoute ce qu'exigent `chess.js` et le moteur :
 *    un roi par camp, aucun pion sur les rangées extrêmes, roques et prise
 *    en passant cohérents.
 *  - `verifierCoherenceMateriel` est un contrôle SÉPARÉ, réservé à la
 *    reconnaissance d'image : il dit si un effectif est arithmétiquement
 *    atteignable, sans jamais rien corriger de lui-même.
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

  // Les effectifs ne sont PAS vérifiés ici. Une position peut être inhabituelle
  // sans être impossible — trois tours après deux sous-promotions, cinq
  // cavaliers — et rien ne justifie de refuser un FEN collé à la main ou une
  // position atteinte en partie. Le contrôle de cohérence matérielle vit dans
  // `verifierCoherenceMateriel`, et ne sert qu'à la reconnaissance d'image.

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


/** Liste les cases occupées par un symbole donné, en notation algébrique. */
export function casesDe(placement: string, symbole: string): string[] {
  const out: string[] = [];
  placement.split('/').forEach((rangee, idx) => {
    let col = 0;
    for (const c of rangee) {
      if (c >= '1' && c <= '8') {
        col += Number(c);
      } else {
        if (c === symbole) out.push(`${'abcdefgh'[col]}${8 - idx}`);
        col += 1;
      }
    }
  });
  return out;
}

export interface ProblemeMateriel {
  camp: 'blancs' | 'noirs';
  /** Phrase explicative, en français, sans jargon. */
  message: string;
  /** Cases à mettre en évidence pour que l'œil sache où regarder. */
  cases: string[];
}

export interface CoherenceMateriel {
  possible: boolean;
  problemes: ProblemeMateriel[];
}

const NOMS_PLURIEL: Record<string, string> = {
  q: 'dames',
  r: 'tours',
  b: 'fous',
  n: 'cavaliers',
};

/**
 * La position est-elle matériellement atteignable ?
 *
 * Le seul critère rigoureux est la conservation du matériel par promotion :
 * chaque pièce en surnombre a forcément été un pion, et ce pion manque donc
 * à l'appel. Une sous-promotion est parfaitement légale — trois tours, cinq
 * cavaliers — tant que les pions correspondants ont disparu.
 *
 *   excédent      = max(0, dames-1) + max(0, tours-2) + max(0, fous-2) + max(0, cavaliers-2)
 *   pionsManquants = 8 - pions
 *   atteignable    <=> excédent <= pionsManquants
 *
 * On ne se sert JAMAIS de ce contrôle pour corriger d'office : il sert à
 * signaler, à expliquer, et à laisser le choix.
 */
export function verifierCoherenceMateriel(placement: string): CoherenceMateriel {
  const n = compterPieces(placement);
  const nb = (c: string) => n[c] ?? 0;
  const problemes: ProblemeMateriel[] = [];
  const rangees = placement.split('/');

  for (const camp of ['blancs', 'noirs'] as const) {
    const maj = camp === 'blancs';
    const sym = (c: string) => (maj ? c.toUpperCase() : c);
    const pions = nb(sym('p'));
    const roi = nb(sym('k'));

    const total =
      pions + roi + nb(sym('q')) + nb(sym('r')) + nb(sym('b')) + nb(sym('n'));

    if (roi !== 1) {
      problemes.push({
        camp,
        message:
          roi === 0
            ? `Les ${camp} n'ont pas de roi : une position d'échecs en compte toujours un.`
            : `Les ${camp} ont ${roi} rois : il ne peut y en avoir qu'un.`,
        cases: casesDe(placement, sym('k')),
      });
    }

    if (pions > 8) {
      problemes.push({
        camp,
        message: `Les ${camp} ont ${pions} pions : un camp n'en a jamais plus de huit.`,
        cases: casesDe(placement, sym('p')),
      });
    }

    if (total > 16) {
      problemes.push({
        camp,
        message: `Les ${camp} ont ${total} pièces : un camp n'en a jamais plus de seize.`,
        cases: [],
      });
    }

    // Conservation du matériel par promotion.
    const excedent =
      Math.max(0, nb(sym('q')) - 1) +
      Math.max(0, nb(sym('r')) - 2) +
      Math.max(0, nb(sym('b')) - 2) +
      Math.max(0, nb(sym('n')) - 2);
    const pionsManquants = Math.max(0, 8 - pions);

    if (excedent > pionsManquants) {
      // On nomme précisément les types en surnombre : c'est ce qui rend le
      // message actionnable, là où « trop de pièces » ne dit rien.
      const enSurnombre = (['q', 'r', 'b', 'n'] as const)
        .map((t) => ({ t, sup: Math.max(0, nb(sym(t)) - (t === 'q' ? 1 : 2)) }))
        .filter((x) => x.sup > 0);

      const liste = enSurnombre
        .map((x) => `${nb(sym(x.t))} ${NOMS_PLURIEL[x.t]}`)
        .join(' et ');

      problemes.push({
        camp,
        message:
          `Les ${camp} ont ${liste} pour ${pions} pion${pions > 1 ? 's' : ''} : ` +
          `chaque pièce en trop vient d'une promotion, et il faudrait donc ` +
          `${excedent} pion${excedent > 1 ? 's' : ''} de moins.`,
        cases: enSurnombre.flatMap((x) => casesDe(placement, sym(x.t))),
      });
    }
  }

  // Pions sur les rangées extrêmes : un pion n'y arrive jamais, il y promeut.
  for (const [idx, nomRangee] of [
    [0, '8e'],
    [7, '1re'],
  ] as const) {
    const pionsIndus = [...rangees[idx]].filter((c) => c === 'p' || c === 'P');
    if (pionsIndus.length > 0) {
      problemes.push({
        camp: pionsIndus[0] === 'P' ? 'blancs' : 'noirs',
        message: `Un pion se trouve sur la ${nomRangee} rangée, où il aurait dû être promu.`,
        cases: [...rangees[idx]]
          .reduce<{ col: number; out: string[] }>(
            (acc, c) => {
              if (c >= '1' && c <= '8') acc.col += Number(c);
              else {
                if (c === 'p' || c === 'P') acc.out.push(`${'abcdefgh'[acc.col]}${8 - idx}`);
                acc.col += 1;
              }
              return acc;
            },
            { col: 0, out: [] },
          )
          .out,
      });
    }
  }

  return { possible: problemes.length === 0, problemes };
}
