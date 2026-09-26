import { describe, expect, it } from 'vitest';
import {
  commentaireFinPartie,
  commentaireLocal,
  issueDe,
  salutationDe,
  NIVEAUX_ELEVE,
  palierDuProfesseur,
  PROFESSEUR_PAR_DEFAUT,
  PROFESSEURS,
  professeurParId,
  type ContexteCommentaire,
  type NiveauEleve,
} from './professeurs.ts';
import { NIVEAUX } from './niveaux.ts';
import { LONGUEUR_CONFORTABLE } from './parole.ts';
import { boiteBouche, COTE_SOURCE, REPERES } from './reperesPortraits.ts';

const contexte = (sur: Partial<ContexteCommentaire> = {}): ContexteCommentaire => ({
  classement: 'gaffe',
  // Notation ANGLAISE : c'est celle que produit chess.js, et donc celle que
  // l'application transmet. Le professeur ne la prononce jamais, mais il s'en
  // sert pour retrouver la pièce déplacée.
  coupSan: 'Nf3',
  fenAvant: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  meilleurSan: 'e4',
  varianteSan: ['Td1', 'Dxd1', 'Txd1', 'Cf6'],
  reponseAdverseSan: 'Fxe4',
  perteCp: 320,
  cpApres: -80,
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

  it('fournit deux états de bouche par professeur', () => {
    // Pastilles découpées dans de vrais rendus bouche ouverte, pas une
    // ouverture simulée : la précédente tentative produisait une fente
    // sombre à bords francs, celle-ci n'invente aucun pixel.
    for (const p of PROFESSEURS) {
      expect(p.bouches, p.id).toEqual([
        `/profs/${p.id}-bouche-entrouverte.webp`,
        `/profs/${p.id}-bouche-ouverte.webp`,
      ]);
    }
  });

  it('place la pastille de bouche sur la bouche', () => {
    for (const p of PROFESSEURS) {
      const r = REPERES[p.id];
      const b = boiteBouche(r);
      // Elle englobe la bouche…
      expect(b.x, p.id).toBeLessThan(r.bouche.cx - r.bouche.rx);
      expect(b.x + b.w, p.id).toBeGreaterThan(r.bouche.cx + r.bouche.rx);
      expect(b.y, p.id).toBeLessThan(r.bouche.cy - r.bouche.ry);
      expect(b.y + b.h, p.id).toBeGreaterThan(r.bouche.cy + r.bouche.ry);
      // …sans remonter jusqu'aux yeux, sinon le fondu rognerait le regard.
      expect(b.y, p.id).toBeGreaterThan(Math.max(r.oeilG.cy, r.oeilD.cy));
      // …et sans déborder de l'image.
      expect(b.x, p.id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, p.id).toBeLessThanOrEqual(COTE_SOURCE);
      expect(b.y + b.h, p.id).toBeLessThanOrEqual(COTE_SOURCE);
    }
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

  it('ne prononce JAMAIS de notation algébrique', async () => {
    // C'est la règle qui commande tout le module : « Cg6 » ne se comprend
    // pas à l'oreille et la synthèse vocale l'écorche.
    const classements = ['theorie', 'unique', 'excellent', 'bon', 'imprecision', 'erreur', 'gaffe'] as const;
    for (const p of PROFESSEURS) {
      for (const c of classements) {
        for (const n of NIVEAUX_ELEVE) {
          const t = await commentaireLocal.commenter(
            p,
            contexte({ classement: c, eleve: n.id as NiveauEleve }),
          );
          expect(t, `${p.id}/${c}/${n.id} : ${t}`).not.toMatch(/[KQRBNCFTD]?[a-h][1-8]/);
          expect(t, `${p.id}/${c}/${n.id}`).not.toMatch(/O-O/);
        }
      }
    }
  });

  it('reste court', async () => {
    // Un commentaire parlé est une réplique, pas un exposé. L'assemblage
    // précédent atteignait sept propositions.
    for (const p of PROFESSEURS) {
      for (const c of ['gaffe', 'excellent', 'erreur'] as const) {
        const t = await commentaireLocal.commenter(p, contexte({ classement: c }));
        expect(t.length, `${p.id}/${c} : ${t}`).toBeLessThan(LONGUEUR_CONFORTABLE);
      }
    }
  });

  it('nomme les pièces en français', async () => {
    const t = await commentaireLocal.commenter(
      professeurParId('ephraim'),
      contexte({
        classement: 'gaffe',
        coupSan: 'Nf3',
        meilleurSan: 'e4',
        explication: { phrase: 'peu importe', motif: 'piece-en-prise' },
      }),
    );
    expect(t).toMatch(/cavalier|pion/);
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
      expect(t, p.id).not.toMatch(/(tu|ton|ta|tes|toi)/i);
    }
  });

  it('reste stable pour un même coup : deux appels donnent le même texte', async () => {
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

describe('le ton suit la position', () => {
  const bon = { classement: 'excellent' as const, perteCp: 0, meilleurSan: null };

  it('dit que la position est perdue même quand le coup est le meilleur', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte({ ...bon, cpApres: -1500 }));
      expect(t, p.id).toMatch(/perdu|perdue|mauvais|intenable/i);
    }
  });

  it('reconnaît la domination', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte({ ...bon, cpApres: 1200 }));
      expect(t, p.id).toMatch(/gagnant|gagné|domine|devant|meilleure|magnifique|à vous/i);
    }
  });

  it('ne commente pas l’état d’une position équilibrée', async () => {
    // Le répéter à chaque coup dans une partie serrée serait du remplissage.
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(p, contexte({ ...bon, cpApres: 40 }));
      expect(t, p.id).not.toMatch(/perdue|gagnant|domine/i);
    }
  });

  it('ne félicite pas après une faute décisive', async () => {
    for (const p of PROFESSEURS) {
      const t = await commentaireLocal.commenter(
        p,
        contexte({ classement: 'gaffe', perteCp: 900, cpApres: -1400 }),
      );
      expect(t, p.id).not.toMatch(/bravo|excellent|parfait|très bien|bien joué|félicit/i);
    }
  });
});

