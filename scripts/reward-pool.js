(function (global) {
    var refreshing = false;

    function formatSol(value) {
        var amount = Number(value) || 0;
        return amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: amount < 10 ? 3 : 2
        }) + ' SOL';
    }

    function setText(selector, value) {
        document.querySelectorAll(selector).forEach(function (element) {
            element.textContent = value;
        });
    }

    function render(pool) {
        setText('[data-reward-pool-total]', formatSol(pool.totalPoolSol));
        setText('[data-reward-prize="first"]', formatSol(pool.prizes?.first));
        setText('[data-reward-prize="second"]', formatSol(pool.prizes?.second));
        setText('[data-reward-prize="third"]', formatSol(pool.prizes?.third));
    }

    async function refresh() {
        if (refreshing || document.hidden) return;
        refreshing = true;
        try {
            var response = await fetch('/api/rewards/pool', {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            var pool = await response.json();
            if (!response.ok || !pool.prizes) return;
            render(pool);
        } catch (_) {
            // Keep the server-rendered 0.5 SOL base visible while the RPC is unavailable.
        } finally {
            refreshing = false;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
    else refresh();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    setInterval(refresh, 60000);
    global.PaperRewardPool = { refresh: refresh };
})(window);
