/**
 * Graphiques du vote — rendu SVG/HTML sans aucune bibliotheque.
 *
 *   VoteChart.render(noeud, timeline)   courbe d'evolution des voix (API inchangee)
 *   VoteChart.ring(noeud, { value, total })   anneau de participation
 *   VoteChart.share(noeud, timeline)    bande de repartition des voix
 *   VoteChart.pace(noeud, timeline)     rythme du vote (voix par tranche)
 *   VoteChart.table(noeud, timeline)    tableau des donnees (equivalent accessible)
 *
 * « timeline » est l'objet deja renvoye par le serveur :
 *   { has_data, labels[], max, folded, series[{ id, name, slot, points[] }] }
 * share(), pace() et table() le relisent tel quel : aucun changement cote
 * serveur n'est necessaire pour les afficher.
 *
 * Les couleurs sont lues sur les variables CSS du conteneur (--s1 … --s8,
 * --s-other, --chart-*), ce qui permet au mode videoprojecteur d'utiliser
 * ses propres teintes sans dupliquer de code ici.
 *
 * Regles de lecture appliquees :
 *  - une couleur par candidat, attribuee par le serveur selon sa position
 *    dans le scrutin : un candidat qui double un autre ne change pas de teinte ;
 *  - legende toujours presente, et nom ecrit en bout de courbe des que la
 *    largeur le permet : l'identite ne repose jamais sur la couleur seule ;
 *  - texte en encre neutre, jamais dans la couleur de la serie ;
 *  - grille discrete en traits pleins, courbes fines, marqueur sur le dernier
 *    point seulement ;
 *  - survol ET clavier (fleches gauche/droite) donnent les memes valeurs ;
 *  - a chaque nouvelle donnee, les traces glissent vers leur nouvelle valeur
 *    (0,65 s) au lieu de sauter ; rien ne bouge si le systeme demande de
 *    reduire les animations (prefers-reduced-motion) ;
 *  - les noms de candidats sont inseres avec textContent, jamais innerHTML.
 */
