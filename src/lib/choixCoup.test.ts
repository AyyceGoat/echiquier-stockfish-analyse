import { describe, expect, it } from 'vitest';
import { choisirCoup, pertesParCandidat, probabilites, type CandidatCoup } from './choixCoup.ts';
import { NIVEAUX } from './niveaux.ts';

const cp = (coup: string, valeur: number): CandidatCoup => ({
  coup,
  evaluation: { type: 'cp', valeur },
});

/** Générateur déterministe : rend les valeurs fournies, puis boucle. */
function aleaScripte(...valeurs: number[]) {
  let i = 0;
  return () => valeurs[i++ % valeurs.length];
}

describe('pertesParCandidat', () => {
  it('mesure la perte par rapport au meilleur candidat', () => {
    const pertes = pertesParCandidat([cp('a', 50), cp('b', -20), cp('c', 10)]);
    expect(pertes).toEqual([0, 70, 40]);
  });

  it('plafonne les désastres, pour qu’ils ne se distinguent plus entre eux', () => {
    // Un mat encaissé donnerait une perte de 30 000, qui écraserait tous les
    // autres écarts dans le softmax.
    const pertes = pertesParCandidat([
      cp('bon', 0),
      { coup: 'mat', evaluation: { type: 'mat', valeur: -1 } },
    ]);
    expect(pertes[0]).toBe(0);
    expect(pertes[1]).toBe(1500);
  });

  it('ne renvoie jamais de perte négative', () => {
    for (const p of pertesParCandidat([cp('a', -300), cp('b', 900)])) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('choisirCoup', () => {
  it('renvoie null sur une liste vide, pour que l’appelant retombe sur bestmove', () => {
    expect(choisirCoup([], { temperatureCp: 100, probaBevue: 0 })).toBeNull();
  });

  it('renvoie l’unique candidat sans tirer au sort', () => {
    expect(choisirCoup([cp('e2e4', 30)], { temperatureCp: 900, probaBevue: 1 })).toBe('e2e4');
  });

  it('à température nulle, joue toujours le meilleur coup', () => {
    const candidats = [cp('mauvais', -400), cp('meilleur', 120), cp('moyen', -30)];
    for (let i = 0; i < 20; i++) {
      const choisi = choisirCoup(candidats, { temperatureCp: 0, probaBevue: 0 }, Math.random);
      expect(choisi).toBe('meilleur');
    }
  });

  it('en bévue certaine, joue le pire des candidats jouables', () => {
    const candidats = [cp('meilleur', 100), cp('moyen', 0), cp('pire', -500)];
    const choisi = choisirCoup(
      candidats,
      { temperatureCp: 50, probaBevue: 1 },
      aleaScripte(0), // 0 < probaBevue : la bévue se déclenche
    );
    expect(choisi).toBe('pire');
  });

  it('n’offre jamais un mat immédiat, même en bévue', () => {
    // Un grand débutant voit l'échec et mat en un coup. Le lui faire jouer
    // donnerait une partie absurde, pas une partie faible.
    const candidats: CandidatCoup[] = [
      cp('correct', 0),
      cp('faible', -600),
      { coup: 'suicide', evaluation: { type: 'mat', valeur: -1 } },
    ];
    const choisi = choisirCoup(candidats, { temperatureCp: 400, probaBevue: 1 }, aleaScripte(0));
    expect(choisi).toBe('faible');
  });

  it('respecte la pondération du tirage', () => {
    const candidats = [cp('a', 0), cp('b', -1000)];
    // `b` perd dix pions : à température 50, son poids est e^-20, négligeable.
    // Un tirage juste au-dessus de 0 doit donc tomber sur `a`.
    expect(choisirCoup(candidats, { temperatureCp: 50, probaBevue: 0 }, aleaScripte(0.5))).toBe('a');
    // Et un tirage à l'extrême fin de la plage reste sur `a`, tant son poids
    // domine la somme.
    expect(
      choisirCoup(candidats, { temperatureCp: 50, probaBevue: 0 }, aleaScripte(0.999)),
    ).toBe('a');
  });
});

describe('probabilites', () => {
  it('somme à 1', () => {
    const p = probabilites([cp('a', 0), cp('b', -80), cp('c', -300)], 150);
    expect(p.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
  });

  it('classe les coups par qualité décroissante', () => {
    const [a, b, c] = probabilites([cp('a', 0), cp('b', -80), cp('c', -300)], 150);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('une température haute aplatit la distribution', () => {
    const candidats = [cp('a', 0), cp('b', -200)];
    const serre = probabilites(candidats, 20);
    const large = probabilites(candidats, 800);
    // À T=20 le meilleur écrase tout ; à T=800 les deux se rapprochent.
    expect(serre[0]).toBeGreaterThan(0.99);
    expect(large[0]).toBeLessThan(0.65);
    expect(large[1]).toBeGreaterThan(0.35);
  });

  it('une température nulle concentre tout sur le meilleur', () => {
    expect(probabilites([cp('a', 0), cp('b', -1)], 0)).toEqual([1, 0]);
  });
});

describe('cohérence de la table des paliers', () => {
  it('ordonne les paliers par force croissante', () => {
    const avecElo = NIVEAUX.filter((n) => n.elo !== null);
    for (let i = 1; i < avecElo.length; i++) {
      expect(avecElo[i].elo!).toBeGreaterThan(avecElo[i - 1].elo!);
    }
    // Le dernier palier est la pleine force, sans Elo affiché.
    expect(NIVEAUX[NIVEAUX.length - 1].elo).toBeNull();
  });

  it('couvre les paliers demandés', () => {
    const elos = NIVEAUX.map((n) => n.elo);
    for (const attendu of [400, 800, 1200, 1600, 2000]) {
      expect(elos).toContain(attendu);
    }
  });

  it('n’active jamais UCI_Elo sous son plancher de 1320', () => {
    for (const n of NIVEAUX) {
      if (n.limiterElo) {
        expect(n.uciElo).toBeDefined();
        expect(n.uciElo!).toBeGreaterThanOrEqual(1320);
      }
    }
  });

  it('relâche le tirage à mesure que le palier faiblit', () => {
    // C'est le tirage, et non UCI_Elo, qui porte la différence sous 1320 :
    // température et bévue doivent décroître quand la force monte.
    const avecElo = NIVEAUX.filter((n) => n.elo !== null);
    for (let i = 1; i < avecElo.length; i++) {
      expect(avecElo[i].temperatureCp).toBeLessThanOrEqual(avecElo[i - 1].temperatureCp);
      expect(avecElo[i].probaBevue).toBeLessThanOrEqual(avecElo[i - 1].probaBevue);
      expect(avecElo[i].candidats).toBeLessThanOrEqual(avecElo[i - 1].candidats);
    }
  });

  it('demande assez de candidats pour que le tirage ait un sens', () => {
    for (const n of NIVEAUX) {
      if (n.temperatureCp > 0) expect(n.candidats).toBeGreaterThan(1);
      if (n.candidats === 1) expect(n.temperatureCp).toBe(0);
      // Le moteur plafonne MultiPV à 16.
      expect(n.candidats).toBeLessThanOrEqual(16);
    }
  });
});
