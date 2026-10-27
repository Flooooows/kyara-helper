# Tableau « Séries à terminer » — version 2

## Version 2.8 : présentation et continuité des achats

Interface sombre avec accent menthe, compteurs, vignettes des cartes, progression
et filtres/budgets repliables. Les liens d'achat conservent le défilement à
l'ouverture du dialogue natif et retrouvent la série à sa fermeture.

Dès un clic d'achat, l'ordre et les emplacements de la sélection sont conservés.
Les quantités évoluent, mais les cartes acquises restent visibles comme
**Dans ta collection**, sans bouton d'achat. Une série terminée reste à sa place.
**Réappliquer le tri** reclasse la sélection et retire les séries complètes.
Changer un filtre ou le mode de tri recalcule également la sélection.
Cette stabilité reste active pendant la session de page, pas après rechargement.

Depuis la version 2.7, le tableau de bord se trouve directement dans **Acheter**.
Les liens d'achat ouvrent la fenêtre native Kyara en gardant le tableau affiché,
sans devoir revenir dans un onglet Collection séparé. Les doublons restent
uniquement dans **Vendre**. Les contrôles natifs du marché restent accessibles.

Le tableau propose une recherche par série, des bornes minimum/maximum de cartes
manquantes et de taille de série, ainsi que le filtre « Séries déjà commencées ».
Une borne vide ne limite pas les résultats. Le tri peut porter sur les cartes
manquantes, la taille, la progression ou le nom. Les séries sont paginées par 25.
**Analyser les séries filtrées** analyse toute la sélection, pas uniquement la
page visible ; le filtre de budget s'applique ensuite aux prix connus. Les filtres
restent en mémoire pendant la navigation, mais sont réinitialisés au rechargement.

Remplace entièrement l'ancien script dans Tampermonkey par le contenu de
`kyara-market-series.user.js`, enregistre, puis recharge le marché Kyara.
N'active pas deux copies du script simultanément. Sur Chrome/Edge, autorise les
scripts utilisateur pour Tampermonkey si l'extension le demande.

## Collection et sélection

Le tableau utilise ta session Windows déjà connectée. Les séries complètes
disparaissent et les autres sont triées par nombre de cartes manquantes.
Par défaut, il suit **toutes les séries incomplètes, quelle que soit leur taille**,
y compris celles dont tu ne possèdes encore aucune carte. Tu peux
importer `animes-5-6-cartes.md` pour limiter le suivi à cette liste ; une ancienne
liste déjà importée est conservée mais n'est plus sélectionnée par défaut.
Le menu permet de revenir à toutes les séries. Le tri reste croissant par nombre
de cartes manquantes, puis alphabétique en cas d'égalité.

La progression s'actualise lorsque Kyara recharge la collection, quand tu reviens
sur l'onglet marché, ou avec **Actualiser ma collection**. Ce bouton efface les
anciens prix afin de pouvoir refaire un relevé à jour. Aucun fichier `.md` local
n'est modifié par le navigateur : le tableau remplace les vérifications manuelles.

## Prix et offres

Déplie une série et clique **Actualiser les prix de cette série**, ou lance
**Analyser les séries filtrées**. Les pages d'annonces sont lues une à une.
**Arrêter l'analyse** termine après la requête en cours. Les prix ne sont pas
analysés en continu en arrière-plan.

Une seule annonce, la moins chère trouvée, apparaît par personnage manquant.
Le calcul retient les prix fixes actifs, non expirés, hors tes propres annonces.
Les enchères et achats immédiats d'enchères ne sont pas inclus.

Le coût de complétion est affiché seulement si chaque carte manquante a une
offre et si toutes les pages ont été analysées. Sinon, le panneau indique un
**sous-total seulement** et les cartes introuvables. Une analyse interrompue,
en erreur ou limitée à 100 pages reste marquée **partielle**. Chaque relevé est
horodaté ; les annonces peuvent changer pendant ou après la lecture.

## Budgets et achat

Les plafonds **par carte** et **par série** sont indépendants ; vide signifie
illimité et zéro signifie zéro. Le filtre **Seulement les séries complétables
dans mon budget** exige des offres pour toutes les cartes et respecte également
ton solde de chakra lorsqu'il est connu. Lance l'analyse avant de l'activer.
Les plafonds ne cachent pas les offres dans le détail : les dépassements sont indiqués.

