(function () {
    var header = document.getElementById('landing-header');
    var app = document.getElementById('hero-visual');
    if (!app) return;

    var tabs = app.querySelectorAll('.ly-app__tab');
    var panels = app.querySelectorAll('.ly-app__panel');
    var active = 0;
    var timer = null;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showPanel(index) {
        if (!panels.length) return;
        active = (index + panels.length) % panels.length;

        tabs.forEach(function (tab, i) {
            var on = i === active;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        panels.forEach(function (panel, i) {
            var on = i === active;
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
        });
    }

    function startAuto() {
        if (reduced) return;
        stopAuto();
        timer = window.setInterval(function () {
            showPanel(active + 1);
        }, 5500);
    }

    function stopAuto() {
        if (timer) {
            window.clearInterval(timer);
            timer = null;
        }
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            showPanel(parseInt(tab.dataset.panel, 10) || 0);
            startAuto();
        });
    });

    app.addEventListener('mouseenter', stopAuto);
    app.addEventListener('mouseleave', startAuto);

    showPanel(0);
    startAuto();

    if (header) {
        window.addEventListener('scroll', function () {
            header.classList.toggle('is-scrolled', window.scrollY > 24);
        }, { passive: true });
    }

    document.body.classList.add('hero-loaded');

    window.addEventListener('beforeunload', stopAuto);
})();
