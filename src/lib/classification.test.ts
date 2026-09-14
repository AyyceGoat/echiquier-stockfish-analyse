import { describe, expect, it } from 'vitest';
import {
  classerCoup,
  momentsCharnieres,
  pdgBlancs,
  precisionCoup,
  precisionPartie,
  SEUILS_PAR_DEFAUT,
  type EntreeClassification,
} from './classification.ts';
import { probabiliteDeGain } from './uci.ts';

/** Base commune : position équilibrée, plusieurs coups légaux. */
function entree(avantCp: number, apresCp: number, extra: Partial<EntreeClassification> = {}) {
  return {
    avant: { type: 'cp', valeur: avantCp } as const,
    apres: { type: 'cp', valeur: apresCp } as const,
    estMeilleurCoup: false,
    nbCoupsLegaux: 30,
    ...extra,
  };
}

describe('classerCoup', () => {
  it('classe un coup sans perte comme excellent', () => {
    const r = classerCoup(entree(30, 30, { estMeilleurCoup: true }));
    expect(r.classement).toBe('excellent');
    expect(r.perteCp).toBe(0);
  });

  it('classe une petite perte comme imprécision', () => {
    expect(classerCoup(entree(20, -50)).classement).toBe('imprecision');
  });

  it('classe une perte moyenne comme erreur', () => {
    expect(classerCoup(entree(50, -120)).classement).toBe('erreur');
  });

  it('classe une grosse perte comme gaffe', () => {
    expect(classerCoup(entree(100, -250)).classement).toBe('gaffe');
  });

  it('ne compte jamais une perte négative', () => {
    // Le moteur voit parfois mieux après coup : le coup n'a rien coûté.
    const r = classerCoup(entree(10, 80));
    expect(r.perteCp).toBe(0);
    expect(r.classement).toBe('excellent');
  });

  it('reste indulgent dans une position déjà gagnée', () => {
    // Perte brute de 400 cp, mais la position reste totalement gagnante :
    // la probabilité de gain bouge à peine, ce n'est pas une gaffe.
    const r = classerCoup(entree(2000, 1600));
    expect(r.perteCp).toBe(400);
    expect(r.pertePdg).toBeLessThan(SEUILS_PAR_DEFAUT.gaffe.pdg);
    expect(r.classement).not.toBe('gaffe');
  });

  it('sanctionne la même perte brute dans une position équilibrée', () => {
    expect(classerCoup(entree(0, -400)).classement).toBe('gaffe');
  });

  it('marque un coup forcé comme unique', () => {
    const r = classerCoup(entree(0, -900, { nbCoupsLegaux: 1 }));
    expect(r.classement).toBe('unique');
  });

  it('marque le seul coup jouable comme unique', () => {
    const r = classerCoup(
      entree(50, 50, { estMeilleurCoup: true, ecartDeuxiemeCoup: 300 }),
    );
    expect(r.classement).toBe('unique');
  });

  it("n'annonce pas coup unique si le joueur n'a pas trouvé le coup", () => {
    const r = classerCoup(
      entree(50, -300, { estMeilleurCoup: false, ecartDeuxiemeCoup: 300 }),
    );
    expect(r.classement).toBe('gaffe');
  });

  it('annonce la théorie sur un coup de livre', () => {
    expect(classerCoup(entree(20, -10, { dansLaTheorie: true })).classement).toBe('theorie');
  });

  it("n'excuse pas une erreur grave sous prétexte de théorie", () => {
    expect(classerCoup(entree(20, -400, { dansLaTheorie: true })).classement).toBe('gaffe');
  });

  it('traite un mat manqué comme une gaffe', () => {
    const r = classerCoup({
      avant: { type: 'mat', valeur: 2 },
      apres: { type: 'cp', valeur: 100 },
      estMeilleurCoup: false,
      nbCoupsLegaux: 25,
    });
    expect(r.classement).toBe('gaffe');
  });

  it('respecte des seuils personnalisés', () => {
    const seuilsStricts = {
      ...SEUILS_PAR_DEFAUT,
      gaffe: { cp: 100, pdg: 1 },
      erreur: { cp: 60, pdg: 1 },
      imprecision: { cp: 20, pdg: 1 },
    };
    expect(classerCoup(entree(0, -200, { seuils: seuilsStricts })).classement).toBe('gaffe');
    expect(classerCoup(entree(0, -200)).classement).toBe('erreur');
  });
});

