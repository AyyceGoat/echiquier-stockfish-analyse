/**
 * Thème appliqué AVANT la première peinture.
 *
 * Fichier séparé et non script en ligne : la politique de sécurité du contenu
 * refuse `unsafe-inline` pour les scripts, et un script en ligne était
 * silencieusement bloqué en production. Chargé sans `defer` depuis le `head`,
 * il s'exécute toujours avant le rendu, donc sans clignotement de thème.
 */
(function () {
        try {
          var brut = localStorage.getItem('echiquier.reglages.v1');
          var theme = brut ? JSON.parse(brut).theme : 'sombre';
          var resolu =
            theme === 'systeme'
              ? matchMedia('(prefers-color-scheme: light)').matches
                ? 'clair'
                : 'sombre'
              : theme === 'clair'
                ? 'clair'
                : 'sombre';
          document.documentElement.dataset.theme = resolu;
          document
            .querySelector('meta[name="theme-color"]')
            .setAttribute('content', resolu === 'clair' ? '#f4efe6' : '#14120f');
        } catch (e) {
          /* Stockage bloqué : on reste sur le thème sombre du document. */
        }
      })();
