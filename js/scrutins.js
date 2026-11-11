/**
 * Scrutins multiples : FOCAL POINT ACADEMIC, HEALTH, ONLINE, LOGISTICS.
 *
 *  - L'administrateur gere, pour chaque scrutin, la liste des candidats
 *    (ajout, modification, suppression, photo), le nombre de choix autorises
 *    et l'etat du vote (brouillon / ouvert / clos).
 *  - Le votant passe d'un scrutin a l'autre et depose un bulletin par scrutin.
 *
 * Dans cet apercu statique, les donnees sont conservees dans le navigateur
 * (localStorage). Dans le projet Laravel, les memes ecrans sont alimentes
 * par le serveur : voir LISEZ-MOI.md, section « Scrutins multiples ».
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'aims.vote.scrutins.v1';
    var VOTER_SESSION = 'aims.vote.voter';     // adresse verifiee (sessionStorage)
    var ADMIN_SESSION = 'aims.vote.admin';     // administration deverrouillee (sessionStorage)
    var DEFAULT_ADMIN_CODE = 'AIMS-ADMIN-2026'; // code secret initial, modifiable dans l'administration
    var EMAIL_DOMAIN = 'aims-senegal.org';      // seules les adresses ...@aims-senegal.org peuvent voter (cf. firestore.rules)

    /* ----------------------------------------------------- types de scrutin */
    var TYPES = [
        {
            key: 'academic',
            label: 'Focal Point Academic',
            short: 'Academic',
            code: 'ACAD26',
            description: 'Lien entre les étudiants et l\'équipe pédagogique : cours, tuteurs, examens.'
        },
        {
            key: 'health',
            label: 'Focal Point Health',
            short: 'Health',
            code: 'HLTH26',
            description: 'Santé, bien-être et suivi médical des étudiants sur le campus.'
        },
        {
            key: 'online',
            label: 'Focal Point Online',
            short: 'Online',
            code: 'ONLN26',
            description: 'Plateformes en ligne, connexion, outils numériques et communication.'
        },
        {
            key: 'logistics',
            label: 'Focal Point Logistics',
            short: 'Logistics',
            code: 'LOGI26',
            description: 'Hébergement, restauration, transport et vie quotidienne.'
        }
    ];

    var STATUS = {
        draft: { label: 'Brouillon', badge: 'badge-draft' },
        open: { label: 'Ouvert', badge: 'badge-open' },
        closed: { label: 'Clos', badge: 'badge-closed' }
    };

    /* Lien a donner aux votants : adresse reelle du site (GitHub Pages ou
       autre hebergement) + ?scrutin=focal-point-<type>, qui ouvre directement
       la verification puis le bulletin du bon scrutin. */
    var SITE_URL = 'https://jolightech.github.io/Scrutin_AIMS-SENEGAL/';

    function siteBase() {
        var loc = window.location;

        if (/^https?:$/.test(loc.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) {
            return loc.origin + loc.pathname.replace(/index\.html$/, '');
        }

        return SITE_URL;
    }

    function voteLink(key) {
        return siteBase() + '?scrutin=focal-point-' + key + '#email';
    }

    /* ------------------------------------------------------------ outils */
    function all(selector, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function initials(name) {
        return String(name || '')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(function (part) { return part.charAt(0).toUpperCase(); })
            .join('') || '?';
    }

    function uid() {
        return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function receipt() {
        var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var out = '';

        for (var i = 0; i < 8; i++) {
            out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            if (i === 3) {
                out += '-';
            }
        }

        return out;
    }

    /* Empreinte simple (FNV-1a, deux passes salees) : suffisante pour un
       apercu sans serveur. Dans le projet Laravel, le code secret est verifie
       cote serveur (Hash::check) et jamais envoye au navigateur. */
    function digest(text) {
        var out = '';

        ['aims-vote', 'focal-point'].forEach(function (salt) {
            var h = 0x811c9dc5;
            var str = salt + ':' + text;

            for (var i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 0x01000193) >>> 0;
            }

            out += ('00000000' + h.toString(16)).slice(-8);
        });

        return out;
    }

    function emailValid(email) {
        var value = String(email || '').trim().toLowerCase();

        // prenom.nom@aims-senegal.org ou x@etudiants.aims-senegal.org
        return /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*aims-senegal\.org$/.test(value);
    }

    function session(key, value) {
        try {
            if (value === undefined) {
                return window.sessionStorage.getItem(key);
            }

            if (value === null) {
                window.sessionStorage.removeItem(key);
            } else {
                window.sessionStorage.setItem(key, value);
            }
        } catch (error) {
            return null;
        }

        return value;
    }

    function voterEmail() {
        // Mode en ligne : seule une adresse confirmée (compte Firebase) compte.
        if (window.VoteCloud && window.VoteCloud.active()) {
            return window.VoteCloud.voterEmail();
        }

        return session(VOTER_SESSION) || null;
    }

    function voterRecord(create) {
        var email = voterEmail();

        if (!email) {
            return null;
        }

        var id = email.toLowerCase();

        if (!data.voters[id] && create) {
            data.voters[id] = { email: id, scrutins: {} };
        }

        return data.voters[id] || null;
    }

    function hasVoted(key) {
        var record = voterRecord(false);

        return record && record.scrutins[key] ? record.scrutins[key].receipt : null;
    }

    function adminUnlocked() {
        if (online()) {
            return window.VoteCloud.isAdmin();
        }

        return session(ADMIN_SESSION) === data.adminHash;
    }

    function typeOf(key) {
        return TYPES.filter(function (type) { return type.key === key; })[0] || TYPES[0];
    }

    function avatar(candidate, small) {
        if (candidate.photo) {
            return '<img class="avatar' + (small ? ' avatar-sm' : '') + '" src="' + esc(candidate.photo) + '" alt="">';
        }

        return '<span class="avatar-initials' + (small ? ' avatar-sm' : '') + '" aria-hidden="true">'
            + esc(initials(candidate.name)) + '</span>';
    }

    function plural(count, singular, pluralForm) {
        return count + ' ' + (count > 1 ? pluralForm : singular);
    }

    /* --------------------------------------------------------- stockage */
    function emptyData() {
        var data = { scrutins: {}, voters: {}, adminHash: digest(DEFAULT_ADMIN_CODE) };

        TYPES.forEach(function (type) {
            data.scrutins[type.key] = { status: 'open', max: 1, candidates: [], ballots: [] };
        });

        return data;
    }

    function seedData() {
        var data = emptyData();

        // Quelques candidats fictifs pour que l'apercu ne soit pas vide.
        data.scrutins.academic.candidates = [
            { id: uid(), name: 'Aminata Diallo', slogan: 'Une classe organisée, une voix qui porte', prog: 'Un point hebdomadaire avec les tuteurs et un canal unique pour les annonces.' },
            { id: uid(), name: 'Moussa Sow', slogan: 'Disponible, à l\'écoute, efficace', prog: '' },
            { id: uid(), name: 'Fatou Ndiaye', slogan: 'Ensemble pour une promotion soudée', prog: '' }
        ];
        data.scrutins.health.candidates = [
            { id: uid(), name: 'Ibrahima Faye', slogan: 'Un campus en bonne santé', prog: '' },
            { id: uid(), name: 'Khady Mbaye', slogan: 'Prévenir, écouter, accompagner', prog: '' }
        ];
        data.scrutins.online.candidates = [
            { id: uid(), name: 'Cheikh Gueye', slogan: 'Une connexion qui tient, des outils qui marchent', prog: '' },
            { id: uid(), name: 'Mariama Ba', slogan: 'Le numérique au service de tous', prog: '' }
        ];
        data.scrutins.logistics.candidates = [
            { id: uid(), name: 'Ousmane Diop', slogan: 'Des repas, des chambres, des bus à l\'heure', prog: '' },
            { id: uid(), name: 'Awa Sarr', slogan: 'La logistique, sans stress', prog: '' }
        ];

        return data;
    }

    function load() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);

            if (raw) {
                var parsed = JSON.parse(raw);

                // Tolere l'ajout d'un nouveau type apres coup.
                TYPES.forEach(function (type) {
                    if (!parsed.scrutins[type.key]) {
                        parsed.scrutins[type.key] = { status: 'draft', max: 1, candidates: [], ballots: [] };
                    }
                });

                parsed.voters = parsed.voters || {};
                parsed.adminHash = parsed.adminHash || digest(DEFAULT_ADMIN_CODE);
                delete parsed.voted;

                return parsed;
            }
        } catch (error) {
            /* stockage indisponible ou corrompu : on repart d'un tableau vide */
        }

        // Premier lancement : aucun candidat fictif, l'administrateur les ajoute.
        return emptyData();
    }

    function save() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            /* quota depasse (photos trop lourdes) ou mode prive : on continue en memoire */
        }

        // Mode en ligne (js/cloud.js) : envoi des changements à Firebase.
        if (online()) {
            window.VoteCloud.sync(data);
        }
    }

    function online() {
        return !!(window.VoteCloud && window.VoteCloud.active());
    }

    var data = load();

    function scrutin(key) {
        return data.scrutins[key];
    }

    function votesFor(key, candidateId) {
        return scrutin(key).ballots.filter(function (ballot) {
            return ballot.choices.indexOf(candidateId) !== -1;
        }).length;
    }

    /* ------------------------------------------------------------ accueil */
    function renderHome() {
        var container = document.querySelector('[data-scrutins-home]');

        if (!container) {
            return;
        }

        container.innerHTML = TYPES.map(function (type) {
            var s = scrutin(type.key);
            var status = STATUS[s.status];
            var receiptCode = hasVoted(type.key);
            var ready = s.status === 'open' && s.candidates.length;
            var action;
            var note;

            if (receiptCode) {
                action = '<span class="sc-done">Vous avez voté</span>';
                note = 'Reçu : <b>' + esc(receiptCode) + '</b>';
            } else if (ready) {
                action = '<a class="btn" href="#email" data-goto="email" data-vote-type="' + type.key + '">Voter</a>';
                note = s.max > 1 ? 'Jusqu\'à ' + s.max + ' choix, vote blanc possible.' : 'Un choix, vote blanc possible.';
            } else if (s.status === 'closed') {
                action = '<button class="btn sc-off" type="button" disabled>Scrutin clos</button>';
                note = 'Le vote est terminé. Consultez les résultats.';
            } else if (s.status === 'draft') {
                action = '<button class="btn sc-off" type="button" disabled>Bientôt ouvert</button>';
                note = 'Le scrutin n\'est pas encore ouvert.';
            } else {
                action = '<button class="btn sc-off" type="button" disabled>Voter</button>';
                note = 'Les candidatures n\'ont pas encore été publiées.';
            }

            return '<article class="sc-card sc-' + s.status + '">'
                + '<header class="sc-head">'
                + '<span class="sc-icon" aria-hidden="true">' + (ICONS[type.key] || '') + '</span>'
                + '<div class="sc-title"><span class="sc-kicker">Focal Point</span>'
                + '<h3>' + esc(type.short) + '</h3></div>'
                + '<span class="badge ' + status.badge + '">' + status.label + '</span>'
                + '</header>'
                + '<p class="sc-desc">' + esc(type.description) + '</p>'
                + '<dl class="sc-facts">'
                + '<div><dt>' + (s.candidates.length > 1 ? 'Candidats' : 'Candidat') + '</dt><dd>' + s.candidates.length + '</dd></div>'
                + '<div><dt>' + (s.ballots.length > 1 ? 'Bulletins' : 'Bulletin') + '</dt><dd>' + s.ballots.length + '</dd></div>'
                + '<div><dt>Code</dt><dd class="sc-code">' + esc(type.code) + '</dd></div>'
                + '</dl>'
                + '<footer class="sc-foot">'
                + '<div class="sc-actions">' + action
                + '<a class="btn btn-ghost" href="#resultats" data-goto="resultats" data-results-type="' + type.key + '">Suivre en direct</a>'
                + '</div>'
                + '<p class="sc-note">' + note + '</p>'
                + '</footer>'
                + '</article>';
        }).join('');
    }

    /* Pictogrammes des quatre types de scrutin (trait, couleur du texte). */
    var ICONS = {
        academic: '<svg viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/></svg>',
        health: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8.5 12h2l1-2 2 4 1-2h1"/></svg>',
        online: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M8.5 10.5a5 5 0 0 1 7 0M10.3 12.3a2.4 2.4 0 0 1 3.4 0"/></svg>',
        logistics: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>'
    };

    /* ------------------------------------------------- verification email */
    var emailError = null;

    function renderEmail() {
        var root = document.querySelector('[data-scrutins-email]');

        if (!root) {
            return;
        }

        if (online()) {
            renderEmailOnline(root);

            return;
        }

        var email = voterEmail();

        root.innerHTML = '<div class="card">'
            + '<h2>Vérifier votre adresse</h2>'
            + '<p class="muted" style="font-size:.98rem">Seules les adresses institutionnelles se terminant par '
            + '<strong>@' + esc(EMAIL_DOMAIN) + '</strong> peuvent voter. Toute autre adresse est refusée. '
            + 'Votre adresse atteste de votre participation (un bulletin par scrutin) ; '
            + 'votre choix, lui, n\'est jamais relié à votre adresse.</p>'
            + '<form data-email-form onsubmit="return false">'
            + '<div class="field">'
            + '<label class="label" for="voter-email">Adresse email institutionnelle</label>'
            + '<input class="input' + (emailError ? ' has-error' : '') + '" id="voter-email" name="email" type="email" autocomplete="email" '
            + 'placeholder="prenom.nom@aims-senegal.org" value="' + esc(email || '') + '"'
            + (emailError ? ' aria-invalid="true" aria-describedby="voter-email-msg"' : '') + '>'
            + (emailError
                ? '<div class="error" id="voter-email-msg">' + esc(emailError) + '</div>'
                : '<div class="help">Adresses acceptées : @' + esc(EMAIL_DOMAIN) + '</div>')
            + '</div>'
            + '<button class="btn btn-lg btn-block" type="submit">Continuer vers les bulletins</button>'
            + '</form>'
            + (email ? '<p class="small muted" style="margin:.9rem 0 0">Adresse actuellement vérifiée : ' + esc(email) + '.</p>' : '')
            + '</div>';
    }

    /* Mode en ligne : compte votant avec adresse confirmée par email. */
    var voterMsg = null;     // { kind: 'error' | 'success', text }
    var voterBusy = false;

    function renderEmailOnline(root) {
        var v = window.VoteCloud.voterState();
        var html = '<div class="card">'
            + '<h2>Vérifier votre adresse</h2>'
            + '<p class="muted" style="font-size:.98rem">Seules les adresses institutionnelles se terminant par '
            + '<strong>@' + esc(EMAIL_DOMAIN) + '</strong> peuvent voter. Votre adresse est confirmée par un lien envoyé par email : '
            + 'personne ne peut voter à votre place. Votre choix, lui, n\'est jamais relié à votre adresse.</p>';

        if (voterMsg) {
            html += '<div class="alert alert-' + voterMsg.kind + '">' + esc(voterMsg.text) + '</div>';
        }

        if (v.state === 'ok') {
            html += '<p style="margin:0 0 1rem">Adresse confirmée : <strong>' + esc(v.email) + '</strong></p>'
                + '<a class="btn btn-lg btn-block" href="#bulletin" data-goto="bulletin">Continuer vers les bulletins</a>'
                + '<button class="btn btn-ghost btn-block" type="button" data-voter-logout style="margin-top:.6rem">Changer de compte</button>';
        } else if (v.state === 'unverified') {
            html += '<div class="voter-step">'
                + '<p><strong>Dernière étape : confirmez votre adresse.</strong></p>'
                + '<p class="muted">Un email a été envoyé à <strong>' + esc(v.email) + '</strong>. Ouvrez-le et cliquez sur le lien '
                + '(pensez à regarder dans les courriers indésirables), puis revenez ici.</p>'
                + '</div>'
                + '<button class="btn btn-lg btn-block" type="button" data-voter-refresh' + (voterBusy ? ' disabled' : '') + '>J\'ai cliqué sur le lien</button>'
                + '<div class="row" style="margin-top:.7rem">'
                + '<button class="btn btn-ghost btn-sm" type="button" data-voter-resend>Renvoyer l\'email</button>'
                + '<button class="btn btn-ghost btn-sm" type="button" data-voter-logout>Changer de compte</button>'
                + '</div>';
        } else if (v.state === 'wrong-domain') {
            html += '<div class="alert alert-error">Vous êtes connecté avec ' + esc(v.email) + ', qui n\'est pas une adresse @' + esc(EMAIL_DOMAIN) + '.</div>'
                + '<button class="btn btn-lg btn-block" type="button" data-voter-logout>Se déconnecter</button>';
        } else {
            html += '<form data-voter-form onsubmit="return false">'
                + '<div class="field"><label class="label" for="voter-email">Adresse email institutionnelle</label>'
                + '<input class="input" id="voter-email" name="email" type="email" autocomplete="email" required placeholder="prenom.nom@aims-senegal.org"></div>'
                + '<div class="field"><label class="label" for="voter-password">Mot de passe</label>'
                + '<input class="input" id="voter-password" name="password" type="password" autocomplete="current-password" minlength="6" required>'
                + '<div class="help">Première fois : choisissez un mot de passe (6 caractères minimum) et cliquez sur « Créer mon compte ».</div></div>'
                + '<div class="voter-actions">'
                + '<button class="btn btn-lg" type="submit" data-voter-login' + (voterBusy ? ' disabled' : '') + '>Se connecter</button>'
                + '<button class="btn btn-ghost btn-lg" type="button" data-voter-register' + (voterBusy ? ' disabled' : '') + '>Créer mon compte</button>'
                + '</div>'
                + '<button class="link-button" type="button" data-voter-reset>Mot de passe oublié ?</button>'
                + '</form>'
                + '<div class="voter-or"><span>ou</span></div>'
                + '<button class="btn btn-ghost btn-block" type="button" data-voter-google>Se connecter avec Google (compte @' + esc(EMAIL_DOMAIN) + ')</button>';
        }

        root.innerHTML = html + '</div>';
    }

    function voterAction(promise, success) {
        voterBusy = true;
        voterMsg = null;
        renderEmail();

        return Promise.resolve(promise).then(function (result) {
            voterBusy = false;
            voterMsg = typeof success === 'function' ? success(result) : success;
            renderAll();

            return result;
        }, function (error) {
            voterBusy = false;
            voterMsg = { kind: 'error', text: window.VoteCloud.authMessage(error) };
            renderAll();
        });
    }

    function voterFields() {
        var form = document.querySelector('[data-voter-form]');

        return {
            form: form,
            email: form ? String(form.elements.email.value || '').trim().toLowerCase() : '',
            password: form ? String(form.elements.password.value || '') : ''
        };
    }

    function verifyEmail(form) {
        var value = String(form.elements.email.value || '').trim().toLowerCase();

        if (!value) {
            emailError = 'Saisissez votre adresse email institutionnelle.';
        } else if (!emailValid(value)) {
            emailError = 'Adresse refusée : seules les adresses se terminant par @' + EMAIL_DOMAIN + ' sont autorisées à voter.';
        } else {
            emailError = null;
            session(VOTER_SESSION, value);
            voterRecord(true);
            save();

            if (online()) {
                window.VoteCloud.checkVoter(value);
            }
            renderAll();
            navigate('bulletin');

            return;
        }

        renderEmail();
        form = document.querySelector('[data-email-form]');

        if (form) {
            form.elements.email.focus();
        }
    }

    function navigate(panel) {
        if (window.PreviewNav) {
            window.PreviewNav(panel);
        } else {
            window.location.hash = panel;
        }
    }

    /* ----------------------------------------------------------- bulletin */
    var currentVote = TYPES[0].key;

    // Lien partage : ?scrutin=focal-point-academic (ou academic) ouvre ce scrutin.
    (function () {
        var match = /[?&]scrutin=([^&#]+)/.exec(window.location.search);
        var wanted = match ? decodeURIComponent(match[1]).toLowerCase().replace(/^focal-point-/, '') : '';

        TYPES.forEach(function (t) {
            if (t.key === wanted) {
                currentVote = t.key;
            }
        });
    })();

    function nextUnvoted(fromKey) {
        var start = TYPES.map(function (t) { return t.key; }).indexOf(fromKey);

        for (var i = 1; i <= TYPES.length; i++) {
            var type = TYPES[(start + i) % TYPES.length];
            var s = scrutin(type.key);

            if (!hasVoted(type.key) && s.status === 'open' && s.candidates.length) {
                return type.key;
            }
        }

        return null;
    }

    function renderBallot() {
        var root = document.querySelector('[data-scrutins-ballot]');

        if (!root) {
            return;
        }

        var email = voterEmail();

        if (!email) {
            root.innerHTML = '<ol class="stepper" aria-label="Étapes du vote">'
                + '<li class="is-done">Code</li><li class="is-current" aria-current="step">Adresse</li>'
                + '<li>Bulletin</li><li>Reçu</li></ol>'
                + '<div class="card center" style="max-width:660px; margin-inline:auto">'
                + '<h2 style="font-size:1.45rem">Vérifiez d\'abord votre adresse</h2>'
                + '<p class="muted" style="margin-bottom:1.2rem">Seules les adresses se terminant par @' + esc(EMAIL_DOMAIN)
                + ' peuvent accéder aux bulletins.</p>'
                + '<a class="btn btn-lg" href="#email" data-goto="email">Saisir mon adresse</a></div>';

            return;
        }

        var type = typeOf(currentVote);
        var s = scrutin(type.key);
        var status = STATUS[s.status];
        var votedCount = TYPES.filter(function (t) { return hasVoted(t.key); }).length;
        var html = '';

        // Votant identifie.
        html += '<div class="row" style="margin-bottom:1rem; gap:.5rem 1rem">'
            + '<span class="small muted">Vous votez avec l\'adresse <strong>' + esc(email) + '</strong></span>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-voter-logout>Changer d\'adresse</button>'
            + '</div>';

        // Navigation entre les quatre scrutins.
        html += '<div class="row" style="margin-bottom:1.3rem; gap:.8rem 1.2rem">'
            + '<div class="segmented" role="tablist" aria-label="Scrutins">'
            + TYPES.map(function (t) {
                var done = hasVoted(t.key) ? ' ✓' : '';
                return '<button type="button" role="tab" aria-selected="' + (t.key === type.key) + '" data-ballot-type="' + t.key + '">'
                    + esc(t.short) + done + '</button>';
            }).join('')
            + '</div>'
            + '<span class="small muted">' + votedCount + ' / ' + TYPES.length + ' scrutins votés</span>'
            + '</div>';

        html += '<ol class="stepper" aria-label="Étapes du vote">'
            + '<li class="is-done">Code</li><li class="is-done">Adresse</li>'
            + '<li class="is-current" aria-current="step">Bulletin</li><li>Reçu</li></ol>';

        html += '<div class="page-head">'
            + '<div class="row" style="margin-bottom:.7rem">'
            + '<span class="badge">Focal Point</span>'
            + '<span class="badge ' + status.badge + '">' + status.label + '</span>'
            + '</div>'
            + '<h1>' + esc(type.label) + '</h1>'
            + '<p class="lead">' + esc(type.description) + ' '
            + (s.max > 1 ? 'Sélectionnez jusqu\'à ' + s.max + ' candidats.' : 'Un seul choix.')
            + ' Le vote blanc est autorisé.</p>'
            + '</div>';

        if (hasVoted(type.key)) {
            html += confirmationCard(type, hasVoted(type.key));
        } else if (s.status !== 'open') {
            html += '<div class="card"><div class="masked">'
                + '<h3>' + (s.status === 'draft' ? 'Scrutin pas encore ouvert' : 'Scrutin clos') + '</h3>'
                + '<p>' + (s.status === 'draft'
                    ? 'L\'administrateur n\'a pas encore ouvert ce vote.'
                    : 'Ce scrutin est terminé : il n\'accepte plus de bulletin.') + '</p>'
                + '</div></div>';
        } else if (!s.candidates.length) {
            html += '<div class="alert alert-info">Aucun candidat n\'a encore été ajouté à ce scrutin. '
                + 'L\'administrateur peut en ajouter depuis l\'onglet <a href="#admin" data-goto="admin">Administration</a>.</div>';
        } else {
            var inputType = s.max > 1 ? 'checkbox' : 'radio';

            html += '<form data-ballot data-max="' + s.max + '" data-ballot-form="' + type.key + '">'
                + '<div class="card">'
                + '<div class="card-head"><h2>Les candidats</h2>'
                + '<span class="badge badge-accent">Choix : <span data-counter>0 / ' + s.max + '</span></span></div>'
                + '<div class="choices">'
                + s.candidates.map(function (candidate) {
                    return '<label class="choice">'
                        + '<input type="' + inputType + '" name="candidates[]" value="' + esc(candidate.id) + '">'
                        + '<span class="choice-check" aria-hidden="true">&#10003;</span>'
                        + avatar(candidate, false)
                        + '<span class="choice-body">'
                        + '<span class="choice-name">' + esc(candidate.name) + '</span>'
                        + (candidate.slogan ? '<span class="choice-slogan">' + esc(candidate.slogan) + '</span>' : '')
                        + (candidate.prog ? '<span class="choice-prog">' + esc(candidate.prog) + '</span>' : '')
                        + '</span></label>';
                }).join('')
                + '</div>'
                + '<label class="choice choice-abstain" style="margin-top:.75rem">'
                + '<input type="checkbox" name="abstain" value="1" data-abstain>'
                + '<span class="choice-check" aria-hidden="true">&#10003;</span>'
                + '<span class="avatar-initials avatar-sm" aria-hidden="true">&mdash;</span>'
                + '<span class="choice-body"><span class="choice-name">Vote blanc</span>'
                + '<span class="choice-slogan">Je participe au scrutin sans choisir de candidat.</span></span>'
                + '</label>'
                + '<hr class="sep">'
                + '<div class="row">'
                + '<button class="btn btn-lg" type="submit" data-submit>Confirmer mon vote</button>'
                + '<span class="small muted">Votre bulletin est définitif : il ne pourra pas être modifié.</span>'
                + '</div></div></form>';
        }

        root.innerHTML = html;

        var form = root.querySelector('[data-ballot]');

        if (form && window.VoteBallot) {
            window.VoteBallot.bind(form);
        }
    }

    function confirmationCard(type, code) {
        var next = nextUnvoted(type.key);
        var nextType = next ? typeOf(next) : null;

        return '<div class="card center">'
            + '<div class="seal" aria-hidden="true">&#10003;</div>'
            + '<h2 style="font-size:1.45rem">Votre vote est enregistré</h2>'
            + '<p class="muted" style="margin-bottom:.9rem">' + esc(type.label) + ' — votre reçu anonyme</p>'
            + '<div class="receipt">' + esc(code) + '</div>'
            + '<p class="small muted" style="margin:1rem auto 1.3rem; max-width:46ch">'
            + 'Notez ce code : il prouve que votre bulletin a bien été compté, sans révéler pour qui vous avez voté.</p>'
            + '<div class="row" style="justify-content:center">'
            + '<button class="btn btn-ghost" type="button" data-copy="' + esc(code) + '" data-copied="Reçu copié">Copier le reçu</button>'
            + (nextType
                ? '<button class="btn" type="button" data-ballot-type="' + nextType.key + '">Scrutin suivant : ' + esc(nextType.short) + '</button>'
                : '<a class="btn" href="#resultats" data-goto="resultats">Suivre les résultats</a>')
            + '</div></div>';
    }

    function submitBallot(form) {
        var key = form.getAttribute('data-ballot-form');
        var s = scrutin(key);

        var record = voterRecord(true);

        if (!s || !record || s.status !== 'open' || hasVoted(key)) {
            return;
        }

        var choices = all('input[name="candidates[]"]:checked', form).map(function (input) { return input.value; });
        var blank = !!form.querySelector('[data-abstain]:checked');

        if (!choices.length && !blank) {
            return;
        }

        var code = receipt();

        s.ballots.push({ choices: choices, blank: blank, receipt: code, at: new Date().toISOString() });
        record.scrutins[key] = { receipt: code, at: new Date().toISOString() };
        save();
        renderAll();
        window.scrollTo(0, 0);
    }

    /* ----------------------------------------------------- administration */
    var currentAdmin = TYPES[0].key;
    var editing = null;      // id du candidat en cours de modification
    var pendingPhoto = null; // dataURL de la photo choisie dans le formulaire
    var notice = null;       // message affiche en haut de la carte des candidats

    function renderAdminStats() {
        var openCount = 0;
        var candidates = 0;
        var ballots = 0;

        TYPES.forEach(function (type) {
            var s = scrutin(type.key);

            openCount += s.status === 'open' ? 1 : 0;
            candidates += s.candidates.length;
            ballots += s.ballots.length;
        });

        var stats = { scrutins: TYPES.length, open: openCount, candidates: candidates, ballots: ballots };

        Object.keys(stats).forEach(function (key) {
            all('[data-admin-stat="' + key + '"]').forEach(function (node) {
                node.textContent = stats[key];
            });
        });
    }

    function renderAdmin(keepDraft) {
        var root = document.querySelector('[data-scrutins-admin]');

        if (!root) {
            return;
        }

        if (!adminUnlocked()) {
            renderAdminLock(root);

            return;
        }

        renderAdminStats();

        var type = typeOf(currentAdmin);
        var s = scrutin(type.key);
        var status = STATUS[s.status];
        var edited = editing ? s.candidates.filter(function (c) { return c.id === editing; })[0] : null;
        var html = '';

        // Valeurs deja saisies dans le formulaire, a conserver lors d'un
        // nouveau rendu (changement de photo par exemple).
        var previous = root.querySelector('[data-admin-form]');
        var draft = {
            name: edited ? edited.name : '',
            slogan: edited ? edited.slogan : '',
            prog: edited ? edited.prog : ''
        };

        if (keepDraft && previous) {
            draft.name = previous.elements.name.value;
            draft.slogan = previous.elements.slogan.value;
            draft.prog = previous.elements.prog.value;
        }

        // Choix du scrutin a administrer.
        html += '<div class="card" style="margin-top:1.1rem">'
            + '<div class="card-head"><div><h2>Choisir le scrutin</h2>'
            + '<p class="card-sub">Chaque type de scrutin a ses propres candidats, son code et son état.</p></div></div>'
            + '<div class="segmented" role="tablist" aria-label="Types de scrutin">'
            + TYPES.map(function (t) {
                var st = scrutin(t.key);
                return '<button type="button" role="tab" aria-selected="' + (t.key === type.key) + '" data-admin-type="' + t.key + '">'
                    + esc(t.short) + ' <span class="muted">(' + st.candidates.length + ')</span></button>';
            }).join('')
            + '</div></div>';

        // Reglages du scrutin courant.
        html += '<div class="card">'
            + '<div class="card-head"><div><h2>' + esc(type.label) + '</h2>'
            + '<p class="card-sub">' + esc(type.description) + '</p></div></div>'
            + '<div class="row" style="align-items:flex-end; gap:1.2rem 1.6rem">'
            + '<div><div class="label">Code à projeter</div>'
            + '<span class="code-pill"><small>code</small> ' + esc(type.code) + '</span></div>'
            + '<div style="flex:1; min-width:260px"><label class="label" for="admin-link-' + type.key + '">Lien direct</label>'
            + '<input class="input mono" id="admin-link-' + type.key + '" type="text" readonly value="' + esc(voteLink(type.key)) + '"></div>'
            + '<div><label class="label" for="admin-expected">Inscrits</label>'
            + '<input class="input" id="admin-expected" type="number" min="1" step="1" style="width:7rem" data-admin-expected value="' + (parseInt(s.expected, 10) || 40) + '"></div>'
            + '<div><label class="label" for="admin-max">Choix par votant</label>'
            + '<select class="select" id="admin-max" data-admin-max>'
            + [1, 2, 3].map(function (n) {
                return '<option value="' + n + '"' + (s.max === n ? ' selected' : '') + '>' + n + '</option>';
            }).join('')
            + '</select></div>'
            + '</div>'
            + '<div class="row" style="margin-top:.9rem">'
            + '<button class="btn btn-ghost btn-sm" type="button" data-copy="' + esc(voteLink(type.key)) + '" data-copied="Lien copié">Copier le lien</button>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-goto="ecran" data-results-type="' + type.key + '">Score live</button>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-export>Export CSV</button>'
            + '</div>'
            + '<hr class="sep">'
            + '<div class="row">'
            + '<span class="badge ' + status.badge + '">État actuel : ' + status.label + '</span>'
            + '<span class="small muted">' + plural(s.ballots.length, 'bulletin reçu', 'bulletins reçus') + '</span>'
            + '<span class="spacer row">'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-status="draft"' + (s.status === 'draft' ? ' disabled' : '') + '>Brouillon</button>'
            + '<button class="btn btn-sm" type="button" data-admin-status="open"' + (s.status === 'open' ? ' disabled' : '') + '>Ouvrir le vote</button>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-status="closed"' + (s.status === 'closed' ? ' disabled' : '') + '>Clore le scrutin</button>'
            + '</span></div></div>';

        // Liste des candidats.
        html += '<div class="card">'
            + '<div class="card-head"><h2>Candidats (' + s.candidates.length + ')</h2>'
            + '<span class="badge">' + esc(type.short) + '</span></div>';

        if (notice) {
            html += '<div class="alert alert-' + notice.kind + '">' + esc(notice.text) + '</div>';
        }

        if (!s.candidates.length) {
            html += '<p class="muted" style="margin-bottom:1rem">Aucun candidat pour l\'instant. Ajoutez-en avec le formulaire ci-dessous.</p>';
        } else {
            html += '<div class="table-wrap"><table class="table"><thead><tr>'
                + '<th scope="col">Candidat</th><th scope="col" class="num">Voix</th>'
                + '<th scope="col" class="table-actions" style="width:1%" aria-label="Actions"></th>'
                + '</tr></thead><tbody>'
                + s.candidates.map(function (candidate) {
                    return '<tr' + (editing === candidate.id ? ' class="is-editing"' : '') + '>'
                        + '<td><div class="row" style="flex-wrap:nowrap; gap:.8rem">'
                        + avatar(candidate, true)
                        + '<div><strong>' + esc(candidate.name) + '</strong>'
                        + (candidate.slogan ? '<div class="small muted">' + esc(candidate.slogan) + '</div>' : '')
                        + '</div></div></td>'
                        + '<td class="num"><strong>' + votesFor(type.key, candidate.id) + '</strong></td>'
                        + '<td class="table-actions"><span class="row" style="flex-wrap:nowrap; gap:.4rem">'
                        + '<button class="btn btn-ghost btn-sm" type="button" data-admin-edit="' + esc(candidate.id) + '">Modifier</button>'
                        + '<button class="btn btn-danger btn-sm" type="button" data-admin-delete="' + esc(candidate.id) + '">Supprimer</button>'
                        + '</span></td></tr>';
                }).join('')
                + '</tbody></table></div>';
        }

        // Formulaire d'ajout / de modification.
        var photo = pendingPhoto === false ? null : (pendingPhoto || (edited && edited.photo) || null);

        html += '<hr class="sep">'
            + '<form data-admin-form onsubmit="return false">'
            + '<h3 style="margin-bottom:.9rem">' + (edited ? 'Modifier ' + esc(edited.name) : 'Ajouter un candidat — ' + esc(type.label)) + '</h3>'
            + '<div class="grid grid-2" style="gap:0 1.1rem">'
            + '<div class="field"><label class="label" for="admin-name">Nom complet</label>'
            + '<input class="input" id="admin-name" name="name" type="text" required placeholder="Aminata Diallo" value="' + esc(draft.name) + '"></div>'
            + '<div class="field"><label class="label" for="admin-slogan">Slogan (optionnel)</label>'
            + '<input class="input" id="admin-slogan" name="slogan" type="text" placeholder="Une classe organisée…" value="' + esc(draft.slogan) + '"></div>'
            + '</div>'
            + '<div class="field"><label class="label" for="admin-prog">Programme (optionnel)</label>'
            + '<textarea class="textarea" id="admin-prog" name="prog" placeholder="En quelques lignes, ce que le candidat propose.">' + esc(draft.prog) + '</textarea></div>'
            + '<div class="field"><label class="label" for="admin-photo">Photo</label>'
            + '<div class="row" style="flex-wrap:nowrap; gap:.9rem">'
            + (photo ? '<img class="avatar" src="' + esc(photo) + '" alt="">' : '<span class="avatar-initials" aria-hidden="true">' + esc(initials(draft.name)) + '</span>')
            + '<div style="flex:1"><input class="input" id="admin-photo" type="file" accept="image/*" data-admin-photo>'
            + '<div class="help">JPG, PNG ou WEBP, 4 Mo maximum. L\'image est automatiquement recadrée en carré.</div></div>'
            + (photo ? '<button class="btn btn-ghost btn-sm" type="button" data-admin-photo-remove>Retirer</button>' : '')
            + '</div></div>'
            + '<div class="row">'
            + '<button class="btn" type="submit" data-admin-save>' + (edited ? 'Enregistrer les modifications' : 'Ajouter le candidat') + '</button>'
            + (edited ? '<button class="btn btn-ghost" type="button" data-admin-cancel>Annuler</button>' : '')
            + '</div></form></div>';

        // Votants : adresses ayant depose au moins un bulletin.
        html += renderVoters();

        // Securite et reinitialisation.
        html += '<div class="card">'
            + '<div class="card-head"><div><h2>Sécurité et réinitialisation</h2>'
            + '<p class="card-sub">Le code secret protège cette page ; la réinitialisation efface tout le tableau de bord.</p></div>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-logout>Se déconnecter</button></div>'
            + (online() ? renderAdmins() : ''
                + '<form data-admin-code-form onsubmit="return false">'
                + '<div class="grid grid-2" style="gap:0 1.1rem">'
                + '<div class="field"><label class="label" for="admin-code-current">Code secret actuel</label>'
                + '<input class="input" id="admin-code-current" name="current" type="password" autocomplete="current-password"></div>'
                + '<div class="field"><label class="label" for="admin-code-next">Nouveau code secret</label>'
                + '<input class="input" id="admin-code-next" name="next" type="password" autocomplete="new-password" minlength="6">'
                + '<div class="help">Six caractères minimum.</div></div>'
                + '</div>'
                + '<button class="btn btn-ghost" type="submit">Changer le code secret</button>'
                + '</form>')
            + '<hr class="sep">'
            + '<div class="row">'
            + '<button class="btn btn-danger" type="button" data-admin-clear-indicators>Effacer tous les indicateurs</button>'
            + '<button class="btn btn-danger" type="button" data-admin-reset-results>Réinitialiser les résultats : ' + esc(type.short) + '</button>'
            + '<button class="btn btn-danger" type="button" data-admin-reset-all>Réinitialiser tout le tableau de bord</button>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-reset-votes>Effacer uniquement les bulletins et les votants</button>'
            + '<button class="btn btn-ghost btn-sm" type="button" data-admin-reset>Recharger les données de démonstration</button>'
            + '</div>'
            + '<p class="small muted" style="margin:.8rem 0 0">« Effacer tous les indicateurs » remet tous les compteurs à zéro : bulletins, voix, votes blancs, participation, graphiques et élu(e) dans les onglets Accueil, Résultats, Score live et Administration, pour les quatre scrutins. Les candidats sont conservés.</p>'
            + '<p class="small muted" style="margin:.4rem 0 0">« Réinitialiser les résultats » efface les bulletins du seul scrutin choisi (' + esc(type.label) + ') : ses votants pourront revoter à ce scrutin. Les candidats sont conservés.</p>'
            + '<p class="small muted" style="margin:.4rem 0 0">La réinitialisation complète supprime les candidats, les bulletins et la liste des votants des quatre scrutins, et rouvre chaque scrutin. Le code secret est conservé.</p>'
            + '</div>';

        root.innerHTML = html;
        notice = null;
    }

    var lockError = null;

    function renderAdminLock(root) {
        all('[data-admin-stat]').forEach(function (node) { node.textContent = '—'; });

        // Mode en ligne : connexion avec un compte Google administrateur.
        if (online()) {
            var who = window.VoteCloud.user();

            root.innerHTML = '<div class="card" style="max-width:520px; margin:1.1rem auto 0">'
                + '<h2>Accès réservé à l\'administrateur</h2>'
                + (who
                    ? '<div class="alert alert-error">Le compte ' + esc(who.email || '') + ' n\'est pas administrateur de cette plateforme.</div>'
                    : '<p class="muted" style="font-size:.98rem">Connectez-vous avec le compte Google administrateur pour gérer les scrutins, les candidats et consulter la liste des votants.</p>')
                + '<button class="btn btn-lg btn-block" type="button" data-cloud-signin>' + (who ? 'Utiliser un autre compte Google' : 'Se connecter avec Google') + '</button>'
                + (who ? '<button class="btn btn-ghost btn-block" type="button" data-admin-logout style="margin-top:.6rem">Se déconnecter</button>' : '')
                + '</div>';

            return;
        }

        root.innerHTML = '<div class="card" style="max-width:520px; margin:1.1rem auto 0">'
            + '<h2>Accès réservé à l\'administrateur</h2>'
            + '<p class="muted" style="font-size:.98rem">Saisissez le code secret pour gérer les scrutins, les candidats et consulter la liste des votants.</p>'
            + '<form data-admin-lock-form onsubmit="return false">'
            + '<div class="field">'
            + '<label class="label" for="admin-code">Code secret</label>'
            + '<input class="input' + (lockError ? ' has-error' : '') + '" id="admin-code" name="code" type="password" autocomplete="current-password" autofocus'
            + (lockError ? ' aria-invalid="true" aria-describedby="admin-code-msg"' : '') + '>'
            + (lockError ? '<div class="error" id="admin-code-msg">' + esc(lockError) + '</div>' : '')
            + '</div>'
            + '<button class="btn btn-lg btn-block" type="submit">Déverrouiller l\'administration</button>'
            + '</form>'
            + '<p class="small muted" style="margin:.9rem 0 0">Aperçu : le code initial est <code>' + esc(DEFAULT_ADMIN_CODE) + '</code>. Changez-le dès la première connexion.</p>'
            + '</div>';

        lockError = null;
    }

    function unlockAdmin(form) {
        var code = String(form.elements.code.value || '');

        if (code && digest(code) === data.adminHash) {
            session(ADMIN_SESSION, data.adminHash);
            renderAdmin();

            return;
        }

        lockError = 'Code secret incorrect.';
        renderAdmin();
    }

    function changeAdminCode(form) {
        var current = String(form.elements.current.value || '');
        var next = String(form.elements.next.value || '');

        if (digest(current) !== data.adminHash) {
            notice = { kind: 'error', text: 'Le code secret actuel est incorrect.' };
        } else if (next.length < 6) {
            notice = { kind: 'error', text: 'Le nouveau code doit comporter au moins six caractères.' };
        } else {
            data.adminHash = digest(next);
            session(ADMIN_SESSION, data.adminHash);
            save();
            notice = { kind: 'success', text: 'Le code secret a été changé.' };
        }

        renderAdmin(true);
    }

    /* Administrateurs (mode en ligne) : comptes Google autorisés. */
    function renderAdmins() {
        var me = (window.VoteCloud.user() || {}).email || '';
        var list = window.VoteCloud.adminEmails();

        return '<p class="small muted">Connecté avec Google : ' + esc(me) + '.</p>'
            + '<h3 style="margin:1.1rem 0 .3rem">Administrateurs</h3>'
            + '<p class="small muted" style="margin-bottom:.7rem">Chaque administrateur se connecte avec son compte Google à cette adresse.</p>'
            + '<ul class="admin-list">'
            + '<li><strong>' + esc(me) + '</strong> <span class="badge">Vous</span></li>'
            + list.filter(function (email) { return email !== me.toLowerCase(); }).map(function (email) {
                return '<li><strong>' + esc(email) + '</strong>'
                    + '<button class="btn btn-ghost btn-sm" type="button" data-admin-remove="' + esc(email) + '">Retirer</button></li>';
            }).join('')
            + '</ul>'
            + '<form class="row" data-admin-add-form onsubmit="return false" style="margin-top:.7rem; align-items:flex-end">'
            + '<div style="flex:1; min-width:220px"><label class="label" for="admin-add-email">Ajouter un administrateur</label>'
            + '<input class="input" id="admin-add-email" name="email" type="email" placeholder="prenom.nom@aims-senegal.org"></div>'
            + '<button class="btn" type="submit">Ajouter</button>'
            + '</form>';
    }

    function renderVoters() {
        var voters = Object.keys(data.voters).map(function (id) { return data.voters[id]; })
            .filter(function (v) { return Object.keys(v.scrutins).length; })
            .sort(function (a, b) { return a.email < b.email ? -1 : 1; });

        var html = '<div class="card">'
            + '<div class="card-head"><div><h2>Votants (' + voters.length + ')</h2>'
            + '<p class="card-sub">Adresses ayant déposé au moins un bulletin. Le choix de chaque votant n\'est pas enregistré avec son adresse.</p></div>'
            + (voters.length ? '<button class="btn btn-ghost btn-sm" type="button" data-admin-export-voters>Export CSV</button>' : '')
            + '</div>';

        if (!voters.length) {
            html += '<p class="muted">Aucun bulletin reçu pour l\'instant.</p>';
        } else {
            html += '<div class="table-wrap"><table class="table"><thead><tr>'
                + '<th scope="col">Adresse</th><th scope="col">Scrutins votés</th>'
                + '<th scope="col">Dernier bulletin</th>'
                + '</tr></thead><tbody>'
                + voters.map(function (v) {
                    var keys = Object.keys(v.scrutins);
                    var last = keys.map(function (k) { return v.scrutins[k].at; }).sort().pop();

                    return '<tr><td><strong>' + esc(v.email) + '</strong></td>'
                        + '<td><span class="row" style="gap:.35rem">'
                        + TYPES.map(function (t) {
                            return v.scrutins[t.key]
                                ? '<span class="badge badge-accent">' + esc(t.short) + '</span>'
                                : '<span class="badge" style="opacity:.45">' + esc(t.short) + '</span>';
                        }).join('')
                        + '</span></td>'
                        + '<td class="small muted">' + esc(formatDate(last)) + '</td></tr>';
                }).join('')
                + '</tbody></table></div>';
        }

        return html + '</div>';
    }

    function formatDate(iso) {
        if (!iso) {
            return '';
        }

        var d = new Date(iso);

        var loc = (window.VoteI18n && window.VoteI18n.lang() === 'en') ? 'en-GB' : 'fr-FR';

        return d.toLocaleDateString(loc) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    }

    function exportVotersCsv() {
        var lines = [['Adresse'].concat(TYPES.map(function (t) { return t.label; })).concat(['Dernier bulletin'])];

        Object.keys(data.voters).forEach(function (id) {
            var v = data.voters[id];
            var keys = Object.keys(v.scrutins);

            if (!keys.length) {
                return;
            }

            lines.push([v.email].concat(TYPES.map(function (t) {
                return v.scrutins[t.key] ? formatDate(v.scrutins[t.key].at) : '';
            })).concat([formatDate(keys.map(function (k) { return v.scrutins[k].at; }).sort().pop())]));
        });

        downloadCsv(lines, 'votants.csv');
    }

    function downloadCsv(lines, filename) {
        var csv = lines.map(function (row) {
            return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(';');
        }).join('\r\n');

        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        var link = document.createElement('a');

        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }

    function readPhoto(file, done) {
        if (!file) {
            return;
        }

        if (file.size > 4 * 1024 * 1024) {
            notice = { kind: 'error', text: 'La photo dépasse 4 Mo.' };
            renderAdmin(true);

            return;
        }

        var reader = new FileReader();

        reader.onload = function () {
            var img = new Image();

            img.onload = function () {
                // Recadrage carre et reduction, pour tenir dans le stockage local.
                var size = 160;
                var canvas = document.createElement('canvas');
                var side = Math.min(img.width, img.height);
                var sx = (img.width - side) / 2;
                var sy = (img.height - side) / 2;

                canvas.width = size;
                canvas.height = size;
                canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
                done(canvas.toDataURL('image/jpeg', 0.82));
            };

            img.onerror = function () {
                notice = { kind: 'error', text: 'Ce fichier n\'est pas une image lisible.' };
                renderAdmin(true);
            };

            img.src = reader.result;
        };

        reader.readAsDataURL(file);
    }

    function saveCandidate(form) {
        var s = scrutin(currentAdmin);
        var name = (form.elements.name.value || '').trim();
        var slogan = (form.elements.slogan.value || '').trim();
        var prog = (form.elements.prog.value || '').trim();

        if (!name) {
            notice = { kind: 'error', text: 'Le nom du candidat est obligatoire.' };
            renderAdmin(true);
            form = document.querySelector('[data-admin-form]');
            if (form) {
                form.elements.name.focus();
            }

            return;
        }

        var duplicate = s.candidates.filter(function (c) {
            return c.id !== editing && c.name.toLowerCase() === name.toLowerCase();
        })[0];

        if (duplicate) {
            notice = { kind: 'error', text: name + ' est déjà candidat(e) à ce scrutin.' };
            renderAdmin(true);

            return;
        }

        if (editing) {
            s.candidates.forEach(function (candidate) {
                if (candidate.id === editing) {
                    candidate.name = name;
                    candidate.slogan = slogan;
                    candidate.prog = prog;

                    if (pendingPhoto === false) {
                        delete candidate.photo;
                    } else if (pendingPhoto) {
                        candidate.photo = pendingPhoto;
                    }
                }
            });
            notice = { kind: 'success', text: name + ' a été mis(e) à jour.' };
        } else {
            var candidate = { id: uid(), name: name, slogan: slogan, prog: prog };

            if (pendingPhoto) {
                candidate.photo = pendingPhoto;
            }

            s.candidates.push(candidate);
            notice = { kind: 'success', text: name + ' a été ajouté(e) au scrutin ' + typeOf(currentAdmin).label + '.' };
        }

        editing = null;
        pendingPhoto = null;
        save();
        renderAll();
    }

    function deleteCandidate(id) {
        var s = scrutin(currentAdmin);
        var candidate = s.candidates.filter(function (c) { return c.id === id; })[0];

        if (!candidate) {
            return;
        }

        var votes = votesFor(currentAdmin, id);
        var question = 'Supprimer ' + candidate.name + ' du scrutin ' + typeOf(currentAdmin).label + ' ?'
            + (votes ? '\n\nCe candidat a déjà reçu ' + plural(votes, 'voix', 'voix') + ' : elles seront perdues.' : '');

        if (!window.confirm(question)) {
            return;
        }

        s.candidates = s.candidates.filter(function (c) { return c.id !== id; });
        s.ballots.forEach(function (ballot) {
            ballot.choices = ballot.choices.filter(function (choice) { return choice !== id; });
        });

        if (editing === id) {
            editing = null;
            pendingPhoto = null;
        }

        notice = { kind: 'success', text: candidate.name + ' a été retiré(e) du scrutin.' };
        save();
        renderAll();
    }

    function exportCsv() {
        var type = typeOf(currentAdmin);
        var s = scrutin(type.key);
        var lines = [['Scrutin', 'Candidat', 'Slogan', 'Voix']];

        s.candidates.forEach(function (candidate) {
            lines.push([type.label, candidate.name, candidate.slogan || '', votesFor(type.key, candidate.id)]);
        });

        lines.push([type.label, 'Vote blanc', '', s.ballots.filter(function (b) { return b.blank; }).length]);

        downloadCsv(lines, 'resultats-' + type.key + '.csv');
    }

    /* --------------------------------------------------------- evenements */
    document.addEventListener('click', function (event) {
        var target = event.target;
        var hit;

        // Accueil : « Voter » sur une carte preselectionne le scrutin.
        hit = target.closest('[data-vote-type]');
        if (hit) {
            currentVote = hit.getAttribute('data-vote-type');
            renderBallot();
        }

        // Bulletin : changement de scrutin.
        hit = target.closest('[data-ballot-type]');
        if (hit) {
            currentVote = hit.getAttribute('data-ballot-type');
            renderBallot();
            window.scrollTo(0, 0);

            return;
        }

        // Administration.
        hit = target.closest('[data-admin-type]');
        if (hit) {
            currentAdmin = hit.getAttribute('data-admin-type');
            editing = null;
            pendingPhoto = null;
            renderAdmin();

            return;
        }

        hit = target.closest('[data-admin-status]');
        if (hit) {
            scrutin(currentAdmin).status = hit.getAttribute('data-admin-status');
            save();
            renderAll();

            return;
        }

        hit = target.closest('[data-admin-edit]');
        if (hit) {
            editing = hit.getAttribute('data-admin-edit');
            pendingPhoto = null;
            renderAdmin();
            var field = document.getElementById('admin-name');
            if (field) {
                field.focus();
                field.scrollIntoView({ block: 'center' });
            }

            return;
        }

        hit = target.closest('[data-admin-delete]');
        if (hit) {
            deleteCandidate(hit.getAttribute('data-admin-delete'));

            return;
        }

        hit = target.closest('[data-admin-cancel]');
        if (hit) {
            editing = null;
            pendingPhoto = null;
            renderAdmin();

            return;
        }

        hit = target.closest('[data-admin-photo-remove]');
        if (hit) {
            pendingPhoto = false; // false = retirer la photo existante
            renderAdmin(true);

            return;
        }

        hit = target.closest('[data-admin-export]');
        if (hit) {
            exportCsv();

            return;
        }

        hit = target.closest('[data-voter-logout]');
        if (hit) {
            session(VOTER_SESSION, null);

            if (online()) {
                voterMsg = null;
                window.VoteCloud.signOut().then(function () {
                    renderAll();
                    navigate('email');
                });

                return;
            }

            renderAll();
            navigate('email');

            return;
        }

        // Mode en ligne : comptes des votants.
        if (online()) {
            var f;

            if (target.closest('[data-voter-register]')) {
                f = voterFields();

                if (!emailValid(f.email)) {
                    voterMsg = { kind: 'error', text: 'Seules les adresses se terminant par @' + EMAIL_DOMAIN + ' peuvent voter.' };
                    renderEmail();
                } else if (f.password.length < 6) {
                    voterMsg = { kind: 'error', text: 'Mot de passe trop court : 6 caractères minimum.' };
                    renderEmail();
                } else {
                    voterAction(window.VoteCloud.registerVoter(f.email, f.password),
                        { kind: 'success', text: 'Compte créé. Un email de confirmation vient d\'être envoyé.' });
                }

                return;
            }

            if (target.closest('[data-voter-google]')) {
                voterAction(window.VoteCloud.signIn(), null);

                return;
            }

            if (target.closest('[data-voter-refresh]')) {
                voterAction(window.VoteCloud.refreshVoter(), function (ok) {
                    if (ok) {
                        navigate('bulletin');

                        return null;
                    }

                    return { kind: 'error', text: 'L\'adresse n\'est pas encore confirmée. Cliquez sur le lien reçu par email, puis réessayez.' };
                });

                return;
            }

            if (target.closest('[data-voter-resend]')) {
                voterAction(window.VoteCloud.resendVerification(),
                    { kind: 'success', text: 'Email de confirmation renvoyé.' });

                return;
            }

            if (target.closest('[data-voter-reset]')) {
                f = voterFields();

                if (!emailValid(f.email)) {
                    voterMsg = { kind: 'error', text: 'Saisissez d\'abord votre adresse @' + EMAIL_DOMAIN + ', puis cliquez sur « Mot de passe oublié ? ».' };
                    renderEmail();
                } else {
                    voterAction(window.VoteCloud.resetPassword(f.email),
                        { kind: 'success', text: 'Un email pour choisir un nouveau mot de passe a été envoyé à ' + f.email + '.' });
                }

                return;
            }
        }

        hit = target.closest('[data-admin-remove]');
        if (hit && online()) {
            var gone = hit.getAttribute('data-admin-remove');

            if (window.confirm('Retirer ' + gone + ' des administrateurs ?')) {
                window.VoteCloud.removeAdmin(gone).then(function () {
                    notice = { kind: 'success', text: gone + ' n\'est plus administrateur.' };
                    renderAdmin();
                });
            }

            return;
        }

        hit = target.closest('[data-cloud-signin]');
        if (hit && online()) {
            window.VoteCloud.signIn();

            return;
        }

        hit = target.closest('[data-admin-logout]');
        if (hit) {
            if (online()) {
                window.VoteCloud.signOut();
            }

            session(ADMIN_SESSION, null);
            renderAdmin();

            return;
        }

        hit = target.closest('[data-admin-export-voters]');
        if (hit) {
            exportVotersCsv();

            return;
        }

        hit = target.closest('[data-admin-clear-indicators]');
        if (hit) {
            if (window.confirm('Effacer tous les indicateurs ?\n\nTous les bulletins, votes et votants des quatre scrutins seront supprimés, et les résultats repartent de zéro. Les candidats sont conservés.')) {
                TYPES.forEach(function (t) { scrutin(t.key).ballots = []; });
                data.voters = {};
                session(VOTER_SESSION, null);
                save();
                notice = { kind: 'success', text: 'Tous les indicateurs ont été remis à zéro.' };
                renderAll();
            }

            return;
        }

        hit = target.closest('[data-admin-reset-results]');
        if (hit) {
            var resetType = typeOf(currentAdmin);

            if (window.confirm('Réinitialiser les résultats de ' + resetType.label + ' ?\n\nTous les bulletins de ce scrutin seront supprimés et ses votants pourront revoter. Les autres scrutins ne changent pas.')) {
                scrutin(resetType.key).ballots = [];
                Object.keys(data.voters).forEach(function (id) {
                    delete data.voters[id].scrutins[resetType.key];
                });
                notice = { kind: 'success', text: 'Résultats de ' + resetType.label + ' remis à zéro.' };
                save();
                renderAll();
            }

            return;
        }

        hit = target.closest('[data-admin-reset-all]');
        if (hit) {
            if (window.confirm('Réinitialiser tout le tableau de bord ?\n\nCandidats, bulletins et votants des quatre scrutins seront définitivement supprimés.')) {
                var keep = data.adminHash;

                data = emptyData();
                data.adminHash = keep;
                editing = null;
                pendingPhoto = null;
                session(VOTER_SESSION, null);
                notice = { kind: 'success', text: 'Le tableau de bord a été réinitialisé.' };
                save();
                renderAll();
            }

            return;
        }

        hit = target.closest('[data-admin-reset-votes]');
        if (hit) {
            if (window.confirm('Effacer tous les bulletins et la liste des votants ? Les candidats sont conservés.')) {
                TYPES.forEach(function (t) { scrutin(t.key).ballots = []; });
                data.voters = {};
                session(VOTER_SESSION, null);
                notice = { kind: 'success', text: 'Bulletins et votants effacés.' };
                save();
                renderAll();
            }

            return;
        }

        hit = target.closest('[data-admin-reset]');
        if (hit) {
            if (window.confirm('Recharger les candidats de démonstration ? Les bulletins et votants actuels seront effacés.')) {
                var hash = data.adminHash;

                data = seedData();
                data.adminHash = hash;
                editing = null;
                pendingPhoto = null;
                session(VOTER_SESSION, null);
                save();
                renderAll();
            }
        }
    });

    document.addEventListener('submit', function (event) {
        var voterForm = event.target.closest('[data-voter-form]');

        if (voterForm && online()) {
            event.preventDefault();

            var vf = voterFields();

            voterAction(window.VoteCloud.loginVoter(vf.email, vf.password), function () {
                if (voterEmail()) {
                    navigate('bulletin');
                }

                return null;
            });

            return;
        }

        var emailForm = event.target.closest('[data-email-form]');

        if (emailForm) {
            event.preventDefault();
            verifyEmail(emailForm);

            return;
        }

        var lock = event.target.closest('[data-admin-lock-form]');

        if (lock) {
            event.preventDefault();
            unlockAdmin(lock);

            return;
        }

        var addAdmin = event.target.closest('[data-admin-add-form]');

        if (addAdmin && online()) {
            event.preventDefault();

            var newEmail = String(addAdmin.elements.email.value || '').trim().toLowerCase();

            window.VoteCloud.addAdmin(newEmail).then(function (ok) {
                notice = ok
                    ? { kind: 'success', text: newEmail + ' est maintenant administrateur.' }
                    : { kind: 'error', text: 'Impossible d\'ajouter cette adresse comme administrateur.' };
                renderAdmin();
            });

            return;
        }

        var codeForm = event.target.closest('[data-admin-code-form]');

        if (codeForm) {
            event.preventDefault();
            changeAdminCode(codeForm);

            return;
        }

        var ballot = event.target.closest('[data-ballot-form]');

        if (ballot) {
            event.preventDefault();
            submitBallot(ballot);

            return;
        }

        var admin = event.target.closest('[data-admin-form]');

        if (admin) {
            event.preventDefault();
            saveCandidate(admin);
        }
    });

    document.addEventListener('change', function (event) {
        var photo = event.target.closest('[data-admin-photo]');

        if (photo) {
            readPhoto(photo.files[0], function (dataUrl) {
                pendingPhoto = dataUrl;
                renderAdmin(true);
            });

            return;
        }

        var expected = event.target.closest('[data-admin-expected]');

        if (expected) {
            scrutin(currentAdmin).expected = Math.max(1, parseInt(expected.value, 10) || 40);
            save();
            renderAll();

            return;
        }

        var max = event.target.closest('[data-admin-max]');

        if (max) {
            scrutin(currentAdmin).max = parseInt(max.value, 10) || 1;
            save();
            renderAll();
        }
    });

    /* -------------------------------------------------------------- rendu */
    function renderAll() {
        renderHome();
        renderEmail();
        renderBallot();
        renderAdmin();

        if (window.PreviewLocks) {
            window.PreviewLocks();
        }

        if (window.PreviewResults && window.PreviewResults.refresh) {
            window.PreviewResults.refresh();
        }
    }

    // Bulletin ou réglage enregistré dans un autre onglet du même navigateur.
    window.addEventListener('storage', function (event) {
        if (event.key === STORAGE_KEY) {
            data = load();
            renderAll();
        }
    });

    /* Parcours obligatoire : Vérification -> Bulletins -> Résultats.
       Renvoie null si l'écran est accessible, sinon l'écran à faire avant
       et le message à afficher. L'administrateur déverrouillé voit tout. */
    function access(panel) {
        if (adminUnlocked()) {
            return null;
        }

        if (panel === 'ecran') {
            return { panel: 'admin', message: 'Le Score live est réservé à l\'administration. Saisissez le code secret.' };
        }

        if ((panel === 'bulletin' || panel === 'resultats') && !voterEmail()) {
            return {
                panel: 'email',
                message: panel === 'bulletin'
                    ? 'Étape 1 : vérifiez votre adresse institutionnelle pour accéder aux bulletins.'
                    : 'Étape 1 : vérifiez votre adresse institutionnelle. Les résultats sont accessibles après le vote.'
            };
        }

        if (panel === 'resultats' && nextUnvoted('') !== null) {
            return { panel: 'bulletin', message: 'Étape 2 : votez pour chaque scrutin ouvert (le vote blanc est possible). Les résultats sont accessibles ensuite.' };
        }

        return null;
    }

    renderAll();

    window.VoteScrutins = {
        types: TYPES,
        data: function () { return data; },
        render: renderAll,
        // Utilisé par js/cloud.js : remplace les données par celles du serveur.
        applyRemote: function (change) {
            change(data);

            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (error) {
                /* rien */
            }

            renderAll();
        },
        voteLink: voteLink,
        access: access
    };
})();
