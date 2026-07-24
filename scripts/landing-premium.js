(function () {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function cssVar(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    function parseRgbTriplet(value) {
        if (!value) return [96, 165, 250];
        return value.split(',').map(function (n) { return parseInt(n, 10) || 0; });
    }

    /* ── Nav scroll state ── */
    var header = document.getElementById('landing-header');
    if (header) {
        window.addEventListener('scroll', function () {
            header.classList.toggle('is-scrolled', window.scrollY > 24);
        }, { passive: true });
    }

    /* ── Text scramble (Motion Primitives inspired) ── */
    function initScramble(el) {
        if (reduced || el.dataset.lpScrambleDone) return;
        var target = el.textContent.trim();
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var frame = 0;
        var maxFrames = 24;
        var interval = window.setInterval(function () {
            frame++;
            if (frame >= maxFrames) {
                el.textContent = target;
                window.clearInterval(interval);
                el.dataset.lpScrambleDone = '1';
                return;
            }
            var progress = frame / maxFrames;
            var out = '';
            for (var i = 0; i < target.length; i++) {
                if (target[i] === ' ') {
                    out += ' ';
                } else if (Math.random() < progress) {
                    out += target[i];
                } else {
                    out += chars[Math.floor(Math.random() * chars.length)];
                }
            }
            el.textContent = out;
        }, 45);
    }

    document.querySelectorAll('[data-lp-scramble]').forEach(function (el) {
        setTimeout(function () { initScramble(el); }, 400);
    });

    /* ── Scroll reveal ── */
    document.querySelectorAll('[data-paper-ca]').forEach(function (button) {
        var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var randomValues = new Uint32Array(10);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(randomValues);
        } else {
            for (var i = 0; i < randomValues.length; i++) {
                randomValues[i] = Math.floor(Math.random() * alphabet.length);
            }
        }
        var randomPart = Array.from(randomValues, function (randomValue) {
            return alphabet[randomValue % alphabet.length];
        }).join('');
        var ca = 'PAPER-DEMO-' + randomPart;
        var value = button.querySelector('.lp-ca-strip__value');
        var action = button.querySelector('.lp-ca-strip__action');
        var resetTimer = null;

        button.setAttribute('data-paper-ca', ca);
        if (value) value.textContent = ca;

        function setCopyState(text, copied) {
            if (action) action.textContent = text;
            button.classList.toggle('is-copied', !!copied);
            button.setAttribute('aria-label', copied ? 'Demo identifier copied' : 'Copy demo identifier');
        }

        function fallbackCopy(value) {
            var input = document.createElement('textarea');
            input.value = value;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            document.body.appendChild(input);
            input.select();
            var copied = document.execCommand('copy');
            input.remove();
            if (!copied) throw new Error('copy failed');
        }

        button.addEventListener('click', function () {
            var copy = navigator.clipboard && window.isSecureContext
                ? navigator.clipboard.writeText(ca)
                : Promise.resolve().then(function () { fallbackCopy(ca); });

            copy.then(function () {
                window.clearTimeout(resetTimer);
                setCopyState('Copied', true);
                resetTimer = window.setTimeout(function () {
                    setCopyState('Copy', false);
                }, 1600);
            }).catch(function () {
                window.clearTimeout(resetTimer);
                setCopyState('Copy failed', false);
                resetTimer = window.setTimeout(function () {
                    setCopyState('Copy', false);
                }, 1600);
            });
        });
    });

    var revealEls = document.querySelectorAll('[data-lp-reveal]');
    if (revealEls.length && !reduced) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        revealEls.forEach(function (el) {
            if (!el.classList.contains('lp-hero__copy')) {
                observer.observe(el);
            }
        });

        var heroVisual = document.getElementById('hero-visual');
        if (heroVisual) heroVisual.classList.add('is-visible');
    } else {
        revealEls.forEach(function (el) {
            el.classList.add('is-visible');
        });
    }

    document.body.classList.add('lp-loaded');

    /* ── Cursor glow + background parallax ── */
    var lpBg = document.getElementById('lp-bg');
    var cursorGlow = document.getElementById('lp-cursor-glow');

    if (!reduced && lpBg) {
        document.addEventListener('mousemove', function (e) {
            var px = (e.clientX / window.innerWidth - 0.5) * 18;
            var py = (e.clientY / window.innerHeight - 0.5) * 14;
            lpBg.style.setProperty('--bg-parallax-x', px + 'px');
            lpBg.style.setProperty('--bg-parallax-y', py + 'px');

            if (cursorGlow) {
                cursorGlow.style.left = e.clientX + 'px';
                cursorGlow.style.top = e.clientY + 'px';
                cursorGlow.classList.add('is-active');
            }
        }, { passive: true });

        document.addEventListener('mouseleave', function () {
            if (cursorGlow) cursorGlow.classList.remove('is-active');
            lpBg.style.setProperty('--bg-parallax-x', '0px');
            lpBg.style.setProperty('--bg-parallax-y', '0px');
        });
    }

    /* ── Bento spotlight ── */
    document.querySelectorAll('[data-lp-spotlight]').forEach(function (el) {
        el.addEventListener('mousemove', function (e) {
            var rect = el.getBoundingClientRect();
            el.style.setProperty('--spot-x', ((e.clientX - rect.left) / rect.width) * 100 + '%');
            el.style.setProperty('--spot-y', ((e.clientY - rect.top) / rect.height) * 100 + '%');
        });
        el.addEventListener('mouseleave', function () {
            el.style.removeProperty('--spot-x');
            el.style.removeProperty('--spot-y');
        });
    });

    /* ── Subtle 3D tilt on preview body only (tabs stay flat + clickable) ── */
    document.querySelectorAll('.lp-preview__body[data-lp-tilt]').forEach(function (body) {
        if (reduced) return;

        var stage = body.closest('.lp-preview__stage');
        if (!stage) return;

        var currentX = 0;
        var currentY = 0;
        var targetX = 0;
        var targetY = 0;
        var raf = null;
        var maxTilt = 4;

        function animate() {
            currentX += (targetX - currentX) * 0.1;
            currentY += (targetY - currentY) * 0.1;

            body.style.transform =
                'rotateX(' + (-currentY * maxTilt) + 'deg) rotateY(' + (currentX * maxTilt) + 'deg)';

            if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
                raf = requestAnimationFrame(animate);
            } else {
                raf = null;
            }
        }

        function schedule() {
            if (!raf) raf = requestAnimationFrame(animate);
        }

        stage.addEventListener('mousemove', function (e) {
            if (e.target.closest('.lp-preview__tab')) return;
            var rect = stage.getBoundingClientRect();
            targetX = (e.clientX - rect.left) / rect.width - 0.5;
            targetY = (e.clientY - rect.top) / rect.height - 0.5;
            schedule();
        });

        stage.addEventListener('mouseleave', function () {
            targetX = 0;
            targetY = 0;
            schedule();
        });
    });

    /* ── Preview tab switching ── */
    var preview = document.getElementById('hero-visual');
    var tablist = document.getElementById('lp-preview-tabs');

    function initPreviewTabs(root) {
        if (!root) return;

        var tabs = root.querySelectorAll('.lp-preview__tab');
        var panels = root.querySelectorAll('.lp-panel');
        var active = 0;

        function showPanel(index) {
            if (!panels.length) return;
            active = (index + panels.length) % panels.length;

            tabs.forEach(function (tab, i) {
                var on = i === active;
                tab.classList.toggle('is-active', on);
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
            });

            panels.forEach(function (panel, i) {
                var on = i === active;
                panel.classList.toggle('is-active', on);
                if (on) panel.removeAttribute('hidden');
                else panel.setAttribute('hidden', '');
            });
        }

        function onTabActivate(tab) {
            var idx = parseInt(tab.getAttribute('data-panel'), 10);
            showPanel(isNaN(idx) ? 0 : idx);
        }

        var list = tablist || root.querySelector('.lp-preview__tabs');
        if (list) {
            list.addEventListener('click', function (e) {
                var tab = e.target.closest('.lp-preview__tab');
                if (!tab || !list.contains(tab)) return;
                e.preventDefault();
                e.stopPropagation();
                onTabActivate(tab);
            });

            list.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                var tab = e.target.closest('.lp-preview__tab');
                if (!tab) return;
                e.preventDefault();
                onTabActivate(tab);
            });
        }

        root.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                showPanel(active + (e.key === 'ArrowRight' ? 1 : -1));
            }
        });

        showPanel(0);
    }

    initPreviewTabs(preview);

    /* ── Sparkle canvas ── */
    var sparkleCanvas = document.getElementById('lp-sparkles');
    if (sparkleCanvas && !reduced) {
        var sctx = sparkleCanvas.getContext('2d');
        var sparkles = [];
        var sparkleRaf = null;
        var sparkleRgb = parseRgbTriplet(cssVar('--accent-rgb', '96, 165, 250'));
        var sparkleSecondary = parseRgbTriplet(cssVar('--accent-rgb', '96, 165, 250'));

        function resizeSparkles() {
            sparkleCanvas.width = window.innerWidth;
            sparkleCanvas.height = window.innerHeight;
        }

        function seedSparkles() {
            sparkles = [];
            var count = Math.min(80, Math.floor(window.innerWidth / 20));
            for (var i = 0; i < count; i++) {
                sparkles.push({
                    x: Math.random() * sparkleCanvas.width,
                    y: Math.random() * sparkleCanvas.height,
                    r: Math.random() * 1.4 + 0.3,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.006 + Math.random() * 0.014,
                    alt: Math.random() > 0.65
                });
            }
        }

        function drawSparkles(ts) {
            sparkleRaf = null;
            if (document.hidden || !sctx) return;
            sctx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
            sparkles.forEach(function (s) {
                var alpha = 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(ts * s.speed + s.phase));
                var rgb = s.alt ? sparkleSecondary : sparkleRgb;
                sctx.beginPath();
                sctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                sctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
                sctx.fill();
            });
            sparkleRaf = requestAnimationFrame(drawSparkles);
        }

        resizeSparkles();
        seedSparkles();
        sparkleRaf = requestAnimationFrame(drawSparkles);
        window.addEventListener('resize', function () {
            resizeSparkles();
            seedSparkles();
        });
        window.addEventListener('paper:theme-changed', function () {
            sparkleRgb = parseRgbTriplet(cssVar('--accent-rgb', '96, 165, 250'));
            sparkleSecondary = parseRgbTriplet(cssVar('--accent-rgb', '96, 165, 250'));
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden && sparkleRaf) {
                cancelAnimationFrame(sparkleRaf);
                sparkleRaf = null;
            } else if (!sparkleRaf) {
                sparkleRaf = requestAnimationFrame(drawSparkles);
            }
        });
    }
})();
