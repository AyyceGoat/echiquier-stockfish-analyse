import { describe, expect, it } from 'vitest';
import {
  commentaireLocal,
  NIVEAUX_ELEVE,
  palierDuProfesseur,
  PROFESSEUR_PAR_DEFAUT,
  PROFESSEURS,
  professeurParId,
  type ContexteCommentaire,
  type NiveauEleve,
} from './professeurs.ts';
import { NIVEAUX } from './niveaux.ts';
import { REPERES } from './reperesPortraits.ts';

const contexte = (sur: Partial<ContexteCommentaire> = {}): ContexteCommentaire => ({
  classement: 'gaffe',
  coupSan: 'Cf3',
  meilleurSan: 'Td1',
  explication: {
    phrase: 'Ce coup laisse votre cavalier en e4 en prise.',
    complement: 'La colonne d reste ouverte.',
    motif: 'piece-en-prise',
  },
  eleve: 'intermediaire',
  ...sur,
});

describe('table des professeurs', () => {
  it('compte les quatre professeurs attendus', () => {
    expect(PROFESSEURS.map((p) => p.id)).toEqual([
      'homme-ultime',
      'ephraim',
      'johana',
      'serena',
    ]);
  });

  it('retombe sur le professeur par défaut si l’identifiant est inconnu', () => {
    expect(professeurParId('inexistant').id).toBe(PROFESSEUR_PAR_DEFAUT);
  });

  it('n’annonce que des paliers qui existent dans l’échelle du moteur', () => {
    const ids = NIVEAUX.map((n) => n.id);
    for (const p of PROFESSEURS) {
      expect(ids).toContain(p.palierMin);
      expect(ids).toContain(p.palierMax);
    }
  });

  it('a des repères de portrait pour chacun', () => {
    for (const p of PROFESSEURS) {
      const r = REPERES[p.id];
      expect(r, `repères manquants pour ${p.id}`).toBeDefined();
      // Les deux yeux sont à la même hauteur à quelques pixels près, et la
      // bouche est sous eux : un repère inversé se verrait immédiatement.
      expect(Math.abs(r.oeilG.cy - r.oeilD.cy)).toBeLessThan(12);
      expect(r.bouche.cy).toBeGreaterThan(r.oeilG.cy);
      expect(r.oeilG.cx).toBeLessThan(r.oeilD.cx);
      expect(r.cou).toBeGreaterThan(r.bouche.cy);
    }
  });

  it('ne fournit aucune image de bouche pour l’instant', () => {
    // Le mécanisme existe, mais les portraits actuels ne s'y prêtent pas :
    // l'ouverture simulée produisait une fente sombre à bords francs. Tant
    // que ce tableau est vide, l'interface se limite au halo.
    for (const p of PROFESSEURS) expect(p.bouches).toEqual([]);
  });
});

describe('palierDuProfesseur', () => {
  it('suit le niveau déclaré par l’élève', () => {
    const serena = professeurParId('serena');
    expect(palierDuProfesseur(serena, 'debutant')).toBe('debutant');
    expect(palierDuProfesseur(serena, 'intermediaire')).toBe('amateur');
    expect(palierDuProfesseur(serena, 'avance')).toBe('club');
  });

  it('borne le palier à l’intervalle du professeur', () => {
    // Johana accompagne les débutants : lui demander « confirmé » ne doit
    // pas la faire jouer à pleine force.
    const johana = professeurParId('johana');
    expect(palierDuProfesseur(johana, 'confirme')).toBe(johana.palierMax);
    // L'Homme Ultime ne descend pas au niveau du grand débutant.
    const ultime = professeurParId('homme-ultime');
    expect(palierDuProfesseur(ultime, 'decouverte')).toBe(ultime.palierMin);
  });

  it('renvoie toujours un palier existant, quel que soit le niveau', () => {
    const ids = NIVEAUX.map((n) => n.id);
    for (const p of PROFESSEURS) {
      for (const n of NIVEAUX_ELEVE) {
        expect(ids).toContain(palierDuProfesseur(p, n.id));
      }
    }
  });
});

describe('commentaireLocal', () => {
  it('ne dépend pas du réseau', () => {
    expect(commentaireLocal.enLigne).toBe(false);
  });

  it('reprend l’explication produite par l’analyse', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte());
      expect(t).toContain('cavalier en e4 en prise');
    }
  });

  it('donne le meilleur coup quand le coup joué était fautif', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte());
      expect(t, p.id).toContain('Td1');
    }
  });

  it('ne réclame pas un meilleur coup quand le coup était bon', async () => {
    const t = await commentaireLocal.commenter(
      professeurParId('ephraim'),
      contexte({ classement: 'excellent', meilleurSan: null }),
    );
    expect(t).not.toContain('Td1');
  });

  it('donne à chaque professeur une voix distincte', async () => {
    const textes = await Promise.all(
      PROFESSEURS.map((p) => commentaireLocal.commenter(p, contexte())),
    );
    expect(new Set(textes).size).toBe(PROFESSEURS.length);
  });

  it('vouvoie, pour les quatre', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte());
      // Aucune marque de tutoiement : ni « tu », ni « ton/ta/tes », ni les
      // terminaisons verbales en -es qui l'accompagnent.
      expect(t, p.id).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
    }
  });

  it('fait digresser Serena, et elle seule', async () => {
    const serena = await commentaireLocal.commenter(professeurParId('serena'), contexte());
    expect(serena).toMatch(/Capablanca|La Havane/);
    for (const id of ['homme-ultime', 'ephraim', 'johana']) {
      const t = await commentaireLocal.commenter(professeurParId(id), contexte());
      expect(t, id).not.toMatch(/Capablanca|La Havane/);
    }
  });

  it('épargne le vocabulaire technique aux débutants', async () => {
    const ctx = contexte({
      explication: {
        phrase: 'Votre tour est attaquée.',
        complement: 'La case d4 devient un avant-poste.',
        motif: 'piece-en-prise',
      },
    });
    const johana = professeurParId('johana');
    const debutant = await commentaireLocal.commenter(johana, { ...ctx, eleve: 'decouverte' });
    const avance = await commentaireLocal.commenter(johana, { ...ctx, eleve: 'avance' });
    expect(debutant).not.toContain('avant-poste');
    expect(avance).toContain('avant-poste');
  });

  it('reste stable pour un même coup : deux appels donnent le même texte', async () => {
    // Le tirage des tournures est déterministe, dérivé du coup et du
    // classement : sans cela le commentaire changerait à chaque rendu React.
    const p = professeurParId('homme-ultime');
    const a = await commentaireLocal.commenter(p, contexte());
    const b = await commentaireLocal.commenter(p, contexte());
    expect(a).toBe(b);
  });

  it('produit un texte pour tous les classements et tous les niveaux', async () => {
    const classements = ['theorie', 'unique', 'excellent', 'bon', 'imprecision', 'erreur', 'gaffe'] as const;
    for (const p of PROFESSEURS) {
      for (const c of classements) {
        for (const n of NIVEAUX_ELEVE) {
          const t = await commentaireLocal.commenter(
            p,
            contexte({ classement: c, eleve: n.id as NiveauEleve }),
          );
          expect(t.length, `${p.id}/${c}/${n.id}`).toBeGreaterThan(10);
        }
      }
    }
  });
});
