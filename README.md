# Ouverture automatique des boosters gratuits Kyara

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
