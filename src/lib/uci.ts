/**
 * Analyseur du protocole UCI.
 *
 * Stockfish parle en texte ligne à ligne. Tout le reste de l'application
 * consomme les types définis ici, jamais des chaînes brutes : c'est le seul
 * endroit où l'on tolère de la syntaxe UCI.
 */

/** Évaluation, toujours du point de vue du camp au trait (convention UCI). */
export type Evaluation =
  | { type: 'cp'; valeur: number }
  | { type: 'mat'; valeur: number };

export interface LigneInfo {
  type: 'info';
  profondeur?: number;
  profondeurSelective?: number;
  multipv: number;
  evaluation?: Evaluation;
  /** true si l'évaluation est une borne (recherche interrompue) : peu fiable. */
  borne: boolean;
  pv: string[];
  noeuds?: number;
  nps?: number;
  tempsMs?: number;
  hashfull?: number;
}

export interface LigneMeilleurCoup {
  type: 'bestmove';
  coup: string | null;
  ponder: string | null;
}

export interface LigneIdentite {
  type: 'id';
  champ: 'name' | 'author';
  valeur: string;
}

export interface LigneOption {
  type: 'option';
  nom: string;
  typeOption: string;
  defaut?: string;
  min?: number;
  max?: number;
}

export type LigneUci =
  | LigneInfo
  | LigneMeilleurCoup
  | LigneIdentite
  | LigneOption
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'autre'; texte: string };

const ENTIER = /^-?\d+$/;

/**
 * Analyse une ligne de sortie du moteur.
 * Renvoie `null` uniquement pour une ligne vide.
 */
export function parseLigneUci(ligne: string): LigneUci | null {
  const texte = ligne.trim();
  if (texte === '') return null;

  if (texte === 'uciok') return { type: 'uciok' };
  if (texte === 'readyok') return { type: 'readyok' };

  const mots = texte.split(/\s+/);

  if (mots[0] === 'bestmove') {
    const brut = mots[1];
    const coup = !brut || brut === '(none)' || brut === '0000' ? null : brut;
    const iPonder = mots.indexOf('ponder');
    const ponder =
      iPonder >= 0 && mots[iPonder + 1] && mots[iPonder + 1] !== '(none)'
        ? mots[iPonder + 1]
        : null;
    return { type: 'bestmove', coup, ponder };
  }

  if (mots[0] === 'id' && (mots[1] === 'name' || mots[1] === 'author')) {
    return { type: 'id', champ: mots[1], valeur: mots.slice(2).join(' ') };
  }

  if (mots[0] === 'option') {
    return parseOption(mots);
  }

  if (mots[0] === 'info') {
    // « info string ... » est un message libre, pas une ligne d'analyse.
    if (mots[1] === 'string') return { type: 'autre', texte };
    return parseInfo(mots);
  }

  return { type: 'autre', texte };
}

function parseOption(mots: string[]): LigneOption {
  // option name <nom éventuellement multi-mots> type <t> default <d> min <n> max <n>
  const iType = mots.indexOf('type');
  const nom = mots.slice(2, iType > 0 ? iType : undefined).join(' ');
  const lire = (cle: string): string | undefined => {
    const i = mots.indexOf(cle);
    return i >= 0 ? mots[i + 1] : undefined;
  };
  const min = lire('min');
  const max = lire('max');
  return {
    type: 'option',
    nom,
    typeOption: iType > 0 ? mots[iType + 1] : 'string',
    defaut: lire('default'),
    min: min && ENTIER.test(min) ? Number(min) : undefined,
    max: max && ENTIER.test(max) ? Number(max) : undefined,
  };
}

