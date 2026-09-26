import { describe, expect, it } from 'vitest';
import { actionDe, decrireCoup, phraseDeFond, sansCoordonnees } from './parole.ts';

const DEPART = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('decrireCoup', () => {
  it('nomme la pièce déplacée, pas la case', () => {
    const c = decrireCoup(DEPART, 'Nf3')!;
    expect(c.sujet).toBe('votre cavalier');
    expect(c.type).toBe('n');
  });

  it('reconnaît une prise', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
    const c = decrireCoup(fen, 'Nxe5')!;
    expect(c.capture).toBe('le pion');
  });

  it('reconnaît le roque', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
    expect(decrireCoup(fen, 'O-O')!.roque).toBe(true);
  });

  it('ne lève pas sur un coup illégal', () => {
    expect(decrireCoup(DEPART, 'Qh5')).toBeNull();
  });
});

describe('actionDe', () => {
  it('dit ce que le joueur a fait, en français', () => {
    expect(actionDe(decrireCoup(DEPART, 'Nf3')!)).toBe('vous déplacez votre cavalier');
    expect(actionDe(decrireCoup(DEPART, 'e4')!)).toBe('vous poussez un pion');
  });
});

describe('sansCoordonnees', () => {
  it('retire toute notation algébrique', () => {
    // C'est le filet de sécurité : rien ne doit atteindre la synthèse vocale
    // sous forme de « Cg6 », que la voix écorche et qu'un débutant ne lit pas.
    for (const brut of ['Il fallait jouer Td1.', 'Après Cxe5, tout s’écroule.', 'Le coup e4 est juste.']) {
      expect(sansCoordonnees(brut)).not.toMatch(/\b[KQRBNCFTD]?[a-h][1-8]\b/);
    }
  });

  it('traduit le roque plutôt que de le supprimer', () => {
    expect(sansCoordonnees('Il fallait jouer O-O.')).toContain('roque');
  });

  it('laisse une phrase ordinaire intacte', () => {
    const t = 'Votre cavalier est en prise ; le fou était plus utile.';
    expect(sansCoordonnees(t)).toBe(t);
  });

  it('respecte l’espace française avant le point-virgule', () => {
    expect(sansCoordonnees('un mot ; un autre')).toContain(' ;');
  });
});

describe('phraseDeFond', () => {
  const base = {
    classement: 'gaffe' as const,
    motif: 'piece-en-prise' as const,
    coup: decrireCoup(DEPART, 'Nf3'),
    meilleur: decrireCoup(DEPART, 'e4'),
    eleve: 'debutant' as const,
  };

  it('ne contient jamais de coordonnées', () => {
    expect(phraseDeFond(base)).not.toMatch(/\b[a-h][1-8]\b/);
  });

  it('nomme l’alternative par sa pièce', () => {
    expect(phraseDeFond(base)).toMatch(/pion/);
  });

  it('appelle le roque « le roque » et non « le roi »', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
    const t = phraseDeFond({
      ...base,
      coup: decrireCoup(fen, 'Ng5'),
      meilleur: decrireCoup(fen, 'O-O'),
    });
    expect(t).toContain('roque');
    expect(t).not.toMatch(/\ble roi\b/);
  });

  it('reste court', () => {
    expect(phraseDeFond(base).length).toBeLessThan(90);
  });
});
