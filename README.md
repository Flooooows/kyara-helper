# Kyara Helper

Des outils pour compléter ses séries, vendre ses doublons, préparer des échanges
et ouvrir les boosters gratuits sur [Kyara](https://kyara.games).

## Installer les scripts Tampermonkey

Les deux scripts fonctionnent directement dans le navigateur avec ta session
Kyara connectée. **Pas besoin de Node.js, de PowerShell ni de lancer le programme
de boosters** pour les utiliser. Ils peuvent être activés ensemble.

1. Installe [Tampermonkey](https://www.tampermonkey.net/) dans ton navigateur.
2. Ouvre le fichier du script souhaité dans ce dépôt :
   - **Marché, collection et vente** : [`kyara-market-series.user.js`](windows/kyara-market-series.user.js).
   - **Échanges entre amis** : [`kyara-trade-helper.user.js`](windows/kyara-trade-helper.user.js).
3. Clique sur **Raw** pour afficher le code brut et copie **tout le contenu**,
   y compris le bloc `// ==UserScript==` au début. Si Tampermonkey propose
   directement une installation à cette étape, clique sur **Installer**.
4. Sinon, ouvre Tampermonkey → **Créer un nouveau script**, efface le modèle,
   colle le code et enregistre avec **Ctrl+S**.
5. Vérifie que Tampermonkey et le script sont activés. Sur Chrome/Edge, active
   l'autorisation **Autoriser les scripts utilisateur** si l'extension la demande
   (ou le mode développeur des extensions selon la version du navigateur).
6. Connecte-toi à Kyara et **recharge entièrement la page**. Répète l'installation
   pour le second script si tu souhaites utiliser les deux.

### Marché : kyara-market-series

Ouvre le [marché Kyara](https://kyara.games/marche).

- Dans **Acheter**, le tableau affiche tes séries incomplètes. Déplie
  **Affiner ma sélection · filtres et budgets** pour filtrer par taille de série,
  nombre de cartes manquantes, nom et budget.
- Clique sur **Analyser les séries filtrées**, ou analyse une seule série,
  pour afficher les offres les moins chères. **Acheter** ouvre la fenêtre native
  de Kyara : confirme l'achat dans cette fenêtre. L'ordre reste stable pendant
  tes achats ; **Réappliquer le tri** reclasse ensuite les séries.
- Dans **Vendre**, clique sur **Analyser les prix · plus chers en premier**
  pour classer tes doublons par prix de vente décroissant.
- **Vendre 1 au prix du marché publie directement une annonce**, sans deuxième
  confirmation, au prix fixe actif le plus bas pour la carte, ou à la médiane
  Kyara en l'absence d'annonce. Les frais du site s'appliquent. Le script garde
  un exemplaire et masque ensuite ce personnage pour éviter une seconde vente.
  Cet historique est local au navigateur ; en cas de résultat incertain,
  vérifie **Mes ventes**.

Guide complet : [marché, filtres, achats et ventes](windows/MARCHE.md).

### Échanges : kyara-trade-helper

1. Ouvre le profil de ton ami sur Kyara puis **Proposer un échange**.
2. Dans **Doublons utiles entre amis**, clique sur **Analyser / actualiser les listes**.
3. Filtre éventuellement par personnage ou série. Dans un échange vide, clique
   sur **Préparer le premier lot affiché** : jusqu'à 20 cartes par côté, en
   conservant un exemplaire de chaque personnage. Désactive au préalable les
   filtres natifs de rareté et de possession.
4. Vérifie les cartes sélectionnées, puis **envoie toi-même la proposition**
   dans Kyara. Le script ne l'envoie pas et ne l'accepte pas automatiquement.
5. Après acceptation, recharge la page avant de préparer le lot suivant.

Guide complet : [échanges et dons entre amis](windows/ECHANGES.md).

### Mettre à jour ou désactiver les scripts

Pour une mise à jour, ouvre le script existant dans le tableau de bord
Tampermonkey, remplace tout son contenu par celui du fichier à jour, enregistre
et recharge Kyara. **Ne garde pas deux copies actives du même script.**
Pour le désactiver, coupe son interrupteur dans Tampermonkey puis recharge la page.
Si aucun panneau n'apparaît, vérifie l'activation et les permissions de l'extension,
ta connexion à Kyara, puis recharge entièrement la page.

## Ouverture automatique des boosters gratuits

Ce script ouvre **au maximum un** booster gratuit par exécution. Il ne clique
que sur le bouton `Open Free` visible sur la page officielle, et ne tente pas
de contourner de limite, CAPTCHA ou protection du site. Utilisez-le seulement
si l'automatisation est autorisée pour votre compte.

## Installation

```bash
cd ~/kyara-free-opener
chmod +x kyara-free-opener.sh
./kyara-free-opener.sh init
```

La commande `init` ouvre un navigateur : connectez-vous à Kyara si nécessaire,
puis revenez au terminal et appuyez sur Entrée. La session est enregistrée
localement dans `kyara-storage-state.json` avec les permissions `600`.

Avant de l'automatiser, vérifiez le comportement sans ouverture :

```bash
./kyara-free-opener.sh dry-run
```

Pour une ouverture ponctuelle :

```bash
./kyara-free-opener.sh run
```

Afficher le récapitulatif des ouvertures effectuées par le programme :

```bash
./kyara-free-opener.sh stats
```

Le compteur est enregistré localement dans `opened-boosters.tsv` et commence à
partir de cette version du script.

## Planification toutes les 10 minutes (Linux / systemd)

```bash
mkdir -p ~/.config/systemd/user
cp systemd/kyara-free-opener.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kyara-free-opener.timer
```

Sur une machine qui doit continuer à exécuter la tâche après votre déconnexion :

```bash
loginctl enable-linger "$USER"
```

Vérifier le minuteur et les derniers passages :

```bash
systemctl --user list-timers kyara-free-opener.timer
journalctl --user -u kyara-free-opener.service -n 30 --no-pager
```

Pour arrêter l'automatisation :

```bash
systemctl --user disable --now kyara-free-opener.timer
```

## Alternative sans session systemd : cron

Sur WSL, Docker ou certaines sessions SSH, `systemctl --user` peut afficher
`Failed to connect to bus`. Utilisez alors `cron` :

```bash
crontab -e
```

Ajoutez cette ligne (adaptez le chemin si votre dossier personnel n'est pas
`/home/ubuntu`) :

```cron
*/10 * * * * /home/ubuntu/kyara-free-opener/kyara-free-opener.sh run >> /home/ubuntu/kyara-free-opener/cron.log 2>&1
```

Vérifiez l'installation et les passages :

```bash
crontab -l
tail -f ~/kyara-free-opener/cron.log
```

Le script charge automatiquement votre installation NVM/Node lorsqu'il est
lancé par `cron`, car celui-ci n'utilise pas votre environnement de terminal.

Pour supprimer l'automatisation, relancez `crontab -e` puis supprimez la ligne.

## Windows (sans WSL)

Une version PowerShell native se trouve dans [`windows/`](windows/README.md).
Elle s'exécute via le Planificateur de tâches Windows et ne requiert pas que
WSL reste ouvert.

## Remarques

- Après une déconnexion de Kyara, relancez `./kyara-free-opener.sh init`.
- Le script ne sauvegarde aucun mot de passe. Le fichier de session peut
  toutefois donner accès à votre session Kyara : ne le partagez pas.
- Si l'interface du site change, lancez `dry-run` avant de réactiver le minuteur.
