import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { construirePgnAnnote, type CoupAnnote } from './pgn.ts';

function coup(p: Partial<CoupAnnote> & Pick<CoupAnnote, 'ply' | 'san'>): CoupAnnote {
  return {
    classement: 'excellent',
    perteCp: 0,
    evaluation: { type: 'cp', valeur: 20 },
    ...p,
  };
}

describe('construirePgnAnnote', () => {
  it('écrit les en-têtes obligatoires dans l’ordre normalisé', () => {
    const pgn = construirePgnAnnote([coup({ ply: 0, san: 'e4' })], {
      White: 'Moi',
      Black: 'Stockfish',
      Result: '1-0',
    });
    const lignes = pgn.split('\n');
    expect(lignes[0]).toBe('[Event "?"]');
    expect(lignes[4]).toBe('[White "Moi"]');
    expect(lignes[5]).toBe('[Black "Stockfish"]');
    expect(lignes[6]).toBe('[Result "1-0"]');
  });

  it('numérote correctement les coups', () => {
    const pgn = construirePgnAnnote([
      coup({ ply: 0, san: 'e4' }),
      coup({ ply: 1, san: 'e5' }),
      coup({ ply: 2, san: 'Nf3' }),
    ]);
    expect(pgn).toContain('1. e4');
    expect(pgn).toContain('e5');
    expect(pgn).toContain('2. Nf3');
  });

  it('commence par « n... » quand la partie démarre sur un coup noir', () => {
    const pgn = construirePgnAnnote([coup({ ply: 0, san: 'Nf6' })], {}, 5);
    expect(pgn).toContain('3... Nf6');
  });

  it('ajoute les symboles d’annotation', () => {
    const pgn = construirePgnAnnote([
      coup({ ply: 0, san: 'e4', classement: 'gaffe' }),
      coup({ ply: 1, san: 'e5', classement: 'erreur' }),
      coup({ ply: 2, san: 'Nf3', classement: 'imprecision' }),
      coup({ ply: 3, san: 'Nc6', classement: 'unique' }),
    ]);
    expect(pgn).toContain('e4??');
    expect(pgn).toContain('e5?');
    expect(pgn).toContain('Nf3?!');
    expect(pgn).toContain('Nc6!');
  });

  it('inclut l’évaluation lisible par les lecteurs de PGN', () => {
    const pgn = construirePgnAnnote([
      coup({ ply: 0, san: 'e4', evaluation: { type: 'cp', valeur: 124 } }),
      coup({ ply: 1, san: 'e5', evaluation: { type: 'mat', valeur: 3 } }),
    ]);
    expect(pgn).toContain('[%eval 1.24]');
    expect(pgn).toContain('[%eval #3]');
  });

  it('écrit la variante recommandée entre parenthèses', () => {
    const pgn = construirePgnAnnote([
      coup({
        ply: 0,
        san: 'a4',
        classement: 'imprecision',
        perteCp: 60,
        meilleurSan: 'e4',
        varianteSan: ['e4', 'e5', 'Nf3'],
        evaluationApres: { type: 'cp', valeur: -40 },
      }),
    ]);
    expect(pgn).toContain('( 1. e4 e5 2. Nf3 )');
  });

  it('n’écrit pas de variante quand le coup joué était le meilleur', () => {
    const pgn = construirePgnAnnote([
      coup({ ply: 0, san: 'e4', meilleurSan: 'e4', varianteSan: ['e4', 'e5'] }),
    ]);
    expect(pgn).not.toContain('( 1. e4');
  });

  it('tait la perte quand un mat entre en jeu', () => {
    const pgn = construirePgnAnnote([
      coup({
        ply: 0,
        san: 'Qh5',
        classement: 'gaffe',
        perteCp: 10012,
        meilleurSan: 'e4',
        evaluation: { type: 'cp', valeur: 30 },
        evaluationApres: { type: 'mat', valeur: -1 },
      }),
    ]);
    expect(pgn).not.toMatch(/Perte : \d{2,},/);
  });

  it('neutralise les accolades qui casseraient un commentaire', () => {
    const pgn = construirePgnAnnote([
      coup({ ply: 0, san: 'e4', explication: 'Un {commentaire} piégé' }),
    ]);
    expect(pgn).toContain('Un commentaire piégé');
    // Une seule paire d'accolades par coup : celle du commentaire.
    expect((pgn.match(/\{/g) ?? []).length).toBe(1);
  });

  it('déclare la position de départ quand elle n’est pas initiale', () => {
    const pgn = construirePgnAnnote([coup({ ply: 0, san: 'Kf2' })], {
      FEN: '8/8/8/8/8/8/5K2/7k w - - 0 1',
      SetUp: '1',
    });
    expect(pgn).toContain('[FEN "8/8/8/8/8/8/5K2/7k w - - 0 1"]');
    expect(pgn).toContain('[SetUp "1"]');
  });

  it('replie les lignes à 80 colonnes, comme le veut la norme', () => {
    const coups = Array.from({ length: 40 }, (_, i) =>
      coup({ ply: i, san: i % 2 === 0 ? 'Nf3' : 'Nf6', explication: 'Un commentaire.' }),
    );
    const corps = construirePgnAnnote(coups).split('\n\n')[1];
    for (const ligne of corps.split('\n')) {
      expect(ligne.length).toBeLessThanOrEqual(80);
    }
  });

  it('produit un PGN relisible par chess.js', () => {
    // Le test qui compte vraiment : un lecteur de PGN standard doit
    // retrouver la partie malgré les annotations, commentaires et variantes.
    const pgn = construirePgnAnnote(
      [
        coup({ ply: 0, san: 'e4', classement: 'theorie' }),
        coup({ ply: 1, san: 'e5', classement: 'theorie' }),
        coup({
          ply: 2,
          san: 'Qh5',
          classement: 'imprecision',
          perteCp: 55,
          meilleurSan: 'Nf3',
          varianteSan: ['Nf3', 'Nc6', 'Bb5'],
          explication: 'Nf3 développait une pièce.',
          evaluationApres: { type: 'cp', valeur: -30 },
        }),
        coup({ ply: 3, san: 'Nc6', classement: 'bon' }),
      ],
      { White: 'Moi', Black: 'Stockfish', Result: '*' },
    );

    const jeu = new Chess();
    jeu.loadPgn(pgn, { strict: false });
    expect(jeu.history()).toEqual(['e4', 'e5', 'Qh5', 'Nc6']);
  });

  it('gère une liste de coups vide sans produire de PGN cassé', () => {
    const pgn = construirePgnAnnote([], { Result: '1/2-1/2' });
    expect(pgn).toContain('[Result "1/2-1/2"]');
    expect(pgn.trim().endsWith('1/2-1/2')).toBe(true);
  });
});