(function (window, document) {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var LOCALE = 'fr-FR';

    /* ------------------------------------------------------------ outils */

    function svgEl(name, attrs, text) {
        var node = document.createElementNS(NS, name);

        for (var key in attrs) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
                node.setAttribute(key, String(attrs[key]));
            }
        }

        if (text !== undefined) {
            node.textContent = String(text);
        }

        return node;
    }

    function htmlEl(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = String(text);
        }

        return node;
    }

    function cssVar(node, name, fallback) {
        var value = window.getComputedStyle(node).getPropertyValue(name);

        return (value && value.trim()) || fallback;
    }

    function cssNum(node, name, fallback) {
        var value = parseFloat(cssVar(node, name, ''));

        return isNaN(value) ? fallback : value;
    }

    function colorOf(root, slot) {
        if (!slot) {
            return cssVar(root, '--s-other', '#8d8580');
        }

        return cssVar(root, '--s' + slot, '#2a78d6');
    }

    function fmtInt(value) {
        return Number(value).toLocaleString(LOCALE);
    }

    function fmtPct(ratio) {
        return (ratio * 100).toLocaleString(LOCALE, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }) + ' %';
    }

    function plural(count, singular, pluralForm) {
        return fmtInt(count) + ' ' + (count > 1 ? pluralForm : singular);
    }

    /** Pas d'axe « rond » (1, 2, 5, 10, 20, 50 …) couvrant la valeur max. */
    function niceStep(max, targetTicks) {
        var raw = Math.max(1, max) / Math.max(1, targetTicks);
        var magnitude = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var residual = raw / magnitude;
        var step;

        if (residual > 5) {
            step = 10 * magnitude;
        } else if (residual > 2) {
            step = 5 * magnitude;
        } else if (residual > 1) {
            step = 2 * magnitude;
        } else {
            step = magnitude;
        }

        return Math.max(1, Math.round(step));
    }

    function truncate(text, max) {
        text = String(text);

        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    /** Positions d'etiquettes regulierement espacees, premiere et derniere incluses. */
    function pickTicks(count, maxTicks) {
        if (count <= 1) {
            return [0];
        }

        var wanted = Math.max(2, Math.min(count, maxTicks));
        var picked = [];

        for (var i = 0; i < wanted; i++) {
            var index = Math.round((i * (count - 1)) / (wanted - 1));

            if (picked.indexOf(index) === -1) {
                picked.push(index);
            }
        }

        return picked;
    }

    /** Noir ou blanc selon la luminance du fond (texte pose sur un aplat). */
    function inkOn(color) {
        var hex = String(color).trim().replace('#', '');

        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }

        if (!/^[0-9a-f]{6}$/i.test(hex)) {
            return '#ffffff';
        }

        var channels = [0, 2, 4].map(function (offset) {
            var value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        var luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

        return luminance > 0.4 ? '#0b0b0b' : '#ffffff';
    }

    /** Courbe lisse qui ne depasse jamais les points (interpolation monotone). */
    function monotonePath(points) {
        var n = points.length;

        if (!n) {
            return '';
        }

        var d = 'M' + points[0][0].toFixed(1) + ',' + points[0][1].toFixed(1);

        if (n === 1) {
            return d;
        }

        var dx = [];
        var slope = [];
        var i;

        for (i = 0; i < n - 1; i++) {
            dx.push(points[i + 1][0] - points[i][0]);
            slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
        }

        var tangent = [slope[0]];

        for (i = 1; i < n - 1; i++) {
            if (slope[i - 1] * slope[i] <= 0) {
                tangent.push(0);
            } else {
                var common = dx[i - 1] + dx[i];

                tangent.push((3 * common) / (
                    (common + dx[i]) / slope[i - 1] + (common + dx[i - 1]) / slope[i]
                ));
            }
        }

        tangent.push(slope[n - 2]);

        for (i = 0; i < n - 1; i++) {
            var third = dx[i] / 3;

            d += 'C' + (points[i][0] + third).toFixed(1) + ',' + (points[i][1] + tangent[i] * third).toFixed(1)
                + ' ' + (points[i + 1][0] - third).toFixed(1) + ',' + (points[i + 1][1] - tangent[i + 1] * third).toFixed(1)
                + ' ' + points[i + 1][0].toFixed(1) + ',' + points[i + 1][1].toFixed(1);
        }

        return d;
    }

    function totalsOf(timeline) {
        return timeline.labels.map(function (label, index) {
            return timeline.series.reduce(function (sum, serie) {
                return sum + (serie.points[index] || 0);
            }, 0);
        });
    }

    function lastOf(serie) {
        return serie.points.length ? serie.points[serie.points.length - 1] : 0;
    }

    function hasData(timeline) {
        return !!(timeline && timeline.has_data && timeline.labels && timeline.labels.length);
    }

    /* ------------------------------------------------------------ mouvement */

    var motion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    var raf = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (callback) { return window.setTimeout(function () { callback(Date.now()); }, 16); };
    var caf = window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout;
    var DURATION = 650;

    function isShown(node) {
        return !!(node && node.offsetParent !== null);
    }

    /** Copie legere de ce qui vient d'etre dessine : point de depart du prochain glissement. */
    function snapshot(timeline) {
        return {
            labels: timeline.labels.slice(),
            max: timeline.max,
            series: timeline.series.map(function (serie) {
                return { id: serie.id, points: serie.points.slice() };
            })
        };
    }

    /** Glissement possible : meme origine, et au plus une tranche de temps en plus. */
    function tweenable(from, to) {
        if (!from || !hasData(to) || motion.matches || document.hidden) {
            return false;
        }

        var before = from.labels.length;
        var after = to.labels.length;

        return before >= 2 && (after === before || after === before + 1)
            && from.labels[0] === to.labels[0]
            && from.series.length === to.series.length;
    }

    /**
     * Etat intermediaire entre deux timelines. rows : valeurs interpolees ;
     * last : position (fractionnaire) du dernier point, qui « sort » du
     * precedent quand une tranche vient de s'ouvrir.
     */
    function blend(to, tween) {
        var count = to.labels.length;

        if (!tween) {
            return {
                rows: to.series.map(function (serie) { return serie.points; }),
                last: count - 1,
                max: to.max
            };
        }

        var from = tween.from;
        var t = tween.t;
        var before = from.labels.length;
        var known = {};

        from.series.forEach(function (serie) {
            known[serie.id] = serie.points;
        });

        return {
            rows: to.series.map(function (serie) {
                var old = known[serie.id];

                return serie.points.map(function (value, index) {
                    var start = old ? (old[Math.min(index, before - 1)] || 0) : 0;

                    return start + (value - start) * t;
                });
            }),
            last: (before - 1) + (count - before) * t,
            max: from.max + (to.max - from.max) * t
        };
    }

    /** Series dont le dernier point a monte : elles recoivent une impulsion. */
    function risers(from, to) {
        var known = {};

        from.series.forEach(function (serie) {
            known[serie.id] = lastOf(serie);
        });

        return to.series.filter(function (serie) {
            return lastOf(serie) > (known[serie.id] || 0);
        }).map(function (serie) {
            return serie.id;
        });
    }

    /** Joue le glissement : draw(root, to, { from, t }) a chaque image, puis le trace final. */
    function play(root, from, to, draw) {
        if (root.__raf) {
            caf(root.__raf);
        }

        var start = null;
        var pings = risers(from, to);

        function frame(now) {
            if (start === null) {
                start = now;
            }

            var linear = Math.min(1, (now - start) / DURATION);

            if (linear < 1) {
                draw(root, to, { from: from, t: 1 - Math.pow(1 - linear, 3) });
                root.__raf = raf(frame);
            } else {
                root.__raf = 0;
                draw(root, to, null, pings);
            }
        }

        root.__raf = raf(frame);
    }

    /**
     * Pose le SVG dans le conteneur. Tant que la « cle » (liste des series)
     * ne change pas, seul le SVG est remplace : legende et infobulle restent.
     */
    function mount(root, svg, key, extras) {
        if (root.__svg && root.__svg.parentNode === root && root.__key === key) {
            root.replaceChild(svg, root.__svg);
        } else {
            root.textContent = '';
            root.appendChild(svg);
            root.__key = key;
            extras();
        }

        root.__svg = svg;
    }

    /** Remplace un texte, en le faisant defiler si VoteLive est charge. */
    function setText(node, value) {
        if (window.VoteLive && window.VoteLive.text) {
            window.VoteLive.text(node, value);
        } else {
            node.textContent = value;
        }
    }

    /* --------------------------------------- redessin quand la largeur change */

    var watched = [];

    var observer = window.ResizeObserver ? new window.ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            var root = entry.target;
            var width = Math.round(entry.contentRect.width);

            if (width && width !== root.__width && typeof root.__redraw === 'function') {
                root.__redraw();
            }
        });
    }) : null;

    function watch(root, redraw) {
        root.__redraw = redraw;

        if (root.__watched) {
            return;
        }

        root.__watched = true;
        watched.push(root);

        if (observer) {
            observer.observe(root);
        }
    }

    /** Largeur utile ; 0 quand le conteneur est masque (onglet inactif). */
    function widthOf(root) {
        var width = Math.round(root.clientWidth || 0);

        root.__width = width;

        if (!width) {
            return observer ? 0 : 640;
        }

        return Math.max(240, width);
    }

    /* ------------------------------------------------------------ infobulle */

    function makeTooltip(root) {
        var tip = htmlEl('div', 'chart-tooltip');

        tip.hidden = true;
        tip.setAttribute('role', 'status');
        root.appendChild(tip);

        return tip;
    }

    /** rows : [{ color, name, value, key: 'line' | 'box' }] — la valeur domine. */
    function fillTooltip(tip, title, rows) {
        tip.textContent = '';

        if (title) {
            tip.appendChild(htmlEl('div', 'chart-tooltip-title', title));
        }

        rows.forEach(function (row) {
            var line = htmlEl('div', 'chart-tooltip-row');

            if (row.color) {
                var key = htmlEl('i', row.key === 'box' ? 'chart-swatch' : 'chart-key');

                key.style.background = row.color;
                line.appendChild(key);
            }

            line.appendChild(htmlEl('span', '', row.name));
            line.appendChild(htmlEl('b', '', row.value));
            tip.appendChild(line);
        });
    }

    /** Place l'infobulle a cote du point vise, sans la laisser sortir du cadre. */
    function placeTooltip(root, tip, x, y) {
        tip.hidden = false;

        var rootWidth = root.clientWidth;
        var left = x + 14;

        if (left + tip.offsetWidth > rootWidth - 4) {
            left = x - 14 - tip.offsetWidth;
        }

        left = Math.max(4, Math.min(rootWidth - tip.offsetWidth - 4, left));

        tip.style.left = left + 'px';
        tip.style.top = Math.max(0, y) + 'px';
    }

    /**
     * Survol et clavier communs a la courbe et aux colonnes : la position la
     * plus proche du pointeur est retenue, on ne vise jamais un trait de 2 px.
     */
    function bindIndexed(root, svg, options) {
        var current = -1;

        function show(index) {
            current = Math.max(0, Math.min(options.count - 1, index));
            root.__hovering = true;
            options.show(current);
        }

        function hide() {
            current = -1;
            root.__hovering = false;
            options.hide();

            // Les donnees arrivees pendant le survol sont dessinees maintenant.
            if (root.__stale && typeof root.__redraw === 'function') {
                root.__stale = false;
                root.__redraw();
            }
        }

        function locate(event) {
            var box = svg.getBoundingClientRect();
            var x = (event.clientX - box.left) * (options.width / box.width);

            return options.indexAt(x);
        }

        svg.addEventListener('pointermove', function (event) {
            show(locate(event));
        });
        svg.addEventListener('pointerdown', function (event) {
            show(locate(event));
        });
        svg.addEventListener('pointerleave', hide);
        svg.addEventListener('pointercancel', hide);

        svg.setAttribute('tabindex', '0');
        svg.addEventListener('focus', function () {
            if (current === -1 && svg.matches(':focus-visible')) {
                show(options.count - 1);
            }
        });
        svg.addEventListener('blur', hide);
        svg.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                show((current === -1 ? options.count - 1 : current) + (event.key === 'ArrowRight' ? 1 : -1));
            } else if (event.key === 'Home') {
                event.preventDefault();
                show(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                show(options.count - 1);
            } else if (event.key === 'Escape') {
                hide();
            }
        });
    }

    function showEmpty(root, message) {
        root.__svg = null;
        root.__key = null;
        root.textContent = '';
        root.appendChild(htmlEl('p', 'chart-empty', message));
        root.setAttribute('data-signature', 'empty');
    }

    function signature(timeline) {
        var parts = [timeline.labels.length, timeline.max];

        timeline.series.forEach(function (serie) {
            parts.push(serie.id, lastOf(serie));
        });

        return parts.join('|');
    }

    /* =========================================================== 1. Courbe */

    function drawLine(root, timeline, tween, pings) {
        if (!hasData(timeline) || timeline.labels.length < 2) {
            showEmpty(root, 'La courbe apparaîtra dès les premiers votes.');

            return;
        }

        var width = widthOf(root);

        if (!width) {
            return;
        }

        var compact = width < 560;
        var font = cssNum(root, '--chart-font', 12.5);
        var stroke = cssNum(root, '--chart-stroke', 2);
        var height = parseInt(root.getAttribute('data-height') || '0', 10) || (compact ? 240 : 320);

        var ink = cssVar(root, '--chart-ink', '#231f20');
        var muted = cssVar(root, '--chart-muted', '#6c6462');
        var grid = cssVar(root, '--chart-grid', '#ebe7e4');
        var axis = cssVar(root, '--chart-axis', '#cfc8c4');
        var surface = cssVar(root, '--chart-surface', '#ffffff');

        var series = timeline.series;
        var count = timeline.labels.length;
        var state = blend(timeline, tween);
        var step = niceStep(timeline.max, 4);
        var yTop = Math.max(step, Math.ceil(timeline.max / step) * step);
        var yMax = yTop;

        // Pendant un glissement, l'echelle passe en douceur de l'ancien maximum au nouveau.
        if (tween) {
            var oldStep = niceStep(tween.from.max, 4);
            var oldTop = Math.max(oldStep, Math.ceil(tween.from.max / oldStep) * oldStep);

            yMax = oldTop + (yTop - oldTop) * tween.t;
        }

        var longest = series.reduce(function (max, serie) {
            return Math.max(max, Math.min(18, String(serie.name).length));
        }, 0);

        var padTop = 14;
        var padBottom = Math.round(font + 20);
        var padLeft = Math.round(14 + String(yTop).length * font * 0.6);
        var padRight = compact ? 14 : Math.min(230, Math.round(longest * font * 0.54 + font * 3.4 + 28));
        var plotW = width - padLeft - padRight;
        var plotH = height - padTop - padBottom;
        var domain = Math.max(1, state.last);

        function xAt(index) {
            var position = index === count - 1 ? state.last : index;

            return padLeft + (plotW * position) / domain;
        }

        function yAt(value) {
            return padTop + plotH - (plotH * value) / yMax;
        }

        var svg = svgEl('svg', {
            viewBox: '0 0 ' + width + ' ' + height,
            width: '100%',
            height: height,
            role: 'img',
            'aria-label': 'Évolution du nombre de voix par candidat au fil du scrutin. '
                + series.map(function (serie) {
                    return serie.name + ' : ' + lastOf(serie);
                }).join(', ') + '. Flèches gauche et droite pour parcourir.'
        });

        // --- grille horizontale et graduations -------------------------
        for (var value = 0; value <= yTop; value += step) {
            if (yAt(value) < padTop - 0.5) {
                break;
            }

            svg.appendChild(svgEl('line', {
                x1: padLeft,
                y1: yAt(value),
                x2: padLeft + plotW,
                y2: yAt(value),
                stroke: value === 0 ? axis : grid,
                'stroke-width': 1
            }));

            svg.appendChild(svgEl('text', {
                x: padLeft - 9,
                y: yAt(value) + font * 0.34,
                'text-anchor': 'end',
                fill: muted,
                'font-size': font,
                'font-variant-numeric': 'tabular-nums'
            }, value));
        }

        // --- libelles de temps, regulierement espaces -------------------
        pickTicks(count, Math.max(2, Math.floor(plotW / (font * 7.5)))).forEach(function (index) {
            svg.appendChild(svgEl('line', {
                x1: xAt(index),
                y1: padTop + plotH,
                x2: xAt(index),
                y2: padTop + plotH + 4,
                stroke: axis,
                'stroke-width': 1
            }));

            svg.appendChild(svgEl('text', {
                x: xAt(index),
                y: height - 4,
                'text-anchor': index === 0 ? 'start' : (index === count - 1 ? 'end' : 'middle'),
                fill: muted,
                'font-size': font,
                'font-variant-numeric': 'tabular-nums'
            }, timeline.labels[index]));
        });

        // --- courbes ---------------------------------------------------
        var ends = [];

        series.forEach(function (serie, position) {
            var color = colorOf(root, serie.slot);
            var row = state.rows[position];
            var points = row.map(function (pointValue, index) {
                return [xAt(index), yAt(pointValue)];
            });
            var endY = yAt(row[row.length - 1]);

            svg.appendChild(svgEl('path', {
                'class': 'chart-line',
                d: monotonePath(points),
                pathLength: 1,
                fill: 'none',
                stroke: color,
                'stroke-width': stroke,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round'
            }));

            ends.push({ id: serie.id, y: endY, at: endY, color: color, name: serie.name, votes: lastOf(serie) });
        });

        // Marqueurs de fin dessines apres toutes les courbes : l'anneau de la
        // couleur du fond les garde lisibles la ou les traits se croisent.
        ends.forEach(function (item) {
            // Une voix vient d'arriver : une onde part du point, une seule fois.
            if (pings && pings.indexOf(item.id) !== -1) {
                svg.appendChild(svgEl('circle', {
                    'class': 'chart-ping',
                    cx: xAt(count - 1),
                    cy: item.at,
                    r: stroke + 2.5,
                    fill: 'none',
                    stroke: item.color,
                    'stroke-width': 2
                }));
            }

            svg.appendChild(svgEl('circle', {
                'class': 'chart-end',
                cx: xAt(count - 1),
                cy: item.at,
                r: stroke + 2.5,
                fill: item.color,
                stroke: surface,
                'stroke-width': 2
            }));
        });

        // --- noms en bout de courbe ; un filet relie ceux qu'il a fallu
        //     decaler pour eviter un chevauchement ----------------------
        if (!compact) {
            var labels = ends.slice().sort(function (a, b) { return a.y - b.y; });
            var gap = font + 6;
            var i;

            for (i = 1; i < labels.length; i++) {
                if (labels[i].y - labels[i - 1].y < gap) {
                    labels[i].y = labels[i - 1].y + gap;
                }
            }

            var overflow = labels.length ? labels[labels.length - 1].y - (padTop + plotH) : 0;

            if (overflow > 0) {
                for (i = labels.length - 1; i >= 0; i--) {
                    var ceiling = i === labels.length - 1 ? padTop + plotH : labels[i + 1].y - gap;

                    labels[i].y = Math.min(labels[i].y, ceiling);
                }
            }

            var endX = xAt(count - 1);

            labels.forEach(function (item) {
                var group = svgEl('g', { 'class': 'chart-end' });

                if (Math.abs(item.y - item.at) > 3) {
                    group.appendChild(svgEl('path', {
                        d: 'M' + (endX + stroke + 6) + ',' + item.at
                            + ' L' + (endX + 14) + ',' + item.y
                            + ' L' + (endX + 20) + ',' + item.y,
                        fill: 'none',
                        stroke: axis,
                        'stroke-width': 1
                    }));
                }

                // Le texte reste en encre neutre : la valeur d'abord, le nom ensuite.
                var text = svgEl('text', {
                    x: endX + 24,
                    y: item.y + font * 0.34,
                    fill: ink,
                    'font-size': font
                });

                text.appendChild(svgEl('tspan', {
                    'font-weight': 700,
                    'font-variant-numeric': 'tabular-nums'
                }, fmtInt(item.votes)));
                text.appendChild(svgEl('tspan', { dx: font * 0.55, fill: muted }, truncate(item.name, 18)));
                group.appendChild(text);
                svg.appendChild(group);
            });
        }

        // --- curseur, points survoles et zone de survol ----------------
        var hover = svgEl('g', { opacity: 0, 'pointer-events': 'none' });
        var crosshair = svgEl('line', {
            y1: padTop,
            y2: padTop + plotH,
            stroke: muted,
            'stroke-width': 1
        });

        hover.appendChild(crosshair);

        var dots = series.map(function (serie) {
            var dot = svgEl('circle', {
                r: stroke + 2.5,
                fill: colorOf(root, serie.slot),
                stroke: surface,
                'stroke-width': 2
            });

            hover.appendChild(dot);

            return dot;
        });

        svg.appendChild(hover);
        svg.appendChild(svgEl('rect', {
            x: 0,
            y: 0,
            width: width,
            height: height,
            fill: 'transparent'
        }));

        // --- assemblage -------------------------------------------------
        var key = 'line|' + series.map(function (serie) {
            return serie.id + ':' + serie.slot + ':' + serie.name;
        }).join('|') + '|' + (timeline.folded || 0);

        if (!root.__drawn) {
            root.__drawn = true;
            svg.classList.add('is-intro');
            window.setTimeout(function () {
                svg.classList.remove('is-intro');
            }, 1500);
        }

        mount(root, svg, key, function () {
            var legend = htmlEl('div', 'chart-legend');

            series.forEach(function (serie) {
                var item = htmlEl('span', 'chart-legend-item');
                var legendKey = htmlEl('i', 'chart-key');

                legendKey.style.background = colorOf(root, serie.slot);
                item.appendChild(legendKey);
                item.appendChild(document.createTextNode(serie.name));
                legend.appendChild(item);
            });

            root.appendChild(legend);

            if (timeline.folded > 0) {
                root.appendChild(htmlEl('p', 'chart-note', timeline.folded
                    + ' autre(s) candidat(s) regroupé(s) sur la courbe. Le classement les détaille un par un.'));
            }

            root.__tooltip = makeTooltip(root);
        });

        // Image intermediaire d'un glissement : pas de survol, pas de signature.
        if (tween) {
            return;
        }

        var tooltip = root.__tooltip;

        bindIndexed(root, svg, {
            count: count,
            width: width,
            indexAt: function (x) {
                return count === 1 ? 0 : Math.round(((x - padLeft) / plotW) * (count - 1));
            },
            show: function (index) {
                crosshair.setAttribute('x1', xAt(index));
                crosshair.setAttribute('x2', xAt(index));

                series.forEach(function (serie, position) {
                    dots[position].setAttribute('cx', xAt(index));
                    dots[position].setAttribute('cy', yAt(serie.points[index]));
                });

                hover.setAttribute('opacity', 1);

                fillTooltip(tooltip, timeline.labels[index], series.map(function (serie) {
                    return { name: serie.name, value: serie.points[index], color: colorOf(root, serie.slot) };
                }).sort(function (a, b) {
                    return b.value - a.value;
                }).map(function (row) {
                    return { name: row.name, value: fmtInt(row.value), color: row.color, key: 'line' };
                }));

                var scale = svg.getBoundingClientRect().width / width;

                placeTooltip(root, tooltip, xAt(index) * scale, padTop);
            },
            hide: function () {
                hover.setAttribute('opacity', 0);
                tooltip.hidden = true;
            }
        });

        root.setAttribute('data-signature', signature(timeline) + '@' + width);
    }

    /** Commun a la courbe et aux colonnes : redessiner, en glissant si possible. */
    function update(root, timeline, draw, self) {
        root.__timeline = timeline;
        watch(root, function () {
            root.removeAttribute('data-signature');
            self(root, root.__timeline);
        });

        // On ne redessine pas sous le doigt ou le curseur de l'utilisateur.
        if (root.__hovering) {
            root.__stale = true;

            return;
        }

        var width = Math.max(240, Math.round(root.clientWidth || 0));
        var next = hasData(timeline) && timeline.labels.length > 1
            ? signature(timeline) + '@' + width
            : 'empty';

        if (root.getAttribute('data-signature') === next) {
            return;
        }

        var from = root.__shown;
        var slide = from
            && root.__svg && root.__svg.parentNode === root
            && root.__shownWidth === width
            && isShown(root)
            && signature(from) !== signature(timeline)
            && tweenable(from, timeline);

        if (hasData(timeline)) {
            root.__shown = snapshot(timeline);
            root.__shownWidth = width;
        }

        if (slide) {
            play(root, from, timeline, draw);
        } else {
            if (root.__raf) {
                caf(root.__raf);
                root.__raf = 0;
            }

            draw(root, timeline, null, null);
        }
    }

    function render(root, timeline) {
        if (!root || !timeline) {
            return;
        }

        update(root, timeline, drawLine, render);
    }

    /* ============================================ 2. Anneau de participation */

    /**
     * Un rayon par inscrit (jusqu'a 90 ; au-dela, 72 rayons proportionnels).
     * Les rayons s'allument dans le sens des aiguilles d'une montre.
     * data : { value: bulletins recus, total: inscrits, label?, sub? }
     */
    function ring(root, data) {
        if (!root || !data) {
            return;
        }

        var total = Math.max(0, Math.round(data.total || 0));
        var value = Math.max(0, Math.round(data.value || 0));
        var exact = total > 0 && total <= 90;
        var rays = total > 0 ? (exact ? total : 72) : 48;
        var lit = total > 0
            ? (exact ? Math.min(value, total) : Math.round(Math.min(1, value / total) * rays))
            : 0;

        root.classList.add('chart', 'chart-ring');

        if (root.__rays !== rays) {
            root.__rays = rays;
            root.__lit = undefined;
            root.textContent = '';

            var svg = svgEl('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
            var outer = 99;
            var inner = 73;
            var pitch = (2 * Math.PI) / rays;
            var half = Math.min(pitch * 0.31, 5.5 / outer);

            for (var i = 0; i < rays; i++) {
                var angle = -Math.PI / 2 + i * pitch;
                var corners = [
                    [inner, angle - half], [outer, angle - half],
                    [outer, angle + half], [inner, angle + half]
                ].map(function (polar) {
                    return (100 + polar[0] * Math.cos(polar[1])).toFixed(2)
                        + ',' + (100 + polar[0] * Math.sin(polar[1])).toFixed(2);
                });

                svg.appendChild(svgEl('polygon', { 'class': 'ring-ray', points: corners.join(' ') }));
            }

            var center = htmlEl('div', 'ring-center');

            center.appendChild(htmlEl('div', 'ring-value'));
            center.appendChild(htmlEl('div', 'ring-label'));
            center.appendChild(htmlEl('div', 'ring-sub'));

            root.appendChild(svg);
            root.appendChild(center);
        }

        var nodes = root.querySelectorAll('.ring-ray');
        var still = motion.matches || document.hidden || !isShown(root);
        var r;

        if (!root.__ringIntro && !still) {
            // Premiere apparition : les rayons s'allument un a un, dans l'ordre.
            root.__ringIntro = true;

            for (r = 0; r < nodes.length; r++) {
                nodes[r].classList.remove('is-on', 'is-new');
                nodes[r].style.transitionDelay = (r < lit ? Math.round(r * (700 / Math.max(1, lit))) : 0) + 'ms';
            }

            root.getBoundingClientRect();

            for (r = 0; r < nodes.length; r++) {
                nodes[r].classList.toggle('is-on', r < lit);
            }

            window.setTimeout(function () {
                for (var index = 0; index < nodes.length; index++) {
                    nodes[index].style.transitionDelay = '';
                }
            }, 1300);
        } else {
            var previous = root.__lit === undefined ? lit : root.__lit;

            for (r = 0; r < nodes.length; r++) {
                nodes[r].classList.toggle('is-on', r < lit);

                // Un bulletin vient d'arriver : son rayon s'allume avec un rebond.
                if (!still && r >= previous && r < lit && lit - previous <= 12) {
                    nodes[r].classList.remove('is-new');
                    nodes[r].getBoundingClientRect();
                    nodes[r].classList.add('is-new');
                }
            }
        }

        root.__lit = lit;

        var headline = total > 0 ? fmtPct(value / total) : fmtInt(value);
        var label = data.label || (total > 0 ? 'de participation' : (value > 1 ? 'bulletins' : 'bulletin'));
        var sub = data.sub !== undefined
            ? data.sub
            : (total > 0 ? fmtInt(value) + ' sur ' + plural(total, 'inscrit', 'inscrits') : '');

        setText(root.querySelector('.ring-value'), headline);
        root.querySelector('.ring-label').textContent = label;
        root.querySelector('.ring-sub').textContent = sub;
        root.setAttribute('role', 'img');
        root.setAttribute('aria-label', total > 0
            ? 'Participation : ' + headline + ', ' + fmtInt(value) + ' bulletins sur ' + fmtInt(total) + ' inscrits.'
            : fmtInt(value) + ' bulletins reçus.');
    }

    /* =========================================== 3. Repartition des voix */

    /**
     * Bande decoupee en parts, une par candidat, avec un repere a 50 %.
     * data-variant="tall" : bande haute, part ecrite dans chaque bloc
     * (videoprojecteur). Par defaut : bande fine, a poser au-dessus d'un
     * classement qui donne deja les chiffres.
     * data-legend="off" : pas de legende (les lignes du classement portent
     * deja la pastille de couleur).
     */
    function share(root, timeline) {
        if (!root || !timeline) {
            return;
        }

        root.classList.add('chart', 'chart-share');
        root.__timeline = timeline;
        root.__width = Math.round(root.clientWidth || 0);
        watch(root, function () {
            share(root, root.__timeline);
        });

        var tall = root.getAttribute('data-variant') === 'tall';
        var series = (timeline.series || []).map(function (serie) {
            return { id: serie.id, name: serie.name, slot: serie.slot, votes: lastOf(serie) };
        });
        var total = series.reduce(function (sum, serie) { return sum + serie.votes; }, 0);

        if (!root.__bar) {
            root.textContent = '';
            root.__bar = htmlEl('div', 'share-bar');
            root.__bar.setAttribute('role', 'list');
            root.__segments = {};
            root.appendChild(root.__bar);

            var mark = htmlEl('div', 'share-mark');

            mark.appendChild(htmlEl('span', '', '50 %'));
            mark.setAttribute('aria-hidden', 'true');
            root.__bar.appendChild(mark);

            root.__emptyTrack = htmlEl('div', 'share-empty');
            root.__bar.appendChild(root.__emptyTrack);

            if (root.getAttribute('data-legend') !== 'off') {
                root.__legend = htmlEl('div', 'chart-legend');
                root.appendChild(root.__legend);
            }

            root.__tip = makeTooltip(root);
        }

        root.__emptyTrack.hidden = total > 0;

        if (root.__legend) {
            root.__legend.textContent = '';
        }

        series.forEach(function (serie) {
            var color = colorOf(root, serie.slot);
            var segment = root.__segments[serie.id];

            if (!segment) {
                segment = htmlEl('div', 'share-seg');
                segment.setAttribute('role', 'listitem');
                segment.setAttribute('tabindex', '0');
                segment.appendChild(htmlEl('span', 'share-label'));
                root.__segments[serie.id] = segment;
                root.__bar.insertBefore(segment, root.__emptyTrack);

                var showTip = function () {
                    var info = segment.__info;

                    fillTooltip(root.__tip, info.name, [
                        { name: 'voix', value: fmtInt(info.votes), color: info.color, key: 'box' },
                        { name: 'des suffrages exprimés', value: info.share }
                    ]);

                    // Centree sous la part visee, sans sortir du cadre.
                    root.__tip.hidden = false;

                    var left = segment.offsetLeft + segment.offsetWidth / 2 - root.__tip.offsetWidth / 2;

                    root.__tip.style.left = Math.max(0, Math.min(root.clientWidth - root.__tip.offsetWidth, left)) + 'px';
                    root.__tip.style.top = (root.__bar.offsetTop + root.__bar.offsetHeight + 10) + 'px';
                };
                var hideTip = function () {
                    root.__tip.hidden = true;
                };

                segment.addEventListener('pointerenter', showTip);
                segment.addEventListener('pointerleave', hideTip);
                segment.addEventListener('focus', showTip);
                segment.addEventListener('blur', hideTip);
            }

            var ratio = total ? serie.votes / total : 0;

            segment.__info = { name: serie.name, votes: serie.votes, share: fmtPct(ratio), color: color };
            segment.hidden = serie.votes === 0;
            segment.style.flex = serie.votes + ' 1 0px';
            segment.style.background = color;
            segment.setAttribute('aria-label', serie.name + ' : ' + plural(serie.votes, 'voix', 'voix')
                + ', ' + fmtPct(ratio) + ' des suffrages exprimés');

            var label = segment.firstChild;

            label.style.color = inkOn(color);
            label.textContent = tall ? fmtPct(ratio).replace(',0', '') : '';

            if (root.__legend) {
                var item = htmlEl('span', 'chart-legend-item');
                var swatch = htmlEl('i', 'chart-swatch');

                swatch.style.background = color;
                item.appendChild(swatch);
                item.appendChild(document.createTextNode(serie.name));
                root.__legend.appendChild(item);
            }
        });

        // Une part ecrite dans un bloc trop etroit serait rognee : on la retire
        // (elle reste lisible au survol, dans le classement et dans le tableau).
        if (tall && root.__bar.clientWidth) {
            var shown = series.filter(function (serie) { return serie.votes > 0; }).length;
            var usable = root.__bar.clientWidth - 2 * Math.max(0, shown - 1);

            series.forEach(function (serie) {
                var label = root.__segments[serie.id].firstChild;

                label.style.display = '';
                label.style.display = total && label.offsetWidth <= (serie.votes / total) * usable ? '' : 'none';
            });
        }

        root.setAttribute('aria-label', 'Répartition des suffrages exprimés entre les candidats');
    }

    /* ================================================== 4. Rythme du vote */

    var clipSeed = 0;

    /** Colonnes : voix recues dans chaque tranche de temps de la timeline. */
    function drawPace(root, timeline, tween) {
        if (!hasData(timeline) || timeline.labels.length < 2) {
            showEmpty(root, 'Le rythme du vote apparaîtra dès les premiers bulletins.');

            return;
        }

        var width = widthOf(root);

        if (!width) {
            return;
        }

        function increments(totals) {
            return totals.map(function (total, index) {
                return Math.max(0, total - (index ? totals[index - 1] : 0));
            });
        }

        // Valeurs finales (textes, infobulle) et valeurs de l'image en cours (hauteurs).
        var totals = totalsOf(timeline);
        var values = increments(totals);
        var count = values.length;
        var peak = Math.max.apply(null, values);
        var peakIndex = values.lastIndexOf(peak);

        var state = blend(timeline, tween);
        var shown = increments(timeline.labels.map(function (label, index) {
            return state.rows.reduce(function (sum, row) { return sum + row[index]; }, 0);
        }));

        var font = cssNum(root, '--chart-font', 12.5);
        var height = parseInt(root.getAttribute('data-height') || '0', 10) || 220;
        var muted = cssVar(root, '--chart-muted', '#6c6462');
        var ink = cssVar(root, '--chart-ink', '#231f20');
        var grid = cssVar(root, '--chart-grid', '#ebe7e4');
        var axis = cssVar(root, '--chart-axis', '#cfc8c4');
        var accent = cssVar(root, '--chart-accent', '#8a1c03');

        var step = niceStep(peak, 3);
        var yTop = Math.max(step, Math.ceil(peak / step) * step);
        var yMax = yTop;

        if (tween) {
            var oldPeak = Math.max.apply(null, increments(totalsOf(tween.from)));
            var oldStep = niceStep(oldPeak, 3);
            var oldTop = Math.max(oldStep, Math.ceil(oldPeak / oldStep) * oldStep);

            yMax = oldTop + (yTop - oldTop) * tween.t;
        }

        var padTop = Math.round(font + 10);
        var padBottom = Math.round(font + 20);
        var padLeft = Math.round(14 + String(yTop).length * font * 0.6);
        var padRight = 6;
        var plotW = width - padLeft - padRight;
        var plotH = height - padTop - padBottom;

        // Une tranche qui s'ouvre fait glisser les colonnes : le nombre de
        // bandes passe de n a n + 1 en continu.
        var band = plotW / (state.last + 1);
        var barW = Math.max(3, Math.min(24, Math.round((plotW / count) * 0.58)));

        function xAt(index) {
            return padLeft + band * index + band / 2;
        }

        function yAt(value) {
            return padTop + plotH - (plotH * value) / yMax;
        }

        var svg = svgEl('svg', {
            viewBox: '0 0 ' + width + ' ' + height,
            width: '100%',
            height: height,
            role: 'img',
            'aria-label': 'Voix reçues par tranche de temps. Maximum : ' + fmtInt(peak)
                + ' à ' + timeline.labels[peakIndex] + '. Flèches gauche et droite pour parcourir.'
        });

        for (var value = 0; value <= yTop; value += step) {
            if (yAt(value) < padTop - 0.5) {
                break;
            }

            svg.appendChild(svgEl('line', {
                x1: padLeft,
                y1: yAt(value),
                x2: padLeft + plotW,
                y2: yAt(value),
                stroke: value === 0 ? axis : grid,
                'stroke-width': 1
            }));

            svg.appendChild(svgEl('text', {
                x: padLeft - 9,
                y: yAt(value) + font * 0.34,
                'text-anchor': 'end',
                fill: muted,
                'font-size': font,
                'font-variant-numeric': 'tabular-nums'
            }, value));
        }

        pickTicks(count, Math.max(2, Math.floor(plotW / (font * 6.5)))).forEach(function (index) {
            if (xAt(index) > padLeft + plotW) {
                return;
            }

            svg.appendChild(svgEl('text', {
                x: xAt(index),
                y: height - 4,
                'text-anchor': 'middle',
                fill: muted,
                'font-size': font,
                'font-variant-numeric': 'tabular-nums'
            }, timeline.labels[index]));
        });

        // La colonne qui entre par la droite ne deborde pas de la zone de trace.
        var clipId = 'vote-pace-clip-' + (root.__clip || (root.__clip = ++clipSeed));
        var clip = svgEl('clipPath', { id: clipId });

        clip.appendChild(svgEl('rect', { x: padLeft, y: 0, width: plotW, height: height }));
        svg.appendChild(clip);

        var group = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' });

        // Colonnes : sommet arrondi (4 px), base droite posee sur l'axe.
        var bars = shown.map(function (barValue, index) {
            var top = yAt(barValue);
            var bottom = yAt(0);
            var left = xAt(index) - barW / 2;
            var radius = Math.min(4, barW / 2, Math.max(0, bottom - top));
            var bar = svgEl('path', {
                d: barValue > 0.001
                    ? 'M' + left.toFixed(1) + ',' + bottom.toFixed(1)
                    + ' V' + (top + radius).toFixed(1)
                    + ' Q' + left.toFixed(1) + ',' + top.toFixed(1) + ' ' + (left + radius).toFixed(1) + ',' + top.toFixed(1)
                    + ' H' + (left + barW - radius).toFixed(1)
                    + ' Q' + (left + barW).toFixed(1) + ',' + top.toFixed(1) + ' ' + (left + barW).toFixed(1) + ',' + (top + radius).toFixed(1)
                    + ' V' + bottom.toFixed(1) + ' Z'
                    : '',
                fill: accent
            });

            group.appendChild(bar);

            return bar;
        });

        svg.appendChild(group);

        // Une seule valeur ecrite : le pic. Les autres se lisent sur l'axe.
        if (peak > 0) {
            svg.appendChild(svgEl('text', {
                x: xAt(peakIndex),
                y: yAt(shown[peakIndex]) - 6,
                'text-anchor': 'middle',
                fill: ink,
                'font-size': font,
                'font-weight': 700
            }, fmtInt(peak)));
        }

        svg.appendChild(svgEl('rect', { x: 0, y: 0, width: width, height: height, fill: 'transparent' }));

        mount(root, svg, 'pace', function () {
            root.__tooltip = makeTooltip(root);
        });

        if (tween) {
            return;
        }

        var tooltip = root.__tooltip;

        bindIndexed(root, svg, {
            count: count,
            width: width,
            indexAt: function (x) {
                return Math.floor((x - padLeft) / band);
            },
            show: function (index) {
                bars.forEach(function (bar, position) {
                    bar.setAttribute('opacity', position === index ? 1 : 0.35);
                });

                fillTooltip(tooltip, timeline.labels[index], [
                    { name: 'voix reçues', value: fmtInt(values[index]), color: accent, key: 'box' },
                    { name: 'cumul', value: fmtInt(totals[index]) }
                ]);

                var scale = svg.getBoundingClientRect().width / width;

                placeTooltip(root, tooltip, xAt(index) * scale, 0);
            },
            hide: function () {
                bars.forEach(function (bar) {
                    bar.setAttribute('opacity', 1);
                });
                tooltip.hidden = true;
            }
        });

        root.setAttribute('data-signature', signature(timeline) + '@' + width);
    }

    function pace(root, timeline) {
        if (!root || !timeline) {
            return;
        }

        root.classList.add('chart', 'chart-pace');
        update(root, timeline, drawPace, pace);
    }

    /* ============================================== 5. Tableau des donnees */

    /** Equivalent accessible des graphiques : une ligne par candidat. */
    function table(root, timeline) {
        if (!root || !timeline) {
            return;
        }

        var rows = (timeline.series || []).map(function (serie) {
            return { name: serie.name, slot: serie.slot, votes: lastOf(serie) };
        }).sort(function (a, b) {
            return b.votes - a.votes;
        });
        var total = rows.reduce(function (sum, row) { return sum + row.votes; }, 0);
        var best = rows.length ? rows[0].votes : 0;

        var wrap = htmlEl('div', 'table-wrap chart');
        var tableNode = htmlEl('table', 'table');
        var head = htmlEl('tr');

        [['Rang', 'num'], ['Candidat', ''], ['Voix', 'num'], ['Part des suffrages', 'num'], ['Écart au premier', 'num']]
            .forEach(function (column) {
                var cell = htmlEl('th', column[1], column[0]);

                cell.setAttribute('scope', 'col');
                head.appendChild(cell);
            });

        var thead = htmlEl('thead');
        var tbody = htmlEl('tbody');

        thead.appendChild(head);
        tableNode.appendChild(thead);

        rows.forEach(function (row, index) {
            var line = htmlEl('tr');
            var name = htmlEl('td');
            var swatch = htmlEl('i', 'result-key');

            name.appendChild(swatch);
            name.appendChild(document.createTextNode(row.name));

            line.appendChild(htmlEl('td', 'num', index + 1));
            line.appendChild(name);
            line.appendChild(htmlEl('td', 'num', fmtInt(row.votes)));
            line.appendChild(htmlEl('td', 'num', total ? fmtPct(row.votes / total) : '—'));
            line.appendChild(htmlEl('td', 'num', row.votes === best ? '—' : '−' + fmtInt(best - row.votes)));
            tbody.appendChild(line);

            line.__slot = row.slot;
            line.__swatch = swatch;
        });

        tableNode.appendChild(tbody);
        wrap.appendChild(tableNode);
        root.textContent = '';
        root.appendChild(wrap);

        // Les couleurs se lisent une fois le tableau dans la page (variables CSS).
        Array.prototype.forEach.call(tbody.children, function (line) {
            line.__swatch.style.background = colorOf(wrap, line.__slot);
        });
    }

    /* ---------------------------------------------------------------- API */

    window.VoteChart = {
        render: render,
        ring: ring,
        share: share,
        pace: pace,
        table: table,
        colorOf: colorOf
    };

    // Repli sans ResizeObserver : redessin au redimensionnement de la fenetre.
    if (!observer) {
        var resizeTimer = null;

        window.addEventListener('resize', function () {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () {
                watched.forEach(function (root) {
                    if (typeof root.__redraw === 'function') {
                        root.__redraw();
                    }
                });
            }, 180);
        });
    }
})(window, document);
