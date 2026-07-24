(function (global) {
    var WALLET_KEY = 'paper.demoWallet.v1';
    var LEGACY_WALLET_KEY = 'Paper.demoWallet.v1';
    var SESSION_KEY = 'paper.wallet.session';
    var lastSyncedPayload = '';
    var syncing = false;

    function readJson(key) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (_) {
            return null;
        }
    }

    function compactPaperWallet(wallet) {
        var positions = {};
        Object.keys(wallet.positions || {}).slice(0, 250).forEach(function (mint) {
            var position = wallet.positions[mint] || {};
            positions[mint] = {
                investedSol: Number(position.investedSol) || 0,
                entryMcUsd: Number(position.entryMcUsd) || 0,
                lastMcUsd: Number(position.lastMcUsd) || 0
            };
        });
        return {
            balanceSol: Number(wallet.balanceSol) || 0,
            positions: positions,
            history: (Array.isArray(wallet.history) ? wallet.history : []).slice(0, 500).map(function (item) {
                return {
                    kind: item.kind === 'sell' ? 'sell' : 'buy',
                    sol: Number(item.sol) || 0,
                    pnlSol: Number(item.pnlSol) || 0,
                    at: Number(item.at) || 0
                };
            })
        };
    }

    async function syncNow(force) {
        if (syncing) return false;
        var session = readJson(SESSION_KEY);
        var wallet = readJson(WALLET_KEY) || readJson(LEGACY_WALLET_KEY);
        if (!session || !session.pubkey || !session.username || !wallet) return false;
        var body = {
            walletAddress: session.pubkey,
            paperWallet: compactPaperWallet(wallet)
        };
        var serialized = JSON.stringify(body);
        if (!force && serialized === lastSyncedPayload) return true;
        syncing = true;
        try {
            var response = await fetch('/api/leaderboard/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: serialized
            });
            if (!response.ok) return false;
            lastSyncedPayload = serialized;
            global.dispatchEvent(new CustomEvent('paper:leaderboard-synced'));
            return true;
        } catch (_) {
            return false;
        } finally {
            syncing = false;
        }
    }

    global.PaperLeaderboardSync = { syncNow: syncNow };
    global.addEventListener('paper:wallet-connected', function () { syncNow(true); });
    global.addEventListener('paper:wallet-updated', function () { syncNow(false); });
    global.addEventListener('storage', function (event) {
        if (event.key === WALLET_KEY || event.key === LEGACY_WALLET_KEY || event.key === SESSION_KEY) syncNow(false);
    });
    setTimeout(function () { syncNow(true); }, 600);
    setInterval(function () { syncNow(false); }, 5000);
})(window);