**Acheter · prix ◆** ouvre la fenêtre d'achat native Kyara dans l'onglet actuel,
directement depuis le tableau. Vérifie le prix actuel puis confirme l'achat dans
cette fenêtre. La collection s'actualise quand Kyara la recharge après l'achat ;
le bouton **Actualiser ma collection** reste disponible si nécessaire.
Le script n'achète ni n'enchérit automatiquement. Le budget par série
n'est pas un budget cumulé pour acheter toutes les séries affichées.

## Vente directe des doublons (version 2.10)

Ouvre l'onglet **Vendre**, puis déplie **Vendre rapidement mes doublons — prix fixe**
dans le panneau. La recherche retrouve tes doublons par personnage ou série.
La liste indique le nombre vendable en conservant au moins un exemplaire, et
respecte les quantités disponibles indiquées par Kyara (verrous et réservations).

Clique **Analyser les prix · plus chers en premier** pour relever les prix des
doublons affichés et les classer par prix décroissant. La recherche permet de
limiter le relevé à un personnage ou une série. Chaque ligne affiche le prix et
sa source (minimum du marché ou médiane). Les prix inconnus restent à la fin.
Les prix connus sont triés au fur et à mesure ; attends la fin pour un classement
complet de la sélection. **Arrêter le relevé** conserve les résultats partiels.

Les pages par prix croissant sont lues une seule fois par série et la lecture
s'arrête dès que tous ses doublons sélectionnés ont une annonce. Sans annonce,
la médiane 7 jours, ou à défaut 30 jours, est utilisée comme dans Kyara.
Le relevé reste en mémoire jusqu'au rechargement ; survole une ligne pour son heure.
Le prix affiché est indicatif et revérifié au clic Vendre. Le relevé n'effectue
aucune vente et les boutons de vente sont désactivés pendant son exécution.

**Vendre 1 au prix du marché** relit ta collection et les annonces de la série,
puis retient le prix fixe actif non expiré le plus bas pour ce personnage,
y compris tes propres annonces. Le prix est égal à celui-ci, sans sous-cotation.
S'il n'existe aucune annonce à prix fixe pour cette carte, le montant « Médiane »
affiché par Kyara est utilisé. Le script remplit le formulaire pour une seule copie,
puis **publie directement**, sans deuxième confirmation. Les frais Kyara
s'appliquent et la durée par défaut du formulaire est conservée.

Le personnage est masqué dès l'envoi, même s'il reste d'autres doublons. Cet
historique est conservé dans ce navigateur et séparé par compte ; il persiste
après rechargement. Les annonces créées avant cette version ou depuis un autre
navigateur ne sont pas dans cet historique. Ne supprime pas les données du site
si tu souhaites conserver cette protection. En cas d'erreur ou de délai dépassé,
la carte reste masquée : vérifie son état dans **Mes ventes** avant de la remettre
en vente manuellement. L'outil ne relance pas automatiquement une publication.

Le relevé est fait au clic, par **prix croissant** : dès qu'une page contient une
annonce éligible pour la carte, son prix minimum est retenu et la lecture s'arrête.
Les pages suivantes ne sont consultées que si aucune annonce correspondante n'a
encore été trouvée (maximum 100 pages). En cas d'erreur
ou de relevé incomplet, la vente est interrompue sans remplacement par la médiane.
Le marché peut évoluer après le relevé. Ni le minimum ni la médiane ne garantissent
une vente immédiate. Si aucune annonce et aucune médiane ne sont disponibles,
le formulaire reste à compléter manuellement.

## Diagnostic

Si la collection manque, vérifie que le script s'exécute dès le chargement
(`document-start`), puis recharge la page. Si Kyara renvoie une erreur 429,
attends avant de relancer l'analyse. Le script conserve les en-têtes de session
uniquement en mémoire pour ses lectures du site ; seuls les noms de séries
importés sont enregistrés localement.

Vérification des calculs (pour le développement) :

    node --test windows/market-series.test.cjs
