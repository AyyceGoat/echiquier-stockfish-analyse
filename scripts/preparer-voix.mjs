/**
 * Génération des voix, par edge-tts.
 *
 * Pourquoi edge-tts plutôt que la synthèse du navigateur : celle-ci est
 * mécanique sur Windows et n'offre en pratique qu'une voix par genre, si
 * bien que les quatre professeurs sonnaient comme deux personnes parlant à
 * des vitesses différentes. edge-tts donne accès aux voix neuronales de
 * Microsoft — treize en français — sans compte, sans clé et sans carte.
 *
 * Le client officiel est en Python ; on l'appelle plutôt que de réécrire le
 * protocole, qui exige un jeton horodaté et une négociation WebSocket. C'est
 * un outil de préparation, pas une dépendance de l'application : les fichiers
 * produits vivent dans le dépôt et le navigateur ne fait que les lire.
 *
 * Deux usages :
 *
 *   node scripts/preparer-voix.mjs apercu
 *     Un même commentaire dit par TOUTES les voix françaises, pour choisir.
 *
 *   node scripts/preparer-voix.mjs figees
 *     Tout le texte invariable des quatre professeurs — salutations,
 *     discours de fin, registres — avec la voix attribuée à chacun.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const executer = promisify(execFile);

/** Commentaire réel, choisi pour qu'on entende la notation et la ponctuation. */
export const PHRASE_APERCU =
  'Non, c’est une faute grave. Ce coup laisse votre cavalier en e4 en prise, ' +
  'et la tour en d1 était le seul coup qui tenait. Reprenez l’initiative ' +
  'maintenant, ou cette partie est déjà écrite.';

/** Les treize voix françaises du service, telles qu'il les nomme. */
export const VOIX_FRANCAISES = [
  { id: 'fr-FR-DeniseNeural', libelle: 'Denise', pays: 'France', genre: 'Femme' },
  { id: 'fr-FR-EloiseNeural', libelle: 'Éloise', pays: 'France', genre: 'Femme' },
  { id: 'fr-FR-VivienneMultilingualNeural', libelle: 'Vivienne', pays: 'France', genre: 'Femme' },
  { id: 'fr-FR-HenriNeural', libelle: 'Henri', pays: 'France', genre: 'Homme' },
  { id: 'fr-FR-RemyMultilingualNeural', libelle: 'Rémy', pays: 'France', genre: 'Homme' },
  { id: 'fr-BE-CharlineNeural', libelle: 'Charline', pays: 'Belgique', genre: 'Femme' },
  { id: 'fr-BE-GerardNeural', libelle: 'Gérard', pays: 'Belgique', genre: 'Homme' },
  { id: 'fr-CH-ArianeNeural', libelle: 'Ariane', pays: 'Suisse', genre: 'Femme' },
  { id: 'fr-CH-FabriceNeural', libelle: 'Fabrice', pays: 'Suisse', genre: 'Homme' },
  { id: 'fr-CA-SylvieNeural', libelle: 'Sylvie', pays: 'Canada', genre: 'Femme' },
  { id: 'fr-CA-AntoineNeural', libelle: 'Antoine', pays: 'Canada', genre: 'Homme' },
  { id: 'fr-CA-JeanNeural', libelle: 'Jean', pays: 'Canada', genre: 'Homme' },
  { id: 'fr-CA-ThierryNeural', libelle: 'Thierry', pays: 'Canada', genre: 'Homme' },
];

/**
 * Voix multilingues, capables de parler français sans être françaises.
 *
 * Les deux meilleures voix françaises — Rémy et Vivienne — sont justement de
 * ce type. Microsoft en propose dix autres, entraînées sur plusieurs langues
 * et qui prononcent le français correctement. Les quatre de Copilot
 * (Andrew, Ava, Brian, Emma) sont les plus récentes du service.
 *
 * Leur langue d'origine n'est pas leur limite : c'est le timbre qui les
 * distingue, et c'est lui qu'on vient chercher.
 */
