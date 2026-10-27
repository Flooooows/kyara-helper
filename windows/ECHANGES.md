# Échanger les doublons entre amis

1. Installe l’extension **Tampermonkey** dans ton navigateur Windows.
2. Dans Tampermonkey, crée un nouveau script et remplace son contenu par celui
   de `kyara-trade-helper.user.js`, puis enregistre (Ctrl+S).
3. Si Chrome/Edge le demande, active l’autorisation d’exécuter des scripts
   utilisateur pour Tampermonkey dans les paramètres des extensions.
4. Recharge entièrement le profil de ton amie, puis ouvre **Proposer un échange**.
5. Dans **Doublons utiles entre amis**, clique **Analyser / actualiser les listes**.

Le panneau affiche tes doublons qu’il lui manque et ses exemplaires disponibles
en double qu’il te manque. La recherche filtre par personnage ou anime.

**Préparer le premier lot affiché** remplit un échange vide avec au maximum
20 cartes de chaque côté, soit **40 cartes au total**, à raison d’un exemplaire
par personnage. Les cartes sont choisies par ordre alphabétique. Désactive les
filtres natifs de rareté/possession avant de préparer le lot.

Chaque côté est rempli indépendamment : les lots peuvent contenir 20 contre 7,
20 contre 0, ou 0 contre 20. Pour donner 82 cartes sans contrepartie, prépare
successivement quatre lots de 20 puis un lot de 2, en rechargeant la page après
chaque acceptation. Kyara reste responsable d’autoriser l’envoi et d’appliquer
ses limites de don ; la sélection seule ne garantit pas que le site l’acceptera.

Vérifie ensuite le contenu et la valeur du lot dans Kyara et envoie toi-même
la proposition. Un nombre égal de cartes ne garantit pas une valeur équilibrée.
Le script n’envoie ni n’accepte d’échange et n’ajoute pas de chakra.

Après acceptation par ton amie, **recharge la page** pour obtenir les collections
à jour, puis prépare le lot suivant. Ne prépare pas plusieurs fois le même lot
avant son acceptation : les cartes reçues ne sont pas encore dans vos collections.

Le script conserve au moins un exemplaire chez chaque personne. Pour ton amie,
il exige au moins deux exemplaires librement échangeables : il peut donc omettre
un doublon si d’autres exemplaires sont verrouillés ou réservés. Les données sont
lues dans les réponses déjà chargées par Kyara, sans copier les identifiants.

Si le panneau indique des données manquantes, vérifie que le script est activé,
recharge le profil et ouvre une nouvelle fenêtre d’échange. Le bouton d’analyse
recalcule à partir des dernières données reçues ; il ne force pas une requête.
