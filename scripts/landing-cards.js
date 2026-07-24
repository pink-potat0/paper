(function () {
    var track = document.querySelector('.gate-track');
    var tunnel = document.getElementById('tunnel');
    var cards = document.querySelectorAll('.portal-card');
    var panels = document.querySelectorAll('.gate-copy-panel');
    var railBtns = document.querySelectorAll('.gate-rail-btn');
    var progressBar = document.getElementById('gate-progress-bar');
    var hero = document.querySelector('.gate-hero');
    var heroVisual = document.getElementById('hero-visual');
    var heroCopy = document.querySelector('.gate-hero-copy');
    var section = document.querySelector('.gate-tunnel-section');

    if (!track || !tunnel || !cards.length) return;

    var total = cards.length;
    var depth = 1100;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    var flat = reduced || mobile;

    var smooth = { journey: 0, hero: 0 };
    var target = { journey: 0, hero: 0 };
    var lastIndex = -1;
    var rafId = null;

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function journeyProgress() {
        var rect = track.getBoundingClientRect();
        var scrollable = track.offsetHeight - window.innerHeight;
        if (scrollable <= 0) return 0;
        return clamp(-rect.top / scrollable, 0, 1);
    }

    function scrollToIndex(index) {
        var scrollable = track.offsetHeight - window.innerHeight;
        if (!scrollable) return;
        var top = section.offsetTop + (index / Math.max(1, total - 1)) * scrollable;
        window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    }

    function setActive(index) {
        if (index === lastIndex) return;
        lastIndex = index;
        panels.forEach(function (p, i) { p.classList.toggle('is-active', i === index); });
        railBtns.forEach(function (b, i) { b.classList.toggle('is-active', i === index); });
    }

    function renderHero(p) {
        if (heroCopy) {
            heroCopy.style.opacity = (1 - p * 1.05).toFixed(3);
            heroCopy.style.transform = 'translate3d(0,' + (-p * 100) + 'px,0)';
        }
        if (heroVisual) {
            heroVisual.style.transform =
                'perspective(1200px) rotateX(' + (-p * 8) + 'deg) rotateY(' + (p * 4) + 'deg) translate3d(0,' + (-p * 60) + 'px,0)';
        }
    }

    function renderTunnel(slideFloat) {
        var camZ = slideFloat * depth * (total - 1);

        if (flat) {
            tunnel.style.transform = 'none';
            cards.forEach(function (card, i) {
                var dist = Math.abs(slideFloat - i);
                var o = clamp(1 - dist, 0, 1);
                card.style.opacity = o.toFixed(3);
                card.style.transform = 'translate3d(0,' + ((i - slideFloat) * 40) + 'px,0) scale(' + (0.9 + o * 0.1) + ')';
                card.style.pointerEvents = o > 0.55 ? 'auto' : 'none';
            });
            setActive(Math.round(slideFloat));
            return;
        }

        tunnel.style.transform = 'translate3d(0,0,' + camZ.toFixed(1) + 'px)';

        cards.forEach(function (card, i) {
            var z = -i * depth;
            var worldZ = z + camZ;
            var norm = clamp(1 - Math.abs(worldZ) / (depth * 0.72), 0, 1);
            var scale = 0.55 + norm * 0.45;
            var opacity = clamp(0.12 + norm * 0.88, 0, 1);
            var y = worldZ * 0.04;
            var rotY = worldZ * 0.018;

            card.style.opacity = opacity.toFixed(3);
            card.style.transform =
                'translate3d(0,' + y.toFixed(1) + 'px,' + z + 'px) rotateY(' + rotY.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
            card.style.pointerEvents = norm > 0.62 ? 'auto' : 'none';
            card.style.zIndex = String(Math.round(norm * 100));
        });

        var best = 0;
        var bestNorm = -1;
        cards.forEach(function (card, i) {
            var worldZ = -i * depth + camZ;
            var norm = 1 - Math.abs(worldZ) / (depth * 0.72);
            if (norm > bestNorm) { bestNorm = norm; best = i; }
        });
        setActive(best);
    }

    function renderPanels(slideFloat) {
        panels.forEach(function (panel, i) {
            var dist = Math.abs(slideFloat - i);
            var o = clamp(1 - dist * 1.15, 0, 1);
            panel.style.opacity = o.toFixed(3);
            panel.style.transform = 'translate3d(' + ((slideFloat - i) * -24) + 'px,0,0)';
            panel.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
        });
    }

    function tick() {
        target.hero = clamp(window.scrollY / window.innerHeight, 0, 1);
        target.journey = journeyProgress();

        smooth.hero = lerp(smooth.hero, target.hero, 0.08);
        smooth.journey = lerp(smooth.journey, target.journey, 0.1);

        renderHero(smooth.hero);

        var slideFloat = smooth.journey * Math.max(1, total - 1);
        renderTunnel(slideFloat);
        renderPanels(slideFloat);

        if (progressBar) {
            progressBar.style.transform = 'scaleX(' + smooth.journey + ')';
        }

        rafId = requestAnimationFrame(tick);
    }

    function requestTick() {
        if (!rafId) rafId = requestAnimationFrame(tick);
    }

    railBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            scrollToIndex(parseInt(btn.dataset.index, 10) || 0);
        });
    });

    if (heroVisual && !flat) {
        heroVisual.addEventListener('mousemove', function (e) {
            var rect = heroVisual.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width - 0.5;
            var y = (e.clientY - rect.top) / rect.height - 0.5;
            var stack = heroVisual.querySelector('.card-stack');
            if (stack) {
                stack.style.transform =
                    'rotateX(' + (y * -10) + 'deg) rotateY(' + (x * 14) + 'deg)';
            }
        });
        heroVisual.addEventListener('mouseleave', function () {
            var stack = heroVisual.querySelector('.card-stack');
            if (stack) stack.style.transform = '';
        });
    }

    cards.forEach(function (card, i) {
        if (!flat) card.style.transform = 'translate3d(0,0,' + (-i * depth) + 'px)';
    });

    if (flat) {
        document.body.classList.add('is-flat');
        window.addEventListener('scroll', requestTick, { passive: true });
        window.addEventListener('resize', requestTick, { passive: true });
        tick();
    } else {
        window.addEventListener('scroll', function () {}, { passive: true });
        window.addEventListener('resize', function () {}, { passive: true });
        tick();
    }
})();
