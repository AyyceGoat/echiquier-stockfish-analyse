import { describe, expect, it } from 'vitest';
import {
  CP_MAT,
  evaluationEnCp,
  formaterEvaluation,
  parseLigneUci,
  probabiliteDeGain,
  versPointDeVueBlanc,
  type LigneInfo,
} from './uci.ts';

function info(ligne: string): LigneInfo {
  const r = parseLigneUci(ligne);
  if (!r || r.type !== 'info') throw new Error(`Attendu une ligne info, reçu ${r?.type}`);
  return r;
}

describe('parseLigneUci', () => {
  it('renvoie null sur une ligne vide', () => {
    expect(parseLigneUci('')).toBeNull();
    expect(parseLigneUci('   \n ')).toBeNull();
  });

  it('reconnaît uciok et readyok', () => {
    expect(parseLigneUci('uciok')).toEqual({ type: 'uciok' });
    expect(parseLigneUci('readyok')).toEqual({ type: 'readyok' });
  });

  it('analyse une ligne info complète', () => {
    const r = info(
      'info depth 20 seldepth 28 multipv 1 score cp 34 nodes 1234567 nps 890123 hashfull 250 tbhits 0 time 1387 pv e2e4 e7e5 g1f3 b8c6',
    );
    expect(r.profondeur).toBe(20);
    expect(r.profondeurSelective).toBe(28);
    expect(r.multipv).toBe(1);
    expect(r.evaluation).toEqual({ type: 'cp', valeur: 34 });
    expect(r.noeuds).toBe(1234567);
    expect(r.nps).toBe(890123);
    expect(r.hashfull).toBe(250);
    expect(r.tempsMs).toBe(1387);
    expect(r.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(r.borne).toBe(false);
  });

  it('analyse un score de mat, positif et négatif', () => {
    expect(info('info depth 10 score mate 3 pv e2e4').evaluation).toEqual({
      type: 'mat',
      valeur: 3,
    });
    expect(info('info depth 10 score mate -2 pv e2e4').evaluation).toEqual({
      type: 'mat',
      valeur: -2,
    });
  });

  it('signale les bornes lowerbound / upperbound', () => {
    expect(info('info depth 5 score cp 20 lowerbound pv e2e4').borne).toBe(true);
    expect(info('info depth 5 score cp 20 upperbound pv e2e4').borne).toBe(true);
    expect(info('info depth 5 score cp 20 pv e2e4').borne).toBe(false);
  });

  it('lit le numéro de MultiPV', () => {
    expect(info('info depth 12 multipv 3 score cp -15 pv d2d4').multipv).toBe(3);
    // MultiPV vaut 1 par défaut si le moteur ne l'annonce pas.
    expect(info('info depth 12 score cp -15 pv d2d4').multipv).toBe(1);
  });

  it('garde les coups de promotion dans la variante', () => {
    expect(info('info depth 9 score cp 900 pv a7a8q b8c6').pv).toEqual(['a7a8q', 'b8c6']);
  });

  it('ne retient que des coups valides dans la pv', () => {
    const r = info('info depth 9 score cp 10 pv e2e4 zz99 e7e5');
    expect(r.pv).toEqual(['e2e4']);
  });

  it('analyse bestmove avec et sans ponder', () => {
    expect(parseLigneUci('bestmove e2e4 ponder e7e5')).toEqual({
      type: 'bestmove',
      coup: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseLigneUci('bestmove d2d4')).toEqual({
      type: 'bestmove',
      coup: 'd2d4',
      ponder: null,
    });
  });

  it('traite bestmove (none) comme absence de coup', () => {
    expect(parseLigneUci('bestmove (none)')).toEqual({
      type: 'bestmove',
      coup: null,
      ponder: null,
    });
    expect(parseLigneUci('bestmove 0000')).toEqual({
      type: 'bestmove',
      coup: null,
      ponder: null,
    });
  });

  it("analyse l'identité du moteur", () => {
    expect(parseLigneUci('id name Stockfish 18')).toEqual({
      type: 'id',
      champ: 'name',
      valeur: 'Stockfish 18',
    });
  });

  it('analyse une déclaration option', () => {
    const r = parseLigneUci('option name Skill Level type spin default 20 min 0 max 20');
    expect(r).toEqual({
      type: 'option',
      nom: 'Skill Level',
      typeOption: 'spin',
      defaut: '20',
      min: 0,
      max: 20,
    });
  });

  it('classe « info string » comme message libre', () => {
    expect(parseLigneUci('info string NNUE evaluation using nn-abc.nnue')?.type).toBe('autre');
  });

  it('ne casse pas sur une ligne inconnue', () => {
    expect(parseLigneUci('Stockfish 18 by the Stockfish developers')?.type).toBe('autre');
  });
});

describe('versPointDeVueBlanc', () => {
  it('laisse inchangée une évaluation au trait blanc', () => {
    expect(versPointDeVueBlanc({ type: 'cp', valeur: 50 }, 'w')).toEqual({
      type: 'cp',
      valeur: 50,
    });
  });
  it('inverse une évaluation au trait noir', () => {
    expect(versPointDeVueBlanc({ type: 'cp', valeur: 50 }, 'b')).toEqual({
      type: 'cp',
      valeur: -50,
    });
    expect(versPointDeVueBlanc({ type: 'mat', valeur: 3 }, 'b')).toEqual({
      type: 'mat',
      valeur: -3,
    });
  });
});

describe('evaluationEnCp', () => {
  it('conserve les centipions', () => {
    expect(evaluationEnCp({ type: 'cp', valeur: 123 })).toBe(123);
    expect(evaluationEnCp({ type: 'cp', valeur: -456 })).toBe(-456);
  });

  it('place un mat au-dessus de toute évaluation en centipions', () => {
    const mat = evaluationEnCp({ type: 'mat', valeur: 5 });
    expect(mat).toBeGreaterThan(evaluationEnCp({ type: 'cp', valeur: 5000 }));
    expect(mat).toBeLessThan(CP_MAT);
  });

  it('privilégie un mat plus court', () => {
    expect(evaluationEnCp({ type: 'mat', valeur: 1 })).toBeGreaterThan(
      evaluationEnCp({ type: 'mat', valeur: 8 }),
    );
    expect(evaluationEnCp({ type: 'mat', valeur: -1 })).toBeLessThan(
      evaluationEnCp({ type: 'mat', valeur: -8 }),
    );
  });

  it('borne les évaluations extrêmes', () => {
    expect(evaluationEnCp({ type: 'cp', valeur: 99999 })).toBeLessThan(CP_MAT);
    expect(evaluationEnCp({ type: 'cp', valeur: -99999 })).toBeGreaterThan(-CP_MAT);
  });
});

describe('formaterEvaluation', () => {
  it('formate les centipions en français', () => {
    expect(formaterEvaluation({ type: 'cp', valeur: 124 })).toBe('+1,24');
    expect(formaterEvaluation({ type: 'cp', valeur: -50 })).toBe('−0,50');
    expect(formaterEvaluation({ type: 'cp', valeur: 0 })).toBe('0,00');
  });
  it('formate les mats', () => {
    expect(formaterEvaluation({ type: 'mat', valeur: 3 })).toBe('+M3');
    expect(formaterEvaluation({ type: 'mat', valeur: -2 })).toBe('−M2');
  });
  it('gère une évaluation absente', () => {
    expect(formaterEvaluation(undefined)).toBe('—');
  });
});

describe('probabiliteDeGain', () => {
  it('vaut 50 % dans une position égale', () => {
    expect(probabiliteDeGain(0)).toBeCloseTo(50, 5);
  });
  it('croît avec l’avantage', () => {
    expect(probabiliteDeGain(300)).toBeGreaterThan(probabiliteDeGain(100));
    expect(probabiliteDeGain(-300)).toBeLessThan(probabiliteDeGain(-100));
  });
  it('reste dans les bornes 0–100', () => {
    expect(probabiliteDeGain(100000)).toBeLessThanOrEqual(100);
    expect(probabiliteDeGain(-100000)).toBeGreaterThanOrEqual(0);
  });
});
