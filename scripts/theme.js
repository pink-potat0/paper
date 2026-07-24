(function () {
    var STORAGE_KEY = 'paper-theme';

    function getPreferred() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (_) {}
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('.theme-toggle').forEach(function (btn) {
            var isLight = theme === 'light';
            btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
            btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
            var icon = btn.querySelector('.theme-toggle-icon');
            if (icon) icon.textContent = isLight ? '☀' : '☾';
        });
        notifyThemeChanged(theme);
    }

    function notifyThemeChanged(theme) {
        try {
            window.dispatchEvent(new CustomEvent('paper:theme-changed', { detail: { theme: theme } }));
        } catch (_) {}
    }

    function toggleTheme() {
        var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
        applyTheme(next);
    }

    applyTheme(getPreferred());

    document.addEventListener('click', function (e) {
        if (e.target.closest('.theme-toggle')) toggleTheme();
    });
})();
