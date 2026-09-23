/**
 * Portrait animé d'un professeur.
 *
 * Quatre calques superposés à l'image, tous animés en `transform` et
 * `opacity` uniquement — ce sont les deux seules propriétés que le
 * compositeur sait animer sans recalcul de mise en page, donc les seules qui
 * tiennent 60 images par seconde sur mobile.
 *
 *  1. Respiration : le buste entier, très légèrement.
 *  2. Mouvement de tête : une COPIE du portrait, masquée en fondu juste
 *     au-dessus du cou. Le calque doit contenir le visage, sinon les
 *     paupières et la bouche dériveraient d'un visage resté immobile.
 *  3. Paupières : pas des formes dessinées, mais des fragments de l'image
 *     elle-même, prélevés juste au-dessus de l'œil et rabattus par `scaleY`.
 *     Teinte, ombrage et trait d'encre se fondent donc exactement, ce
 *     qu'aucune couleur choisie à la main n'obtiendrait.
 *  4. Halo d'accent pendant la parole, SOUS le portrait : posé par-dessus,
 *     il laverait le visage.
 *
 *  5. Bouche : une pastille découpée dans un VRAI rendu bouche ouverte,
 *     posée sur le portrait immobile (voir `bouches` dans `professeurs.ts`).
 *     La tentative précédente simulait l'ouverture par transformation et
 *     produisait une fente sombre à bords francs ; celle-ci n'invente rien.
 *     La pastille vit dans `.pp-tete` pour suivre le mouvement de tête.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { boiteBouche, pourcent, REPERES, type Zone } from '../lib/reperesPortraits.ts';
import type { FicheProfesseur } from '../lib/professeurs.ts';

/** Largeurs disponibles dans `public/profs`. */
const LARGEURS = [192, 320, 512, 768, 1024];

function srcSet(id: string): string {
  return LARGEURS.map((l) => `/profs/${id}-${l}.webp ${l}w`).join(', ');
}

/**
 * Un calque recadré sur une zone de l'image.
 *
 * Le contenu est une copie de l'image sur-dimensionnée et décalée pour que la
 * région voulue tombe pile dans la boîte. `srcY` permet de prélever les
 * pixels AILLEURS que sous la boîte : c'est ainsi que la paupière montre la
 * peau située au-dessus de l'œil.
 */
function Calque({
  id,
  classe,
  zone,
  srcY,
  style,
}: {
  id: string;
  classe: string;
  zone: { x: number; y: number; w: number; h: number };
  srcY?: number;
  style?: React.CSSProperties;
}) {
  const { x, y, w, h } = zone;
  return (
    <div
      className={`pp-boite ${classe}`}
      style={{ left: pourcent(x), top: pourcent(y), width: pourcent(w), height: pourcent(h), ...style }}
    >
      <div
        className="pp-peau"
        style={{
          width: `${(1024 / w) * 100}%`,
          height: `${(1024 / h) * 100}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-(srcY ?? y) / h) * 100}%`,
          backgroundImage: `url('/profs/${id}-512.webp')`,
        }}
      />
    </div>
  );
}

const boiteDe = (z: Zone) => ({ x: z.cx - z.rx, y: z.cy - z.ry, w: z.rx * 2, h: z.ry * 2 });

