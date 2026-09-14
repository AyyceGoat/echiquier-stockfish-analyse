/**
 * Génère les icônes PNG de la PWA sans dépendance externe.
 *
 * Un encodeur PNG tient en quelques lignes (signature, IHDR, IDAT compressé
 * par zlib, IEND) et évite d'ajouter `sharp` ou `canvas` au projet pour trois
 * fichiers produits une seule fois.
 *
 * Motif : damier 8x8 sur fond sombre — immédiatement lisible comme une
 * application d'échecs, y compris en 48 px dans une liste d'applications.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FOND = [0x0b, 0x10, 0x20];
const CASE_CLAIRE = [0xe8, 0xec, 0xf8];
const CASE_SOMBRE = [0x6c, 0x8c, 0xff];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const octet of buf) crc = table[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function morceau(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, somme]);
}

/** Encode un tableau RGB (largeur * hauteur * 3) en PNG. */
function encoderPng(largeur, hauteur, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // couleur vraie RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Chaque ligne est précédée de son octet de filtre (0 = aucun).
  const brut = Buffer.alloc(hauteur * (1 + largeur * 3));
  for (let y = 0; y < hauteur; y++) {
    const debutLigne = y * (1 + largeur * 3);
    brut[debutLigne] = 0;
    rgb.copy(brut, debutLigne + 1, y * largeur * 3, (y + 1) * largeur * 3);
  }

  return Buffer.concat([
    signature,
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Dessine le damier.
 * `marge` exprime la part de l'image laissée au fond : les icônes
 * « maskable » ont besoin d'une zone de sécurité, le système pouvant
 * rogner jusqu'à 10 % de chaque bord.
 */
function dessiner(taille, marge) {
  const rgb = Buffer.alloc(taille * taille * 3);
  const bord = Math.round(taille * marge);
  const plateau = taille - 2 * bord;
  const cote = plateau / 8;

  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let couleur = FOND;
      if (x >= bord && x < bord + plateau && y >= bord && y < bord + plateau) {
        const col = Math.floor((x - bord) / cote);
        const lig = Math.floor((y - bord) / cote);
        couleur = (col + lig) % 2 === 0 ? CASE_CLAIRE : CASE_SOMBRE;
      }
      const i = (y * taille + x) * 3;
      rgb[i] = couleur[0];
      rgb[i + 1] = couleur[1];
      rgb[i + 2] = couleur[2];
    }
  }
  return encoderPng(taille, taille, rgb);
}

const dossier = join(process.cwd(), 'public', 'icons');
mkdirSync(dossier, { recursive: true });

writeFileSync(join(dossier, 'icon-192.png'), dessiner(192, 0.12));
writeFileSync(join(dossier, 'icon-512.png'), dessiner(512, 0.12));
// Zone de sécurité plus large : le système peut rogner les bords.
writeFileSync(join(dossier, 'icon-maskable-512.png'), dessiner(512, 0.22));

console.log('Icônes générées dans public/icons/.');
