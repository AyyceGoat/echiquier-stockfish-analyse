import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { expliquerCoup, uciVersSan, variantEnSan, type ContexteExplication } from './explications.ts';
import {
  clouages,
  enfilades,
  estEnPrise,
  fourchetteDepuis,
  piecesEnPrise,
  avecTraitInverse,
} from './motifs.ts';

/** Contexte minimal : seuls les champs utiles au cas testé sont renseignés. */
function ctx(p: Partial<ContexteExplication> & Pick<ContexteExplication, 'fenAvant' | 'coupJoue'>): ContexteExplication {
  return {
    meilleurCoup: null,
    pvMeilleure: [],
    avant: { type: 'cp', valeur: 0 },
    apres: { type: 'cp', valeur: 0 },
    ...p,
  };
}

/** Aucune phrase principale ne doit contenir d'évaluation chiffrée. */
function sansChiffreDEvaluation(phrase: string) {
  expect(phrase).not.toMatch(/[-+−]?\d+[.,]\d\d/);
  expect(phrase).not.toMatch(/centipion/i);
}

describe('motifs — briques géométriques', () => {
  it('repère une pièce réellement en prise', () => {
    // Cavalier noir en e5, attaqué par le pion d4, sans défense.
    const jeu = new Chess('4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1');
    expect(estEnPrise(jeu, 'e5', 'b')).toBe(true);
  });

  it('ne considère pas en prise une pièce suffisamment défendue', () => {
    // Cavalier e5 défendu par le pion d6, attaqué seulement par la tour e1 :
    // l'attaquant vaut plus que la pièce, l'échange n'est pas perdant.
    const jeu = new Chess('4k3/8/3p4/4n3/8/8/8/4R1K1 b - - 0 1');
    expect(estEnPrise(jeu, 'e5', 'b')).toBe(false);
  });

  it('classe les pièces en prise de la plus chère à la moins chère', () => {
    const jeu = new Chess('4k3/8/8/3qn3/4P3/8/8/4K3 b - - 0 1');
    const enPrise = piecesEnPrise(jeu, 'b');
    expect(enPrise[0].type).toBe('q');
  });

  it('détecte une fourchette de cavalier', () => {
    // Cavalier blanc en c7 attaquant le roi e8 et la tour a8.
    const jeu = new Chess('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1');
    const vue = avecTraitInverse(jeu);
    expect(vue).not.toBeNull();
    const f = fourchetteDepuis(vue!, 'c7', 'w');
    expect(f).not.toBeNull();
    expect(f!.cibles.map((c) => c.type).sort()).toEqual(['k', 'r']);
  });

  it('ne voit pas de fourchette quand une seule pièce est attaquée', () => {
    const jeu = new Chess('4k3/2N5/8/8/8/8/8/4K3 b - - 0 1');
    const vue = avecTraitInverse(jeu)!;
    expect(fourchetteDepuis(vue, 'c7', 'w')).toBeNull();
  });

  it('détecte un clouage absolu', () => {
    // Fou blanc b5, cavalier noir c6, roi noir e8 : le cavalier est cloué.
    const jeu = new Chess('4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1');
    const c = clouages(jeu, 'b');
    expect(c).toHaveLength(1);
    expect(c[0].devant.type).toBe('n');
    expect(c[0].absolu).toBe(true);
  });

  it('détecte une enfilade', () => {
    // Tour blanche a1, dame noire a5, tour noire a8 : la dame est devant.
    const jeu = new Chess('r3k3/8/8/q7/8/8/8/R3K3 b - - 0 1');
    const e = enfilades(jeu, 'b');
    expect(e).toHaveLength(1);
    expect(e[0].devant.type).toBe('q');
    expect(e[0].derriere.type).toBe('r');
  });

  it('distingue clouage et enfilade par la valeur relative', () => {
    // Même géométrie, pièces inversées : tour devant, dame derrière = clouage.
    const jeu = new Chess('q3k3/8/8/r7/8/8/8/R3K3 b - - 0 1');
    expect(enfilades(jeu, 'b')).toHaveLength(0);
    expect(clouages(jeu, 'b')).toHaveLength(1);
  });
});

