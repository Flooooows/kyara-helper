# Version Windows native

Cette version n'utilise pas WSL : elle lance directement Chromium avec la
bibliothèque Playwright officielle.

## Prérequis

1. **Windows 10 ou 11**, avec une session Windows ouverte lorsque la tâche doit
   pouvoir démarrer.
2. **[Node.js LTS](https://nodejs.org/)** installé sur **Windows** (pas
   uniquement dans WSL). Vérifiez dans un nouveau PowerShell :

   ```powershell
   node --version
   npm --version
   ```

3. Une connexion Internet pour l'installation initiale de Playwright et de
   Chromium. L'installation télécharge un navigateur dédié.
4. L'accès à votre compte Kyara pour l'initialisation. Le script n'enregistre
   pas votre mot de passe, mais son fichier de session doit rester privé.

Copiez ce dossier `windows` dans un emplacement Windows, par exemple :

```text
C:\Users\VotreNom\KyaraFreeOpener
```

Dans PowerShell, ouvrez ce dossier puis exécutez :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
npm install
npx playwright install chromium
.\KyaraFreeOpener.ps1 -Mode Init
.\KyaraFreeOpener.ps1 -Mode DryRun
```

`Init` ouvre Kyara : connectez-vous si nécessaire, puis revenez au terminal et
appuyez sur Entrée. La session et le compteur sont conservés dans :

```text
%LOCALAPPDATA%\KyaraFreeOpener
```

Installer la tâche Windows toutes les 10 minutes :

```powershell
.\Install-KyaraTask.ps1
```

Vérifier que la tâche est bien créée :

```powershell
schtasks /Query /TN "Kyara Free Opener" /FO LIST
```

En cas de problème, consultez le journal de chaque exécution :

```powershell
Get-Content "$env:LOCALAPPDATA\KyaraFreeOpener\task.log" -Tail 100
```

Vérifier le compteur :

```powershell
.\KyaraFreeOpener.ps1 -Mode Stats
```

Supprimer la tâche :

```powershell
.\Install-KyaraTask.ps1 -Mode Remove
```

La tâche s'exécute lorsque Windows est actif ; après une mise en veille, elle
reprendra lors du réveil grâce à l'option *Start when available*. Utilisez ce
script seulement si l'automatisation est autorisée pour votre compte Kyara.
