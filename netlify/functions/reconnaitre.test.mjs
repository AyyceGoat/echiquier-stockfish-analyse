/**
 * Les plafonds de dépense de la lecture par modèle.
 *
 * Ce point d'entrée facture une génération à Anthropic et du temps de fonction
 * à Netlify. Le contrôle d'origine ferme l'usage depuis un navigateur tiers,
 * mais un en-tête `Origin` se falsifie en une ligne de `curl` : seul un
 * compteur borne la facture. C'est donc la chose à tester.
 *
 * Aucun appel payant n'est émis ici : sans `ANTHROPIC_API_KEY` dans
 * l'environnement et sans clé utilisateur, la fonction rend 401 — mais APRÈS
 * avoir consommé le quota. C'est exactement l'ordre qu'on veut vérifier.
 */

import { describe, expect, it, beforeEach } from 'vitest';

const handler = (await import('./reconnaitre.mjs')).default;

/** Une requête de lecture, avec l'adresse d'appelant qu'on veut. */
const requete = (ip, image = 'x'.repeat(200)) =>
  new Request('https://exemple.test/api/reconnaitre', {
    method: 'POST',
    headers: {
      origin: 'https://exemple.test',
      'content-type': 'application/json',
      'x-nf-client-connection-ip': ip,
    },
    body: JSON.stringify({ image, typeMime: 'image/jpeg' }),
  });

/** Adresse distincte à chaque test : le compteur est en mémoire, pas remis à zéro. */
let compteur = 0;
let ip = '';
beforeEach(() => {
  compteur += 1;
  ip = `203.0.113.${compteur}`;
});

describe('plafond par adresse IP', () => {
  it('laisse passer vingt lectures, refuse la vingt-et-unième', async () => {
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await handler(requete(ip))).status);
    // Les vingt premières passent le quota et butent sur l'absence de clé.
    expect(codes.slice(0, 20), JSON.stringify(codes)).toEqual(Array(20).fill(401));
    // Les suivantes sont refusées par le quota, avant toute dépense.
    expect(codes.slice(20)).toEqual([429, 429]);
  });

  it('compte chaque adresse séparément', async () => {
    const voisine = `198.51.100.${compteur}`;
    for (let i = 0; i < 21; i++) await handler(requete(ip));
    expect((await handler(requete(ip))).status).toBe(429);
    // La connexion d'à côté n'est pas punie pour autant.
    expect((await handler(requete(voisine))).status).toBe(401);
  });

  it('explique le refus et propose la clé personnelle', async () => {
    for (let i = 0; i < 21; i++) await handler(requete(ip));
    const r = await handler(requete(ip));
    const corps = await r.json();
    expect(r.status).toBe(429);
    expect(corps.conseil).toMatch(/clé d’API|clé d'API/);
  });
});

describe('taille de l’image', () => {
  it('refuse une image qui dépasse un mégaoctet et demi', async () => {
    // Le client envoie 340 Ko au plus. Au-delà, c'est qu'on ne passe pas par lui.
    const r = await handler(requete(ip, 'x'.repeat(1_600_000)));
    expect(r.status).toBe(413);
  });

  it('refuse une requête sans image exploitable', async () => {
    const r = await handler(requete(ip, 'trop court'));
    expect(r.status).toBe(400);
  });
});

describe('surface du point d’entrée', () => {
  it('ne répond qu’aux méthodes attendues', async () => {
    const r = await handler(
      new Request('https://exemple.test/api/reconnaitre', { method: 'DELETE' }),
    );
    expect(r.status).toBe(405);
  });

  it('ne publie aucune clé ni nom de variable sur le diagnostic', async () => {
    const r = await handler(
      new Request('https://exemple.test/api/reconnaitre?diagnostic=1', { method: 'GET' }),
    );
    const corps = await r.json();
    expect(r.status).toBe(200);
    // Des booléens et un nom de modèle, rien d'autre.
    expect(Object.keys(corps).sort()).toEqual(['cleServeur', 'modele', 'passerelle']);
    expect(JSON.stringify(corps)).not.toMatch(/sk-ant|ANTHROPIC/);
  });
});
