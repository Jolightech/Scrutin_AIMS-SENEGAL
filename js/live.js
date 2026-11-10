/**
 * Petits effets du direct — aucun de ces effets ne porte une information a
 * lui seul : ils montrent ce qui vient de changer, puis s'effacent.
 *
 *   VoteLive.text(noeud, valeur)        remplace un texte en le faisant defiler
 *   VoteLive.plus(noeud, '+1')          pastille qui s'envole au-dessus d'un chiffre
 *   VoteLive.reorder(conteneur, fn)     les lignes glissent vers leur nouveau rang
 *                                       (fn modifie « style.order » de chaque ligne)
 *
 * Tout est neutralise si le systeme demande de reduire les animations
 * (prefers-reduced-motion), si l'onglet est en arriere-plan ou si l'element
 * n'est pas affiche : la valeur est alors simplement mise a jour.
 */
(function (window, document) {
    'use strict';

    var motion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    var EASE = 'cubic-bezier(.22, .68, .3, 1)';

    function still(node) {
        return motion.matches || document.hidden || !node || node.offsetParent === null;
    }

    /** Le texte sortant monte et s'efface, le nouveau arrive par le bas. */
    function text(node, value) {
        if (!node) {
            return false;
        }

        value = String(value);

        var current = node.__target !== undefined ? node.__target : node.textContent;

        if (current === value) {
            return false;
        }

        node.__target = value;

        if (node.__swap) {
            node.__swap.onfinish = null;
            node.__swap.cancel();
            node.__swap = null;
        }

        if (still(node) || typeof node.animate !== 'function') {
            node.textContent = value;

            return true;
        }

        // Une transformation n'a pas d'effet sur un element en ligne.
        if (window.getComputedStyle(node).display === 'inline') {
            node.style.display = 'inline-block';
        }

        var leave = node.animate([
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(-38%)', opacity: 0 }
        ], { duration: 110, easing: 'ease-in' });

        node.__swap = leave;
        leave.onfinish = function () {
            node.textContent = value;
            node.__swap = node.animate([
                { transform: 'translateY(42%)', opacity: 0 },
                { transform: 'translateY(0)', opacity: 1 }
            ], { duration: 280, easing: EASE });
        };

        return true;
    }

    /** Pastille « +1 » posee au-dessus du noeud, qui monte et disparait. */
    function plus(anchor, label) {
        if (still(anchor)) {
            return;
        }

        var box = anchor.getBoundingClientRect();
        var chip = document.createElement('span');

        chip.className = 'vote-chip' + (anchor.closest && anchor.closest('.screen') ? ' vote-chip-screen' : '');
        chip.textContent = label || '+1';
        chip.setAttribute('aria-hidden', 'true');
        chip.style.left = (box.left + box.width / 2 + window.pageXOffset) + 'px';
        chip.style.top = (box.top + window.pageYOffset) + 'px';
        document.body.appendChild(chip);

        var remove = function () {
            if (chip.parentNode) {
                chip.parentNode.removeChild(chip);
            }
        };

        chip.addEventListener('animationend', remove);
        window.setTimeout(remove, 1400);
    }

    /**
     * Applique fn (qui change l'ordre des lignes) puis fait glisser chaque
     * ligne de son ancienne place a la nouvelle. Une ligne qui monte recoit
     * la classe is-up pendant 2,6 s (petite fleche a cote du rang), une
     * ligne qui descend la classe is-down.
     */
    function reorder(container, apply, selector) {
        var rows = Array.prototype.slice.call(container.querySelectorAll(selector || '.result'));
        var animate = !still(container);
        var before = rows.map(function (row) {
            return {
                top: animate ? row.getBoundingClientRect().top : 0,
                order: row.style.order === '' ? null : parseInt(row.style.order, 10)
            };
        });

        apply();

        rows.forEach(function (row, index) {
            var order = row.style.order === '' ? null : parseInt(row.style.order, 10);
            var was = before[index].order;

            if (was !== null && order !== null && order !== was) {
                var direction = order < was ? 'is-up' : 'is-down';

                row.classList.remove('is-up', 'is-down');
                row.getBoundingClientRect();
                row.classList.add(direction);
                window.clearTimeout(row.__rankTimer);
                row.__rankTimer = window.setTimeout(function () {
                    row.classList.remove('is-up', 'is-down');
                }, 2600);
            }

            if (!animate) {
                return;
            }

            var delta = before[index].top - row.getBoundingClientRect().top;

            if (Math.abs(delta) < 1) {
                return;
            }

            // La ligne qui monte passe au-dessus de celle qu'elle double.
            row.classList.toggle('is-rising', delta > 0);
            row.style.transition = 'none';
            row.style.transform = 'translateY(' + delta + 'px)';
            row.getBoundingClientRect();
            row.style.transition = 'transform .55s ' + EASE;
            row.style.transform = '';

            window.clearTimeout(row.__moveTimer);
            row.__moveTimer = window.setTimeout(function () {
                row.classList.remove('is-rising');
                row.style.transition = '';
            }, 600);
        });
    }

    window.VoteLive = {
        text: text,
        plus: plus,
        reorder: reorder
    };
})(window, document);
