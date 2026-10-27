# Tableau de complétion du marché

## Purpose / Big Picture

Remplacer le panneau de filtres par un tableau des séries incomplètes, triées par
cartes manquantes, avec coût minimum des offres à prix fixe, une offre par carte
et budgets par carte/série. Le script Tampermonkey reste un seul fichier à coller.

## Progress

- [x] (2026-10-26 03:05 UTC+8) Inspection des requêtes et du code public du marché.
- [x] (2026-10-26 03:09 UTC+8) Implémentation du tableau et de la collecte paginée.
- [x] (2026-10-26 03:09 UTC+8) Quatre tests Node réussis et validation navigateur sans achat.
- [x] (2026-10-26 03:09 UTC+8) Documentation utilisateur dans windows/MARCHE.md.

## Surprises & Discoveries

Les annonces `active` peuvent déjà être expirées selon `endsAt`. Le marché utilise
`/api/market/listings?series=…&type=fixed&sort=price_asc&page=1&pageSize=24`, renvoyant
`items` et `total`. La collection est `/api/me/collection?lean=1`, tableau de
`characterId,qty`. Le catalogue `/api/characters` contient `id,name,series`.
L'authentification est portée par les requêtes du site, pas uniquement les cookies.
Le profil du bootstrap se nomme `me`, et non `user`. Validation réelle : solde
de 2187 ◆ et 37 séries incomplètes correctement affichés après correction.

## Decision Log

Décision (2026-10-25) : observer les en-têtes des GET collection/bootstrap en mémoire
et les réutiliser uniquement sur les GET Kyara. Aucun identifiant persistant ni achat.
Comparer les offres à prix fixe non expirées, hors annonces personnelles. Les
enchères ne permettent pas un coût d'achat garanti et sont exclues.
Une pagination interrompue doit produire une estimation partielle, jamais un minimum
exhaustif. Scanner à la demande et séquentiellement pour limiter les requêtes.

## Context and Orientation

Le projet est `/home/ubuntu/kyara-free-opener`. Le fichier
`windows/kyara-market-series.user.js` est le script installé par l'utilisateur.
`windows/MARCHE.md` documente son installation. L'ancien panneau importait les
noms depuis `animes-5-6-cartes.md`, stockés sous `kyara-helper-series`.

## Plan of Work

Premier jalon : fonctions pures de regroupement et sélection des offres vérifiables
sans navigateur. Deuxième jalon : observer la session et afficher le tableau avec
import facultatif, rafraîchissement de collection, scan annulable, plafonds de prix.
Troisième jalon : tests Node et injection dans un navigateur connecté pour comparer
un résultat réel et vérifier qu'aucune transaction n'est envoyée.

## Concrete Steps

Depuis le dossier projet : `node --check windows/kyara-market-series.user.js`, puis
`node --test windows/market-series.test.cjs`. Injecter le script au démarrage avec
Playwright, charger `/marche`, actualiser les collections et scanner une série.

## Validation and Acceptance

Une série complète disparaît. Une carte possédée en plusieurs exemplaires compte
une seule fois. Les offres expirées/personnelles sont exclues. Un manque d'offre
affiche un sous-total, pas un prix de complétion. Les budgets insuffisants signalent
la série et chaque carte concernée. Une erreur réseau laisse un message et permet
de relancer, un scan annulé ne marque pas les séries restantes comme introuvables.

## Idempotence and Recovery

Les lectures sont répétables. Désactiver le script rétablit l'interface native.
Les imports n'écrivent que les noms en localStorage. Les données de session restent
en mémoire et disparaissent à la fermeture de la page.

## Artifacts and Notes

`node --test windows/market-series.test.cjs` : 4 tests réussis. Relevé réel de
Snow White with the Red Hair : cinq offres uniques totalisant 120 ◆, une carte
sans offre. Le tableau indique sous-total seulement. Actualisation de collection
testée avec le script final dans un nouveau contexte navigateur : OK.

## Interfaces and Dependencies

JavaScript natif, API DOM et fetch, sans dépendance supplémentaire. Fonctions
`buildSeries(characters,collection,scope)` et `bestOffers(items,now)` exportables
pour les tests Node. Les liens vers les offres utilisent `/marche?annonce=ID`.

## Outcomes & Retrospective

Les cinq fonctions sont livrées. La comparaison de prix est limitée explicitement
aux ventes à prix fixe et horodatée. La lecture en pagination n'est pas un instantané
transactionnel : les offres peuvent évoluer pendant le relevé. L'installation
Tampermonkey Windows reste une action utilisateur ; les tests navigateur injectent
le même fichier au démarrage. Aucun achat n'a été réalisé.

Révision finale : plan actualisé après tests, ajout des preuves réelles et du nom
correct du champ bootstrap pour le solde.

Extension du 25 octobre : version 2.3, liste de doublons vendables et préparation
du formulaire natif de vente à prix fixe. La quantité est min(listable, qty-1).
Le prix est lu depuis la médiane du formulaire ; aucune publication automatique.
Test navigateur : Mira Kamiunten, médiane 10 ◆, formulaire préparé sans soumission.
Six tests Node valident notamment la conservation d'un exemplaire et les réservations.