describe('absence de redite', () => {
  it('ne réutilise pas une tournure déjà employée dans la partie', async () => {
    const coups = ['Nf3', 'e4', 'd4', 'Bb5', 'Re1', 'c3', 'h3', 'Nbd2'];
    for (const p of PROFESSEURS) {
      const memoire = { dites: [] as string[], nouvelles: [] as string[], partie: [] as string[] };
      const reactions: string[] = [];
      for (const coupSan of coups) {
        const t = await commentaireLocal.commenter(
          p,
          contexte({ classement: 'excellent', perteCp: 0, meilleurSan: null, cpApres: 30, coupSan, memoire }),
        );
        memoire.dites.push(...memoire.nouvelles);
        memoire.partie.push(...memoire.nouvelles);
        memoire.nouvelles = [];
        reactions.push(t.split(/(?<=[.!?…])\s/)[0]);
      }
      // Le stock de réactions par professeur dépasse six : aucune ne doit
      // revenir avant qu'il soit épuisé.
      const six = new Set(reactions.slice(0, 6));
      expect(six.size, `${p.id} : ${reactions.slice(0, 6).join(' | ')}`).toBe(6);
    }
  });
});

describe('fin de partie', () => {
  const finDe = (sur: Partial<Parameters<typeof commentaireFinPartie>[1]> = {}) => ({
    issue: 'victoire' as const,
    raison: 'échec et mat',
    nbCoups: 40,
    pireCoup: null,
    beauCoup: null,
    eleve: 'intermediaire' as NiveauEleve,
    ...sur,
  });

  it('traduit résultat et camp en issue vécue', () => {
    expect(issueDe('1-0', 'w', 'mat')).toBe('victoire');
    expect(issueDe('1-0', 'b', 'mat')).toBe('defaite');
    expect(issueDe('0-1', 'b', 'mat')).toBe('victoire');
    expect(issueDe('0-1', 'w', 'mat')).toBe('defaite');
    expect(issueDe('1/2-1/2', 'w', 'pat')).toBe('nulle');
    // L'abandon prime : c'est la manière de finir qui compte, pas le score.
    expect(issueDe('0-1', 'w', 'abandon des blancs')).toBe('abandon');
  });

  it('parle de la partie achevée, pour les quatre issues et les quatre professeurs', () => {
    for (const p of PROFESSEURS) {
      for (const issue of ['victoire', 'defaite', 'nulle', 'abandon'] as const) {
        const t = commentaireFinPartie(p, finDe({ issue }));
        expect(t.length, `${p.id}/${issue}`).toBeGreaterThan(20);
        // Aucun présent de commentaire de coup : on parle au passé.
        expect(t, `${p.id}/${issue}`).not.toMatch(/il fallait jouer|d’abord\./i);
      }
    }
  });

  it('désigne le coup qui a fait basculer la partie', () => {
    const t = commentaireFinPartie(professeurParId('ephraim'), finDe({
      issue: 'defaite',
      pireCoup: { san: 'Cf6', ply: 33, perteCp: 420, classement: 'gaffe', motif: 'piece-en-prise' },
    }));
    expect(t).toContain('17… Cf6');
    expect(t).toContain('4,2 pion');
    // Et la leçon qui va avec le motif.
    expect(t).toMatch(/attaquants et les défenseurs/);
  });

  it('ne désigne pas un coup anodin comme le moment décisif', () => {
    const t = commentaireFinPartie(professeurParId('johana'), finDe({
      issue: 'defaite',
      pireCoup: { san: 'h6', ply: 20, perteCp: 40, classement: 'imprecision' },
    }));
    expect(t).not.toContain('11. h6');
  });

  it('ne salue un beau coup que si la partie n’est pas gagnée', () => {
    const beauCoup = { san: 'Txe6', ply: 24, perteCp: 0, classement: 'excellent' as const };
    const perdue = commentaireFinPartie(professeurParId('serena'), finDe({ issue: 'defaite', beauCoup }));
    const gagnee = commentaireFinPartie(professeurParId('serena'), finDe({ issue: 'victoire', beauCoup }));
    expect(perdue).toContain('13. Txe6');
    expect(gagnee).not.toContain('13. Txe6');
  });

  it('ne répète pas la même conclusion d’une partie à l’autre', () => {
    for (const p of PROFESSEURS) {
      const memoire = { dites: [] as string[], nouvelles: [] as string[], partie: [] as string[] };
      const vus = new Set<string>();
      for (let partie = 0; partie < 5; partie++) {
        const t = commentaireFinPartie(p, finDe({ issue: 'victoire', nbCoups: 30 + partie, memoire }));
        memoire.dites.push(...memoire.nouvelles);
        memoire.partie.push(...memoire.nouvelles);
        memoire.nouvelles = [];
        vus.add(t);
      }
      expect(vus.size, p.id).toBe(5);
    }
  });
});

describe('salutationDe', () => {
  it('ne redonne pas le même accueil de partie en partie', () => {
    for (const p of PROFESSEURS) {
      const memoire = { dites: [] as string[], nouvelles: [] as string[], partie: [] as string[] };
      const vues = new Set<string>();
      for (let i = 0; i < 8; i++) {
        vues.add(salutationDe(p, memoire));
        memoire.dites.push(...memoire.nouvelles);
        memoire.partie.push(...memoire.nouvelles);
        memoire.nouvelles = [];
      }
      expect(vues.size, p.id).toBe(8);
    }
  });
});