export const VOIX_MULTILINGUES = [
  { id: 'en-US-AndrewMultilingualNeural', libelle: 'Andrew', pays: 'Multilingue', genre: 'Homme' },
  { id: 'en-US-BrianMultilingualNeural', libelle: 'Brian', pays: 'Multilingue', genre: 'Homme' },
  { id: 'en-US-AvaMultilingualNeural', libelle: 'Ava', pays: 'Multilingue', genre: 'Femme' },
  { id: 'en-US-EmmaMultilingualNeural', libelle: 'Emma', pays: 'Multilingue', genre: 'Femme' },
  { id: 'en-AU-WilliamMultilingualNeural', libelle: 'William', pays: 'Multilingue', genre: 'Homme' },
  { id: 'de-DE-FlorianMultilingualNeural', libelle: 'Florian', pays: 'Multilingue', genre: 'Homme' },
  { id: 'de-DE-SeraphinaMultilingualNeural', libelle: 'Seraphina', pays: 'Multilingue', genre: 'Femme' },
  { id: 'it-IT-GiuseppeMultilingualNeural', libelle: 'Giuseppe', pays: 'Multilingue', genre: 'Homme' },
  { id: 'ko-KR-HyunsuMultilingualNeural', libelle: 'Hyunsu', pays: 'Multilingue', genre: 'Homme' },
  { id: 'pt-BR-ThalitaMultilingualNeural', libelle: 'Thalita', pays: 'Multilingue', genre: 'Femme' },
];

/** Toutes les voix proposées à l'écoute. */
export const TOUTES_LES_VOIX = [...VOIX_FRANCAISES, ...VOIX_MULTILINGUES];

/**
 * Empreinte d'une réplique : voix, débit, hauteur et texte.
 *
 * C'est la clé du cache. Deux professeurs qui disent la même phrase avec des
 * voix différentes produisent deux fichiers ; le même professeur qui la
 * redit n'en produit aucun.
 */
