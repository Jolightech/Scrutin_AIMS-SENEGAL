/**
 * Données partagées en ligne (Firebase Firestore + connexion Google pour
 * l'administration).
 *
 * Sans configuration (js/firebase-config.js vide), la plateforme reste en
 * mode local : tout est gardé dans le navigateur, comme avant.
 *
 * Avec configuration :
 *  - config/scrutins : état, nombre de choix, inscrits et candidats des
 *    quatre scrutins (écriture réservée à l'administration) ;
 *  - ballots/{id}    : un document par bulletin, SANS adresse email
 *    (lecture publique pour les résultats en direct) ;
 *  - voters/{email__type} : liste d'émargement, créée en même temps que le
 *    bulletin ; un second vote au même scrutin est refusé par les règles
 *    de sécurité (création seulement, jamais de modification) ;
 *  - tallies/{type}  : compteur de bulletins ; chaque vote l'augmente de 1
 *    et désigne son bulletin, ce qui interdit d'ajouter plusieurs bulletins
 *    en une seule écriture.
 * Pour voter, il faut un compte dont l'adresse @aims-senegal.org a été
 * confirmée (lien reçu par email) ou un compte Google à cette adresse.
 *  - admins/{uid}    : comptes Google autorisés à administrer.
 * Les règles de sécurité sont dans firestore.rules.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
    getFirestore, doc, collection, onSnapshot, setDoc, getDoc, writeBatch,
    runTransaction, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendEmailVerification, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

const config = window.FIREBASE_CONFIG;
const Scr = window.VoteScrutins;

if (config && config.projectId && Scr) {
    start();
}

function start() {
    const app = initializeApp(config);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const TYPES = Scr.types.map((t) => t.key);
    const VOTER_SESSION = 'aims.vote.voter';

    const remote = { config: null, ballots: {}, voters: {} };
    let user = null;
    let admin = false;
    let ready = { config: false, ballots: false };
    let stopVoters = null;
    let stopAdmins = null;
    let adminEmails = [];
    let lastConfigJson = null;

    // Seule une adresse @aims-senegal.org confirmée peut voter.
    const INSTITUTIONAL = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*aims-senegal\.org$/;

    function voterState() {
        if (!user) {
            return { state: 'none', email: null };
        }

        const email = String(user.email || '').toLowerCase();

        if (!INSTITUTIONAL.test(email)) {
            return { state: 'wrong-domain', email: email };
        }

        if (!user.emailVerified) {
            return { state: 'unverified', email: email };
        }

        return { state: 'ok', email: email };
    }

    function currentEmail() {
        const v = voterState();

        return v.state === 'ok' ? v.email : null;
    }

    function syncSession() {
        try {
            const email = currentEmail();

            if (email) {
                window.sessionStorage.setItem(VOTER_SESSION, email);
            } else {
                window.sessionStorage.removeItem(VOTER_SESSION);
            }
        } catch (error) {
            /* rien */
        }
    }

    function iso(value) {
        if (value instanceof Timestamp) {
            return value.toDate().toISOString();
        }

        return value || new Date().toISOString();
    }

    function voterKey(email, type) {
        return email.toLowerCase() + '__' + type;
    }

    /* --------------------------------------- serveur -> page (lecture) */
    function apply() {
        if (!ready.config || !ready.ballots) {
            return;
        }

        Scr.applyRemote(function (data) {
            const cfg = remote.config || {};

            TYPES.forEach(function (type) {
                const c = cfg[type] || { status: 'draft', max: 1, expected: 40, candidates: [] };

                data.scrutins[type] = {
                    status: c.status || 'draft',
                    max: c.max || 1,
                    expected: c.expected || 40,
                    candidates: Array.isArray(c.candidates) ? c.candidates : [],
                    ballots: []
                };
            });

            Object.keys(remote.ballots).forEach(function (id) {
                const b = remote.ballots[id];

                if (data.scrutins[b.type]) {
                    data.scrutins[b.type].ballots.push({
                        _id: id,
                        choices: b.choices || [],
                        blank: !!b.blank,
                        receipt: b.receipt || '',
                        at: iso(b.at)
                    });
                }
            });

            TYPES.forEach(function (type) {
                data.scrutins[type].ballots.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
            });

            if (admin) {
                // Liste d'émargement complète, pour l'administration.
                const voters = {};

                Object.keys(remote.voters).forEach(function (key) {
                    const v = remote.voters[key];
                    const email = String(v.email || '').toLowerCase();

                    voters[email] = voters[email] || { email: email, scrutins: {} };
                    voters[email].scrutins[v.type] = {
                        receipt: (data.voters[email] && data.voters[email].scrutins[v.type] || {}).receipt || '—',
                        at: v.at ? iso(v.at) : ''
                    };
                });

                // On garde les reçus du votant de cet appareil.
                const me = currentEmail();

                if (me && data.voters[me]) {
                    voters[me] = voters[me] || { email: me, scrutins: {} };
                    Object.keys(data.voters[me].scrutins).forEach(function (type) {
                        if (voters[me].scrutins[type]) {
                            voters[me].scrutins[type].receipt = data.voters[me].scrutins[type].receipt;
                        }
                    });
                }

                data.voters = voters;
            }
        });

        lastConfigJson = JSON.stringify(configOf(Scr.data()));

        // Ancienne configuration sans liste d'identifiants (lue par les règles) :
        // l'administration la complète automatiquement.
        if (admin && remote.config && TYPES.some(function (type) {
            return !remote.config[type] || !Array.isArray(remote.config[type].ids);
        })) {
            setDoc(doc(db, 'config', 'scrutins'), configOf(Scr.data())).catch(report);
        }
    }

    onSnapshot(doc(db, 'config', 'scrutins'), function (snap) {
        remote.config = snap.exists() ? snap.data() : null;
        ready.config = true;
        apply();
    }, report);

    onSnapshot(collection(db, 'ballots'), function (snap) {
        remote.ballots = {};
        snap.forEach(function (d) { remote.ballots[d.id] = d.data(); });
        ready.ballots = true;
        apply();
    }, report);

    function watchVoters() {
        if (stopVoters) {
            stopVoters();
            stopVoters = null;
        }

        if (!admin) {
            remote.voters = {};

            return;
        }

        stopVoters = onSnapshot(collection(db, 'voters'), function (snap) {
            remote.voters = {};
            snap.forEach(function (d) { remote.voters[d.id] = d.data(); });
            apply();
        }, report);
    }

    /* -------------------------------------- administration (Google) */
    onAuthStateChanged(auth, async function (next) {
        user = next;
        admin = false;

        if (user) {
            // Adresse confirmée depuis un autre onglet ou un autre appareil :
            // on recharge le compte et on renouvelle le jeton.
            try {
                if (!user.emailVerified) {
                    await user.reload();
                    user = auth.currentUser;
                }

                if (user && user.emailVerified) {
                    const token = await user.getIdTokenResult();

                    if (!token.claims.email_verified) {
                        await user.getIdToken(true);
                    }
                }
            } catch (error) {
                report(error);
            }
        }

        if (user) {
            try {
                const me = await getDoc(doc(db, 'admins', user.uid));

                admin = me.exists();

                // Administrateur ajouté par adresse email (compte Google vérifié).
                if (!admin && user.email && user.emailVerified) {
                    try {
                        const byEmail = await getDoc(doc(db, 'adminEmails', user.email.toLowerCase()));

                        admin = byEmail.exists();
                    } catch (error) {
                        admin = false;
                    }
                }

                // Premier administrateur : le premier compte connecté réclame
                // l'administration tant que personne ne l'a fait.
                if (!admin) {
                    const claimed = await getDoc(doc(db, 'config', 'owner'));

                    if (!claimed.exists()) {
                        const batch = writeBatch(db);

                        batch.set(doc(db, 'admins', user.uid), { email: user.email || '', at: serverTimestamp() });
                        batch.set(doc(db, 'config', 'owner'), { uid: user.uid, at: serverTimestamp() });
                        await batch.commit();
                        admin = true;
                    }
                }
            } catch (error) {
                report(error);
            }
        }

        syncSession();
        watchVoters();
        watchAdmins();
        Scr.render();

        if (currentEmail()) {
            checkVoter(currentEmail());
        }
    });

    function watchAdmins() {
        if (stopAdmins) {
            stopAdmins();
            stopAdmins = null;
        }

        adminEmails = [];

        if (!admin) {
            return;
        }

        stopAdmins = onSnapshot(collection(db, 'adminEmails'), function (snap) {
            adminEmails = [];
            snap.forEach(function (d) { adminEmails.push(d.id); });
            adminEmails.sort();
            Scr.render();
        }, report);
    }

    async function addAdmin(email) {
        const id = String(email || '').trim().toLowerCase();

        if (!admin || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(id)) {
            return false;
        }

        try {
            await setDoc(doc(db, 'adminEmails', id), { email: id, by: (user && user.email) || '', at: serverTimestamp() });

            return true;
        } catch (error) {
            report(error);

            return false;
        }
    }

    async function removeAdmin(email) {
        if (!admin) {
            return false;
        }

        try {
            const batch = writeBatch(db);

            batch.delete(doc(db, 'adminEmails', String(email).toLowerCase()));
            await batch.commit();

            return true;
        } catch (error) {
            report(error);

            return false;
        }
    }

    /* --------------------------------------- page -> serveur (écriture) */
    function configOf(data) {
        const out = {};

        TYPES.forEach(function (type) {
            const s = data.scrutins[type];

            out[type] = {
                status: s.status,
                max: s.max || 1,
                expected: parseInt(s.expected, 10) || 40,
                // Liste des identifiants, lue par les règles de sécurité.
                ids: s.candidates.map(function (c) { return c.id; }),
                candidates: s.candidates.map(function (c) {
                    const copy = { id: c.id, name: c.name, slogan: c.slogan || '', prog: c.prog || '' };

                    if (c.photo) {
                        copy.photo = c.photo;
                    }

                    return copy;
                })
            };
        });

        return out;
    }

    async function sync(data) {
        if (!ready.config || !ready.ballots) {
            return;
        }

        // 1. Réglages et candidats (administration).
        const cfg = configOf(data);
        const json = JSON.stringify(cfg);

        if (admin && json !== lastConfigJson) {
            lastConfigJson = json;
            setDoc(doc(db, 'config', 'scrutins'), cfg).catch(report);
        }

        // 2. Nouveaux bulletins : bulletin anonyme + émargement, ensemble.
        const email = currentEmail();

        for (const type of TYPES) {
            for (const ballot of data.scrutins[type].ballots) {
                if (ballot._id || ballot._sending) {
                    continue;
                }

                if (!email) {
                    continue;
                }

                ballot._sending = true;

                const ref = doc(collection(db, 'ballots'));
                const tallyRef = doc(db, 'tallies', type);
                const voterRef = doc(db, 'voters', voterKey(email, type));

                ballot._id = ref.id;

                // Bulletin + émargement + compteur, ensemble (transaction).
                runTransaction(db, async function (tx) {
                    const tally = await tx.get(tallyRef);
                    const n = tally.exists() ? (tally.data().n || 0) : 0;

                    tx.set(voterRef, { email: email, type: type });
                    tx.set(ref, {
                        type: type,
                        choices: ballot.choices,
                        blank: !!ballot.blank,
                        receipt: ballot.receipt,
                        at: serverTimestamp()
                    });
                    tx.set(tallyRef, { n: n + 1, last: ref.id });
                }).catch(async function (error) {
                    report(error);

                    // A-t-il vraiment déjà voté (autre appareil) ? Sinon, on
                    // annule le vote local pour qu'il puisse réessayer.
                    let already = false;

                    try {
                        already = (await getDoc(voterRef)).exists();
                    } catch (e) {
                        already = false;
                    }

                    const en = window.VoteI18n && window.VoteI18n.lang() === 'en';

                    window.alert(already
                        ? (en ? 'You have already voted in this election.' : 'Vous avez déjà voté à ce scrutin.')
                        : (en ? 'Your vote could not be saved (connection lost or election closed). Please try again.'
                              : 'Votre vote n\'a pas pu être enregistré (connexion perdue ou scrutin clos). Réessayez.'));

                    Scr.applyRemote(function (d) {
                        const record = d.voters[email];

                        if (!record) {
                            return;
                        }

                        if (already) {
                            record.scrutins[type] = { receipt: '—', at: '' };
                        } else {
                            delete record.scrutins[type];
                        }

                        d.scrutins[type].ballots = d.scrutins[type].ballots.filter(function (b) { return b._id !== ref.id; });
                    });
                    apply();
                });
            }
        }

        if (!admin) {
            return;
        }

        // 3. Bulletins effacés par l'administration.
        const kept = {};

        TYPES.forEach(function (type) {
            data.scrutins[type].ballots.forEach(function (b) {
                if (b._id) {
                    kept[b._id] = true;
                }
            });
        });

        const removeBallots = Object.keys(remote.ballots).filter(function (id) { return !kept[id]; });

        // 4. Émargements effacés par l'administration.
        const keptVoters = {};

        Object.keys(data.voters || {}).forEach(function (email) {
            Object.keys(data.voters[email].scrutins || {}).forEach(function (type) {
                keptVoters[voterKey(email, type)] = true;
            });
        });

        const removeVoters = Object.keys(remote.voters).filter(function (key) { return !keptVoters[key]; });
        const refs = removeBallots.map(function (id) { return doc(db, 'ballots', id); })
            .concat(removeVoters.map(function (key) { return doc(db, 'voters', key); }));

        for (let i = 0; i < refs.length; i += 400) {
            const batch = writeBatch(db);

            refs.slice(i, i + 400).forEach(function (ref) { batch.delete(ref); });
            batch.commit().catch(report);
        }
    }

    // Votant de cet appareil : a-t-il déjà voté (depuis un autre appareil) ?
    async function checkVoter(email) {
        if (!email) {
            return;
        }

        const found = {};

        await Promise.all(TYPES.map(async function (type) {
            try {
                const snap = await getDoc(doc(db, 'voters', voterKey(email, type)));

                if (snap.exists()) {
                    found[type] = '';
                }
            } catch (error) {
                report(error);
            }
        }));

        Scr.applyRemote(function (data) {
            const id = email.toLowerCase();

            data.voters[id] = data.voters[id] || { email: id, scrutins: {} };

            Object.keys(found).forEach(function (type) {
                if (!data.voters[id].scrutins[type]) {
                    data.voters[id].scrutins[type] = { receipt: '—', at: found[type] };
                }
            });
        });
    }

    /* ------------------------------------ comptes des votants (email) */
    function lang() {
        return (window.VoteI18n && window.VoteI18n.lang() === 'en') ? 'en' : 'fr';
    }

    function backUrl() {
        return window.location.origin + window.location.pathname + '#email';
    }

    function authMessage(error) {
        const fr = {
            'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse : utilisez « Se connecter ».',
            'auth/invalid-credential': 'Adresse ou mot de passe incorrect.',
            'auth/wrong-password': 'Adresse ou mot de passe incorrect.',
            'auth/user-not-found': 'Aucun compte avec cette adresse : utilisez « Créer mon compte ».',
            'auth/weak-password': 'Mot de passe trop court : 6 caractères minimum.',
            'auth/invalid-email': 'Adresse email invalide.',
            'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
            'auth/network-request-failed': 'Pas de connexion internet. Réessayez.',
            'auth/popup-closed-by-user': 'Connexion annulée.'
        };
        const en = {
            'auth/email-already-in-use': 'An account already exists with this address: use “Sign in”.',
            'auth/invalid-credential': 'Wrong email or password.',
            'auth/wrong-password': 'Wrong email or password.',
            'auth/user-not-found': 'No account with this address: use “Create my account”.',
            'auth/weak-password': 'Password too short: at least 6 characters.',
            'auth/invalid-email': 'Invalid email address.',
            'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
            'auth/network-request-failed': 'No internet connection. Try again.',
            'auth/popup-closed-by-user': 'Sign-in cancelled.'
        };
        const table = lang() === 'en' ? en : fr;

        return table[error && error.code] || ((lang() === 'en' ? 'Error: ' : 'Erreur : ') + ((error && error.message) || error));
    }

    async function registerVoter(email, password) {
        email = String(email || '').trim().toLowerCase();

        if (!INSTITUTIONAL.test(email)) {
            throw new Error(lang() === 'en'
                ? 'Only addresses ending with @aims-senegal.org can vote.'
                : 'Seules les adresses se terminant par @aims-senegal.org peuvent voter.');
        }

        const cred = await createUserWithEmailAndPassword(auth, email, password);

        auth.languageCode = lang();
        await sendEmailVerification(cred.user, { url: backUrl() });
    }

    async function loginVoter(email, password) {
        email = String(email || '').trim().toLowerCase();
        await signInWithEmailAndPassword(auth, email, password);
    }

    async function resendVerification() {
        if (user && !user.emailVerified) {
            auth.languageCode = lang();
            await sendEmailVerification(user, { url: backUrl() });
        }
    }

    // Après le clic sur le lien reçu par email : recharge l'état du compte.
    async function refreshVoter() {
        if (!user) {
            return false;
        }

        await user.reload();
        user = auth.currentUser;

        if (user && user.emailVerified) {
            await user.getIdToken(true);
        }

        syncSession();
        Scr.render();

        if (currentEmail()) {
            await checkVoter(currentEmail());
        }

        return !!currentEmail();
    }

    async function resetPassword(email) {
        email = String(email || '').trim().toLowerCase();
        auth.languageCode = lang();
        await sendPasswordResetEmail(auth, email, { url: backUrl() });
    }

    function report(error) {
        if (window.console) {
            window.console.error('[Firebase]', error);
        }
    }

    window.VoteCloud = {
        active: function () { return true; },
        isAdmin: function () { return admin; },
        user: function () { return user; },
        signIn: function () {
            return signInWithPopup(auth, new GoogleAuthProvider()).catch(function (error) {
                report(error);
                window.alert((window.VoteI18n && window.VoteI18n.lang() === 'en')
                    ? 'Sign-in failed: ' + error.message
                    : 'Connexion impossible : ' + error.message);
            });
        },
        signOut: function () { return signOut(auth); },
        voterState: voterState,
        voterEmail: currentEmail,
        registerVoter: registerVoter,
        loginVoter: loginVoter,
        resendVerification: resendVerification,
        refreshVoter: refreshVoter,
        resetPassword: resetPassword,
        authMessage: authMessage,
        sync: sync,
        checkVoter: checkVoter,
        adminEmails: function () { return adminEmails.slice(); },
        addAdmin: addAdmin,
        removeAdmin: removeAdmin
    };

    document.querySelectorAll('.preview-tag').forEach(function (tag) {
        tag.textContent = 'Données partagées en ligne';
    });

    // La page est déjà rendue en mode local : on bascule en mode en ligne.
    Scr.render();

    // Retour depuis le lien de confirmation (…#email) : on recharge l'état.
    window.addEventListener('focus', function () {
        if (user && !user.emailVerified) {
            refreshVoter().catch(report);
        }
    });
}
