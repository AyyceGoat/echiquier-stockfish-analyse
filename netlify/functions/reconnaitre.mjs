/**
 * Fonction serverless de reconnaissance de position.
 *
 * Elle existe pour une seule raison : garder la clé d'API hors du bundle
 * client. Deux sources de clé sont acceptées, dans cet ordre :
 *   1. ANTHROPIC_API_KEY, configurée sur l'hébergeur (cas nominal) ;
 *   2. l'en-tête `x-cle-api`, envoyé par l'utilisateur depuis les réglages,
 *      où la clé reste stockée uniquement sur son appareil.
 * Aucune clé n'est journalisée ni conservée par la fonction.
 *
 * GET  -> indique si l'hébergeur dispose de sa propre clé.
 * POST -> { image: base64, typeMime } -> plateau 8x8 + confiance par case.
 */

import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/api/reconnaitre' };

const MODELE = 'claude-opus-5';

// Effort « low » : la lecture d'un échiquier est une tâche de perception,
// pas de raisonnement. C'est aussi ce qui garde la réponse sous la limite
// de temps d'exécution des fonctions Netlify.
const EFFORT = 'low';

// Schéma volontairement minimal : l'API de sortie structurée n'accepte pas
// de `minItems`/`maxItems` au-delà de 1, ni de bornes numériques. La forme
// 8x8 est donc imposée par la consigne, puis VÉRIFIÉE deux fois — ici par
// `normaliserPlateau` côté client, et par la validation de FEN avant tout
// affichage. Une contrainte de schéma en plus n'aurait rien garanti de mieux.
const SCHEMA = {
  type: 'object',
  properties: {
    plateau: {
      type: 'array',
      description:
        'Les 8 rangées, de celle du HAUT de l’image à celle du BAS, chacune de 8 cases, de gauche à droite.',
      items: {
        type: 'array',
        items: {
          type: 'string',
          description:
            'Symbole FEN : majuscule pour une pièce blanche (P N B R Q K), minuscule pour une pièce noire (p n b r q k), chaîne vide pour une case vide.',
        },
      },
    },
    confiances: {
      type: 'array',
      description: 'Confiance entre 0 et 1 pour chaque case, même disposition que « plateau ».',
      items: { type: 'array', items: { type: 'number' } },
    },
    orientation: {
      type: 'string',
      enum: ['blancs-en-bas', 'noirs-en-bas'],
    },
    trait: { type: 'string', enum: ['w', 'b', 'inconnu'] },
    remarques: { type: 'array', items: { type: 'string' } },
  },
  required: ['plateau', 'confiances', 'orientation', 'trait', 'remarques'],
  additionalProperties: false,
};

const CONSIGNE = `Tu lis une position d'échecs sur une image et tu la transcris case par case.

MÉTHODE, à suivre dans l'ordre :
1. Repère les quatre coins de l'échiquier. L'image peut être une capture d'écran d'échiquier numérique, une photo d'échiquier en bois, une photo prise de biais, ou une image rognée.
2. Si la photo est prise de biais, corrige mentalement la perspective avant de lire les cases.
3. Détermine l'orientation : « blancs-en-bas » si le camp blanc occupe le bas de l'image, « noirs-en-bas » sinon. Les coordonnées imprimées sur l'échiquier, la position des rois et le sens des pièces sont les meilleurs indices.
4. Lis les 64 cases. La première rangée du tableau est celle du HAUT DE L'IMAGE, la première case de chaque rangée est celle de GAUCHE DE L'IMAGE. Ne réordonne rien : l'orientation est déclarée séparément.
5. Attribue une confiance à chaque case. Sois honnête : une case masquée, floue, à contre-jour ou dont la pièce est ambiguë doit recevoir une confiance basse (< 0,5). Une case manifestement vide et nette mérite une confiance élevée.
6. Si tu distingues à qui est le trait (pendule, surbrillance du dernier coup), indique-le ; sinon « inconnu ».

RÈGLES STRICTES :
- « plateau » contient EXACTEMENT 8 rangées, chacune de EXACTEMENT 8 cases. « confiances » a exactement la même forme. Une réponse qui ne respecte pas ces tailles est inutilisable.
- Case vide = chaîne vide, jamais un point ni un espace.
- Pièce blanche en MAJUSCULE, pièce noire en minuscule, selon la couleur réelle des pièces et non leur position sur l'image.
- Un échiquier a au plus un roi de chaque couleur. Si tu hésites entre un roi et une dame, choisis et baisse la confiance.
- N'invente aucune pièce : une case dont tu ne vois pas le contenu est vide avec une confiance basse.
- Signale dans « remarques » toute difficulté réelle (reflet, pièce coupée par le cadrage, échiquier partiellement masqué). Une remarque par difficulté, en français, en une phrase.`;