export function empreinte(voix, texte, debit = '+0%', hauteur = '+0Hz') {
  return createHash('sha256')
    .update(`${voix}|${debit}|${hauteur}|${texte}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Synthétise un texte, ou ne fait rien si le fichier existe déjà.
 *
 * Le cache est définitif et vit dans le dépôt : une phrase déjà dite n'est
 * jamais regénérée, ni ici ni à l'exécution.
 */
export async function synthetiser(voix, texte, sortie, { debit = '+0%', hauteur = '+0Hz' } = {}) {
  if (existsSync(sortie)) return { genere: false, sortie };
  // Le service coupe parfois la connexion en cours de série — mille cinq
  // cents synthèses d'affilée finissent par en croiser une. Sans reprise, un
  // seul délai réseau emportait toute la génération, et il fallait tout
  // relancer à la main.
  let derniere;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      return await synthetiserUneFois(voix, texte, sortie, { debit, hauteur });
    } catch (e) {
      derniere = e;
      // Attente croissante : une coupure isolée se résout tout de suite, une
      // limitation de débit demande de lever le pied.
      await new Promise((r) => setTimeout(r, essai * 1500));
    }
  }
  throw derniere;
}

async function synthetiserUneFois(voix, texte, sortie, { debit, hauteur }) {
  await executer(
    'python',
    [
      '-m',
      'edge_tts',
      '--voice',
      voix,
      '--rate',
      debit,
      '--pitch',
      hauteur,
      '--text',
      texte,
      '--write-media',
      sortie,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return { genere: true, sortie };
}

/* --- Aperçu : toutes les voix disent le même commentaire ----------------- */
async function apercu() {
  const dossier = 'public/voix/apercu';
  mkdirSync(dossier, { recursive: true });
  const index = [];
  for (const v of TOUTES_LES_VOIX) {
    const fichier = `${dossier}/${v.id}.mp3`;
    process.stdout.write(`  ${v.libelle.padEnd(10)} ${v.id.padEnd(34)}`);
    try {
      const { genere } = await synthetiser(v.id, PHRASE_APERCU, fichier);
      const poids = readFileSync(fichier).length;
      console.log(`${genere ? 'généré' : 'déjà là'}  ${(poids / 1024).toFixed(0)} Ko`);
      index.push({ ...v, multilingue: v.pays === 'Multilingue', fichier: `/voix/apercu/${v.id}.mp3` });
    } catch (e) {
      console.log(`ÉCHEC — ${String(e?.message ?? e).slice(0, 80)}`);
    }
  }
  writeFileSync('src/lib/voixApercu.json', JSON.stringify(index, null, 2) + '\n');
  console.log(`\n${index.length} voix prêtes. Index écrit dans src/lib/voixApercu.json`);
}

/* --- Texte figé : tout l'invariable des professeurs --------------------- */

/**
 * Toutes les phrases que les professeurs peuvent prononcer sans variable.
 *
 * L'unité est la PHRASE, pas le commentaire : un commentaire est assemblé à
 * partir de fragments qui sont chacun une phrase complète. Pré-générer chaque
 * combinaison serait impossible ; pré-générer chaque phrase est tractable, et
 * l'enchaînement s'entend comme une diction normale.
 */
/** Noms de pièces, pour fabriquer les descriptions de coups. */
const NOM = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };

async function phrasesFigees() {
  const rep = await import('../src/lib/repertoireProfesseurs.ts');
  const prof = await import('../src/lib/professeurs.ts');

  /** Parcourt n'importe quelle imbrication de tableaux et d'objets. */
  const recolter = (valeur, sortie) => {
    if (typeof valeur === 'string') {
      const t = valeur.trim();
      // On écarte les fragments qui ne sont pas des phrases : libellés,
      // identifiants, morceaux destinés à être complétés par un coup.
      if (t.length >= 12 && /[.!?…]$/.test(t)) sortie.add(t);
    } else if (Array.isArray(valeur)) {
      for (const v of valeur) recolter(v, sortie);
    } else if (valeur && typeof valeur === 'object') {
      for (const v of Object.values(valeur)) recolter(v, sortie);
    }
    return sortie;
  };

  const sortie = new Set();

  /**
   * Les phrases produites par la traduction en langage humain.
   *
   * Elles ne vivent dans aucun registre : elles sont fabriquées à partir du
   * motif, du classement et des pièces en jeu. On énumère donc toutes les
   * combinaisons plausibles et on récolte les textes distincts — sans quoi
   * l'essentiel de ce que dit un professeur passerait par la synthèse à la
   * demande, avec son délai et son silence possible.
   */
  const parole = await import('../src/lib/parole.ts');
  const PIECES = ['p', 'n', 'b', 'r', 'q', 'k'];
  const decrit = (type, roque = false) => ({
    sujet: type === 'q' || type === 'r' ? `votre ${NOM[type]}` : `votre ${NOM[type]}`,
    article: type === 'q' || type === 'r' ? `la ${NOM[type]}` : `le ${NOM[type]}`,
    capture: null,
    roque,
    promotion: false,
    echec: false,
    type,
  });
  const MOTIFS = [
    undefined,
    'piece-en-prise',
    'menace-ignoree',
    'fourchette',
    'clouage',
    'enfilade',
    'mat-manque',
    'mat-subi',
    'occasion-manquee',
    'coup-force',
    'passif',
    'sans-consequence',
  ];
  const CLASSEMENTS = ['theorie', 'unique', 'excellent', 'bon', 'imprecision', 'erreur', 'gaffe'];
  const ELEVES = ['decouverte', 'debutant', 'intermediaire', 'avance', 'confirme'];
  for (const motif of MOTIFS) {
    for (const classement of CLASSEMENTS) {
      for (const eleve of ELEVES) {
        for (const tc of PIECES) {
          for (const tm of [...PIECES, null]) {
            for (const roque of [false, true]) {
              const t = parole.phraseDeFond({
                classement,
                motif,
                coup: decrit(tc),
                meilleur: tm === null ? null : decrit(tm, roque),
                eleve,
              });
              const propre = t.trim();
              if (propre.length >= 12) sortie.add(propre);
            }
          }
        }
      }
    }
  }

  for (const module of [rep, prof]) {
    for (const [nom, valeur] of Object.entries(module)) {
      if (typeof valeur === 'function') continue;
      if (nom === 'PROFESSEURS') {
        // Les fiches contiennent des présentations et des salutations.
        for (const fiche of valeur) recolter([fiche.salutation, fiche.presentation], sortie);
        continue;
      }
      recolter(valeur, sortie);
    }
  }
  return [...sortie].sort();
}

async function figees(voixDemandees) {
  const attribution = voixDemandees.length > 0 ? voixDemandees : Object.values(lireAttribution());
  if (attribution.length === 0) {
    console.log('Aucune voix à générer.');
    console.log('Usage : node scripts/preparer-voix.mjs figees fr-FR-HenriNeural fr-FR-DeniseNeural …');
    console.log('Les quatre voix se choisissent sur la page « Les voix des professeurs ».');
    process.exit(2);
  }

  const phrases = await phrasesFigees();
  console.log(`${phrases.length} phrases figées, ${attribution.length} voix.`);
  console.log('');

  const dossier = 'public/voix/figees';
  mkdirSync(dossier, { recursive: true });
  const manifeste = existsSync('src/lib/voixManifeste.json')
    ? JSON.parse(readFileSync('src/lib/voixManifeste.json', 'utf8'))
    : {};

  let generees = 0;
  let dejaLa = 0;
  const echouees = [];
  for (const voix of attribution) {
    for (const [i, texte] of phrases.entries()) {
      const cle = empreinte(voix, texte);
      const fichier = `${dossier}/${cle}.mp3`;
      try {
        const { genere } = await synthetiser(voix, texte, fichier);
        manifeste[cle] = `/voix/figees/${cle}.mp3`;
        if (genere) generees += 1;
        else dejaLa += 1;
      } catch (e) {
        // Une phrase perdue n'emporte pas la série : elle passera par la
        // synthèse à la demande, et un nouveau passage la rattrapera.
        echouees.push(`${voix} · ${texte.slice(0, 40)} — ${String(e?.message ?? e).slice(0, 60)}`);
      }
      if ((i + 1) % 25 === 0) {
        process.stdout.write(`
  ${voix} : ${i + 1}/${phrases.length}`);
      }
    }
    console.log(`
  ${voix} : ${phrases.length}/${phrases.length} ✓`);
    // Le manifeste est réécrit après chaque voix : une interruption ne perd
    // pas le travail déjà fait.
    // Deux copies : l'une pour les tests, l'autre servie au navigateur. Le
    // manifeste n'est pas importé par le bundle — 105 Ko sur le chemin
    // critique de l'écran de jeu pour une donnée qui ne sert qu'à la
    // première réplique.
    const rendu = JSON.stringify(manifeste, null, 0);
    writeFileSync('src/lib/voixManifeste.json', rendu);
    writeFileSync('public/voix/manifeste.json', rendu);
  }

  console.log(`
${generees} fichiers générés, ${dejaLa} déjà présents.`);
  console.log(`Manifeste : ${Object.keys(manifeste).length} entrées.`);
}

/** Attribution enregistrée par la page d'écoute, si elle a été exportée. */
function lireAttribution() {
  const p = 'src/lib/voixProfesseurs.json';
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

const mode = process.argv[2] ?? 'apercu';
if (mode === 'apercu') {
  await apercu();
} else if (mode === 'figees') {
  await figees(process.argv.slice(3));
} else {
  console.log(`Mode inconnu : ${mode}`);
  process.exit(2);
}
