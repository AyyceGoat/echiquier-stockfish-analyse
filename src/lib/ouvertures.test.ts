import { describe, expect, it } from 'vitest';
import { estCoupDeTheorie, OUVERTURES, trouverOuverture } from './ouvertures.ts';

describe('trouverOuverture', () => {
  it('nomme une ouverture connue', () => {
    expect(trouverOuverture(['e4', 'c5'])?.nom).toBe('Défense sicilienne');
    expect(trouverOuverture(['d4', 'd5', 'c4'])?.nom).toBe('Gambit Dame');
  });

  it('retient la ligne connue la plus longue', () => {
    const najdorf = trouverOuverture([
      'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
    ]);
    expect(najdorf?.nom).toContain('Najdorf');
    expect(najdorf?.eco).toBe('B90');
  });

  it('garde le nom même quand la partie sort du livre', () => {
    // On sort de la théorie au 4e coup : le nom de l'ouverture reste valable.
    const o = trouverOuverture(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']);
    expect(o?.eco).toBe('C23');
  });

  it('renvoie null sur une suite inconnue', () => {
    expect(trouverOuverture(['a3', 'h6'])).toBeNull();
    expect(trouverOuverture([])).toBeNull();
  });
});

describe('estCoupDeTheorie', () => {
  it('reconnaît les coups de livre', () => {
    expect(estCoupDeTheorie(['e4'])).toBe(true);
    expect(estCoupDeTheorie(['e4', 'c5'])).toBe(true);
    expect(estCoupDeTheorie(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])).toBe(true);
  });

  it("n'excuse pas un coup qui sort du livre", () => {
    // Régression : après « e4 e5 Bc4 » (Partie du Fou, C23), les coups
    // suivants ne sont plus de la théorie embarquée. Marquer Qh5 comme
    // « coup de théorie » reviendrait à excuser toute imprécision jouée
    // après une ouverture reconnue.
    expect(estCoupDeTheorie(['e4', 'e5', 'Bc4'])).toBe(true);
    expect(estCoupDeTheorie(['e4', 'e5', 'Bc4', 'Nc6'])).toBe(false);
    expect(estCoupDeTheorie(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5'])).toBe(false);
  });

  it('refuse une suite jamais vue', () => {
    expect(estCoupDeTheorie(['a3'])).toBe(false);
    expect(estCoupDeTheorie([])).toBe(false);
  });

  it('reste vrai le long de toute une ligne connue', () => {
    const ligne = 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'.split(' ');
    for (let i = 1; i <= ligne.length; i++) {
      expect(estCoupDeTheorie(ligne.slice(0, i))).toBe(true);
    }
  });
});

describe('répertoire', () => {
  it("n'a que des coups en notation abrégée plausible", () => {
    for (const o of OUVERTURES) {
      for (const coup of o.coups.split(' ')) {
        expect(coup).toMatch(/^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?|O-O(-O)?)[+#]?$/);
      }
    }
  });

  it('a un code ECO valide partout', () => {
    for (const o of OUVERTURES) {
      expect(o.eco).toMatch(/^[A-E]\d\d$/);
    }
  });
});
