(function () {
    if (document.querySelector('[data-interactive-dots]')) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'interactive-dots-background';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-interactive-dots', 'true');

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var dots = [];
    var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var time = 0;
    var raf = null;
    var running = false;
    var dpr = 1;
    var width = 0;
    var height = 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var config = {
        backgroundColor: '#0a0d12',
        dotColor: '#94a3b8',
        gridSpacing: 30,
        animationSpeed: 0.005,
        removeWaveLine: true
    };

    function cssVar(name, fallback) {
        var bodyValue = document.body
            ? getComputedStyle(document.body).getPropertyValue(name).trim()
            : '';
        var rootValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return bodyValue || rootValue || fallback;
    }

    function parseColor(value) {
        var fallback = [148, 163, 184];
        if (!value) return fallback;
        value = String(value).trim();

        if (value.charAt(0) === '#') {
            var hex = value.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
            }
            if (hex.length === 6) {
                return [
                    parseInt(hex.slice(0, 2), 16),
                    parseInt(hex.slice(2, 4), 16),
                    parseInt(hex.slice(4, 6), 16)
                ];
            }
        }

        var rgb = value.match(/rgba?\(([^)]+)\)/i);
        if (rgb) {
            return rgb[1].split(',').slice(0, 3).map(function (part) {
                return Math.max(0, Math.min(255, parseInt(part, 10) || 0));
            });
        }

        if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(value)) {
            return value.split(',').map(function (part) {
                return Math.max(0, Math.min(255, parseInt(part, 10) || 0));
            });
        }

        return fallback;
    }

    function readConfig() {
        config.backgroundColor = cssVar('--interactive-dots-bg', cssVar('--bg-dark', '#0a0d12'));
        config.dotColor = cssVar('--interactive-dots-color', cssVar('--text-accent-muted', '#94a3b8'));
        config.gridSpacing = parseFloat(cssVar('--interactive-dots-spacing', '30')) || 30;
    }

    function ensureCanvas() {
        if (!document.body.contains(canvas)) {
            document.body.prepend(canvas);
        }
    }

    function resetContext() {
        ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return false;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
    }

    function initializeDots() {
        dots = [];
        if (width <= 0 || height <= 0) return;
        for (var x = config.gridSpacing / 2; x < width; x += config.gridSpacing) {
            for (var y = config.gridSpacing / 2; y < height; y += config.gridSpacing) {
                dots.push({
                    originalX: x,
                    originalY: y,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
    }

    function resize() {
        ensureCanvas();
        dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        if (!resetContext()) return;
        initializeDots();
        draw();
    }

    function getMouseInfluence(x, y) {
        var dx = x - mouse.x;
        var dy = y - mouse.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        return Math.max(0, 1 - distance / 150);
    }

    function draw() {
        if (!ctx || width <= 0 || height <= 0) return;

        var dotRgb = parseColor(config.dotColor);

        if (!reducedMotion) time += config.animationSpeed;
        ctx.clearRect(0, 0, width, height);
        if (config.backgroundColor !== 'transparent') {
            ctx.fillStyle = config.backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        dots.forEach(function (dot) {
            var totalInfluence = getMouseInfluence(dot.originalX, dot.originalY);
            var pulse = reducedMotion ? 0 : Math.sin(time + dot.phase) * 0.5;
            var opacityPulse = reducedMotion ? 0 : Math.abs(Math.sin(time * 0.5 + dot.phase)) * 0.1;
            var dotSize = 2 + totalInfluence * 6 + pulse;
            var opacity = Math.max(0.3, 0.6 + totalInfluence * 0.4 + opacityPulse);
            var half = dotSize;

            ctx.fillStyle = 'rgba(' + dotRgb[0] + ',' + dotRgb[1] + ',' + dotRgb[2] + ',' + opacity + ')';
            ctx.fillRect(dot.originalX - half, dot.originalY - half, half * 2, half * 2);
        });

    }

    function tick() {
        raf = null;
        if (!running || document.hidden) return;

        try {
            draw();
        } catch (err) {
            if (!resetContext()) {
                running = false;
                return;
            }
            initializeDots();
            try { draw(); } catch (_) { running = false; return; }
        }

        raf = window.requestAnimationFrame(tick);
    }

    function startLoop() {
        if (reducedMotion || running) return;
        running = true;
        if (!raf) raf = window.requestAnimationFrame(tick);
    }

    function stopLoop() {
        running = false;
        if (raf) {
            window.cancelAnimationFrame(raf);
            raf = null;
        }
    }

    function setMouse(event) {
        mouse.x = event.clientX;
        mouse.y = event.clientY;
    }

    function onVisible() {
        readConfig();
        resize();
        startLoop();
    }

    function mount() {
        readConfig();
        ensureCanvas();
        resize();

        window.addEventListener('resize', resize);
        document.addEventListener('pointermove', function (event) {
            setMouse(event);
            if (reducedMotion) draw();
        }, { passive: true });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                stopLoop();
            } else {
                onVisible();
            }
        });

        window.addEventListener('paper:theme-changed', function () {
            readConfig();
            draw();
        });

        window.addEventListener('pageshow', function (event) {
            if (event.persisted) onVisible();
        });

        canvas.addEventListener('contextlost', function (event) {
            event.preventDefault();
            stopLoop();
        }, false);

        canvas.addEventListener('contextrestored', function () {
            resetContext();
            readConfig();
            initializeDots();
            startLoop();
        }, false);

        // Recover if the animation loop dies (GPU pressure, tab sleep, etc.)
        window.setInterval(function () {
            if (reducedMotion || document.hidden) return;
            ensureCanvas();
            if (!running || !raf) startLoop();
        }, 2000);

        startLoop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }

    window.addEventListener('beforeunload', stopLoop);
})();