function parseInfo(mots: string[]): LigneInfo {
  const info: LigneInfo = { type: 'info', multipv: 1, borne: false, pv: [] };

  for (let i = 1; i < mots.length; i++) {
    const cle = mots[i];
    const suivant = mots[i + 1];

    switch (cle) {
      case 'depth':
        if (suivant && ENTIER.test(suivant)) info.profondeur = Number(suivant);
        i += 1;
        break;
      case 'seldepth':
        if (suivant && ENTIER.test(suivant)) info.profondeurSelective = Number(suivant);
        i += 1;
        break;
      case 'multipv':
        if (suivant && ENTIER.test(suivant)) info.multipv = Number(suivant);
        i += 1;
        break;
      case 'nodes':
        if (suivant && ENTIER.test(suivant)) info.noeuds = Number(suivant);
        i += 1;
        break;
      case 'nps':
        if (suivant && ENTIER.test(suivant)) info.nps = Number(suivant);
        i += 1;
        break;
      case 'time':
        if (suivant && ENTIER.test(suivant)) info.tempsMs = Number(suivant);
        i += 1;
        break;
      case 'hashfull':
        if (suivant && ENTIER.test(suivant)) info.hashfull = Number(suivant);
        i += 1;
        break;
      case 'score': {
        const genre = mots[i + 1];
        const valeur = mots[i + 2];
        if ((genre === 'cp' || genre === 'mate') && valeur && ENTIER.test(valeur)) {
          info.evaluation =
            genre === 'cp'
              ? { type: 'cp', valeur: Number(valeur) }
              : { type: 'mat', valeur: Number(valeur) };
          i += 2;
          // « lowerbound » / « upperbound » suivent immédiatement le score.
          if (mots[i + 1] === 'lowerbound' || mots[i + 1] === 'upperbound') {
            info.borne = true;
            i += 1;
          }
        }
        break;
      }
      case 'pv': {
        // « pv » est toujours le dernier mot-clé : tout le reste est la variante.
        // Une variante doit rester contiguë : on la tronque au premier jeton
        // illisible plutôt que de recoller des coups qui ne s'enchaînent plus.
        const reste = mots.slice(i + 1);
        const fin = reste.findIndex((m) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
        info.pv = fin === -1 ? reste : reste.slice(0, fin);
        i = mots.length;
        break;
      }
      default:
        break;
    }
  }

  return info;
}

/**
 * Ramène une évaluation UCI (point de vue du trait) au point de vue des blancs.
 * Toute l'application raisonne en « + = les blancs sont mieux ».
 */
export function versPointDeVueBlanc(ev: Evaluation, trait: 'w' | 'b'): Evaluation {
  if (trait === 'w') return ev;
  return ev.type === 'cp'
    ? { type: 'cp', valeur: -ev.valeur }
    : { type: 'mat', valeur: -ev.valeur };
}

/** Plafond utilisé pour représenter un mat sur une échelle en centipions. */
export const CP_MAT = 10000;

/**
 * Projette une évaluation sur une échelle numérique unique, pour comparer
 * deux coups ou tracer une courbe. Un mat en N vaut d'autant plus que N est petit.
 */
export function evaluationEnCp(ev: Evaluation): number {
  if (ev.type === 'cp') return Math.max(-CP_MAT + 1, Math.min(CP_MAT - 1, ev.valeur));
  // « mate 0 » : le camp au trait est mat sur l'échiquier.
  if (ev.valeur === 0) return -CP_MAT;
  const signe = ev.valeur > 0 ? 1 : -1;
  return signe * (CP_MAT - Math.min(99, Math.abs(ev.valeur)) * 10);
}

/** Rend une évaluation lisible en français : « +1,24 » ou « Mat en 3 ». */
export function formaterEvaluation(ev: Evaluation | undefined): string {
  if (!ev) return '—';
  if (ev.type === 'mat') {
    if (ev.valeur === 0) return 'Mat';
    return `${ev.valeur > 0 ? '+' : '−'}M${Math.abs(ev.valeur)}`;
  }
  const pions = ev.valeur / 100;
  const signe = pions > 0 ? '+' : pions < 0 ? '−' : '';
  return `${signe}${Math.abs(pions).toFixed(2).replace('.', ',')}`;
}

/**
 * Probabilité de gain estimée à partir d'une évaluation en centipions.
 * Courbe logistique alignée sur celle de Lichess : elle sert de base au
 * calcul de précision, car une perte de 100 cp ne coûte pas la même chose
 * dans une position égale et dans une position déjà gagnée.
 */
export function probabiliteDeGain(cp: number): number {
  const borne = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * borne)) - 1);
}