function reponseJson(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function erreur(message, conseil, statut = 400) {
  return reponseJson({ erreur: message, conseil }, statut);
}

/**
 * L'origine de la requête est-elle celle du site ?
 *
 * On compare à l'hôte servi par la requête elle-même, ce qui couvre du même
 * coup le domaine de production, les préversions et les branches, sans liste
 * à tenir à jour. Une requête sans origine — appel serveur à serveur, outil
 * en ligne de commande — est refusée : le navigateur, lui, envoie toujours
 * cet en-tête sur une requête POST cross-origin ou same-origin.
 */
function origineAutorisee(origine, req) {
  if (!origine) return false;
  try {
    return new URL(origine).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const reponse = {
      cleServeur: Boolean(process.env.ANTHROPIC_API_KEY),
      modele: MODELE,
    };
    // Diagnostic volontairement pauvre : de quoi savoir si la reconnaissance
    // par modèle est utilisable et par quel chemin, sans publier de noms de
    // variables ni de fragment de clé sur un point d'entrée ouvert.
    if (url.searchParams.get('diagnostic') === '1') {
      reponse.passerelle = Boolean(process.env.ANTHROPIC_BASE_URL);
    }
    return reponseJson(reponse);
  }

  if (req.method !== 'POST') {
    return erreur('Méthode non prise en charge.', undefined, 405);
  }

  // Origine vérifiée AVANT toute dépense.
  //
  // Quand une clé est configurée côté hébergeur, ce point d'entrée dépense
  // les crédits du propriétaire du site. Sans contrôle, n'importe qui sur
  // Internet peut l'appeler : c'était un relais ouvert. On n'accepte donc
  // que les requêtes émises depuis le site lui-même. Ce n'est pas une
  // authentification — un en-tête se falsifie — mais cela ferme l'usage
  // depuis un navigateur tiers, qui est le cas réel.
  //
  // Une requête portant la clé de l'utilisateur reste acceptée sans
  // condition : elle ne coûte rien au site.
  const origine = req.headers.get('origin');
  const cleUtilisateur = req.headers.get('x-cle-api');
  if (!cleUtilisateur && process.env.ANTHROPIC_API_KEY && !origineAutorisee(origine, req)) {
    return erreur(
      'Origine non autorisée.',
      "Cette fonction ne répond qu'aux requêtes venant de l'application.",
      403,
    );
  }

  const cle = process.env.ANTHROPIC_API_KEY || cleUtilisateur;
  if (!cle) {
    return erreur(
      "Aucune clé d'API n'est configurée.",
      "Ouvrez Réglages puis « Reconnaissance par image » et saisissez votre clé d'API Anthropic. Elle reste stockée sur cet appareil.",
      401,
    );
  }

  let corps;
  try {
    corps = await req.json();
  } catch {
    return erreur('Requête illisible.');
  }

  const { image, typeMime } = corps ?? {};
  if (typeof image !== 'string' || image.length < 100) {
    return erreur("Aucune image exploitable n'a été reçue.");
  }
  // Garde-fou : le client redimensionne à 1024 px, ce qui donne ~150 Ko.
  if (image.length > 8_000_000) {
    return erreur(
      "L'image est trop volumineuse.",
      'Réessayez : elle doit être redimensionnée avant envoi.',
      413,
    );
  }

  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(typeMime)
    ? typeMime
    : 'image/jpeg';

  const client = new Anthropic({ apiKey: cle });

  try {
    const reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 8000,
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: CONSIGNE },
          ],
        },
      ],
    });

    if (reponse.stop_reason === 'refusal') {
      return erreur(
        "Le modèle a refusé de traiter cette image.",
        "Vérifiez qu'il s'agit bien d'une photo d'échiquier.",
        422,
      );
    }

    const texte = reponse.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!texte.trim()) {
      return erreur(
        "Le modèle n'a renvoyé aucune position.",
        'Réessayez avec une image plus nette.',
        502,
      );
    }

    let donnees;
    try {
      donnees = JSON.parse(texte);
    } catch {
      return erreur('La réponse du modèle est illisible.', 'Réessayez.', 502);
    }

    return reponseJson({
      plateau: donnees.plateau,
      confiances: donnees.confiances,
      orientation: donnees.orientation,
      trait: donnees.trait === 'w' || donnees.trait === 'b' ? donnees.trait : undefined,
      remarques: Array.isArray(donnees.remarques) ? donnees.remarques : [],
    });
  } catch (e) {
    // On ne renvoie jamais l'erreur brute au client : elle peut contenir
    // des fragments de requête. On mappe sur un message actionnable.
    const statut = typeof e?.status === 'number' ? e.status : 500;
    if (statut === 401 || statut === 403) {
      return erreur(
        "La clé d'API a été refusée.",
        'Vérifiez la clé saisie dans les réglages.',
        401,
      );
    }
    if (statut === 429) {
      return erreur(
        'Trop de requêtes envoyées au modèle.',
        'Patientez quelques instants puis réessayez.',
        429,
      );
    }
    // Le message brut peut contenir des fragments de requête : on n'en
    // conserve que le type et le statut, suffisants pour diagnostiquer.
    const cause = `${e?.name ?? 'Error'}${statut ? ` ${statut}` : ''}: ${String(e?.message ?? e).slice(0, 200)}`;
    console.error('Échec de la reconnaissance :', cause);
    return reponseJson(
      {
        erreur: 'La reconnaissance a échoué.',
        conseil: 'Réessayez, ou basculez sur la reconnaissance locale dans les réglages.',
        cause,
      },
      502,
    );
  }
}
