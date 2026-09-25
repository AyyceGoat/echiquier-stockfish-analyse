/**
 * Synthèse vocale à la demande, pour le texte variable.
 *
 * Le texte invariable des professeurs est pré-généré et livré avec
 * l'application. Reste ce qui change d'une partie à l'autre : les phrases
 * qui citent un coup, un nombre de pions, un nom d'adversaire. Cette
 * fonction les synthétise avec la même voix, et le navigateur les conserve
 * définitivement — une phrase déjà dite n'est jamais redemandée.
 *
 * Elle parle au même service que `edge-tts`, celui de la lecture à voix haute
 * de Microsoft Edge. Aucun compte, aucune clé, aucune carte. Le client
 * officiel étant en Python et Netlify exécutant du Node, le protocole est
 * réimplémenté ici : il tient en une poignée d'échanges WebSocket.
 *
 * Deux détails du protocole méritent d'être expliqués, sans quoi le code
 * paraît arbitraire :
 *
 *   - `Sec-MS-GEC` est une empreinte SHA-256 d'un horodatage arrondi à cinq
 *     minutes, concaténé à une constante publique du service. Sans cet
 *     en-tête, le service refuse la connexion ;
 *   - la réponse arrive en trames binaires précédées d'un en-tête textuel
 *     dont la longueur est écrite sur les deux premiers octets. L'audio
 *     commence après cet en-tête.
 */

import { createHash, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

export const config = { path: '/api/voix' };

/** Jeton public du service, identique pour tous les clients Edge. */
const JETON = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
/**
 * Graine de `Sec-MS-GEC` : c'est le jeton lui-même.
 *
 * Le service refusait la connexion avec un 403 tant qu'une autre constante
 * était utilisée. L'empreinte se calcule sur l'horodatage concaténé au jeton
 * public, et rien d'autre.
 */
const GRAINE = JETON;
const POINT_ENTREE =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

/**
 * Version de Chromium annoncée au service.
 *
 * Elle n'est pas décorative : le service la VALIDE et refuse la connexion par
 * un 403 si elle est trop ancienne. À faire suivre quand Edge avance — c'est
 * la même valeur que celle du client de référence.
 */
const VERSION_CHROMIUM = '143.0.3650.75';
const VERSION_MAJEURE = VERSION_CHROMIUM.split('.')[0];

/** Voix autorisées : celles attribuées aux professeurs, et rien d'autre. */
const VOIX_AUTORISEES = new Set([
  'fr-FR-HenriNeural',
  'fr-FR-RemyMultilingualNeural',
  'fr-FR-EloiseNeural',
  'fr-FR-VivienneMultilingualNeural',
]);

/** Au-delà, ce n'est plus une réplique de professeur. */
const LONGUEUR_MAX = 600;

/**
 * Empreinte horodatée exigée par le service.
 *
 * L'horodatage est ramené à l'origine Windows (1601) puis arrondi à cinq
 * minutes : deux clients synchronisés produisent donc la même valeur, et une
 * empreinte reste valable le temps d'une fenêtre.
 */
function secMsGec() {
  const maintenant = Date.now();
  const ticks = Math.floor((maintenant / 1000 + 11644473600) / 300) * 300 * 10_000_000;
  return createHash('sha256').update(`${ticks}${GRAINE}`).digest('hex').toUpperCase();
}

function echapper(texte) {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ssml(voix, texte) {
  const langue = voix.slice(0, 5);
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langue}'>` +
    `<voice name='${voix}'>` +
    `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${echapper(texte)}</prosody>` +
    `</voice></speak>`
  );
}

function horodatage() {
  return new Date().toString().replace(/GMT.*/, 'GMT+0000 (Coordinated Universal Time)');
}

/**
 * Ouvre une session, envoie le texte, rend l'audio assemblé.
 *
 * Le service découpe la réponse en trames : on les concatène jusqu'au signal
 * `turn.end`. La promesse est bornée par un délai, sinon une connexion muette
 * retiendrait la fonction jusqu'à son propre délai d'exécution.
 */
function synthetiser(voix, texte, delaiMs = 8000) {
  return new Promise((resoudre, rejeter) => {
    const url =
      `${POINT_ENTREE}?TrustedClientToken=${JETON}` +
      `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${VERSION_CHROMIUM}`;
    const prise = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          `Chrome/${VERSION_MAJEURE}.0.0.0 Safari/537.36 Edg/${VERSION_MAJEURE}.0.0.0`,
      },
    });

    const morceaux = [];
    const minuteur = setTimeout(() => {
      prise.terminate();
      rejeter(new Error('délai dépassé'));
    }, delaiMs);

    const finir = (erreur, audio) => {
      clearTimeout(minuteur);
      try {
        prise.close();
      } catch {
        // La prise est peut-être déjà fermée : sans conséquence.
      }
      if (erreur) rejeter(erreur);
      else resoudre(audio);
    };

    prise.on('open', () => {
      prise.send(
        `X-Timestamp:${horodatage()}\r\nContent-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          }),
      );
      prise.send(
        `X-RequestId:${randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${horodatage()}Z\r\nPath:ssml\r\n\r\n${ssml(voix, texte)}`,
      );
    });

    prise.on('message', (donnees, binaire) => {
      if (binaire) {
        // Deux premiers octets : longueur de l'en-tête textuel qui précède
        // l'audio. Les sauter donnerait un fichier corrompu.
        const longueurEntete = (donnees[0] << 8) | donnees[1];
        morceaux.push(donnees.subarray(2 + longueurEntete));
        return;
      }
      const texteTrame = donnees.toString();
      if (texteTrame.includes('Path:turn.end')) {
        finir(null, Buffer.concat(morceaux));
      }
    });

    prise.on('error', (e) => finir(e));
    prise.on('close', () => {
      if (morceaux.length > 0) finir(null, Buffer.concat(morceaux));
      else finir(new Error('connexion fermée sans audio'));
    });
  });
}

function erreur(message, code = 400) {
  return new Response(JSON.stringify({ erreur: message }), {
    status: code,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * L'origine de la requête est-elle celle du site ?
 *
 * Même garde que la reconnaissance d'image : ce point d'entrée consomme un
 * service externe, et rien ne justifie de le laisser ouvert à tout Internet.
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
  if (req.method !== 'POST') return erreur('Méthode non prise en charge.', 405);
  if (!origineAutorisee(req.headers.get('origin'), req)) {
    return erreur('Origine non autorisée.', 403);
  }

  let corps;
  try {
    corps = await req.json();
  } catch {
    return erreur('Requête illisible.');
  }

  const voix = String(corps?.voix ?? '');
  const texte = String(corps?.texte ?? '').trim();

  if (!VOIX_AUTORISEES.has(voix)) return erreur('Voix inconnue.');
  if (texte.length === 0) return erreur('Texte vide.');
  if (texte.length > LONGUEUR_MAX) return erreur('Texte trop long.', 413);

  try {
    const audio = await synthetiser(voix, texte);
    if (audio.length === 0) return erreur('Aucun audio produit.', 502);
    return new Response(audio, {
      headers: {
        'content-type': 'audio/mpeg',
        // Le navigateur conserve la réplique de son côté ; ce cache-ci évite
        // simplement de resynthétiser pour deux appareils du même réseau.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    // Le professeur se taira : c'est le comportement voulu quand la voix
    // n'est pas disponible à temps.
    return erreur(`Synthèse indisponible : ${String(e?.message ?? e).slice(0, 80)}`, 502);
  }
}
