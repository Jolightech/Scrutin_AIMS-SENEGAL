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
 *  - admins/{uid}    : comptes Google autorisés à administrer.
 * Les règles de sécurité sont dans firestore.rules.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
    getFirestore, doc, collection, onSnapshot, setDoc, getDoc, writeBatch,
    serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
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
    let lastConfigJson = null;

    function currentEmail() {
        try {
            return window.sessionStorage.getItem(VOTER_SESSION) || null;
        } catch (error) {
            return null;
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
                        at: iso(v.at)
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
            try {
                const me = await getDoc(doc(db, 'admins', user.uid));

                admin = me.exists();

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

        watchVoters();
        Scr.render();
    });

    /* --------------------------------------- page -> serveur (écriture) */
    function configOf(data) {
        const out = {};

        TYPES.forEach(function (type) {
            const s = data.scrutins[type];

            out[type] = {
                status: s.status,
                max: s.max || 1,
                expected: parseInt(s.expected, 10) || 40,
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
                const batch = writeBatch(db);

                batch.set(doc(db, 'voters', voterKey(email, type)), {
                    email: email.toLowerCase(),
                    type: type,
                    at: serverTimestamp()
                });
                batch.set(ref, {
                    type: type,
                    choices: ballot.choices,
                    blank: !!ballot.blank,
                    receipt: ballot.receipt,
                    at: serverTimestamp()
                });
                ballot._id = ref.id;

                batch.commit().catch(function (error) {
                    report(error);
                    window.alert(
                        (window.VoteI18n && window.VoteI18n.lang() === 'en')
                            ? 'Your vote could not be saved: this address has already voted in this election, or the election is closed.'
                            : 'Votre vote n\'a pas pu être enregistré : cette adresse a déjà voté à ce scrutin, ou le scrutin est clos.'
                    );
                    Scr.applyRemote(function (d) {
                        if (d.voters[email] && d.voters[email].scrutins[type]) {
                            d.voters[email].scrutins[type].receipt = '—';
                        }
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
                    found[type] = iso(snap.data().at);
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
        sync: sync,
        checkVoter: checkVoter
    };

    document.querySelectorAll('.preview-tag').forEach(function (tag) {
        tag.textContent = 'Données partagées en ligne';
    });

    // La page est déjà rendue en mode local : on bascule en mode en ligne.
    Scr.render();

    const email = currentEmail();

    if (email) {
        checkVoter(email);
    }
}
