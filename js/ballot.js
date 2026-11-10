/**
 * Bulletin de vote : mise en evidence des choix, respect du nombre maximum
 * de selections et blocage du double envoi.
 * Le formulaire reste entierement fonctionnel sans JavaScript (la validation
 * definitive est faite cote serveur).
 *
 * VoteBallot.bind(form) permet de (re)lier un bulletin rendu dynamiquement,
 * par exemple quand le votant passe d'un scrutin a l'autre (js/scrutins.js).
 */
(function () {
    'use strict';

    function bind(form) {
        if (!form || form.__ballotBound) {
            return;
        }

        form.__ballotBound = true;

        var max = Math.max(1, parseInt(form.getAttribute('data-max') || '1', 10));
        var abstain = form.querySelector('[data-abstain]');
        var counter = form.querySelector('[data-counter]');
        var submit = form.querySelector('[data-submit]');

        function choices() {
            return Array.prototype.slice.call(
                form.querySelectorAll('input[name="candidates[]"]')
            );
        }

        function card(input) {
            return input.closest('.choice');
        }

        function sync() {
            var all = choices();

            if (abstain && abstain.checked) {
                all.forEach(function (input) {
                    input.checked = false;
                });
            }

            var selected = all.filter(function (input) {
                return input.checked;
            });

            all.forEach(function (input) {
                var box = card(input);

                if (box) {
                    box.classList.toggle('is-selected', input.checked);
                }

                // Les boutons radio gerent l'exclusivite tout seuls.
                if (input.type === 'checkbox') {
                    input.disabled = !input.checked && selected.length >= max;
                }
            });

            if (abstain) {
                var abstainCard = card(abstain);

                if (abstainCard) {
                    abstainCard.classList.toggle('is-selected', abstain.checked);
                }

                abstain.disabled = selected.length > 0;
            }

            if (counter) {
                counter.textContent = selected.length + ' / ' + max;
            }

            if (submit) {
                submit.disabled = selected.length === 0 && !(abstain && abstain.checked);
            }
        }

        form.addEventListener('change', sync);

        form.addEventListener('submit', function () {
            // Desactive apres l'envoi pour ne pas perdre la valeur du bouton.
            window.setTimeout(function () {
                if (submit) {
                    submit.disabled = true;
                    submit.textContent = 'Envoi en cours…';
                }
            }, 0);
        });

        sync();
    }

    window.VoteBallot = { bind: bind };

    // Liaison automatique des bulletins deja presents dans la page (Blade).
    Array.prototype.slice.call(document.querySelectorAll('[data-ballot]')).forEach(bind);
})();
