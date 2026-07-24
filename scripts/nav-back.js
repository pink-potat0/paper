(function () {
    var DASHBOARD = '/pages/dashboard';
    var LANDING_PATHS = ['/', '/index.html'];

    function normalizePath(path) {
        if (!path) return '/';
        var p = path.replace(/\/+$/, '') || '/';
        return p.toLowerCase();
    }

    function resolveBackHref(fallback) {
        fallback = fallback || DASHBOARD;
        try {
            if (!document.referrer) return fallback;
            var ref = new URL(document.referrer);
            if (ref.origin !== location.origin) return fallback;
            var refPath = normalizePath(ref.pathname);
            var here = normalizePath(location.pathname);
            if (refPath === here) return fallback;
            if (LANDING_PATHS.indexOf(refPath) !== -1) return fallback;
            return ref.pathname + ref.search + ref.hash;
        } catch (_) {
            return fallback;
        }
    }

    function init() {
        document.querySelectorAll('[data-nav-back]').forEach(function (el) {
            var fallback = el.getAttribute('data-nav-back-fallback') || DASHBOARD;
            el.addEventListener('click', function (event) {
                event.preventDefault();
                location.href = resolveBackHref(fallback);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
