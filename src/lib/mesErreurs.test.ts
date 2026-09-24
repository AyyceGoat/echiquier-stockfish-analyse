import { describe, expect, it } from 'vitest';
import {
  adversaireDe,
  compterMesParties,
  monCampDe,
  numeroCoup,
  regrouperMesErreurs,
} from './mesErreurs.ts';
import type { PartieEnregistree } from '../db/parties.ts';
import type { CoupAnalyse, RapportAnalyse } from '../analysis/analyseur.ts';
import type { MotifExplication } from './explications.ts';
import type { Classement } from './classification.ts';

function coup(
  sur: Partial<CoupAnalyse> & { motif?: MotifExplication | undefined },
): CoupAnalyse {
  const { motif, ...reste } = sur;
  return {
    ply: 0,
    san: 'Cf3',
    uci: 'g1f3',
    couleur: 'w',
    fenAvant: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenApres: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
    avant: { type: 'cp', valeur: 20 },
    apres: { type: 'cp', valeur: -200 },
    cpAvantBlancs: 20,
    cpApresBlancs: -200,
    classement: 'gaffe' as Classement,
    perteCp: 220,
    pertePdg: 20,
    precision: 40,
    meilleurUci: 'd2d4',
    meilleurSan: 'd4',
    varianteSan: ['d4', 'd5'],
    varianteUci: ['d2d4', 'd7d5'],
    explication: {
      phrase: 'Ce coup laisse une pièce en prise.',
      motif: motif === undefined ? 'piece-en-prise' : motif,
    },
    estMeilleurCoup: false,
    ...reste,
  } as CoupAnalyse;
}

function rapport(coups: CoupAnalyse[]): RapportAnalyse {
  return {
    fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    coups,
    precisionBlancs: 80,
    precisionNoirs: 70,
    perteMoyenneBlancs: 50,
    perteMoyenneNoirs: 70,
    eloBlancs: 1400,
    eloNoirs: 1200,
    coupsRetenusBlancs: 20,
    coupsRetenusNoirs: 20,
    bilanBlancs: {} as RapportAnalyse['bilanBlancs'],
    bilanNoirs: {} as RapportAnalyse['bilanNoirs'],
    momentsCles: [],
    ouverture: null,
    reglages: { profondeur: 14, tempsMs: 0 },
    complet: true,
  } as RapportAnalyse;
}

function partie(sur: Partial<PartieEnregistree> = {}): PartieEnregistree {
  return {
    id: 'p1',
    date: 1000,
    mode: 'assiste',
    blanc: 'Moi',
    noir: 'Ephraim (Amateur)',
    resultat: '1-0',
    finPar: 'mat',
    fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    coupsSan: ['Cf3'],
    ...sur,
  };
}

describe('monCampDe', () => {
  it('préfère le camp explicitement enregistré', () => {
    expect(monCampDe(partie({ monCamp: 'b', blanc: 'Moi' }))).toBe('b');
  });

  it('retombe sur le nom pour les parties antérieures', () => {
    expect(monCampDe(partie({ blanc: 'Moi', noir: 'Ephraim (Amateur)' }))).toBe('w');
    expect(monCampDe(partie({ blanc: 'Johana (Club)', noir: 'Moi' }))).toBe('b');
  });

  it('renvoie null quand le joueur n’est d’aucun côté', () => {
    // Position importée ou partie du banc : ce ne sont pas ses erreurs.
    expect(monCampDe(partie({ blanc: 'B-essai', noir: 'N-essai' }))).toBeNull();
  });
});

describe('adversaireDe', () => {
  it('nomme l’autre camp', () => {
    const p = partie({ blanc: 'Moi', noir: 'Serena (Club)' });
    expect(adversaireDe(p, 'w')).toBe('Serena (Club)');
    expect(adversaireDe(p, 'b')).toBe('Moi');
  });
});

