import { describe, expect, it } from 'vitest';
import {
  FEN_INITIALE,
  lireCase,
  placementVersPlateau,
  plateauVersPlacement,
  retournerPlacement,
  validateFenLegality,
  validateFenSyntax,
} from './fen.ts';

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

  it('refuse plus de huit pions', () => {
    const r = validateFenLegality('rnbqkbnr/pppppppp/p7/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(false);
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

  it('refuse un surnombre de pièces incompatible avec les promotions', () => {
    const r = validateFenLegality('qqqqkqqq/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
    expect(r.valide).toBe(false);
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
