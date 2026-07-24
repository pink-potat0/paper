(function () {
    var canvas = document.getElementById('space-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var particles = [];
    var count = reduced ? 80 : 180;
    var scrollZ = 0;
    var mouse = { x: 0.5, y: 0.5 };
    var w = 0;
    var h = 0;
    var accent = [45, 212, 191];
    var accent2 = [99, 102, 241];

    function readAccent() {
        var rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
        if (rgb) accent = rgb.split(',').map(function (n) { return parseInt(n, 10); });
        var rgb2 = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary-rgb').trim();
        if (rgb2) accent2 = rgb2.split(',').map(function (n) { return parseInt(n, 10); });
    }

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }

    function init() {
        particles = [];
        for (var i = 0; i < count; i++) {
            particles.push({
                x: (Math.random() - 0.5) * 2400,
                y: (Math.random() - 0.5) * 2400,
                z: Math.random() * 2000,
                s: Math.random() * 2 + 0.4,
                c: Math.random() > 0.82 ? 1 : 0
            });
        }
    }

    function project(p, camZ) {
        var fov = 480;
        var z = p.z - camZ;
        if (z < 10) z = 10;
        var scale = fov / z;
        return {
            x: w / 2 + (p.x + (mouse.x - 0.5) * 120) * scale,
            y: h / 2 + (p.y + (mouse.y - 0.5) * 80) * scale,
            r: Math.max(0.4, p.s * scale * 0.9),
            a: Math.min(1, scale * 0.55)
        };
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        var camZ = scrollZ * 2200;
        var sorted = particles.slice().sort(function (a, b) { return (b.z - camZ) - (a.z - camZ); });

        sorted.forEach(function (p) {
            var dot = project(p, camZ);
            if (dot.x < -20 || dot.x > w + 20 || dot.y < -20 || dot.y > h + 20) return;
            var rgb = p.c ? accent2 : accent;
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (dot.a * 0.75) + ')';
            ctx.fill();
        });

        if (!reduced) requestAnimationFrame(draw);
    }

    window.LandingSpace = {
        setScroll: function (v) {
            scrollZ = v;
        }
    };

    window.addEventListener('resize', function () {
        resize();
        init();
    });

    window.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX / w;
        mouse.y = e.clientY / h;
    });

    document.addEventListener('DOMContentLoaded', function () {
        readAccent();
        resize();
        init();
        draw();
    });

    window.addEventListener('paper:theme-changed', readAccent);
})();