describe('regrouperMesErreurs', () => {
  it('ignore les coups de l’adversaire', () => {
    // C'était le défaut : la section comptait aussi les bévues du moteur.
    const p = partie({
      monCamp: 'w',
      rapport: rapport([
        coup({ ply: 0, couleur: 'w' }),
        coup({ ply: 1, couleur: 'b' }),
        coup({ ply: 3, couleur: 'b' }),
      ]),
    });
    const groupes = regrouperMesErreurs([p]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].occurrences).toHaveLength(1);
    expect(groupes[0].occurrences[0].couleur).toBe('w');
  });

  it('suit le camp du joueur quand il joue les noirs', () => {
    const p = partie({
      monCamp: 'b',
      blanc: 'Ephraim (Amateur)',
      noir: 'Moi',
      rapport: rapport([coup({ ply: 0, couleur: 'w' }), coup({ ply: 1, couleur: 'b' })]),
    });
    const occ = regrouperMesErreurs([p])[0].occurrences;
    expect(occ).toHaveLength(1);
    expect(occ[0].ply).toBe(1);
    expect(occ[0].adversaire).toBe('Ephraim (Amateur)');
  });

  it('ne retient que les coups fautifs', () => {
    const p = partie({
      monCamp: 'w',
      rapport: rapport([
        coup({ ply: 0, classement: 'excellent' }),
        coup({ ply: 2, classement: 'theorie' }),
        coup({ ply: 4, classement: 'erreur' }),
      ]),
    });
    expect(regrouperMesErreurs([p])[0].occurrences).toHaveLength(1);
  });

  it('écarte les motifs qui ne décrivent pas une erreur', () => {
    const p = partie({
      monCamp: 'w',
      rapport: rapport([
        coup({ ply: 0, motif: 'passif' }),
        coup({ ply: 2, motif: 'sans-consequence' }),
        coup({ ply: 4, motif: 'fourchette' }),
      ]),
    });
    const groupes = regrouperMesErreurs([p]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].motif).toBe('fourchette');
  });

  it('remonte la position réelle, le coup joué et le coup attendu', () => {
    const p = partie({
      monCamp: 'w',
      rapport: rapport([
        coup({
          ply: 8,
          fenAvant: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
          san: 'Cg5',
          uci: 'f3g5',
          meilleurSan: 'O-O',
          meilleurUci: 'e1g1',
        }),
      ]),
    });
    const o = regrouperMesErreurs([p])[0].occurrences[0];
    expect(o.fenAvant).toContain('r1bqkb1r');
    expect(o.san).toBe('Cg5');
    expect(o.meilleurSan).toBe('O-O');
    expect(o.meilleurUci).toBe('e1g1');
    expect(o.phrase).toContain('en prise');
  });

  it('classe les motifs du plus fréquent au moins fréquent', () => {
    const p = partie({
      monCamp: 'w',
      rapport: rapport([
        coup({ ply: 0, motif: 'fourchette' }),
        coup({ ply: 2, motif: 'piece-en-prise' }),
        coup({ ply: 4, motif: 'piece-en-prise' }),
        coup({ ply: 6, motif: 'piece-en-prise' }),
      ]),
    });
    const groupes = regrouperMesErreurs([p]);
    expect(groupes.map((g) => g.motif)).toEqual(['piece-en-prise', 'fourchette']);
    expect(groupes[0].occurrences).toHaveLength(3);
  });

  it('rassemble les occurrences de plusieurs parties, la plus récente d’abord', () => {
    const vieille = partie({
      id: 'a',
      date: 100,
      monCamp: 'w',
      rapport: rapport([coup({ ply: 0 })]),
    });
    const recente = partie({
      id: 'b',
      date: 900,
      monCamp: 'w',
      rapport: rapport([coup({ ply: 0 })]),
    });
    const occ = regrouperMesErreurs([vieille, recente])[0].occurrences;
    expect(occ.map((o) => o.partieId)).toEqual(['b', 'a']);
  });

  it('ignore une partie sans rapport', () => {
    expect(regrouperMesErreurs([partie({ rapport: undefined })])).toEqual([]);
  });
});

describe('compterMesParties', () => {
  it('ne compte que les parties analysées où le joueur figure', () => {
    const parties = [
      partie({ id: 'a', monCamp: 'w', rapport: rapport([]) }),
      partie({ id: 'b', rapport: undefined }),
      partie({ id: 'c', blanc: 'B-essai', noir: 'N-essai', rapport: rapport([]) }),
    ];
    expect(compterMesParties(parties)).toBe(1);
  });
});

describe('numeroCoup', () => {
  it('distingue le trait', () => {
    expect(numeroCoup(0, 'w')).toBe('1.');
    expect(numeroCoup(1, 'b')).toBe('1…');
    expect(numeroCoup(102, 'w')).toBe('52.');
    expect(numeroCoup(103, 'b')).toBe('52…');
  });
});
