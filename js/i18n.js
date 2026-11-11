/**
 * Choix de la langue : français (langue d'origine) ou anglais.
 *
 * Le site est écrit en français. En anglais, ce script traduit à la volée
 * chaque texte affiché (et les attributs placeholder, title, aria-label…),
 * y compris ce que les autres scripts ajoutent ensuite, grâce à un
 * MutationObserver. Les noms, slogans et programmes des candidats ne sont
 * pas traduits. Le choix est gardé dans le navigateur (localStorage).
 *
 * Pour ajouter une traduction : une entrée dans EXACT (texte identique) ou
 * dans RULES (texte avec une partie variable : nombre, nom, heure…).
 */
(function () {
    'use strict';

    var KEY = 'aims.vote.lang';
    var lang = 'fr';

    try {
        lang = window.localStorage.getItem(KEY) === 'en' ? 'en' : 'fr';
    } catch (error) {
        lang = 'fr';
    }

    /* ------------------------------------------------- textes identiques */
    var EXACT = {
        // Titre, entête, écran d'ouverture
        'Vote AIMS — aperçu de l\'interface': 'AIMS Vote',
        'Élections des délégués et focal points': 'Elections of delegates and focal points',
        'AIMS Sénégal, plateforme de vote interne.': 'AIMS Senegal, internal voting platform.',
        'Le choix de chaque votant reste secret : les bulletins ne portent aucune adresse email.': 'Each vote stays secret: ballots do not contain any email address.',
        'African Institute for Mathematical Sciences, Sénégal': 'African Institute for Mathematical Sciences, Senegal',
        'AIMS Sénégal': 'AIMS Senegal',
        'AIMS Sénégal — African Institute for Mathematical Sciences': 'AIMS Senegal — African Institute for Mathematical Sciences',
        'Plateforme de vote': 'Voting platform',
        'des délégués et focal points': 'for delegates and focal points',
        'Cette plateforme a été développée par': 'This platform was developed by',
        'et': 'and',
        'Accéder à la plateforme': 'Enter the platform',
        'Ouverture automatique dans quelques secondes': 'Opens automatically in a few seconds',
        'Navigation principale': 'Main navigation',
        'Voter': 'Vote',
        'Administration': 'Administration',
        'Données enregistrées dans ce navigateur': 'Data saved in this browser',
        'Données partagées en ligne': 'Data shared online',
        'Se connecter avec Google': 'Sign in with Google',
        'Administrateurs': 'Administrators',
        'Chaque administrateur se connecte avec son compte Google à cette adresse.': 'Each administrator signs in with their Google account at this address.',
        'Vous': 'You',
        'Ajouter un administrateur': 'Add an administrator',
        'Ajouter': 'Add',
        'Impossible d\'ajouter cette adresse comme administrateur.': 'This address could not be added as an administrator.',
        'Utiliser un autre compte Google': 'Use another Google account',
        'Connectez-vous avec le compte Google administrateur pour gérer les scrutins, les candidats et consulter la liste des votants.': 'Sign in with the administrator Google account to manage elections and candidates and to see the voter list.',
        'Écrans de l\'aperçu': 'Screens',

        // Onglets
        'Accueil': 'Home',
        '1. Vérification': '1. Verification',
        '2. Bulletins': '2. Ballots',
        '3. Résultats': '3. Results',
        'Score live': 'Live score',

        // Accueil
        'Élection des focal points, promotion 2026': 'Election of focal points, class of 2026',
        'Saisissez le code du scrutin, vérifiez votre adresse institutionnelle, puis votez pour chacun des quatre scrutins : Academic, Health, Online et Logistics. Le vote est secret et les résultats sont publiés en direct.': 'Enter the election code, check your institutional email, then vote in each of the four elections: Academic, Health, Online and Logistics. The vote is secret and the results are shown live.',
        'Code du scrutin': 'Election code',
        'Choix secret': 'Secret vote',
        'Résultats en direct': 'Live results',
        'Un bulletin par votant et par scrutin': 'One ballot per voter and per election',
        'de participation': 'turnout',
        ', mis à jour à chaque bulletin.': ', updated with every ballot.',
        'Les scrutins': 'The elections',
        'Quatre focal points à élire : Academic, Health, Online et Logistics. Chaque scrutin a ses propres candidats et son propre code.': 'Four focal points to elect: Academic, Health, Online and Logistics. Each election has its own candidates and its own code.',
        'Déroulement du vote': 'How voting works',
        'Quatre étapes, sans inscription ni mot de passe.': 'Four steps, no sign-up and no password.',
        'Saisir le code': 'Enter the code',
        'Le code de six caractères est projeté en salle ou communiqué par l\'administration.': 'The six-character code is shown in the room or given by the administration.',
        'Vérifier son adresse': 'Check your email',
        'Seule une adresse en @aims-senegal.org donne accès aux bulletins ; toute autre adresse est refusée.': 'Only an @aims-senegal.org address gives access to the ballots; any other address is refused.',
        'Voter pour chaque scrutin': 'Vote in each election',
        'Un bulletin par scrutin : Academic, Health, Online et Logistics. Le vote blanc est possible.': 'One ballot per election: Academic, Health, Online and Logistics. A blank vote is possible.',
        'Consulter les résultats': 'See the results',
        'Les résultats sont mis à jour à chaque bulletin. À la clôture, le candidat élu est proclamé.': 'Results are updated with every ballot. When the election closes, the elected candidate is announced.',
        'Secret du vote': 'Secret vote',
        'Garanties appliquées à chaque bulletin.': 'Guarantees applied to every ballot.',
        'Seules les adresses @aims-senegal.org votent': 'Only @aims-senegal.org addresses can vote',
        'Toute autre adresse est refusée avant même d\'accéder aux bulletins.': 'Any other address is refused before reaching the ballots.',
        'Un seul bulletin par personne et par scrutin': 'Only one ballot per person and per election',
        'Votre adresse est inscrite sur la liste d\'émargement : un second vote au même scrutin est refusé.': 'Your address is added to the voter list: a second vote in the same election is refused.',
        'Le bulletin n\'est pas relié à l\'adresse': 'The ballot is not linked to the address',
        'La liste d\'émargement indique seulement': 'The voter list only shows',
        'qui': 'who',
        'a voté ; les bulletins ne portent aucune adresse.': 'voted; ballots do not contain any address.',
        'Après le vote': 'After voting',
        'Un reçu est délivré': 'You get a receipt',
        'Ce code atteste que le bulletin a été comptabilisé, sans révéler le choix exprimé.': 'This code proves that the ballot was counted, without showing the choice.',

        // Cartes des scrutins
        'Focal Point': 'Focal Point',
        'Ouvert': 'Open',
        'Ouverts': 'Open',
        'Clos': 'Closed',
        'Brouillon': 'Draft',
        'Candidat': 'Candidate',
        'Candidats': 'Candidates',
        'Bulletin': 'Ballot',
        'Bulletins': 'Ballots',
        'Code': 'Code',
        'code': 'code',
        'Suivre en direct': 'Follow live',
        'Vous avez voté': 'You have voted',
        'Reçu :': 'Receipt:',
        'Scrutin clos': 'Election closed',
        'Bientôt ouvert': 'Opening soon',
        'Un choix, vote blanc possible.': 'One choice, blank vote possible.',
        'Le vote est terminé. Consultez les résultats.': 'Voting is over. See the results.',
        'Le scrutin n\'est pas encore ouvert.': 'This election is not open yet.',
        'Les candidatures n\'ont pas encore été publiées.': 'Candidates have not been published yet.',
        'Lien entre les étudiants et l\'équipe pédagogique : cours, tuteurs, examens.': 'Link between students and the teaching team: courses, tutors, exams.',
        'Santé, bien-être et suivi médical des étudiants sur le campus.': 'Health, well-being and medical follow-up of students on campus.',
        'Plateformes en ligne, connexion, outils numériques et communication.': 'Online platforms, internet connection, digital tools and communication.',
        'Hébergement, restauration, transport et vie quotidienne.': 'Housing, meals, transport and daily life.',

        // Vérification
        'Étapes du vote': 'Voting steps',
        'Adresse': 'Email',
        'Reçu': 'Receipt',
        'Focal Points': 'Focal Points',
        'Élections des focal points': 'Focal point elections',
        'Quatre scrutins : Academic, Health, Online et Logistics. Un bulletin par scrutin, vote blanc autorisé.': 'Four elections: Academic, Health, Online and Logistics. One ballot per election, blank vote allowed.',
        'Vérifier votre adresse': 'Check your email address',
        'Seules les adresses institutionnelles se terminant par': 'Only institutional addresses ending with',
        'peuvent voter. Toute autre adresse est refusée. Votre adresse atteste de votre participation (un bulletin par scrutin) ; votre choix, lui, n\'est jamais relié à votre adresse.': 'can vote. Any other address is refused. Your address records that you took part (one ballot per election); your choice is never linked to your address.',
        'Adresse email institutionnelle': 'Institutional email address',
        'prenom.nom@aims-senegal.org': 'firstname.lastname@aims-senegal.org',
        'Continuer vers les bulletins': 'Continue to the ballots',
        'Saisissez votre adresse email institutionnelle.': 'Enter your institutional email address.',
        'Vérifiez d\'abord votre adresse': 'First check your email address',
        'Seules les adresses se terminant par @aims-senegal.org peuvent accéder aux bulletins.': 'Only addresses ending with @aims-senegal.org can open the ballots.',
        'Saisir mon adresse': 'Enter my email',

        // Bulletins
        'Vous votez avec l\'adresse': 'You are voting with the address',
        'Changer d\'adresse': 'Change address',
        'Les candidats': 'The candidates',
        'Vote blanc': 'Blank vote',
        'Je participe au scrutin sans choisir de candidat.': 'I take part in the election without choosing a candidate.',
        'Choix :': 'Choice:',
        'Confirmer mon vote': 'Confirm my vote',
        'Votre bulletin est définitif : il ne pourra pas être modifié.': 'Your ballot is final: it cannot be changed.',
        'Votre vote est enregistré': 'Your vote is saved',
        'Notez ce code : il prouve que votre bulletin a bien été compté, sans révéler pour qui vous avez voté.': 'Write down this code: it proves your ballot was counted, without showing who you voted for.',
        'Copier le reçu': 'Copy the receipt',
        'Reçu copié': 'Receipt copied',
        'Suivre les résultats': 'Follow the results',
        'Ce scrutin est terminé : il n\'accepte plus de bulletin.': 'This election is over: it no longer accepts ballots.',

        // Résultats
        'Type de scrutin': 'Election type',
        'Bulletins reçus': 'Ballots received',
        'Voix exprimées': 'Votes cast',
        'Votes blancs': 'Blank votes',
        'Restent à voter': 'Still to vote',
        'inscrits sans bulletin': 'registered voters without a ballot',
        'des bulletins': 'of ballots',
        'Participation': 'Turnout',
        'Bulletins reçus par rapport au nombre d\'inscrits.': 'Ballots received compared with the number of registered voters.',
        'Classement': 'Ranking',
        'Part des suffrages exprimés ; le repère marque la majorité absolue.': 'Share of votes cast; the mark shows the absolute majority.',
        'En attente des premiers bulletins.': 'Waiting for the first ballots.',
        'Aucun candidat n\'est encore inscrit à ce scrutin.': 'No candidate is registered for this election yet.',
        'voix': 'votes',
        'Évolution du vote': 'Vote trend',
        'Cumul des voix de chaque candidat depuis le premier bulletin.': 'Total votes of each candidate since the first ballot.',
        'Rythme du vote': 'Voting pace',
        'Voix reçues par tranche de 3 minutes.': 'Votes received per time slot.',
        'La courbe apparaîtra dès les premiers votes.': 'The chart will appear with the first votes.',
        'Le rythme du vote apparaîtra dès les premiers bulletins.': 'The voting pace will appear with the first ballots.',
        'Voir les données en tableau': 'See the data as a table',
        'Rang': 'Rank',
        'Voix': 'Votes',
        'Part des suffrages': 'Share of votes',
        'Écart au premier': 'Gap to first',
        'Répartition des suffrages exprimés entre les candidats': 'Share of votes cast between candidates',
        'Exemple : variante « résultats sous scellés »': 'Example: “sealed results” option',
        'Réglage par scrutin, pour ne pas influencer les votants : seule la participation est diffusée pendant le vote.': 'A setting per election, so voters are not influenced: only the turnout is shown during the vote.',
        'Résultats sous scellés': 'Sealed results',
        'Le détail par candidat sera publié à la clôture du scrutin.': 'Results per candidate will be published when the election closes.',
        'Résultats définitifs': 'Final results',
        'Scrutin pas encore ouvert.': 'Election not open yet.',
        'Scrutin clos. Résultats définitifs.': 'Election closed. Final results.',

        // Score live
        'Les votes en direct, à projeter en salle pendant le dépouillement : chiffres lisibles du fond de la salle, aucun élément d\'interface.': 'Live votes, to show on the projector during the count: numbers you can read from the back of the room, no interface elements.',
        'Scrutin à projeter': 'Election to show',
        'Tous les scrutins': 'All elections',
        'Résultats des quatre scrutins': 'Results of the four elections',
        'Élu(e)': 'Elected',
        'Afficher en plein écran': 'Show full screen',
        'Faire défiler les quatre scrutins toutes les 15 secondes': 'Show the four elections in turn, every 15 seconds',
        'En plein écran : flèches ← et → pour changer de scrutin, Échap pour quitter.': 'Full screen: use the ← and → keys to change election, Esc to exit.',
        'Élection des focal points, promotion 2026 ': 'Election of focal points, class of 2026',
        'Pour voter : scannez le QR code': 'To vote: scan the QR code',

        // Messages d'étape
        'Étape 1 : vérifiez votre adresse institutionnelle pour accéder aux bulletins.': 'Step 1: check your institutional email to open the ballots.',
        'Étape 1 : vérifiez votre adresse institutionnelle. Les résultats sont accessibles après le vote.': 'Step 1: check your institutional email. Results are available after you vote.',
        'Étape 2 : votez pour chaque scrutin ouvert (le vote blanc est possible). Les résultats sont accessibles ensuite.': 'Step 2: vote in each open election (a blank vote is possible). Results are available after that.',
        'Le Score live est réservé à l\'administration. Saisissez le code secret.': 'The live score is for the administration only. Enter the secret code.',

        // Administration
        'Accès réservé à l\'administrateur': 'Administrator access only',
        'Saisissez le code secret pour gérer les scrutins, les candidats et consulter la liste des votants.': 'Enter the secret code to manage elections and candidates and to see the voter list.',
        'Code secret': 'Secret code',
        'Déverrouiller l\'administration': 'Unlock administration',
        'Aperçu : le code initial est': 'Preview: the first code is',
        '. Changez-le dès la première connexion.': '. Change it the first time you log in.',
        'Code secret incorrect.': 'Wrong secret code.',
        'Gestion des scrutins': 'Election management',
        'Quatre types de scrutin : Focal Point Academic, Health, Online et Logistics. Ajoutez les candidats de chacun, ouvrez puis clôturez le vote.': 'Four types of election: Focal Point Academic, Health, Online and Logistics. Add the candidates for each one, open the vote, then close it.',
        'Scrutins': 'Elections',
        'Choisir le scrutin': 'Choose the election',
        'Chaque type de scrutin a ses propres candidats, son code et son état.': 'Each type of election has its own candidates, code and status.',
        'Types de scrutin': 'Election types',
        'Code à projeter': 'Code to show',
        'Lien direct': 'Direct link',
        'Inscrits': 'Registered voters',
        'Choix par votant': 'Choices per voter',
        'Copier le lien': 'Copy the link',
        'Lien copié': 'Link copied',
        'Export CSV': 'Export CSV',
        'Ouvrir le vote': 'Open the vote',
        'Clore le scrutin': 'Close the election',
        'Actions': 'Actions',
        'Modifier': 'Edit',
        'Supprimer': 'Delete',
        'Aucun candidat pour l\'instant. Ajoutez-en avec le formulaire ci-dessous.': 'No candidates yet. Add some with the form below.',
        'Nom complet': 'Full name',
        'Slogan (optionnel)': 'Slogan (optional)',
        'Programme (optionnel)': 'Programme (optional)',
        'En quelques lignes, ce que le candidat propose.': 'In a few lines, what the candidate proposes.',
        'Une classe organisée…': 'An organised class…',
        'Photo': 'Photo',
        'JPG, PNG ou WEBP, 4 Mo maximum. L\'image est automatiquement recadrée en carré.': 'JPG, PNG or WEBP, 4 MB maximum. The image is cropped to a square automatically.',
        'Ajouter le candidat': 'Add the candidate',
        'Enregistrer les modifications': 'Save changes',
        'Annuler': 'Cancel',
        'Retirer': 'Remove',
        'Adresses ayant déposé au moins un bulletin. Le choix de chaque votant n\'est pas enregistré avec son adresse.': 'Addresses that cast at least one ballot. The choice of each voter is not saved with their address.',
        'Aucun bulletin reçu pour l\'instant.': 'No ballots received yet.',
        'Scrutins votés': 'Elections voted',
        'Dernier bulletin': 'Last ballot',
        'Sécurité et réinitialisation': 'Security and reset',
        'Le code secret protège cette page ; la réinitialisation efface tout le tableau de bord.': 'The secret code protects this page; a reset deletes the whole dashboard.',
        'Se déconnecter': 'Log out',
        'Code secret actuel': 'Current secret code',
        'Nouveau code secret': 'New secret code',
        'Six caractères minimum.': 'At least six characters.',
        'Changer le code secret': 'Change the secret code',
        'Effacer tous les indicateurs': 'Clear all indicators',
        'Réinitialiser tout le tableau de bord': 'Reset the whole dashboard',
        'Effacer uniquement les bulletins et les votants': 'Delete only ballots and voters',
        'Recharger les données de démonstration': 'Load demo data again',
        '« Effacer tous les indicateurs » remet tous les compteurs à zéro : bulletins, voix, votes blancs, participation, graphiques et élu(e) dans les onglets Accueil, Résultats, Score live et Administration, pour les quatre scrutins. Les candidats sont conservés.': '“Clear all indicators” sets every counter back to zero: ballots, votes, blank votes, turnout, charts and elected candidate in the Home, Results, Live score and Administration tabs, for the four elections. Candidates are kept.',
        'La réinitialisation complète supprime les candidats, les bulletins et la liste des votants des quatre scrutins, et rouvre chaque scrutin. Le code secret est conservé.': 'A full reset deletes the candidates, ballots and voter list of the four elections, and opens each election again. The secret code is kept.',

        // Messages de l'administration
        'Bulletins et votants effacés.': 'Ballots and voters deleted.',
        'Tous les indicateurs ont été remis à zéro.': 'All indicators were set back to zero.',
        'Le tableau de bord a été réinitialisé.': 'The dashboard was reset.',
        'Le code secret a été changé.': 'The secret code was changed.',
        'Le code secret actuel est incorrect.': 'The current secret code is wrong.',
        'Le nouveau code doit comporter au moins six caractères.': 'The new code must have at least six characters.',
        'La photo dépasse 4 Mo.': 'The photo is larger than 4 MB.',
        'Ce fichier n\'est pas une image lisible.': 'This file is not a readable image.',
        'Le nom du candidat est obligatoire.': 'The candidate name is required.',

        // Fenêtres de confirmation
        'Effacer tous les indicateurs ?\n\nTous les bulletins, votes et votants des quatre scrutins seront supprimés, et les résultats repartent de zéro. Les candidats sont conservés.': 'Clear all indicators?\n\nAll ballots, votes and voters of the four elections will be deleted, and results start again from zero. Candidates are kept.',
        'Réinitialiser tout le tableau de bord ?\n\nCandidats, bulletins et votants des quatre scrutins seront définitivement supprimés.': 'Reset the whole dashboard?\n\nCandidates, ballots and voters of the four elections will be deleted for good.',
        'Effacer tous les bulletins et la liste des votants ? Les candidats sont conservés.': 'Delete all ballots and the voter list? Candidates are kept.',
        'Recharger les candidats de démonstration ? Les bulletins et votants actuels seront effacés.': 'Load the demo candidates again? Current ballots and voters will be deleted.'
    };

    /* -------------------------------------- textes avec une partie variable */
    var RULES = [
        [/^Focal Point (\w+) — votre reçu anonyme$/, 'Focal Point $1 — your anonymous receipt'],
        [/^Focal Point (\w+), promotion 2026$/, 'Focal Point $1, class of 2026'],
        [/^Élu\(e\), (.+)$/, 'Elected, $1'],
        [/^(.+) est élu\(e\) avec (\d+) voix d'avance\.$/, '$1 is elected with a lead of $2 vote(s).'],
        [/^(.+) mène avec (\d+) voix d'avance\.$/, '$1 leads by $2 vote(s).'],
        [/^Égalité en tête entre (.+) et (.+)\.$/, 'Tie for first place between $1 and $2.'],
        [/^Égalité en tête entre (\d+) candidats\.$/, 'Tie for first place between $1 candidates.'],
        [/^(\d+) voix, soit (.+) des suffrages exprimés$/, '$1 votes, that is $2 of votes cast'],
        [/^(.+) : (\d+) voix, (.+) des suffrages exprimés$/, '$1: $2 votes, $3 of votes cast'],
        [/^Dernier bulletin reçu à (\d\d:\d\d)$/, 'Last ballot received at $1'],
        [/^Scrutin clos, dernier bulletin à (\d\d:\d\d)\. Résultats définitifs\.$/, 'Election closed, last ballot at $1. Final results.'],
        [/^Scrutin (\d+) sur (\d+)$/, 'Election $1 of $2'],
        [/^Les (\d+) scrutins$/, 'The $1 elections'],
        [/^(\d+) bulletins? sur (\d+) inscrits$/, '$1 ballot(s) out of $2 registered voters'],
        [/^sur (\d+) inscrits$/, 'out of $1 registered voters'],
        [/^réparties entre (\d+) candidats?$/, 'shared between $1 candidate(s)'],
        [/^(\d+) bulletins? reçus?$/, '$1 ballot(s) received'],
        [/^(\d+) \/ (\d+) scrutins votés$/, '$1 / $2 elections voted'],
        [/^Jusqu'à (\d+) choix, vote blanc possible\.$/, 'Up to $1 choices, blank vote possible.'],
        [/^Scrutin suivant : (.+)$/, 'Next election: $1'],
        [/^Réinitialiser les résultats : (.+)$/, 'Reset results: $1'],
        [/^Ajouter un candidat — (.+)$/, 'Add a candidate — $1'],
        [/^Modifier (.+)$/, 'Edit $1'],
        [/^Candidats \((\d+)\)$/, 'Candidates ($1)'],
        [/^Votants \((\d+)\)$/, 'Voters ($1)'],
        [/^État actuel : (.+)$/, function (m, state) { return 'Current status: ' + (EXACT[state] || state); }],
        [/^Adresse actuellement vérifiée : (.+)\.$/, 'Address currently verified: $1.'],
        [/^Adresse refusée : seules les adresses se terminant par @(.+) sont autorisées à voter\.$/, 'Address refused: only addresses ending with @$1 can vote.'],
        [/^Adresses acceptées : @(.+)$/, 'Accepted addresses: @$1'],
        [/^(.+) a été ajouté\(e\) au scrutin (.+)\.$/, '$1 was added to the $2 election.'],
        [/^(.+) a été mis\(e\) à jour\.$/, '$1 was updated.'],
        [/^(.+) a été retiré\(e\) du scrutin\.$/, '$1 was removed from the election.'],
        [/^(.+) est déjà candidat\(e\) à ce scrutin\.$/, '$1 is already a candidate in this election.'],
        [/^Résultats de (.+) remis à zéro\.$/, 'Results of $1 set back to zero.'],
        [/^Le compte (.+) n'est pas administrateur de cette plateforme\.$/, 'The account $1 is not an administrator of this platform.'],
        [/^Connecté avec Google : (.*)\.$/, 'Signed in with Google: $1.'],
        [/^(.+) est maintenant administrateur\.$/, '$1 is now an administrator.'],
        [/^(.+) n'est plus administrateur\.$/, '$1 is no longer an administrator.'],
        [/^Retirer (.+) des administrateurs \?$/, 'Remove $1 from the administrators?'],
        [/^Supprimer (.+) du scrutin (.+) \?([\s\S]*)$/, function (m, name, label, rest) {
            return 'Delete ' + name + ' from the ' + label + ' election?' + (rest ? rest.replace(/Ce candidat a déjà reçu (\d+) voix : elles seront perdues\./, 'This candidate already has $1 vote(s): they will be lost.') : '');
        }],
        [/^Réinitialiser les résultats de (.+) \?\n\nTous les bulletins de ce scrutin seront supprimés et ses votants pourront revoter\. Les autres scrutins ne changent pas\.$/,
            'Reset the results of $1?\n\nAll ballots of this election will be deleted and its voters can vote again. The other elections do not change.'],
        [/^« Réinitialiser les résultats » efface les bulletins du seul scrutin choisi \((.+)\) : ses votants pourront revoter à ce scrutin\. Les candidats sont conservés\.$/,
            '“Reset results” deletes the ballots of the chosen election only ($1): its voters can vote again in this election. Candidates are kept.'],
        [/^(.+) Sélectionnez jusqu'à (\d+) candidats\. Le vote blanc est autorisé\.$/, function (m, desc, n) {
            return (EXACT[desc] || desc) + ' Choose up to ' + n + ' candidates. A blank vote is allowed.';
        }],
        [/^(.+) Un seul choix\. Le vote blanc est autorisé\.$/, function (m, desc) {
            return (EXACT[desc] || desc) + ' One choice only. A blank vote is allowed.';
        }],
        [/^(.+) ✓$/, function (m, label) { return (EXACT[label] || label) + ' ✓'; }],
        [/^Voix reçues par tranche de temps\. Maximum : (.+) à (.+)\. Flèches gauche et droite pour parcourir\.$/, 'Votes received per time slot. Maximum: $1 at $2. Use the left and right arrows to browse.'],
        [/^Évolution du nombre de voix par candidat au fil du scrutin\. (.*) Flèches gauche et droite pour parcourir\.$/, 'Number of votes per candidate during the election. $1 Use the left and right arrows to browse.'],
        [/^Participation : (.+)$/, 'Turnout: $1'],
        [/^QR code du lien de vote : (.+)$/, 'QR code of the voting link: $1']
    ];

    function translate(text) {
        if (Object.prototype.hasOwnProperty.call(EXACT, text)) {
            return EXACT[text];
        }

        for (var i = 0; i < RULES.length; i++) {
            if (RULES[i][0].test(text)) {
                return text.replace(RULES[i][0], RULES[i][1]);
            }
        }

        return null;
    }

    // Garde les espaces autour du texte (ex. « <b>3</b> candidats »).
    function translateKeepingSpaces(value) {
        var match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
        var core = match[2].replace(/\s+/g, ' ');

        if (!core) {
            return null;
        }

        var out = translate(core);

        return out === null ? null : match[1] + out + match[3];
    }

    var ATTRS = ['placeholder', 'title', 'aria-label', 'data-copied', 'alt'];

    function translateElement(element) {
        ATTRS.forEach(function (name) {
            var value = element.getAttribute && element.getAttribute(name);

            if (value) {
                var out = translateKeepingSpaces(value);

                if (out !== null && out !== value) {
                    element.setAttribute(name, out);
                }
            }
        });
    }

    function translateTree(root) {
        if (!root) {
            return;
        }

        if (root.nodeType === 3) {
            var parent = root.parentNode;

            if (parent && !/^(SCRIPT|STYLE)$/.test(parent.nodeName)) {
                var out = translateKeepingSpaces(root.nodeValue);

                if (out !== null && out !== root.nodeValue) {
                    root.nodeValue = out;
                }
            }

            return;
        }

        if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.nodeName)) {
            return;
        }

        translateElement(root);

        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        var node;

        while ((node = walker.nextNode())) {
            if (node.nodeType === 1) {
                translateElement(node);
            } else {
                translateTree(node);
            }
        }
    }

    /* ---------------------------------------------- bouton de langue */
    function paintToggles() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-lang-toggle]'), function (button) {
            button.innerHTML = lang === 'en'
                ? '<span class="lang-long">Français</span><span class="lang-short">FR</span>'
                : '<span class="lang-long">English</span><span class="lang-short">EN</span>';
            button.setAttribute('lang', lang === 'en' ? 'fr' : 'en');
            button.setAttribute('aria-label', lang === 'en' ? 'Afficher le site en français' : 'Show the site in English');
        });
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-lang-toggle]');

        if (!button) {
            return;
        }

        var next = lang === 'en' ? 'fr' : 'en';

        try {
            window.localStorage.setItem(KEY, next);
        } catch (error) {
            /* stockage indisponible : le changement vaut pour cette page */
        }

        // Rechargement : textes, nombres (virgule ou point) et dates dans la
        // nouvelle langue. Les données et la session sont conservées.
        window.location.reload();
    });

    /* --------------------------------------------------------- démarrage */
    var observer = null;

    function start() {
        document.documentElement.lang = 'en';
        document.title = translate(document.title) || document.title;
        translateTree(document.body);
        paintToggles();

        if (observer || !window.MutationObserver) {
            return;
        }

        observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'characterData') {
                    translateTree(mutation.target);
                } else if (mutation.type === 'attributes') {
                    translateElement(mutation.target);
                } else {
                    Array.prototype.forEach.call(mutation.addedNodes, translateTree);
                }
            });
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRS
        });

        // Fenêtres de confirmation des autres scripts.
        var confirm = window.confirm.bind(window);

        window.confirm = function (message) {
            return confirm(translate(String(message)) || message);
        };
    }

    paintToggles();

    if (lang === 'en') {
        start();
    }

    window.VoteI18n = { lang: function () { return lang; }, translate: translate };
})();
