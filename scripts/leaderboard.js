(function (global) {
    var loading = false;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function currentWalletAddress() {
        try {
            var session = JSON.parse(localStorage.getItem('paper.wallet.session') || 'null');
            return session && session.pubkey ? session.pubkey : '';
        } catch (_) {
            return '';
        }
    }

    function formatPnl(value) {
        var amount = Number(value) || 0;
        return (amount >= 0 ? '+' : '') + amount.toFixed(3) + ' SOL';
    }

    function setActiveView(view, updateUrl) {
        var nextView = view === 'payouts' ? 'payouts' : 'rankings';
        document.querySelectorAll('[data-lb-view]').forEach(function (tab) {
            var active = tab.getAttribute('data-lb-view') === nextView;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.setAttribute('tabindex', active ? '0' : '-1');
        });
        document.querySelectorAll('[data-lb-panel]').forEach(function (panel) {
            panel.hidden = panel.getAttribute('data-lb-panel') !== nextView;
        });
        if (updateUrl && global.history && global.history.replaceState) {
            var nextUrl = global.location.pathname + global.location.search + (nextView === 'payouts' ? '#payouts' : '');
            global.history.replaceState(null, '', nextUrl);
        }
    }

    function initViews() {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-lb-view]'));
        if (!tabs.length) return;
        tabs.forEach(function (tab, index) {
            tab.addEventListener('click', function () {
                setActiveView(tab.getAttribute('data-lb-view'), true);
            });
            tab.addEventListener('keydown', function (event) {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                var direction = event.key === 'ArrowRight' ? 1 : -1;
                var next = tabs[(index + direction + tabs.length) % tabs.length];
                setActiveView(next.getAttribute('data-lb-view'), true);
                next.focus();
            });
        });
        setActiveView(global.location.hash === '#payouts' ? 'payouts' : 'rankings', false);
        global.addEventListener('hashchange', function () {
            setActiveView(global.location.hash === '#payouts' ? 'payouts' : 'rankings', false);
        });
    }

    function render(traders) {
        var table = document.querySelector('.lp-leaderboard__table');
        if (!table) return;
        table.querySelectorAll('.lp-leaderboard__row:not(.lp-leaderboard__row--head)').forEach(function (row) {
            row.remove();
        });
        document.body.classList.remove('leaderboard-live-loading');
        if (!traders.length) {
            table.insertAdjacentHTML('beforeend',
                '<div class="lp-leaderboard__row lb-live-empty" role="row">' +
                '<span role="cell">No synced traders yet. Register a username and make a paper trade to appear here.</span>' +
                '</div>');
            return;
        }
        var mine = currentWalletAddress();
        table.insertAdjacentHTML('beforeend', traders.map(function (trader) {
            var rank = Number(trader.rank) || 0;
            var rankClass = rank > 0 && rank <= 5 ? ' lp-leaderboard__row--' + rank : '';
            var mineClass = mine && trader.walletAddress === mine ? ' is-current-user' : '';
            var pnl = Number(trader.pnlSol) || 0;
            return '<div class="lp-leaderboard__row' + rankClass + mineClass + '" role="row">' +
                '<span class="lp-leaderboard__rank" role="cell">' + rank + '</span>' +
                '<span class="lp-leaderboard__trader" role="cell"><i aria-hidden="true"></i>' + escapeHtml(trader.username) + '</span>' +
                '<span class="lp-leaderboard__stat" role="cell">' + (Number(trader.trades) || 0) + '</span>' +
                '<span class="lp-leaderboard__stat" role="cell">' + (Number(trader.winRate) || 0).toFixed(0) + '%</span>' +
                '<span class="lp-leaderboard__pnl ' + (pnl >= 0 ? 'is-up' : 'is-down') + '" role="cell">' + formatPnl(pnl) + '</span>' +
                '</div>';
        }).join(''));
    }

    async function refresh() {
        if (loading || document.hidden) return;
        loading = true;
        try {
            if (global.PaperLeaderboardSync) await global.PaperLeaderboardSync.syncNow(false);
            var response = await fetch('/api/leaderboard?limit=100', {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('Leaderboard unavailable');
            var data = await response.json();
            render(Array.isArray(data.traders) ? data.traders : []);
        } catch (_) {
        } finally {
            loading = false;
        }
    }

    global.addEventListener('paper:leaderboard-synced', refresh);
    global.addEventListener('paper:wallet-connected', refresh);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initViews();
            refresh();
        });
    } else {
        initViews();
        refresh();
    }
    setInterval(refresh, 8000);
})(window);
