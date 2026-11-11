# Vote AIMS Sénégal — élection des focal points

Plateforme de vote en ligne pour les quatre scrutins Focal Point
(Academic, Health, Online, Logistics). Site statique publié sur GitHub
Pages, données partagées en temps réel avec Firebase (Firestore).

Développée par ANON N'DA GUY SIMON STEPHANE et JOEL J. BOCOVO.

- Site : https://jolightech.github.io/Scrutin_AIMS-SENEGAL/
- Lien à envoyer aux votants : https://jolightech.github.io/Scrutin_AIMS-SENEGAL/#email
  (un seul scrutin : ajouter `?scrutin=focal-point-health` avant `#email`)

## Parcours du votant

1. Vérification : compte avec une adresse `@aims-senegal.org` confirmée par
   le lien reçu par email (ou compte Google à cette adresse).
2. Bulletins : un bulletin par scrutin, vote blanc possible, reçu anonyme.
3. Résultats : accessibles après avoir voté à chaque scrutin ouvert.

## Administration

Onglet Administration, connexion avec un compte Google administrateur.
Candidats (photo, slogan, programme), nombre de choix, nombre d'inscrits,
ouverture et clôture de chaque scrutin, liste d'émargement (export CSV),
administrateurs supplémentaires, remises à zéro. L'onglet **Score live**
(réservé à l'administration) se projette en salle : les quatre scrutins
en même temps ou un seul, plein écran, défilement automatique.

## Sécurité (firestore.rules)

- Seule une adresse `@aims-senegal.org` **confirmée** peut voter.
- Un vote écrit ensemble le bulletin, l'émargement et le compteur du
  scrutin : impossible de voter deux fois au même scrutin ou d'ajouter des
  bulletins à la main.
- Les bulletins ne portent aucune adresse ; l'émargement ne porte pas de
  date. Chacun ne lit que son propre émargement ; la liste complète est
  réservée à l'administration.
- Un bulletin ne contient que des candidats du scrutin, sans doublon, au
  plus « choix par votant ».

Après toute modification de `firestore.rules`, coller le fichier dans la
console Firebase (Firestore Database > Règles) et cliquer sur Publier.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Pages, résultats en direct, Score live |
| `js/scrutins.js` | Scrutins, bulletins, vérification, administration |
| `js/cloud.js` | Lien avec Firebase (lecture / écriture, comptes) |
| `js/firebase-config.js` | Configuration du projet Firebase (`null` = mode local) |
| `js/i18n.js` | Traduction anglaise (bouton de langue) |
| `js/chart.js`, `js/live.js` | Graphiques et animations du direct |
| `js/qr.js` | QR codes des liens de vote |
| `css/aims.css` | Style |
| `firestore.rules` | Règles de sécurité de la base |

## Mode local

Avec `window.FIREBASE_CONFIG = null` dans `js/firebase-config.js`, la
plateforme fonctionne sans serveur : tout est gardé dans le navigateur
(démonstration uniquement, code admin initial `AIMS-ADMIN-2026`).

## Limites de l'offre gratuite Firebase (Spark)

1 000 emails de confirmation et 150 emails « mot de passe oublié » par
jour ; 50 000 lectures et 20 000 écritures Firestore par jour.
