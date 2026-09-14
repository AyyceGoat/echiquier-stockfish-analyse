/**
 * Sert dist/ SANS les en-têtes COOP/COEP, pour reproduire le cas d'une
 * WebView Android ou d'un hébergeur qui ne les applique pas. Sert à vérifier
 * que le repli mono-thread de Stockfish fonctionne réellement.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let chemin = join('dist', decodeURIComponent(url.pathname));
  try {
    let corps;
    try {
      corps = await readFile(chemin);
    } catch {
      chemin = join('dist', 'index.html');
      corps = await readFile(chemin);
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(corps);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(4174, () => console.log('Serveur sans isolation sur http://localhost:4174'));
