import { describe, expect, it } from 'vitest';
import {
  casesDe,
  FEN_INITIALE,
  lireCase,
  placementVersPlateau,
  plateauVersPlacement,
  retournerPlacement,
  validateFenLegality,
  validateFenSyntax,
  verifierCoherenceMateriel,
} from './fen.ts';

/** Raccourci : le champ de placement d'un FEN. */
const s_placement = (fen: string) => fen.split(' ')[0];

describe('validateFenSyntax', () => {
  it('accepte la position initiale', () => {
    const r = validateFenSyntax(FEN_INITIALE);
    expect(r.valide).toBe(true);
    expect(r.erreurs).toEqual([]);
    expect(r.fenNormalise).toBe(FEN_INITIALE);
  });

  it('refuse un FEN vide', () => {
    expect(validateFenSyntax('').valide).toBe(false);
    expect(validateFenSyntax('   ').valide).toBe(false);
  });

  it('refuse un nombre de rangées incorrect', () => {
    const r = validateFenSyntax('rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/8 rangées/);
  });

  it('refuse une rangée qui ne totalise pas 8 cases', () => {
    const r = validateFenSyntax('rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/7 cases/);
  });

  it('refuse un caractère de pièce inconnu', () => {
    const r = validateFenSyntax('rnbqkbnx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(r.valide).toBe(false);
  });

  it('refuse deux nombres consécutifs', () => {
    const r = validateFenSyntax('44bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/consécutifs/);
  });

  it('complète les champs manquants', () => {
    const r = validateFenSyntax('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
    expect(r.valide).toBe(true);
    expect(r.fenNormalise).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    expect(r.avertissements.length).toBeGreaterThan(0);
  });

  it('ignore une prise en passant incohérente avec le trait', () => {
    const r = validateFenSyntax('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1');
    expect(r.valide).toBe(true);
    expect(r.fenNormalise).toContain(' - 0 1');
  });

  it('refuse un trait invalide', () => {
    expect(validateFenSyntax('8/8/8/8/8/8/8/8 x - - 0 1').valide).toBe(false);
  });
});

describe('validateFenLegality', () => {
  it('accepte la position initiale', () => {
    expect(validateFenLegality(FEN_INITIALE).valide).toBe(true);
  });

  it('refuse une position sans roi blanc', () => {
    const r = validateFenLegality('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w - - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/blancs ont 0 roi/);
  });

  it('refuse deux rois noirs', () => {
    const r = validateFenLegality('rnbqkbnk/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/noirs ont 2 roi/);
  });

  it('refuse un pion sur la 8e rangée', () => {
    const r = validateFenLegality('Pnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/8e rangée/);
  });

  it('refuse un pion sur la 1re rangée', () => {
    const r = validateFenLegality('rnbqkbnr/1ppppppp/8/8/8/8/PPPPPPPP/pNBQKBNR w - - 0 1');
    expect(r.valide).toBe(false);
    expect(r.erreurs.join(' ')).toMatch(/1re rangée/);
  });

  it('accepte un effectif inhabituel mais laisse le contrôle matériel juger', () => {
    // `validateFenLegality` ne se prononce QUE sur ce qui empêche le moteur
    // de fonctionner. Trois tours blanches sont parfaitement légales après
    // deux sous-promotions : refuser ici corromprait une position valide.
    const r = validateFenLegality('rnbqkbnr/pppppppp/8/8/8/R7/PPPPPP2/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(true);
  });

  it('retire les droits de roque impossibles sans invalider la position', () => {
    // Le roi blanc est en e2 : aucun roque blanc n'est possible.
    const r = validateFenLegality('rnbqkbnr/pppppppp/8/8/8/8/PPPPKPPP/RNBQ1BNR w KQkq - 0 1');
    expect(r.valide).toBe(true);
    expect(r.fenNormalise).toContain(' kq ');
    expect(r.avertissements.join(' ')).toMatch(/roque/);
  });

  it('retire une prise en passant sans pion correspondant', () => {
    const r = validateFenLegality('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1');
    expect(r.valide).toBe(true);
    expect(r.fenNormalise).toMatch(/KQkq - 0 1$/);
  });

  it('conserve une prise en passant valide', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
    const r = validateFenLegality(fen);
    expect(r.valide).toBe(true);
    expect(r.fenNormalise).toContain(' e6 ');
  });

  it('ne juge pas non plus un surnombre impossible : ce n’est pas son rôle', () => {
    const r = validateFenLegality('qqqqkqqq/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(true);
    // C'est `verifierCoherenceMateriel` qui le signale, et seulement à la
    // reconnaissance d'image.
    expect(verifierCoherenceMateriel(s_placement(r.fenNormalise!)).possible).toBe(false);
  });
});

describe('lireCase', () => {
  const p = FEN_INITIALE.split(' ')[0];
  it('lit les cases occupées', () => {
    expect(lireCase(p, 'e1')).toBe('K');
    expect(lireCase(p, 'e8')).toBe('k');
    expect(lireCase(p, 'a1')).toBe('R');
    expect(lireCase(p, 'h8')).toBe('r');
    expect(lireCase(p, 'd1')).toBe('Q');
  });
  it('renvoie une chaîne vide sur une case vide', () => {
    expect(lireCase(p, 'e4')).toBe('');
    expect(lireCase(p, 'a5')).toBe('');
  });
});

describe('conversions plateau / placement', () => {
  it('fait un aller-retour sans perte', () => {
    const p = FEN_INITIALE.split(' ')[0];
    expect(plateauVersPlacement(placementVersPlateau(p))).toBe(p);
  });

  it('gère un échiquier vide', () => {
    const vide = '8/8/8/8/8/8/8/8';
    expect(plateauVersPlacement(placementVersPlateau(vide))).toBe(vide);
  });

  it('place correctement une pièce isolée', () => {
    const plateau: (string | null)[][] = Array.from({ length: 8 }, () =>
      Array<string | null>(8).fill(null),
    );
    plateau[0][0] = 'k'; // a8
    plateau[7][7] = 'K'; // h1
    const placement = plateauVersPlacement(plateau);
    expect(placement).toBe('k7/8/8/8/8/8/8/7K');
    expect(lireCase(placement, 'a8')).toBe('k');
    expect(lireCase(placement, 'h1')).toBe('K');
  });

  it('retourne le placement', () => {
    const p = 'k7/8/8/8/8/8/8/7K';
    expect(retournerPlacement(p)).toBe('K7/8/8/8/8/8/8/7k');
    expect(retournerPlacement(retournerPlacement(p))).toBe(p);
  });
});


describe('verifierCoherenceMateriel', () => {
  // Positions minimales : deux rois et uniquement les pièces qui comptent
  // pour le critère testé. Un échiquier complet cumulerait plusieurs causes
  // d'impossibilité et on ne saurait plus laquelle est mesurée.

  it('accepte la position initiale', () => {
    expect(verifierCoherenceMateriel(s_placement(FEN_INITIALE)).possible).toBe(true);
  });

  // --- Les quatre cas de référence ---

  it('accepte 3 tours blanches avec 6 pions blancs', () => {
    // Deux sous-promotions : excédent = 1, pions manquants = 2.
    const r = verifierCoherenceMateriel('4k3/8/8/8/8/RRR5/PPPPPP2/4K3');
    expect(r.possible).toBe(true);
    expect(r.problemes).toEqual([]);
  });

  it('accepte 5 cavaliers blancs avec 5 pions blancs', () => {
    // Trois sous-promotions : excédent = 3, pions manquants = 3, tout juste.
    const r = verifierCoherenceMateriel('4k3/8/8/8/NNNNN3/8/PPPPP3/4K3');
    expect(r.possible).toBe(true);
  });

  it('refuse 3 tours blanches avec 8 pions blancs', () => {
    // Excédent = 1 mais aucun pion ne manque : la troisième tour ne peut
    // venir de nulle part.
    const r = verifierCoherenceMateriel('4k3/8/8/8/8/RRR5/PPPPPPPP/4K3');
    expect(r.possible).toBe(false);
    expect(r.problemes).toHaveLength(1);
    expect(r.problemes[0].camp).toBe('blancs');
    expect(r.problemes[0].message).toMatch(/3 tours/);
  });

  it('accepte 2 dames blanches avec 7 pions blancs', () => {
    const r = verifierCoherenceMateriel('4k3/8/8/8/8/QQ6/PPPPPPP1/4K3');
    expect(r.possible).toBe(true);
  });

  // --- Autres garde-fous ---

  it('accepte quatre dames si les pions correspondants manquent', () => {
    // Excédent = 3, pions manquants = 5 : parfaitement atteignable.
    const r = verifierCoherenceMateriel('4k3/8/8/8/QQQQ4/8/PPP5/4K3');
    expect(r.possible).toBe(true);
  });

  it('refuse plus de huit pions', () => {
    const r = verifierCoherenceMateriel('4k3/pppppppp/p7/8/8/8/8/4K3');
    expect(r.possible).toBe(false);
    expect(r.problemes.some((x) => /9 pions/.test(x.message))).toBe(true);
  });

  it('refuse un camp sans roi ou avec deux rois', () => {
    expect(verifierCoherenceMateriel('4k3/8/8/8/8/8/8/8').possible).toBe(false);
    expect(verifierCoherenceMateriel('4k3/8/8/8/8/8/8/3KK3').possible).toBe(false);
  });

  it('refuse un pion sur une rangée extrême', () => {
    const r = verifierCoherenceMateriel('P3k3/8/8/8/8/8/8/4K3');
    expect(r.possible).toBe(false);
    expect(r.problemes.some((x) => /8e rangée/.test(x.message))).toBe(true);
  });

  it('refuse plus de seize pièces dans un camp', () => {
    const r = verifierCoherenceMateriel('4k3/8/8/8/RRR5/8/PPPPPPPP/RNBQKBNR');
    expect(r.possible).toBe(false);
    expect(r.problemes.some((x) => /seize/.test(x.message))).toBe(true);
  });

  it('désigne les cases en cause, pour le surlignage', () => {
    const r = verifierCoherenceMateriel('4k3/8/8/8/8/RRR5/PPPPPPPP/4K3');
    expect(r.problemes[0].cases.sort()).toEqual(['a3', 'b3', 'c3']);
  });

  it('formule un message sans jargon', () => {
    const r = verifierCoherenceMateriel('4k3/8/8/8/8/RRR5/PPPPPPPP/4K3');
    expect(r.problemes[0].message).toMatch(/promotion/);
    expect(r.problemes[0].message).not.toMatch(/excédent|surnombre/i);
  });

  it('traite les deux camps indépendamment', () => {
    // Blancs impossibles, noirs corrects.
    const r = verifierCoherenceMateriel('4k3/pppppppp/rrr5/8/8/8/PPPPPPPP/RRRRK3');
    expect(r.problemes.map((x) => x.camp)).toContain('blancs');
    expect(r.problemes.map((x) => x.camp)).toContain('noirs');
  });
});

describe('casesDe', () => {
  it('localise chaque occurrence d’un symbole', () => {
    const p = s_placement(FEN_INITIALE);
    expect(casesDe(p, 'K')).toEqual(['e1']);
    expect(casesDe(p, 'r')).toEqual(['a8', 'h8']);
    expect(casesDe(p, 'P')).toHaveLength(8);
    expect(casesDe(p, 'Q')).toEqual(['d1']);
  });

  it('renvoie une liste vide pour un symbole absent', () => {
    expect(casesDe('8/8/8/8/8/8/8/8', 'Q')).toEqual([]);
  });
});