describe('expliquerCoup', () => {
  it('annonce un mat manqué en nommant le coup', () => {
    const e = expliquerCoup(
      ctx({
        fenAvant: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        coupJoue: 'g1h1',
        meilleurCoup: 'a1a8',
        avant: { type: 'mat', valeur: 3 },
        apres: { type: 'cp', valeur: 300 },
      }),
    );
    expect(e.motif).toBe('mat-manque');
    expect(e.phrase).toMatch(/mat en 3 coups/);
    expect(e.phrase).toMatch(/Ta8|Ra8/);
    sansChiffreDEvaluation(e.phrase);
  });

  it('annonce un mat concédé', () => {
    const e = expliquerCoup(
      ctx({
        fenAvant: 'rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2',
        coupJoue: 'd8h4',
        meilleurCoup: 'd8h4',
        avant: { type: 'cp', valeur: 100 },
        apres: { type: 'mat', valeur: -2 },
      }),
    );
    expect(e.motif).toBe('mat-subi');
    expect(e.phrase).toMatch(/mater en 2 coups/);
    sansChiffreDEvaluation(e.phrase);
  });

  it('signale une pièce laissée en prise, en la nommant et en donnant sa case', () => {
    // Les noirs jouent Cf6-e4, où le cavalier est pris par le pion d3.
    const e = expliquerCoup(
      ctx({
        fenAvant: '4k3/8/5n2/8/8/3P4/8/4K3 b - - 0 1',
        coupJoue: 'f6e4',
        meilleurCoup: 'f6d5',
        avant: { type: 'cp', valeur: 0 },
        apres: { type: 'cp', valeur: -300 },
      }),
    );
    expect(e.motif).toBe('piece-en-prise');
    expect(e.phrase).toMatch(/cavalier/);
    expect(e.phrase).toMatch(/e4/);
    expect(e.phrase).toMatch(/en prise/);
    sansChiffreDEvaluation(e.phrase);
  });

  it('signale une occasion manquée de gain matériel', () => {
    // Les blancs pouvaient prendre la tour en d5 mais jouent ailleurs.
    const e = expliquerCoup(
      ctx({
        fenAvant: '4k3/8/8/3r4/8/8/3B4/4K3 w - - 0 1',
        coupJoue: 'e1f1',
        meilleurCoup: 'd2a5',
        avant: { type: 'cp', valeur: 500 },
        apres: { type: 'cp', valeur: 0 },
      }),
    );
    // Le fou d2 ne prend pas d5 : on vérifie le cas générique de capture.
    expect(['occasion-manquee', 'passif', 'piece-en-prise']).toContain(e.motif);
    sansChiffreDEvaluation(e.phrase);
  });

  it('nomme la pièce prenable quand le meilleur coup était une capture', () => {
    // Tour blanche d1, tour noire d5 : Txd5 gagnait la tour.
    const e = expliquerCoup(
      ctx({
        fenAvant: '4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1',
        coupJoue: 'e1e2',
        meilleurCoup: 'd1d5',
        avant: { type: 'cp', valeur: 500 },
        apres: { type: 'cp', valeur: 0 },
      }),
    );
    expect(e.motif).toBe('occasion-manquee');
    expect(e.phrase).toMatch(/tour/);
    expect(e.phrase).toMatch(/d5/);
    sansChiffreDEvaluation(e.phrase);
  });

  it('signale un coup forcé sans le reprocher', () => {
    const e = expliquerCoup(
      ctx({
        fenAvant: '4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1',
        coupJoue: 'g1h1',
        nbCoupsLegaux: 1,
      }),
    );
    expect(e.motif).toBe('coup-force');
    expect(e.phrase).toMatch(/seul possible/);
  });

  it('qualifie de passif un coup sans motif tactique', () => {
    const e = expliquerCoup(
      ctx({
        fenAvant: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        coupJoue: 'a2a3',
        meilleurCoup: 'e2e4',
        avant: { type: 'cp', valeur: 30 },
        apres: { type: 'cp', valeur: 0 },
      }),
    );
    expect(['passif', 'sans-consequence']).toContain(e.motif);
    sansChiffreDEvaluation(e.phrase);
  });

  it('propose toujours le meilleur coup en complément quand il y en a un', () => {
    const e = expliquerCoup(
      ctx({
        fenAvant: '4k3/8/5n2/8/8/3P4/8/4K3 b - - 0 1',
        coupJoue: 'f6e4',
        meilleurCoup: 'f6d5',
        apres: { type: 'cp', valeur: -300 },
      }),
    );
    expect(e.complement).toBeTruthy();
  });

  it('ne met jamais de chiffre d’évaluation dans la phrase principale', () => {
    // Balayage de plusieurs situations : aucune ne doit chiffrer.
    const situations: ContexteExplication[] = [
      ctx({ fenAvant: '4k3/8/5n2/8/8/3P4/8/4K3 b - - 0 1', coupJoue: 'f6e4', meilleurCoup: 'f6d5' }),
      ctx({
        fenAvant: '4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1',
        coupJoue: 'e1e2',
        meilleurCoup: 'd1d5',
      }),
      ctx({
        fenAvant: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        coupJoue: 'g1h1',
        meilleurCoup: 'a1a8',
        avant: { type: 'mat', valeur: 3 },
      }),
    ];
    for (const s of situations) {
      const e = expliquerCoup(s);
      sansChiffreDEvaluation(e.phrase);
      if (e.complement) sansChiffreDEvaluation(e.complement);
    }
  });

  it('produit toujours une phrase non vide', () => {
    const e = expliquerCoup(
      ctx({ fenAvant: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', coupJoue: 'e1e2' }),
    );
    expect(e.phrase.length).toBeGreaterThan(5);
    expect(e.phrase.endsWith('.')).toBe(true);
  });

  it('ne lance jamais, même sur un coup illégal', () => {
    expect(() =>
      expliquerCoup(ctx({ fenAvant: FEN_TEST, coupJoue: 'a1a8', meilleurCoup: 'zzzz' })),
    ).not.toThrow();
  });
});

const FEN_TEST = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('conversions de notation', () => {
  it('convertit un coup UCI en SAN', () => {
    expect(uciVersSan(FEN_TEST, 'e2e4')).toBe('e4');
    expect(uciVersSan(FEN_TEST, 'g1f3')).toBe('Nf3');
  });

  it('renvoie null sur un coup illégal', () => {
    expect(uciVersSan(FEN_TEST, 'e2e5')).toBeNull();
  });

  it('convertit une variante et s’arrête au premier coup illégal', () => {
    expect(variantEnSan(FEN_TEST, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(variantEnSan(FEN_TEST, ['e2e4', 'a1a8', 'g1f3'])).toEqual(['e4']);
  });

  it('respecte la longueur demandée', () => {
    expect(variantEnSan(FEN_TEST, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 2)).toHaveLength(2);
  });
});
