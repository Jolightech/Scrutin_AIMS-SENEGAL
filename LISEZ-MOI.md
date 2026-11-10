# Vote AIMS — refonte de l'interface

Cette archive garde la structure de l'aperçu d'origine. Ouvrez `index.html`
dans un navigateur : les six écrans sont accessibles par la barre d'aperçu,
et les boutons mènent à l'écran suivant du parcours.

## Reporter la refonte dans le projet Laravel

1. Copier `css/aims.css` vers `public/css/aims.css`.
2. Copier `js/chart.js` et `js/live.js` vers `public/js/`, et charger
   `live.js` avant `chart.js` dans le gabarit.
3. Copier le dossier `fonts/` vers `public/fonts/` (polices auto-hébergées,
   licence SIL Open Font : aucune requête vers un service externe).

Tous les noms de classes existants sont conservés, et
`VoteChart.render(noeud, timeline)` garde la même signature : les gabarits
Blade actuels prennent le nouveau style sans modification.

## Composants ajoutés (facultatifs)

Ils sont repérés par `[nouveau]` dans la feuille de style. Les trois
graphiques relisent l'objet `timeline` que le serveur renvoie déjà.

```html
<div class="chart" id="participation"></div>
<div class="chart" id="repartition" data-legend="off"></div>
<div class="chart" id="rythme"></div>
<div id="tableau"></div>
```

```js
VoteChart.ring(participation, { value: bulletins, total: inscrits });
VoteChart.share(repartition, timeline);   // data-variant="tall" pour le vidéoprojecteur
VoteChart.pace(rythme, timeline);
VoteChart.table(tableau, timeline);
```

Autres classes disponibles : `.stepper` (étapes du vote), `.stat-foot`
(précision sous un chiffre), `.card-sub`, `.split`, `.facts`, `.meter`,
`.result-key` et `.result-pct` (lignes du classement), `.screen-grid`
(vidéoprojecteur en deux colonnes), `.data-details`, `.table .num`,
`.card-lead` (phrase de synthèse au-dessus du classement).

Pour afficher « Élu(e) » à la place de « En tête » à la clôture, ajouter la
classe `is-closed` au conteneur `.results`.

## Animations du direct

Les graphiques s'animent seuls dès que `chart.js` est remplacé : à chaque
appel de `VoteChart.render()`, `pace()`, `ring()` ou `share()` avec de
nouvelles données, les tracés glissent vers leur nouvelle valeur, une onde
part du point du candidat qui gagne une voix et le rayon du nouveau bulletin
s'allume. L'annonce de l'élu(e) (`.winner.is-revealed`) est animée en CSS.

Pour le classement et les compteurs, `js/live.js` fournit trois fonctions à
appeler dans le script qui rafraîchit la page :

```js
VoteLive.text(noeud, valeur);     // le chiffre défile au lieu de sauter
VoteLive.plus(noeudDesVoix, '+1'); // pastille au-dessus du candidat crédité
VoteLive.reorder(conteneur, function () {
    // ici : changer style.order de chaque .result
});                                // les lignes glissent, flèche ▲ / ▼ à côté du rang
```

Le script en bas de `index.html` montre l'usage complet (`paintRanking`,
`paintStats`). Toutes les animations sont coupées quand le système demande
de réduire les mouvements, et quand l'onglet est en arrière-plan.

## Vidéoprojecteur : QR code

Le QR code de l'aperçu est un SVG fixe qui pointe vers le lien d'exemple.
Dans le projet, il faut le générer pour chaque scrutin côté serveur (par
exemple avec le paquet `simplesoftwareio/simple-qrcode`) et l'afficher avec
la classe `.screen-qr`, dans un bloc `.screen-join`.

## Couleurs des candidats

L'ordre des huit teintes (`--s1` à `--s8`) a changé : le jaune passe en
sixième position pour ne pas se confondre avec l'or du candidat de tête.
Les numéros de `slot` envoyés par le serveur restent valables.

## Scrutins multiples : Focal Point Academic, Health, Online, Logistics

`js/scrutins.js` ajoute quatre types de scrutin. Le votant vote une fois par
scrutin (onglets Academic / Health / Online / Logistics du bulletin, avec le
compteur « n / 4 scrutins votés »), et l'administrateur gère chaque scrutin
séparément : candidats (ajout, modification, suppression, photo recadrée en
carré), nombre de choix par votant, état (brouillon / ouvert / clos),
export CSV.

Dans cet aperçu, les données sont conservées dans le navigateur
(`localStorage`, clé `aims.vote.scrutins.v1`) ; le bouton « Réinitialiser les
données de démonstration » les remet à zéro.

### Reporter dans le projet Laravel

- Table `scrutins` : ajouter une colonne `type` (enum `academic`, `health`,
  `online`, `logistics`) et une colonne `max_choices`. Les candidats restent
  rattachés à leur scrutin (`scrutin_id`), donc à un type.
- Le bulletin du votant affiche un onglet par type ouvert (`data-ballot-type`)
  et vérifie l'empreinte de l'email **par scrutin** : une personne peut voter
  aux quatre scrutins, mais une seule fois à chacun.
- Dans l'administration, le sélecteur de type (`data-admin-type`) filtre les
  candidats ; le formulaire d'ajout envoie `scrutin_id` avec le nom, le slogan,
  le programme et la photo.
- `js/ballot.js` expose désormais `VoteBallot.bind(form)` pour relier un
  bulletin rendu dynamiquement ; les bulletins déjà présents dans la page
  restent liés automatiquement.

Pour ajouter un cinquième type, il suffit d'ajouter une entrée dans le tableau
`TYPES` en tête de `js/scrutins.js` (clé, libellé, code, description).

## Accès administrateur, adresses autorisées, votants

- **Code secret** : la page Administration est verrouillée. Code initial de
  l'aperçu : `AIMS-ADMIN-2026` (constante `DEFAULT_ADMIN_CODE` dans
  `js/scrutins.js`), modifiable depuis la carte « Sécurité et
  réinitialisation ». Le déverrouillage vaut pour l'onglet ouvert
  (`sessionStorage`). Dans le projet Laravel, remplacer par une vraie
  authentification côté serveur (middleware `auth` + `Hash::check`) : un
  verrou en JavaScript ne protège qu'un aperçu.
- **Adresses** : seules les adresses se terminant par `senegal.org`
  (`prenom.nom@aims-senegal.org`, …) passent l'écran Vérification ; toute
  autre adresse est refusée avec un message d'erreur. Côté Laravel, la même
  règle va dans la validation de la requête (`ends_with:senegal.org`).
- **Votants** : l'administration affiche la liste d'émargement (adresse,
  scrutins votés, date du dernier bulletin) avec export CSV. Les bulletins ne
  contiennent pas l'adresse : on sait *qui* a voté, pas *pour qui*.
- **Réinitialisation** : « Réinitialiser tout le tableau de bord » supprime
  candidats, bulletins et votants des quatre scrutins (le code secret est
  conservé). Deux variantes : effacer uniquement bulletins et votants, ou
  recharger les candidats de démonstration.
