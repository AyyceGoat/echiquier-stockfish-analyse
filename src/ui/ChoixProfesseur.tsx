/**
 * Choix du professeur, et niveau déclaré par l'élève.
 *
 * Les deux vont ensemble : le niveau décide du vocabulaire employé ET du
 * palier auquel le professeur joue. Les séparer sur deux écrans obligerait à
 * revenir en arrière pour comprendre pourquoi l'adversaire est devenu plus
 * fort.
 *
 * Le palier réellement appliqué est affiché en clair sous la sélection. Un
 * professeur n'accompagne pas toute l'échelle : demander « confirmé » à
 * Johana ne la fera pas jouer à 2400, et il vaut mieux le dire que de
 * laisser croire le contraire.
 */

import {
  NIVEAUX_ELEVE,
  palierDuProfesseur,
  PROFESSEURS,
  professeurParId,
  type NiveauEleve,
} from '../lib/professeurs.ts';
import { libelleNiveau, niveauParId } from '../lib/niveaux.ts';
import { PortraitProfesseur } from './PortraitProfesseur.tsx';

export function ChoixProfesseur({
  professeur,
  niveauEleve,
  onProfesseur,
  onNiveauEleve,
}: {
  professeur: string;
  niveauEleve: NiveauEleve;
  onProfesseur: (id: string) => void;
  onNiveauEleve: (n: NiveauEleve) => void;
}) {
  const choisi = professeurParId(professeur);
  const palier = niveauParId(palierDuProfesseur(choisi, niveauEleve));

  return (
    <div className="space-y-5">
      <div>
        <p className="sur-titre mb-2">Votre professeur</p>
        <ul
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="radiogroup"
          aria-label="Choix du professeur"
        >
          {PROFESSEURS.map((p) => {
            const actif = p.id === professeur;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  onClick={() => onProfesseur(p.id)}
                  className={`flex w-full flex-col items-center gap-2 rounded-[var(--radius-md)] border p-2 transition-[border-color,transform] duration-[var(--t-rapide)] active:scale-[0.98] ${
                    actif
                      ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                      : 'border-[var(--color-bordure)] hover:border-[var(--color-bordure-forte)]'
                  }`}
                  style={actif ? { borderColor: p.accent } : undefined}
                >
                  <PortraitProfesseur
                    prof={p}
                    cleEntree={actif ? `${p.id}-actif` : p.id}
                    className="pp-pastille w-full"
                  />
                  <span className="text-center text-xs leading-tight">
                    <span className="titre block font-semibold">{p.nom}</span>
                    <span className="mt-0.5 block" style={{ color: p.accent }}>
                      {p.role}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-texte-doux)]">
          {choisi.presentation}
        </p>
      </div>

      <div>
        <p className="sur-titre mb-2">Votre niveau</p>
        <ul className="space-y-1.5" role="radiogroup" aria-label="Votre niveau">
          {NIVEAUX_ELEVE.map((n) => {
            const actif = n.id === niveauEleve;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  onClick={() => onNiveauEleve(n.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors duration-[var(--t-rapide)] ${
                    actif
                      ? 'border-[var(--color-accent)] bg-[var(--color-fond-3)]'
                      : 'border-[var(--color-bordure)] hover:border-[var(--color-bordure-forte)]'
                  }`}
                >
                  <span className="block text-sm font-medium">{n.libelle}</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-texte-doux)]">
                    {n.detail}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Conséquence du choix, dite en clair plutôt que laissée à deviner. */}
      <p className="rounded-[var(--radius-md)] bg-[var(--color-fond-3)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-texte-doux)]">
        {choisi.nom} accompagne <span className="text-[var(--color-texte)]">{choisi.eleves.toLowerCase()}</span> et
        jouera contre vous au niveau{' '}
        <span className="text-[var(--color-texte)]">{libelleNiveau(palier)}</span>.
      </p>
    </div>
  );
}
