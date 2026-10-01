import { describe, expect, it } from 'vitest';
import { empreinteReplique, phrasesDe } from './voixAudio.ts';
import { ACQUIESCE, INTERROMPU, REACTIONS, SALUTATIONS } from './repertoireProfesseurs.ts';
import manifeste from './voixManifeste.json';
import attribution from './voixProfesseurs.json';
import { PROFESSEURS } from './professeurs.ts';

describe('phrasesDe', () => {
  it('découpe un commentaire en phrases complètes', () => {
    const t =
      'Non, c’est une faute grave. Ce coup laisse votre cavalier en prise. Il fallait jouer Td1.';
    expect(phrasesDe(t)).toEqual([
      'Non, c’est une faute grave.',
      'Ce coup laisse votre cavalier en prise.',
      'Il fallait jouer Td1.',
    ]);
  });

  it('reconnaît les points de suspension et l’exclamation', () => {
    expect(phrasesDe('Bravo ! Vous progressez… Continuez.')).toHaveLength(3);
  });

  it('ne rend rien sur du vide', () => {
    expect(phrasesDe('   ')).toEqual([]);
  });

  it('garde une phrase sans ponctuation finale', () => {
    // Un fragment produit par l'assemblage peut ne pas se terminer par un
    // point : il doit rester prononçable plutôt que disparaître.
    expect(phrasesDe('Le moment décisif est 17… Cf6')).not.toHaveLength(0);
  });
});

describe('attribution des voix', () => {
  it('donne une voix à chaque professeur', () => {
    for (const p of PROFESSEURS) {
      expect(attribution, p.id).toHaveProperty(p.id);
    }
  });

  it('ne donne jamais la même voix à deux professeurs', () => {
    // C'était le défaut signalé : quatre professeurs pour deux voix.
    const voix = Object.values(attribution as Record<string, string>);
    expect(new Set(voix).size).toBe(voix.length);
  });
});

describe('manifeste des phrases pré-générées', () => {
  const entrees = manifeste as Record<string, string>;

  it('n’est pas vide', () => {
    expect(Object.keys(entrees).length).toBeGreaterThan(500);
  });

  it('ne référence que des fichiers du dossier livré', () => {
    for (const chemin of Object.values(entrees)) {
      expect(chemin).toMatch(/^\/voix\/figees\/[0-9a-f]{24}\.mp3$/);
    }
  });

  it('a une empreinte distincte par fichier', () => {
    const fichiers = Object.values(entrees);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it('couvre chaque professeur avec sa voix, phrase par phrase', async () => {
    // Le compte total ne prouve rien, et l'entrée de registre non plus : la
    // lecture demande un fichier par PHRASE. Un salut de trois phrases dont
    // seul le bloc entier serait enregistré partirait en synthèse à la
    // demande — c'est le défaut qu'on garde ici.
    const voix = attribution as Record<string, string>;
    for (const p of PROFESSEURS) {
      const blocs = [
        ...(SALUTATIONS[p.id] ?? []),
        ...(ACQUIESCE[p.id] ?? []),
        ...(INTERROMPU[p.id] ?? []),
        ...Object.values(REACTIONS[p.id] ?? {}).flat(),
      ];
      expect(blocs.length, p.id).toBeGreaterThan(40);
      const manquantes: string[] = [];
      for (const bloc of blocs) {
        for (const phrase of phrasesDe(bloc)) {
          const cle = await empreinteReplique(voix[p.id], phrase);
          if (!entrees[cle]) manquantes.push(phrase);
        }
      }
      expect(manquantes, `${p.id} · ${voix[p.id]}`).toEqual([]);
    }
  });
});