export function PortraitProfesseur({
  prof,
  /** Le professeur parle : halo actif, et bouche animée si des images existent. */
  parle = false,
  /** Rejoue l'animation d'entrée quand cette valeur change. */
  cleEntree,
  className = '',
}: {
  prof: FicheProfesseur;
  parle?: boolean;
  cleEntree?: string | number;
  className?: string;
}) {
  const reperes = REPERES[prof.id];
  const gauche = useRef<HTMLDivElement>(null);
  const droite = useRef<HTMLDivElement>(null);
  const [imageBouche, setImageBouche] = useState(0);

  /* --- Clignement, à intervalles irréguliers ---------------------------
     Un clignement à période fixe se repère immédiatement. Le délai est tiré
     entre 3 et 6 secondes, et le battement est parfois doublé. */
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let minuteurs: number[] = [];
    let vivant = true;

    const battre = (duree = 120) => {
      for (const ref of [gauche, droite]) {
        const el = ref.current;
        if (!el) continue;
        el.style.transition = `transform ${duree}ms ease-in`;
        el.style.transform = 'scaleY(1)';
        minuteurs.push(
          window.setTimeout(() => {
            el.style.transition = `transform ${duree + 50}ms ease-out`;
            el.style.transform = 'scaleY(0)';
          }, duree),
        );
      }
    };

    const suivant = () => {
      if (!vivant) return;
      minuteurs.push(
        window.setTimeout(
          () => {
            battre();
            if (Math.random() < 0.22) minuteurs.push(window.setTimeout(() => battre(105), 330));
            suivant();
          },
          3000 + Math.random() * 3000,
        ),
      );
    };
    suivant();

    return () => {
      vivant = false;
      for (const m of minuteurs) clearTimeout(m);
      minuteurs = [];
    };
  }, [prof.id]);

  /* --- Bouche, si et seulement si des pastilles existent ---------------
     L'index 0 est la bouche fermée, c'est-à-dire AUCUNE pastille : le
     portrait d'origine suffit. Les pastilles suivantes s'y superposent.

     Le rythme n'est pas régulier. Une alternance à cadence fixe se lit
     comme un clignotant ; on tire donc l'état suivant au hasard en
     interdisant de répéter le précédent, ce qui produit des ouvertures de
     durées inégales, comme une parole. */
  useEffect(() => {
    if (prof.bouches.length === 0) return;
    if (!parle) {
      setImageBouche(0);
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let precedent = 0;
    const t = window.setInterval(() => {
      let suivant = precedent;
      while (suivant === precedent) suivant = Math.floor(Math.random() * (prof.bouches.length + 1));
      precedent = suivant;
      setImageBouche(suivant);
    }, 115);
    return () => {
      clearInterval(t);
      setImageBouche(0);
    };
  }, [parle, prof.bouches.length]);

  const boiteDeLaBouche = useMemo(
    () => (reperes ? boiteBouche(reperes) : null),
    [reperes],
  );

  if (!reperes) return null;

  return (
    <div
      key={cleEntree}
      className={`pp-scene pp-entre ${parle ? 'pp-parle' : ''} ${className}`}
      style={
        {
          '--pp-accent': prof.accent,
          '--pp-cou': pourcent(reperes.cou),
        } as React.CSSProperties
      }
    >
      <div className="pp-halo" aria-hidden />
      <div className="pp-buste">
        {/* Portrait de base : c'est lui qui porte le texte alternatif. */}
        <img
          className="pp-image"
          src={`/profs/${prof.id}-512.webp`}
          srcSet={srcSet(prof.id)}
          sizes="(max-width: 700px) 40vw, 180px"
          alt={`Portrait de ${prof.nom}`}
          draggable={false}
        />
        <div className="pp-tete">
          <img
            className="pp-image"
            src={`/profs/${prof.id}-512.webp`}
            alt=""
            aria-hidden
            draggable={false}
          />
          <Calque
            id={prof.id}
            classe="pp-paupiere"
            zone={boiteDe(reperes.oeilG)}
            srcY={reperes.oeilG.cy - reperes.oeilG.ry * 3}
          />
          <Calque
            id={prof.id}
            classe="pp-paupiere"
            zone={boiteDe(reperes.oeilD)}
            srcY={reperes.oeilD.cy - reperes.oeilD.ry * 3}
          />
          {/* Les deux pastilles sont rendues en permanence et pilotées par
              l'opacité : les décoder au moment où le professeur ouvre la
              bouche produirait un trou d'une image à la première syllabe. */}
          {boiteDeLaBouche
            ? prof.bouches.map((src, i) => (
                <img
                  key={src}
                  className="pp-bouche"
                  src={src}
                  alt=""
                  aria-hidden
                  draggable={false}
                  style={{
                    left: pourcent(boiteDeLaBouche.x),
                    top: pourcent(boiteDeLaBouche.y),
                    width: pourcent(boiteDeLaBouche.w),
                    height: pourcent(boiteDeLaBouche.h),
                    opacity: imageBouche === i + 1 ? 1 : 0,
                  }}
                />
              ))
            : null}
        </div>
      </div>
      {/* Les refs sont posées après coup : `Calque` rend deux nœuds dont on
          doit piloter le `transform` à la main, hors du cycle de React, pour
          que le clignement n'entraîne aucun rendu. */}
      <PosePaupieres gauche={gauche} droite={droite} />
    </div>
  );
}

/**
 * Rattache les deux paupières rendues par `Calque` aux refs du clignement.
 *
 * Passer par le DOM plutôt que par l'état : un clignement toutes les trois
 * secondes sur quatre portraits déclencherait des rendus React en continu,
 * pour une animation qui ne concerne que deux `transform`.
 */
function PosePaupieres({
  gauche,
  droite,
}: {
  gauche: React.RefObject<HTMLDivElement | null>;
  droite: React.RefObject<HTMLDivElement | null>;
}) {
  const ancre = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scene = ancre.current?.closest('.pp-scene');
    if (!scene) return;
    const lids = scene.querySelectorAll<HTMLDivElement>('.pp-paupiere');
    gauche.current = lids[0] ?? null;
    droite.current = lids[1] ?? null;
  });
  return <span ref={ancre} hidden />;
}
