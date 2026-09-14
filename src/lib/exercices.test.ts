import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  EXERCICES,
  evaluerTentative,
  exerciceParId,
  exercicesParCategorie,
  exercicesParMotif,
} from './exercices.ts';
import { validateFenLegality, verifierCoherenceMateriel } from './fen.ts';

describe('intégrité des exercices', () => {
  it('a des identifiants uniques', () => {
    const ids = EXERCICES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EXERCICES.map((e) => [e.id, e] as const))(
    '« %s » repose sur une position valide et atteignable',
    (_id, e) => {
      const v = validateFenLegality(e.fen);
      expect(v.valide, v.erreurs.join(' ')).toBe(true);
      const c = verifierCoherenceMateriel(e.fen.split(' ')[0]);
      expect(c.possible, c.problemes.map((p) => p.message).join(' ')).toBe(true);
    },
  );

  it.each(EXERCICES.map((e) => [e.id, e] as const))(
    '« %s » a une solution légale',
    (_id, e) => {
      const jeu = new Chess(e.fen);
      const coups = jeu.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
      expect(coups).toContain(e.solution);
    },
  );

  it.each(EXERCICES.map((e) => [e.id, e] as const))(
    '« %s » : la solution atteint bien l’objectif',
    (_id, e) => {
      const v = evaluerTentative(e, e.solution);
      expect(v.reussi, `${e.solution} : ${v.message}`).toBe(true);
    },
  );

  it.each(EXERCICES.map((e) => [e.id, e] as const))(
    '« %s » est correctement rédigé',
    (_id, e) => {
      expect(e.titre.length).toBeGreaterThan(3);
      expect(e.consigne.length).toBeGreaterThan(15);
      expect(e.indice.length).toBeGreaterThan(10);
      expect(e.lecon.length).toBeGreaterThan(20);
      // La consigne ne doit jamais contenir la solution en clair.
      expect(e.consigne.toLowerCase()).not.toContain(e.solution.toLowerCase());
    },
  );

  it('couvre les motifs de base des exercices tactiques', () => {
    const motifs = new Set(exercicesParCategorie('tactique').map((e) => e.motif));
    for (const attendu of ['fourchette', 'clouage', 'enfilade', 'piece-en-prise', 'mat-manque']) {
      expect(motifs.has(attendu as never), `motif manquant : ${attendu}`).toBe(true);
    }
  });

  it('couvre les règles de base', () => {
    const ids = exercicesParCategorie('bases').map((e) => e.id);
    for (const attendu of [
      'pion-avance',
      'pion-prend',
      'prise-en-passant',
      'promotion',
      'cavalier-en-l',
      'fou-diagonale',
      'tour-lignes',
      'dame-partout',
      'roi-une-case',
      'petit-roque',
      'grand-roque',
      'parer-echec',
      'mat-tour',
    ]) {
      expect(ids, `exercice manquant : ${attendu}`).toContain(attendu);
    }
  });
});

describe('evaluerTentative', () => {
  it('refuse un coup illégal', () => {
    const e = exerciceParId('pion-avance')!;
    expect(evaluerTentative(e, 'e2e5').reussi).toBe(false);
    expect(evaluerTentative(e, 'zzzz').reussi).toBe(false);
  });

  it('refuse un coup légal qui rate l’objectif', () => {
    const e = exerciceParId('pion-avance')!;
    const v = evaluerTentative(e, 'e2e3');
    expect(v.reussi).toBe(false);
    expect(v.message).toContain('e4');
  });

  it('accepte n’importe quel mat, pas seulement celui prévu', () => {
    // Deux dames : plusieurs mats existent, tous doivent être acceptés.
    const e = {
      ...exerciceParId('mat-tour')!,
      fen: '7k/8/6K1/8/8/8/8/Q6Q w - - 0 1',
      solution: 'a1a8',
    };
    expect(evaluerTentative(e, 'a1a8').reussi).toBe(true);
    expect(evaluerTentative(e, 'h1h8').reussi).toBe(true);
  });

  it('distingue un échec d’un mat', () => {
    const e = exerciceParId('mat-tour')!;
    const v = evaluerTentative(e, 'a1a7');
    expect(v.reussi).toBe(false);
  });

  it('mesure le gain matériel après la meilleure défense', () => {
    const e = exerciceParId('fourchette-cavalier')!;
    expect(evaluerTentative(e, e.solution).reussi).toBe(true);
    // Un coup de cavalier sans fourchette ne gagne rien.
    expect(evaluerTentative(e, 'd5f4').reussi).toBe(false);
  });

  it('relie un exercice à un motif d’erreur', () => {
    expect(exercicesParMotif('fourchette').length).toBeGreaterThan(0);
    expect(exercicesParMotif('clouage').length).toBeGreaterThan(0);
  });
});
