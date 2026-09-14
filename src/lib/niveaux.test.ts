import { describe, expect, it } from 'vitest';
import {
  libelleNiveau,
  NIVEAU_PAR_DEFAUT,
  NIVEAUX,
  niveauDepuisAncienneValeur,
  niveauParId,
} from './niveaux.ts';

describe('table des niveaux', () => {
  it('propose les six paliers attendus, dans l’ordre croissant', () => {
    expect(NIVEAUX.map((n) => n.id)).toEqual([
      'debutant',
      'amateur',
      'club',
      'fort',
      'expert',
      'maximum',
    ]);
  });

  it('annonce un Elo croissant, la pleine force en dernier', () => {
    const elos = NIVEAUX.map((n) => n.elo);
    expect(elos[elos.length - 1]).toBeNull();
    const chiffres = elos.slice(0, -1) as number[];
    for (let i = 1; i < chiffres.length; i++) {
      expect(chiffres[i]).toBeGreaterThan(chiffres[i - 1]);
    }
  });

  it('augmente le Skill Level avec le niveau', () => {
    for (let i = 1; i < NIVEAUX.length; i++) {
      expect(NIVEAUX[i].skill).toBeGreaterThanOrEqual(NIVEAUX[i - 1].skill);
    }
  });

  it('respecte le plancher d’UCI_Elo imposé par le moteur', () => {
    // Stockfish refuse une valeur inférieure à 1320.
    for (const n of NIVEAUX) {
      if (n.uciElo !== undefined) expect(n.uciElo).toBeGreaterThanOrEqual(1320);
    }
  });

  it('bride la profondeur là où UCI_Elo ne peut pas descendre', () => {
    // C'est le seul levier sous 1320 Elo : sans lui, « Débutant » jouerait
    // encore à plus de 1300, ce qui n'est pas un débutant.
    const debutant = niveauParId('debutant');
    expect(debutant.profondeurMax).toBe(1);
    expect(niveauParId('amateur').profondeurMax).toBeLessThanOrEqual(4);
  });

  it('ne bride ni la profondeur ni la force au niveau maximum', () => {
    const max = niveauParId('maximum');
    expect(max.profondeurMax).toBeNull();
    expect(max.limiterElo).toBe(false);
    expect(max.skill).toBe(20);
  });

  it('laisse plus de temps aux niveaux élevés', () => {
    for (let i = 1; i < NIVEAUX.length; i++) {
      expect(NIVEAUX[i].tempsMs).toBeGreaterThanOrEqual(NIVEAUX[i - 1].tempsMs);
    }
  });

  it('décrit chaque palier en une phrase', () => {
    for (const n of NIVEAUX) {
      expect(n.description.length).toBeGreaterThan(15);
      expect(n.description.endsWith('.')).toBe(true);
    }
  });
});

describe('niveauParId', () => {
  it('retrouve un palier', () => {
    expect(niveauParId('club').libelle).toBe('Club');
  });

  it('retombe sur le palier par défaut si l’identifiant est inconnu', () => {
    expect(niveauParId('inexistant').id).toBe(NIVEAU_PAR_DEFAUT);
  });
});

describe('libelleNiveau', () => {
  it('affiche l’ordre de grandeur Elo', () => {
    expect(libelleNiveau(niveauParId('club'))).toBe('Club (~1600 Elo)');
  });
  it('n’invente pas d’Elo pour la pleine force', () => {
    expect(libelleNiveau(niveauParId('maximum'))).toBe('Maximum');
  });
});

describe('niveauDepuisAncienneValeur', () => {
  it('convertit un ancien réglage numérique', () => {
    expect(niveauDepuisAncienneValeur(0)).toBe('debutant');
    expect(niveauDepuisAncienneValeur(5)).toBe('amateur');
    expect(niveauDepuisAncienneValeur(10)).toBe('club');
    expect(niveauDepuisAncienneValeur(20)).toBe('maximum');
  });

  it('retombe sur le défaut pour une valeur absente ou absurde', () => {
    expect(niveauDepuisAncienneValeur(undefined)).toBe(NIVEAU_PAR_DEFAUT);
    expect(niveauDepuisAncienneValeur('club')).toBe(NIVEAU_PAR_DEFAUT);
    expect(niveauDepuisAncienneValeur(NaN)).toBe(NIVEAU_PAR_DEFAUT);
  });
});
