(function () {
    function syncNav() {
        var btn = document.getElementById('nav-connect-btn');
        if (!btn) return;
        var label = btn.querySelector('.metal-shine-button__label') || btn.querySelector('.liquid-metal-button__label');
        function setText(text) {
            if (label) label.textContent = text;
            else btn.textContent = text;
        }
        if (WalletAuth.isConnected()) {
            setText(WalletAuth.getDisplayName());
            btn.classList.add('wallet-connected-pill');
            btn.setAttribute('aria-label', 'Wallet connected — click to manage or switch');
        } else {
            setText('Connect Wallet');
            btn.classList.remove('wallet-connected-pill');
            btn.setAttribute('aria-label', 'Connect wallet');
        }
    }

    function init() {
        var btn = document.getElementById('nav-connect-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                WalletModal.open();
            });
        }

        function bindHeroConnect(id) {
            var hero = document.getElementById(id);
            if (!hero) return;
            hero.addEventListener('click', function () {
                if (WalletAuth.isConnected()) {
                    window.location.href = '/pages/dashboard';
                } else {
                    WalletModal.open();
                }
            });
        }

        bindHeroConnect('hero-connect-btn');
        bindHeroConnect('hero-connect-btn-2');

        function setHeroLabel(text) {
            ['hero-connect-btn', 'hero-connect-btn-2'].forEach(function (id) {
                var btn = document.getElementById(id);
                if (!btn) return;
                var label = btn.querySelector('.metal-shine-button__label') || btn.querySelector('.liquid-metal-button__label') || btn.querySelector('.lp-btn-glow__label');
                if (label) label.textContent = text;
                else btn.textContent = text;
            });
        }

        window.addEventListener('paper:wallet-connected', function () {
            syncNav();
            setHeroLabel('Go to Dashboard');
        });

        window.addEventListener('paper:wallet-disconnected', function () {
            syncNav();
            setHeroLabel('Connect Wallet');
        });

        syncNav();
        if (WalletAuth.isConnected()) {
            setHeroLabel('Go to Dashboard');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