Extension version 2.4 : le bouton soumet directement le formulaire natif au prix
fixe médian. Un historique local par compte/personnage est écrit avant l'envoi,
puis le personnage est masqué même si d'autres doublons restent disponibles.
Les erreurs et résultats incertains conservent cette marque pour empêcher une
nouvelle tentative accidentelle. Cet historique ne couvre pas les anciennes
annonces ni les autres navigateurs. Documentation mise à jour dans MARCHE.md.

Validation 2.4 : syntaxe vérifiée et neuf tests Node réussis (market-series.test.cjs
et market-sales.test.cjs). Le formulaire simulé vérifie la soumission directe,
le prix médian, la persistance après rechargement, le renouvellement natif après
refus et le maintien du masquage après erreur ou absence de réponse. Aucune
annonce réelle publiée pour ces tests.

Version 2.6 : vue dédiée Collection via /marche#collection-dashboard, navigation
Collection/Acheter/Vendre, recherche et filtres combinables de taille et de cartes
manquantes, séries commencées, quatre tris et pagination par 25. Le scan porte
sur la sélection filtrée entière, avant filtre d'accessibilité budgétaire.
Filtres conservés en mémoire pendant la navigation uniquement.

Validation : dix tests Node réussis et syntaxe valide. Navigateur connecté :
25 lignes par page, combinaison maximum 2 manquantes/minimum 5 cartes vérifiée,
retour vers Vendre masquant le tableau vérifié, absence de débordement horizontal
à 390 px. Aucune transaction effectuée. Évaluation de conception : 8/10 ; pour
atteindre 10/10, ajouter une sauvegarde des préférences et une revue visuelle
approfondie des états vides et de chargement.

Version 2.7 : à la demande de l'utilisateur, le tableau est désormais affiché
dans Acheter (onglet absent ou `onglet=acheter`), y compris avec `annonce=ID`.
Suppression du lien Collection et du masquage des éléments natifs du marché,
pour conserver l'accès à la fenêtre d'achat. Les filtres et prix en mémoire
restent disponibles pendant la navigation native. Syntaxe et dix tests Node
réussis ; aucun achat effectué.

Version 2.8 : nouvelle présentation sombre/menthe, compteurs, filtres repliables,
vignettes et états possédés. Liens SvelteKit avec noscroll/keepfocus et restauration
de l'ancre de série après fermeture du dialogue. Au clic d'achat, la sélection
est figée (ordre, pages, cartes), puis les quantités sont projetées depuis la
collection actualisée. Les séries complètes restent jusqu'au reclassement explicite
ou changement de filtre ; l'actualisation au focus n'efface plus les relevés durant
cette séquence. Pas de persistance au rechargement.

Validation : onze tests Node, dont acquisition successive de deux cartes sans
déplacement de série ni suppression d'emplacements. Navigateur réel : scrollY
784 avant, pendant et après ouverture/fermeture de l'annonce. Réponse collection
simulée sans transaction : 6 lignes conservées, Shirayuki marquée possédée et
compteur passé de 6 à 5. À 390 px, aucun débordement horizontal ; capture relue.
Évaluation visuelle : 8/10 ; une meilleure intégration aux barres fixes mobiles
du site et des préférences persistantes restent des pistes d'amélioration.

Version 2.9 : au clic Vendre, lecture paginée fraîche des annonces de la série
et sélection du prix fixe actif non expiré minimum pour le personnage exact,
y compris les annonces personnelles. Alignement exact, sans sous-cotation.
Repli sur la médiane native uniquement si aucune offre éligible n'est trouvée
après lecture complète. Une erreur ou un relevé tronqué interrompt la vente.
La limite est de 100 pages. Publication directe et historique anti-doublon conservés.
Validation : syntaxe valide et treize tests Node réussis, couvrant minimum sur
plusieurs pages, exclusions, annonce personnelle, absence d'offre et erreurs
de lecture sans publication. Aucune vente réelle effectuée.

Version 2.9.1 : exploitation du tri `price_asc` déjà demandé au serveur. La lecture
s'arrête dès la première page contenant une annonce éligible du personnage ;
seule l'absence d'offre nécessite de poursuivre la pagination avant repli médian.
Quatorze tests réussis et syntaxe valide, dont un test qui interdit toute lecture
de page suivante après découverte du minimum sur la première page.

Version 2.10 : classement des doublons par prix de vente décroissant, relevé
explicite annulable sur la sélection de recherche, montant/source affichés et
prix inconnus en fin de liste. Requêtes groupées par série, arrêt dès que tous
les minimums sont trouvés. Repli sur `/api/market/prices/ID` uniquement après
pagination complète sans offre. Endpoint et règle native median7d ?? median30d
vérifiés en lecture dans le navigateur le 27 octobre. Vente revérifiant son prix
conservée. Le relevé désactive les ventes pour éviter les modifications simultanées.
Syntaxe valide et seize tests réussis, incluant regroupement/arrêt anticipé,
classement décroissant, repli médian et prix inconnus. Aucune vente réalisée.
