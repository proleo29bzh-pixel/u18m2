# Activer le covoiturage partagé (10 minutes, gratuit)

Les réponses des familles sont enregistrées dans un Google Sheet sur ton compte Google.

1. Va sur https://sheets.new : un nouveau Google Sheet s'ouvre. Nomme-le « Covoit U18M2 ».
2. Menu **Extensions > Apps Script**.
3. Efface le contenu et colle tout le fichier `Code.gs`.
4. Ligne `const CODE_EQUIPE = "CTC2026";` : mets le code que tu donneras aux familles.
5. Clique sur l'icône disquette pour enregistrer.
6. En haut à droite, clique sur **Déployer > Nouveau déploiement**.
   - Roue dentée > type **Application Web**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
   - Clique sur **Déployer**, puis autorise l'accès avec ton compte Google.
     Google affiche « application non validée » : clique sur Paramètres avancés, puis « Accéder à… ».
7. Copie l'**URL de l'application Web** (elle finit par `/exec`).
8. Colle-la dans `config/infos.json` :
   ```json
   "covoiturage": { "api": "https://script.google.com/macros/s/XXXX/exec", ... }
   ```
9. Donne le code équipe aux familles : l'appli le demande une seule fois.

L'onglet « Reponses » du Sheet se remplit tout seul. Tu peux y corriger une réponse à la main.

**Si tu modifies le script plus tard** : Déployer > Gérer les déploiements > crayon > Version : « Nouvelle version ». L'URL reste la même.
