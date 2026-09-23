/**
 * Extraction des erreurs du JOUEUR dans ses propres parties.
 *
 * Deux défauts corrigés ici, tous deux du même genre : des données qui ne
 * montraient pas ce qu'elles prétendaient montrer.
 *
 *  1. Le décompte portait sur TOUS les coups de la partie, ceux du moteur
 *     compris. La section « mes erreurs » comptait donc aussi les bévues de
 *     l'adversaire. On ne retient plus que les coups joués par le camp du
 *     joueur.
 *
 *  2. Chaque motif renvoyait vers des exercices génériques du catalogue —
 *     toujours les mêmes diagrammes, sans rapport avec la partie. On
 *     remonte maintenant les positions RÉELLES : la position exacte avant la
 *     faute, le coup joué, le coup qu'il fallait jouer, et de quelle partie
 *     cela vient.
 *
 * Ce module ne fait que lire et regrouper : il ne sait rien de l'affichage,
 * ce qui le rend vérifiable sans navigateur.
 */

import type { PartieEnregistree } from '../db/parties.ts';
import type { Classement } from './classification.ts';
import type { MotifExplication } from './explications.ts';

/** Classements qui désignent une faute à travailler. */
export const CLASSEMENTS_FAUTIFS: Classement[] = ['imprecision', 'erreur', 'gaffe'];

/**
 * Motifs à compter.
 *
 * `passif` et `sans-consequence` décrivent un constat, pas une erreur
 * reconnaissable : les afficher comme « erreur récurrente » n'apprendrait
 * rien et diluerait les vrais motifs.
 */
export const MOTIFS_ERREUR: MotifExplication[] = [
  'piece-en-prise',
  'occasion-manquee',
  'menace-ignoree',
  'fourchette',
  'clouage',
  'enfilade',
  'mat-manque',
  'mat-subi',
];

/** Une faute précise, dans une partie précise. */
export interface OccurrenceErreur {
  partieId: string;
  /** Horodatage de la partie, pour situer l'occurrence. */
  date: number;
  /** Nom de l'adversaire tel qu'il a été enregistré. */
  adversaire: string;
  /** Demi-coup dans la partie, à partir de zéro. */
  ply: number;
  couleur: 'w' | 'b';
  /** Position AVANT la faute : c'est elle qu'il faut montrer. */
  fenAvant: string;
  san: string;
  uci: string;
  meilleurSan: string | null;
  meilleurUci: string | null;
  classement: Classement;
  motif: MotifExplication;
  /** Phrase produite par l'analyse, telle quelle. */
  phrase: string;
  perteCp: number;
}

export interface GroupeErreur {
  motif: MotifExplication;
  occurrences: OccurrenceErreur[];
}

/**
 * De quel côté jouait le joueur ?
 *
 * `monCamp` est renseigné depuis que les écrans de jeu l'enregistrent. Les
 * parties plus anciennes ne l'ont pas : on retombe sur le nom, « Moi » étant
 * celui que les deux écrans écrivent. Une partie où le joueur n'apparaît
 * d'aucun côté — position importée, partie du banc d'essai — renvoie `null`
 * et sera écartée, car ses erreurs ne sont pas les siennes.
 */
export function monCampDe(partie: PartieEnregistree): 'w' | 'b' | null {
  if (partie.monCamp === 'w' || partie.monCamp === 'b') return partie.monCamp;
  if (partie.blanc === 'Moi') return 'w';
  if (partie.noir === 'Moi') return 'b';
  return null;
}

/** Nom de l'adversaire, du point de vue du joueur. */
export function adversaireDe(partie: PartieEnregistree, monCamp: 'w' | 'b'): string {
  return monCamp === 'w' ? partie.noir : partie.blanc;
}

/**
 * Regroupe les fautes du joueur par motif, les plus fréquentes d'abord.
 *
 * Les occurrences d'un même motif sont rendues de la plus récente à la plus
 * ancienne : c'est ce qu'on veut revoir en premier.
 */
export function regrouperMesErreurs(parties: PartieEnregistree[]): GroupeErreur[] {
  const parMotif = new Map<MotifExplication, OccurrenceErreur[]>();

  for (const partie of parties) {
    const rapport = partie.rapport;
    if (!rapport) continue;
    const monCamp = monCampDe(partie);
    if (monCamp === null) continue;
    const adversaire = adversaireDe(partie, monCamp);

    for (const coup of rapport.coups) {
      if (coup.couleur !== monCamp) continue;
      if (!CLASSEMENTS_FAUTIFS.includes(coup.classement)) continue;
      const motif = coup.explication?.motif;
      if (!motif || !MOTIFS_ERREUR.includes(motif)) continue;

      const liste = parMotif.get(motif) ?? [];
      liste.push({
        partieId: partie.id,
        date: partie.date,
        adversaire,
        ply: coup.ply,
        couleur: coup.couleur,
        fenAvant: coup.fenAvant,
        san: coup.san,
        uci: coup.uci,
        meilleurSan: coup.meilleurSan,
        meilleurUci: coup.meilleurUci,
        classement: coup.classement,
        motif,
        phrase: coup.explication.phrase,
        perteCp: coup.perteCp,
      });
      parMotif.set(motif, liste);
    }
  }

  return [...parMotif.entries()]
    .map(([motif, occurrences]) => ({
      motif,
      occurrences: occurrences.sort((a, b) => b.date - a.date || b.ply - a.ply),
    }))
    .sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/** Nombre de parties du joueur effectivement exploitables. */
export function compterMesParties(parties: PartieEnregistree[]): number {
  return parties.filter((p) => p.rapport && monCampDe(p) !== null).length;
}

/** Numéro de coup affichable : « 24. » pour les blancs, « 24… » pour les noirs. */
export function numeroCoup(ply: number, couleur: 'w' | 'b'): string {
  return `${Math.floor(ply / 2) + 1}${couleur === 'w' ? '.' : '…'}`;
}
