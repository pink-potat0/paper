(function () {
    var msgEl = document.getElementById('msg');
    var recentSection = document.getElementById('wallet-recent-section');
    var recentList = document.getElementById('wallet-recent-list');
    var walletGrid = document.getElementById('wallet-grid');

    function setMessage(text, type) {
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.className = 'auth-message' + (type ? ' ' + type : '');
    }

    function walletIcon(id) {
        var icons = {
            jupiter: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="jup" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22c55e"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><circle cx="16" cy="16" r="14" fill="url(#jup)"/><ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/></svg>',
            phantom: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#ab9ff2"/><path fill="#fff" d="M22 14.5c0-3.6-2.9-6.5-6.5-6.5S9 10.9 9 14.5c0 2.8 1.8 5.2 4.3 6.1-.2.7-.8 2.4-1 3.1-.1.4.3.7.6.5.8-.5 2.4-1.6 3.2-2.1.4.1.9.1 1.4.1 3.6 0 6.5-2.9 6.5-6.5z"/></svg>',
            trust: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0500ff"/><path fill="#fff" d="M16 7l7 3v6c0 5-3 9-7 11-4-2-7-6-7-11v-6l7-3z"/></svg>',
            metamask: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#f6851b"/><path fill="#e2761b" d="M16 6l-8 8 2 12 6 4 6-4 2-12-8-8z"/></svg>',
            solflare: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#fc8c04"/><path fill="#111" d="M10 20l6-12 6 12H10z"/></svg>'
        };
        return icons[id] || '';
    }

    function renderWalletButton(wallet, isRecent) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wallet-option' + (WalletAuth.isInstalled(wallet.id) ? '' : ' is-uninstalled');
        btn.dataset.walletId = wallet.id;
        btn.innerHTML =
            '<span class="wallet-option-icon">' + walletIcon(wallet.id) + '</span>' +
            '<span class="wallet-option-name">' + wallet.name + '</span>' +
            (WalletAuth.isInstalled(wallet.id) ? '' : '<span class="wallet-option-hint">Install</span>');
        btn.addEventListener('click', function () { handleConnect(wallet.id); });
        return btn;
    }

    async function handleConnect(walletId) {
        setMessage('Connecting…', 'loading');
        try {
            await WalletAuth.connect(walletId);
            setMessage('Connected! Redirecting…', 'success');
            setTimeout(function () {
                window.location.href = 'dashboard';
            }, 600);
        } catch (err) {
            setMessage(err.message || 'Connection failed', 'error');
        }
    }

    function renderWalletLists() {
        if (!walletGrid) return;

        var recent = WalletAuth.readRecent();
        if (recent && recent.walletId && recentSection && recentList) {
            var rw = WalletAuth.getWallet(recent.walletId);
            if (rw) {
                recentSection.hidden = false;
                recentList.innerHTML = '';
                recentList.appendChild(renderWalletButton(rw, true));
            }
        }

        walletGrid.innerHTML = '';
        WalletAuth.WALLETS.forEach(function (wallet) {
            if (recent && wallet.id === recent.walletId) return;
            walletGrid.appendChild(renderWalletButton(wallet));
        });
    }

    if (WalletAuth.isConnected()) {
        window.location.href = 'dashboard';
        return;
    }

    renderWalletLists();
})();
