/**
 * Pilote de l'écran de lancement.
 *
 * Fichier séparé pour la même raison que `theme.js` : la politique de
 * sécurité bloque les scripts en ligne. Bloqué, celui-ci ne définissait pas
 * `window.__lancement`, l'application appelait donc `terminer()` dans le
 * vide, et l'écran restait sur « Préparation… » indéfiniment.
 *
 * Le garde-fou des vingt secondes vit désormais AUSSI en CSS
 * (`lancement-secours` dans le document) : un garde-fou écrit en JavaScript
 * ne sert à rien précisément quand le JavaScript ne s'exécute pas.
 */
(function () {
        var racine = document.getElementById('lancement');
        var barre = document.getElementById('lancement-barre');
        var etape = document.getElementById('lancement-etape');
        if (!racine) return;

        var part = 0.04;
        var debut = Date.now();
        /** Durée minimale d'affichage : en dessous, l'écran clignote. */
        var MINIMUM = 900;

        function avancer(valeur, texte) {
          // Monotone : une jauge qui recule est pire que pas de jauge.
          part = Math.max(part, Math.min(1, valeur));
          if (barre) barre.style.transform = 'scaleX(' + part + ')';
          if (texte && etape) etape.textContent = texte;
        }

        function terminer() {
          avancer(1, 'Prêt');
          var reste = Math.max(0, MINIMUM - (Date.now() - debut));
          setTimeout(function () {
            racine.classList.add('lc-sort');
            // On retire le nœud après la transition : le laisser en place
            // garderait un calque plein écran au-dessus de l'application.
            setTimeout(function () {
              if (racine && racine.parentNode) racine.parentNode.removeChild(racine);
            }, 600);
          }, reste);
        }

        window.__lancement = { avancer: avancer, terminer: terminer };

        // Garde-fou : si l'application ne se signale jamais, on sort quand
        // même et on laisse le visiteur voir ce qu'il y a derrière.
        setTimeout(function () {
          if (document.getElementById('lancement')) {
            if (etape) etape.textContent = 'Le chargement prend plus de temps que prévu…';
            terminer();
          }
        }, 20000);

        // Progression fine pendant le téléchargement du bundle : on ne sait
        // pas encore ce qu'il reste, mais on sait que ça avance.
        var faux = setInterval(function () {
          if (part >= 0.6) return clearInterval(faux);
          avancer(part + 0.035);
        }, 180);
      })();
