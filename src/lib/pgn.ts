/**
 * Export du rapport d'analyse en PGN commenté.
 *
 * On écrit le PGN à la main plutôt que via `chess.js` : il faut intercaler
 * les symboles d'annotation, les commentaires français et les variantes,
 * ce que l'export standard ne permet pas.
 */

import { formaterPerte, SYMBOLES, type Classement } from './classification.ts';
import { formaterEvaluation, type Evaluation } from './uci.ts';

export interface CoupAnnote {
  /** Numéro de demi-coup, 0 pour le premier coup des blancs. */
  ply: number;
  san: string;
  classement: Classement;
  perteCp: number;
  evaluation: Evaluation;
  /** Évaluation après le coup, pour savoir si un mat entre en jeu. */
  evaluationApres?: Evaluation;
  /** Meilleur coup manqué, en SAN. */
  meilleurSan?: string | null;
  /** Variante recommandée, en SAN. */
  varianteSan?: string[];
  explication?: string;
}

export interface EnTetesPgn {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  FEN?: string;
  SetUp?: string;
  [cle: string]: string | undefined;
}

/** Échappe les caractères qui casseraient un commentaire PGN. */
function nettoyerCommentaire(texte: string): string {
  return texte.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function formaterEnTetes(e: EnTetesPgn): string {
  const ordre = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
  const lignes: string[] = [];
  for (const cle of ordre) {
    lignes.push(`[${cle} "${(e[cle] ?? '?').replace(/"/g, "'")}"]`);
  }
  for (const [cle, val] of Object.entries(e)) {
    if (ordre.includes(cle) || val === undefined) continue;
    lignes.push(`[${cle} "${val.replace(/"/g, "'")}"]`);
  }
  return lignes.join('\n');
}

/**
 * Construit le PGN annoté.
 * `plyDepart` permet de numéroter correctement une partie commencée
 * depuis une position importée.
 */
export function construirePgnAnnote(
  coups: CoupAnnote[],
  enTetes: EnTetesPgn = {},
  plyDepart = 0,
): string {
  const morceaux: string[] = [];

  for (const c of coups) {
    const plyAbsolu = plyDepart + c.ply;
    const numero = Math.floor(plyAbsolu / 2) + 1;
    const estBlanc = plyAbsolu % 2 === 0;

    if (estBlanc) morceaux.push(`${numero}.`);
    else if (morceaux.length === 0) morceaux.push(`${numero}...`);

    morceaux.push(`${c.san}${SYMBOLES[c.classement]}`);

    const commentaires: string[] = [];
    commentaires.push(`[%eval ${cleEval(c.evaluation)}] ${formaterEvaluation(c.evaluation)}`);
    if (c.explication) commentaires.push(nettoyerCommentaire(c.explication));
    const perte = c.evaluationApres
      ? formaterPerte(c.perteCp, c.evaluation, c.evaluationApres)
      : null;
    if (perte && c.perteCp >= 50 && c.meilleurSan) {
      commentaires.push(`Perte : ${perte.replace('−', '')} pion(s).`);
    }
    morceaux.push(`{ ${commentaires.join(' ')} }`);

    // Variante recommandée, uniquement quand le coup joué n'était pas le meilleur.
    if (c.meilleurSan && c.varianteSan && c.varianteSan.length > 0 && c.meilleurSan !== c.san) {
      morceaux.push(`( ${formaterVariante(c.varianteSan, plyAbsolu)} )`);
    }
  }

  const corps = habiller(morceaux.join(' '));
  const resultat = enTetes.Result ?? '*';
  return `${formaterEnTetes(enTetes)}\n\n${corps} ${resultat}\n`;
}

function cleEval(ev: Evaluation): string {
  return ev.type === 'mat' ? `#${ev.valeur}` : (ev.valeur / 100).toFixed(2);
}

function formaterVariante(san: string[], plyDepart: number): string {
  const out: string[] = [];
  san.forEach((coup, i) => {
    const ply = plyDepart + i;
    const numero = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) out.push(`${numero}.`);
    else if (i === 0) out.push(`${numero}...`);
    out.push(coup);
  });
  return out.join(' ');
}

/** Replie les lignes à 80 colonnes, comme le veut la norme PGN. */
function habiller(texte: string, largeur = 80): string {
  const mots = texte.split(' ');
  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots) {
    if (courante === '') {
      courante = mot;
    } else if (courante.length + 1 + mot.length <= largeur) {
      courante += ` ${mot}`;
    } else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes.join('\n');
}

/** Déclenche le téléchargement d'un fichier texte depuis le navigateur. */
export function telechargerTexte(nomFichier: string, contenu: string): void {
  const blob = new Blob([contenu], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse au navigateur le temps de lancer le téléchargement avant de libérer.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