describe('precisionCoup', () => {
  it('donne 100 % pour un coup parfait', () => {
    expect(precisionCoup(50, 50)).toBeCloseTo(100, 0);
  });

  it('décroît avec la chute de probabilité de gain', () => {
    const a = precisionCoup(50, 45);
    const b = precisionCoup(50, 30);
    const c = precisionCoup(50, 10);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('reste borné entre 0 et 100', () => {
    expect(precisionCoup(100, 0)).toBeGreaterThanOrEqual(0);
    expect(precisionCoup(100, 0)).toBeLessThanOrEqual(100);
    expect(precisionCoup(0, 100)).toBeLessThanOrEqual(100);
  });

  it('ne pénalise pas une amélioration', () => {
    expect(precisionCoup(40, 60)).toBeCloseTo(100, 0);
  });
});

describe('precisionPartie', () => {
  it('renvoie null sans aucun coup', () => {
    expect(precisionPartie([])).toBeNull();
  });

  it('fait la moyenne arrondie au dixième', () => {
    expect(precisionPartie([100, 90, 80])).toBe(90);
    expect(precisionPartie([100, 95])).toBe(97.5);
  });

  it('donne 100 sur une partie parfaite', () => {
    expect(precisionPartie([100, 100, 100])).toBe(100);
  });
});

describe('pdgBlancs', () => {
  it('suit la probabilité de gain des blancs', () => {
    expect(pdgBlancs({ type: 'cp', valeur: 0 })).toBeCloseTo(50, 5);
    expect(pdgBlancs({ type: 'cp', valeur: 500 })).toBeGreaterThan(70);
    expect(pdgBlancs({ type: 'mat', valeur: 2 })).toBeGreaterThan(95);
    expect(pdgBlancs({ type: 'mat', valeur: -2 })).toBeLessThan(5);
  });

  it('est cohérent avec probabiliteDeGain', () => {
    expect(pdgBlancs({ type: 'cp', valeur: 250 })).toBeCloseTo(probabiliteDeGain(250), 5);
  });
});

describe('momentsCharnieres', () => {
  const coups = [
    { id: 'a', cpAvantBlancs: 0, cpApresBlancs: 10 },
    { id: 'b', cpAvantBlancs: 10, cpApresBlancs: -400 },
    { id: 'c', cpAvantBlancs: -400, cpApresBlancs: -380 },
    { id: 'd', cpAvantBlancs: -380, cpApresBlancs: 200 },
    { id: 'e', cpAvantBlancs: 200, cpApresBlancs: -100 },
  ];

  it('retient les plus grosses variations', () => {
    const r = momentsCharnieres(coups, 3).map((c) => c.id);
    expect(r).toEqual(['d', 'b', 'e']);
  });

  it('respecte le nombre demandé', () => {
    expect(momentsCharnieres(coups, 1)).toHaveLength(1);
    expect(momentsCharnieres(coups, 10)).toHaveLength(5);
  });

  it('ignore les positions déjà décidées', () => {
    const decides = [
      { id: 'x', cpAvantBlancs: 3000, cpApresBlancs: 1000 },
      { id: 'y', cpAvantBlancs: 0, cpApresBlancs: -100 },
    ];
    expect(momentsCharnieres(decides, 2).map((c) => c.id)).toEqual(['y']);
  });

  it('gère une liste vide', () => {
    expect(momentsCharnieres([], 3)).toEqual([]);
  });
});
