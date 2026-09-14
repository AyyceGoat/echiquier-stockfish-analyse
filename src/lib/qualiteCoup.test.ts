import { describe, expect, it } from 'vitest';
import { ECART_COUP_FORCE, LIBELLE_QUALITE, qualifierCoup } from './qualiteCoup.ts';

describe('qualifierCoup', () => {
  it('reconnaît un coup forcé quand il n’existe qu’un coup légal', () => {
    // Roi blanc en h1, tour noire en g2 : Rxg2 est le seul coup.
    const q = qualifierCoup({
      fen: '4k3/8/8/8/8/8/6r1/7K w - - 0 1',
      uci: 'h1g2',
      pv: ['h1g2'],
      evaluation: { type: 'cp', valeur: 0 },
    });
    expect(q).toBe('force');
  });

  it('reconnaît un coup forcé quand le deuxième coup est très loin derrière', () => {
    const q = qualifierCoup({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      uci: 'e2e4',
      pv: ['e2e4'],
      evaluation: { type: 'cp', valeur: 300 },
      evaluationSeconde: { type: 'cp', valeur: 300 - ECART_COUP_FORCE },
    });
    expect(q).toBe('force');
  });

  it('ne déclare pas forcé un coup dont l’alternative est proche', () => {
    const q = qualifierCoup({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      uci: 'e2e4',
      pv: ['e2e4'],
      evaluation: { type: 'cp', valeur: 30 },
      evaluationSeconde: { type: 'cp', valeur: 20 },
    });
    expect(q).toBe('meilleur');
  });

  it('reconnaît un sacrifice qui gagne comme coup brillant', () => {
    // Les blancs donnent la dame en h7 ; la position reste gagnante.
    const q = qualifierCoup({
      fen: '4k2r/5ppp/8/8/8/8/8/4K2Q w - - 0 1',
      uci: 'h1h7',
      pv: ['h1h7', 'h8h7'],
      evaluation: { type: 'cp', valeur: 400 },
    });
    expect(q).toBe('brillant');
  });

  it('ne déclare pas brillant un sacrifice qui ne mène nulle part', () => {
    const q = qualifierCoup({
      fen: '4k2r/5ppp/8/8/8/8/8/4K2Q w - - 0 1',
      uci: 'h1h7',
      pv: ['h1h7', 'h8h7'],
      evaluation: { type: 'cp', valeur: -200 },
    });
    expect(q).toBe('meilleur');
  });

  it('ne déclare pas brillant un coup qui ne donne rien', () => {
    const q = qualifierCoup({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      uci: 'e2e4',
      pv: ['e2e4', 'e7e5'],
      evaluation: { type: 'cp', valeur: 300 },
    });
    expect(q).toBe('meilleur');
  });

  it('reste robuste sur un FEN invalide', () => {
    expect(() =>
      qualifierCoup({ fen: 'nimportequoi', uci: 'e2e4', pv: [], evaluation: { type: 'cp', valeur: 0 } }),
    ).not.toThrow();
  });

  it('a un libellé pour chaque qualité', () => {
    expect(LIBELLE_QUALITE.force).toBe('Coup forcé');
    expect(LIBELLE_QUALITE.brillant).toBe('Coup brillant');
    expect(LIBELLE_QUALITE.meilleur).toBe('Meilleur coup');
  });
});
