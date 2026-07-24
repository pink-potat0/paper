(function () {
    var WALLET_KEY = "paper.demoWallet.v1";
    var WALLET_KEY_LEGACY = "Paper.demoWallet.v1";
    var STARTING_SOL = 5;
    var MIN_OPEN = 0.001;
    var PNL_HANDLE_KEY = "paper.pnlHandle";
    var PNL_HANDLE_MAX = 10;
    var PERIOD_MS = { "1d": 86400000, "7d": 7 * 86400000 };

    var state = {
        wallet: null,
        mintMeta: {},
        tab: "history",
        search: "",
        pnlPeriod: "7d",
    };

    var pnlCardImage = null;
    var pnlCardFontsPromise = null;

    function loadWallet() {
        try {
            var raw = localStorage.getItem(WALLET_KEY) || localStorage.getItem(WALLET_KEY_LEGACY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed.balanceSol === "number" && parsed.positions && typeof parsed.positions === "object") {
                    return parsed;
                }
            }
        } catch (_) {}
        return { balanceSol: STARTING_SOL, realizedPnlSol: 0, positions: {}, history: [] };
    }

    function toast(msg, kind) {
        var el = document.getElementById("ustat-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "ustat-toast";
            el.className = "ustat-toast";
            el.setAttribute("role", "status");
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = "ustat-toast is-visible" + (kind ? " " + kind : "");
        clearTimeout(el._t);
        el._t = setTimeout(function () {
            el.classList.remove("is-visible");
        }, 2800);
    }

    function normalizePnlHandleInput(value) {
        return String(value || "")
            .trim()
            .replace(/^@+/g, "")
            .slice(0, PNL_HANDLE_MAX);
    }

    function getPnlCardDisplayName() {
        var raw = localStorage.getItem(PNL_HANDLE_KEY);
        var h = normalizePnlHandleInput(raw);
        return h ? "@" + h : "";
    }

    function pnlHandleCandidate(value) {
        var raw = String(value || "").trim();
        if (!raw || raw.length > 24 || /[.â€¦…]/.test(raw)) return "";
        var h = normalizePnlHandleInput(raw);
        return /^[a-zA-Z0-9_]{2,10}$/.test(h) ? h : "";
    }

    function getWalletUsernameForPnlCard() {
        try {
            var direct = pnlHandleCandidate(localStorage.getItem("paper.username"));
            if (direct) return direct;
        } catch (_) {}
        try {
            var session = JSON.parse(localStorage.getItem("paper.wallet.session") || "null");
            var fromSession = pnlHandleCandidate((session && (session.username || session.displayName)) || "");
            if (fromSession) return fromSession;
        } catch (_) {}
        try {
            var fromAuth = pnlHandleCandidate(window.WalletAuth && WalletAuth.getDisplayName && WalletAuth.getDisplayName());
            if (fromAuth) return fromAuth;
        } catch (_) {}
        return "";
    }

    function getWalletUserIdForPnlCard() {
        try {
            var fromAuth = window.WalletAuth && WalletAuth.getUserId && WalletAuth.getUserId();
            if (fromAuth) return fromAuth;
        } catch (_) {}
        try {
            var session = JSON.parse(localStorage.getItem("paper.wallet.session") || "null");
            return session && session.pubkey ? session.pubkey : null;
        } catch (_) {}
        return null;
    }

    function savePnlHandle(value) {
        var h = normalizePnlHandleInput(value);
        if (!h) return false;
        try { localStorage.setItem(PNL_HANDLE_KEY, h); } catch (_) {}
        return true;
    }

    function promptForPnlHandle() {
        return new Promise(function (resolve) {
            document.getElementById("pnl-handle-setup-modal")?.remove();
            var modal = document.createElement("div");
            modal.id = "pnl-handle-setup-modal";
            modal.className = "pnl-card-modal pnl-handle-setup-modal";
            modal.innerHTML =
                '<div class="pnl-card-backdrop"></div>' +
                '<div class="pnl-card-dialog pnl-handle-dialog" role="dialog" aria-modal="true" aria-labelledby="pnl-handle-title">' +
                '<h2 class="pnl-handle-title" id="pnl-handle-title">What should we call you?</h2>' +
                '<p class="pnl-handle-hint">Pick a nickname for your cards. Max ' + PNL_HANDLE_MAX + " characters.</p>" +
                '<input type="text" class="pnl-handle-input" maxlength="' + PNL_HANDLE_MAX + '" autocomplete="nickname" spellcheck="false" placeholder="e.g. bobo12" />' +
                '<div class="pnl-handle-actions">' +
                '<button type="button" class="pnl-card-btn" data-pnl-handle-cancel>Cancel</button>' +
                '<button type="button" class="pnl-card-btn is-primary" data-pnl-handle-save disabled>Continue</button>' +
                "</div></div>";
            document.body.appendChild(modal);
            var input = modal.querySelector(".pnl-handle-input");
            var saveBtn = modal.querySelector("[data-pnl-handle-save]");
            var finish = function (ok) {
                modal.remove();
                resolve(ok);
            };
            var syncSave = function () {
                saveBtn.disabled = normalizePnlHandleInput(input.value) === "";
            };
            input.addEventListener("input", syncSave);
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click();
            });
            modal.querySelector("[data-pnl-handle-cancel]").addEventListener("click", function () { finish(false); });
            modal.querySelector(".pnl-card-backdrop").addEventListener("click", function () { finish(false); });
            saveBtn.addEventListener("click", function () {
                var v = normalizePnlHandleInput(input.value);
                if (!v) return;
                savePnlHandle(v);
                finish(true);
            });
            setTimeout(function () {
                input.focus();
                syncSave();
            }, 0);
        });
    }

    function ensurePnlHandleSet() {
        var raw = localStorage.getItem(PNL_HANDLE_KEY);
        if (raw !== null && normalizePnlHandleInput(raw) !== "") return Promise.resolve(true);
        if (savePnlHandle(getWalletUsernameForPnlCard())) return Promise.resolve(true);
        var userId = getWalletUserIdForPnlCard();
        if (userId && typeof getUserProfile === "function") {
            return getUserProfile(userId)
                .then(function (profile) { return savePnlHandle(profile && profile.username) ? true : promptForPnlHandle(); })
                .catch(function () { return promptForPnlHandle(); });
        }
        return promptForPnlHandle();
    }

    function loadPnlCardFonts() {
        if (!pnlCardFontsPromise) {
            pnlCardFontsPromise = document.fonts.load("185px 'NCLNeovibes Demo'").catch(function () {});
        }
        return pnlCardFontsPromise;
    }

    function loadPnlCardTemplate() {
        if (pnlCardImage) return loadPnlCardFonts().then(function () { return pnlCardImage; });
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function () {
                pnlCardImage = img;
                loadPnlCardFonts().then(function () { resolve(img); });
            };
            img.onerror = reject;
            img.src = "../assets/images/lykeuipnlcard.png";
        });
    }

    function totalUnrealizedSol() {
        var total = 0;
        Object.keys(state.wallet.positions || {}).forEach(function (mint) {
            var pos = state.wallet.positions[mint];
            if (!pos || Number(pos.investedSol) < MIN_OPEN) return;
            var dex = state.mintMeta[mint];
            var mc = Number(dex?.mcUsd) || Number(pos.lastMcUsd) || 0;
            total += unrealizedForPosition(pos, mc);
        });
        return total;
    }

    function computeWalletPnlPeriod(periodKey) {
        var ms = PERIOD_MS[periodKey] || PERIOD_MS["7d"];
        var cutoff = Date.now() - ms;
        var realized = 0;
        var buyVol = 0;
        (state.wallet.history || []).forEach(function (h) {
            var t = Number(h.at) || 0;
            if (t < cutoff) return;
            if (h.kind === "buy") buyVol += Number(h.sol) || 0;
            if (h.kind === "sell" && Number.isFinite(h.pnlSol)) realized += h.pnlSol;
        });
        var pct = buyVol > 0 ? (realized / buyVol) * 100 : 0;
        return { realized: realized, buyVol: buyVol, pct: pct };
    }

    function periodLabel(periodKey) {
        return periodKey === "1d" ? "1-day P&L" : "7-day P&L";
    }

    function periodCardTitle(periodKey) {
        return periodKey === "1d" ? "1 DAY" : "7 DAY";
    }

    function drawPnlCardText(ctx, text, x, y, maxWidth, font, align) {
        ctx.font = font;
        ctx.textAlign = align || "left";
        var measured = ctx.measureText(text).width;
        var sizeMatch = font.match(/(\d+)px/);
        if (measured > maxWidth && sizeMatch) {
            var baseSize = Number(sizeMatch[1]);
            var nextSize = Math.max(34, Math.floor(baseSize * (maxWidth / measured)));
            ctx.font = font.replace(/(\d+)px/, nextSize + "px");
        }
        ctx.fillText(text, x, y);
    }

    async function buildWalletPnlCardCanvas(periodKey) {
        var p = computeWalletPnlPeriod(periodKey);
        var unrealOpen = totalUnrealizedSol();
        var img = pnlCardImage;
        if (!img) return null;
        var W = img.naturalWidth;
        var H = img.naturalHeight;
        var canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = '700 130px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(periodCardTitle(periodKey), W * 0.048 + 52, H * 0.395);
        var pnlSolStr = (p.realized >= 0 ? "+" : "") + p.realized.toFixed(3);
        drawPnlCardText(ctx, pnlSolStr, W * 0.22 - 90, H * 0.58 - 44, W * 0.44, '800 185px "NCLNeovibes Demo", "Helvetica Neue", Arial, sans-serif');
        var statsY = H * 0.796 + 148;
        ctx.font = '700 60px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(p.buyVol.toFixed(2) + " SOL", Math.max(16, W * 0.40 - 666), statsY);
        ctx.fillText(unrealOpen.toFixed(2) + " SOL", Math.max(16, W * 0.58 - 640), statsY);
        ctx.textAlign = "right";
        drawPnlCardText(ctx, (p.pct >= 0 ? "+" : "") + p.pct.toFixed(1) + "%", Math.max(80, W * 0.955 - 840), statsY, 220, '700 60px "Helvetica Neue", Arial, sans-serif', "right");
        var uname = getPnlCardDisplayName();
        if (uname) drawPnlCardText(ctx, uname, W - 128, statsY, 420, '500 60px "Helvetica Neue", Arial, sans-serif', "right");
        return canvas;
    }

    async function buildTokenPnlCardCanvas(mint) {
        var pos = state.wallet.positions[mint];
        var hist = (state.wallet.history || []).filter(function (h) { return h.mint === mint; });
        var investedTotal = hist.filter(function (h) { return h.kind === "buy"; })
            .reduce(function (sum, h) { return sum + (Number(h.sol) || 0); }, 0);
        var realized = hist.filter(function (h) { return h.kind === "sell"; })
            .reduce(function (sum, h) { return sum + (Number(h.pnlSol) || 0); }, 0);
        var holding = 0;
        var unrealized = 0;
        if (pos && Number(pos.entryMcUsd) > 0) {
            var dex = state.mintMeta[mint];
            var mc = Number(dex?.mcUsd) || Number(pos.lastMcUsd) || Number(pos.entryMcUsd);
            var ratio = mc > 0 ? mc / Number(pos.entryMcUsd) : 1;
            holding = (Number(pos.investedSol) || 0) * ratio;
            unrealized = holding - (Number(pos.investedSol) || 0);
        }
        var pnl = realized + unrealized;
        var pct = investedTotal > 0 ? (pnl / investedTotal) * 100 : 0;
        var ticker = String(metaForMint(mint).symbol || "TKN").replace(/^\$?/, "").toUpperCase();
        var img = pnlCardImage;
        if (!img) return null;
        var W = img.naturalWidth;
        var H = img.naturalHeight;
        var canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = '700 130px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(ticker, W * 0.048 + 52, H * 0.395);
        drawPnlCardText(ctx, (pnl >= 0 ? "+" : "") + pnl.toFixed(3), W * 0.22 - 90, H * 0.58 - 44, W * 0.44, '800 185px "NCLNeovibes Demo", "Helvetica Neue", Arial, sans-serif');
        var statsY = H * 0.796 + 148;
        ctx.font = '700 60px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(investedTotal.toFixed(2) + " SOL", Math.max(16, W * 0.40 - 666), statsY);
        ctx.fillText(holding.toFixed(2) + " SOL", Math.max(16, W * 0.58 - 640), statsY);
        drawPnlCardText(ctx, (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%", Math.max(80, W * 0.955 - 840), statsY, 220, '700 60px "Helvetica Neue", Arial, sans-serif', "right");
        var uname = getPnlCardDisplayName();
        if (uname) drawPnlCardText(ctx, uname, W - 128, statsY, 420, '500 60px "Helvetica Neue", Arial, sans-serif', "right");
        return canvas;
    }

    function showPnlCardModal(canvas, downloadSlug) {
        document.getElementById("pnl-card-modal")?.remove();
        var modal = document.createElement("div");
        modal.id = "pnl-card-modal";
        modal.className = "pnl-card-modal";
        modal.innerHTML =
            '<div class="pnl-card-backdrop"></div>' +
            '<div class="pnl-card-dialog">' +
            '<button type="button" class="pnl-card-close" aria-label="Close">×</button>' +
            '<div class="pnl-card-preview"></div>' +
            '<div class="pnl-card-actions">' +
            '<button type="button" class="pnl-card-btn is-primary" data-action="download">Download</button>' +
            '<button type="button" class="pnl-card-btn" data-action="copy">Copy image</button>' +
            "</div></div>";
        var preview = modal.querySelector(".pnl-card-preview");
        canvas.style.maxWidth = "100%";
        canvas.style.height = "auto";
        canvas.style.borderRadius = "10px";
        canvas.style.display = "block";
        preview.appendChild(canvas);
        document.body.appendChild(modal);
        var close = function () { modal.remove(); };
        modal.querySelector(".pnl-card-close").addEventListener("click", close);
        modal.querySelector(".pnl-card-backdrop").addEventListener("click", close);
        modal.querySelector('[data-action="download"]').addEventListener("click", function () {
            canvas.toBlob(function (blob) {
                if (!blob) return;
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                var sym = String(downloadSlug || "pnl").replace(/[^a-z0-9]/gi, "_").toLowerCase();
                a.href = url;
                a.download = "paper-pnl-" + sym + ".png";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
                toast("PnL card downloaded", "is-pos");
            }, "image/png");
        });
        modal.querySelector('[data-action="copy"]').addEventListener("click", function () {
            new Promise(function (r) { canvas.toBlob(r, "image/png"); }).then(function (blob) {
                if (!blob) throw new Error("blob failed");
                if (navigator.clipboard && window.ClipboardItem) {
                    return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                }
                throw new Error("unsupported");
            }).then(function () {
                toast("Image copied to clipboard", "is-pos");
            }).catch(function () {
                toast("Copy failed — use Download", "is-err");
            });
        });
    }

    function fmtSol(n, digits) {
        var x = Number(n) || 0;
        return (x >= 0 ? "" : "-") + Math.abs(x).toFixed(digits == null ? 3 : digits) + " SOL";
    }

    function fmtSolSigned(n, digits) {
        var x = Number(n) || 0;
        if (Math.abs(x) < 0.0000001) return "0 SOL";
        return (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(digits == null ? 3 : digits) + " SOL";
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function truncateMint(m) {
        m = String(m || "");
        if (m.length < 12) return m;
        return m.slice(0, 4) + "…" + m.slice(-4);
    }

    function metaForMint(mint) {
        var m = state.mintMeta[mint] || {};
        var pos = state.wallet.positions[mint];
        return {
            symbol: m.symbol || pos?.symbol || truncateMint(mint),
            name: m.name || pos?.name || "Token",
            image: m.image || pos?.image_uri || "",
        };
    }

    function unrealizedForPosition(pos, mcUsd) {
        var entry = Number(pos.entryMcUsd) || 0;
        var mc = Number(mcUsd) || Number(pos.lastMcUsd) || 0;
        if (!entry || !mc) return 0;
        return pos.investedSol * (mc / entry - 1);
    }

    function computeSnapshot() {
        var wallet = state.wallet;
        var unrealized = 0;
        var investedOpen = 0;

        Object.keys(wallet.positions || {}).forEach(function (mint) {
            var pos = wallet.positions[mint];
            if (!pos || Number(pos.investedSol) < MIN_OPEN) return;
            investedOpen += Number(pos.investedSol) || 0;
            var dex = state.mintMeta[mint];
            var mc = Number(dex?.mcUsd) || Number(pos.lastMcUsd) || 0;
            unrealized += unrealizedForPosition(pos, mc);
        });

        var tradeable = Number(wallet.balanceSol) || 0;
        var totalValue = tradeable + investedOpen + unrealized;

        return {
            totalValue: totalValue,
            unrealized: unrealized,
            tradeable: tradeable,
        };
    }

    function renderBalance(snap) {
        var el = function (id) { return document.getElementById(id); };
        if (el("ustat-total-value")) el("ustat-total-value").textContent = fmtSol(snap.totalValue);
        var unr = el("ustat-unrealized");
        if (unr) {
            unr.textContent = fmtSolSigned(snap.unrealized);
            unr.classList.toggle("is-up", snap.unrealized > 0);
            unr.classList.toggle("is-down", snap.unrealized < 0);
        }
        if (el("ustat-tradeable")) el("ustat-tradeable").textContent = fmtSol(snap.tradeable);
        if (el("ustat-funding-bal")) el("ustat-funding-bal").textContent = fmtSol(snap.tradeable, 3);
        renderPeriodPnl();
    }

    function renderPeriodPnl() {
        var p = computeWalletPnlPeriod(state.pnlPeriod);
        var label = document.getElementById("ustat-period-label");
        var pnlEl = document.getElementById("ustat-period-pnl");
        if (label) label.textContent = periodLabel(state.pnlPeriod);
        if (pnlEl) {
            pnlEl.textContent = fmtSolSigned(p.realized);
            pnlEl.classList.toggle("is-up", p.realized > 0);
            pnlEl.classList.toggle("is-down", p.realized < 0);
        }
    }

    function tokenCell(mint) {
        var meta = metaForMint(mint);
        var sym = String(meta.symbol).replace(/^\$?/, "$");
        var href = "/pages/demo-trading-terminal?chartonly=1#" + encodeURIComponent(mint);
        var img = meta.image
            ? '<img src="' + escapeHtml(meta.image) + '" alt="" loading="lazy">'
            : "<i aria-hidden=\"true\"></i>";
        return (
            '<a class="ustat-token ustat-token-link" href="' + escapeHtml(href) + '" title="Trade ' + escapeHtml(sym) + '">' + img +
            "<div><b>" + escapeHtml(sym) + "</b><small>" + escapeHtml(meta.name) + "</small></div></a>"
        );
    }

    function aggregateByMint() {
        var map = {};
        (state.wallet.history || []).forEach(function (h) {
            if (!h.mint) return;
            if (!map[h.mint]) map[h.mint] = { mint: h.mint, bought: 0, sold: 0, pnl: 0 };
            if (h.kind === "buy") map[h.mint].bought += Number(h.sol) || 0;
            if (h.kind === "sell") {
                map[h.mint].sold += Number(h.sol) || 0;
                map[h.mint].pnl += Number(h.pnlSol) || 0;
            }
        });
        return Object.values(map);
    }

    function rowsForTab() {
        var q = state.search.trim().toLowerCase();
        function matchMint(mint) {
            if (!q) return true;
            var meta = metaForMint(mint);
            return mint.toLowerCase().indexOf(q) !== -1 ||
                String(meta.symbol).toLowerCase().indexOf(q) !== -1 ||
                String(meta.name).toLowerCase().indexOf(q) !== -1;
        }

        if (state.tab === "active") {
            return Object.keys(state.wallet.positions || {})
                .filter(function (m) {
                    var p = state.wallet.positions[m];
                    return p && Number(p.investedSol) >= MIN_OPEN;
                })
                .filter(matchMint)
                .map(function (mint) {
                    var pos = state.wallet.positions[mint];
                    var dex = state.mintMeta[mint];
                    var mc = Number(dex?.mcUsd) || Number(pos.lastMcUsd) || 0;
                    var unreal = unrealizedForPosition(pos, mc);
                    var hist = (state.wallet.history || []).filter(function (h) { return h.mint === mint; });
                    var bought = hist.filter(function (h) { return h.kind === "buy"; }).reduce(function (s, h) { return s + (Number(h.sol) || 0); }, 0);
                    var sold = hist.filter(function (h) { return h.kind === "sell"; }).reduce(function (s, h) { return s + (Number(h.sol) || 0); }, 0);
                    return { mint: mint, bought: bought, sold: sold, pnl: unreal, open: true, invested: pos.investedSol };
                });
        }

        if (state.tab === "top") {
            return aggregateByMint()
                .filter(function (r) { return matchMint(r.mint); })
                .map(function (r) {
                    var cost = r.bought - r.pnl;
                    r.pnlPct = cost > 0 ? (r.pnl / cost) * 100 : 0;
                    return r;
                })
                .sort(function (a, b) { return b.pnlPct - a.pnlPct; })
                .slice(0, 100);
        }

        return aggregateByMint()
            .filter(function (r) { return r.sold > 0 && matchMint(r.mint); })
            .sort(function (a, b) {
                var ta = (state.wallet.history || []).find(function (h) { return h.mint === a.mint && h.kind === "sell"; });
                var tb = (state.wallet.history || {}).find(function (h) { return h.mint === b.mint && h.kind === "sell"; });
                return (tb?.at || 0) - (ta?.at || 0);
            });
    }

    function renderTable() {
        var body = document.getElementById("ustat-table-body");
        if (!body) return;
        var rows = rowsForTab();
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5"><div class="ustat-empty">No trades to show yet. Head to Paper Trade to start trading.</div></td></tr>';
            return;
        }

        body.innerHTML = rows.map(function (r) {
            var pnlCls = r.pnl >= 0 ? "ustat-pnl-up" : "ustat-pnl-down";
            var cost = r.bought - (r.pnl || 0);
            var pct = cost > 0 ? ((r.pnl / cost) * 100) : (r.pnlPct || 0);
            var pnlLabel = (r.pnl >= 0 ? "+" : "") + fmtSol(r.pnl, 3);
            if (Math.abs(pct) > 0.05) {
                pnlLabel += " (" + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%)";
            }
            return (
                "<tr>" +
                "<td>" + tokenCell(r.mint) + "</td>" +
                '<td class="ustat-amt-up">' + fmtSol(r.bought, 3) + "</td>" +
                '<td class="ustat-amt-down">' + (r.sold > 0 ? fmtSol(r.sold, 3) : "—") + "</td>" +
                '<td class="' + pnlCls + '">' + pnlLabel + "</td>" +
                '<td class="ustat-row-actions"><button type="button" class="ustat-token-share" data-share-pnl-mint="' + escapeHtml(r.mint) + '" title="Share this token P&amp;L">Share P&amp;L</button></td>' +
                "</tr>"
            );
        }).join("");
    }

    function renderActivity() {
        var list = document.getElementById("ustat-activity-list");
        if (!list) return;
        var items = (state.wallet.history || []).slice(0, 40);
        if (!items.length) {
            list.innerHTML = '<div class="ustat-empty">No activity yet</div>';
            return;
        }
        list.innerHTML = items.map(function (h) {
            var meta = metaForMint(h.mint);
            var sym = String(meta.symbol).replace(/^\$?/, "");
            var age = h.at ? timeAgo(h.at) : "—";
            var amt = fmtSol(h.sol, 3);
            return (
                '<div class="ustat-act-row">' +
                '<span class="ustat-act-type ' + escapeHtml(h.kind) + '">' + escapeHtml(h.kind) + "</span>" +
                '<span class="ustat-act-token">' + escapeHtml(sym) + "</span>" +
                '<span class="ustat-act-meta"><strong>' + escapeHtml(amt) + "</strong>" + escapeHtml(age) + "</span>" +
                "</div>"
            );
        }).join("");
    }

    function timeAgo(ms) {
        var sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
        if (sec < 60) return sec + "s";
        if (sec < 3600) return Math.floor(sec / 60) + "m";
        if (sec < 86400) return Math.floor(sec / 3600) + "h";
        return Math.floor(sec / 86400) + "d";
    }

    function walletAgeDays() {
        var hist = state.wallet.history || [];
        if (!hist.length) return 0;
        var oldest = hist.reduce(function (m, h) { return Math.min(m, h.at || Date.now()); }, Date.now());
        return Math.max(1, Math.floor((Date.now() - oldest) / 86400000));
    }

    function renderAll() {
        var snap = computeSnapshot();
        renderBalance(snap);
        renderTable();
        renderActivity();
        var days = document.getElementById("ustat-wallet-age");
        if (days) days.textContent = walletAgeDays() + "d paper wallet";
    }

    function neededMints() {
        var set = {};
        Object.keys(state.wallet.positions || {}).forEach(function (m) { set[m] = 1; });
        (state.wallet.history || []).forEach(function (h) { if (h.mint) set[h.mint] = 1; });
        return Object.keys(set);
    }

    function fetchMintMeta(mints) {
        var pending = mints.filter(function (m) { return !state.mintMeta[m]; });
        if (!pending.length) return Promise.resolve();
        var chunks = [];
        for (var i = 0; i < pending.length; i += 20) chunks.push(pending.slice(i, i + 20));
        return chunks.reduce(function (chain, group) {
            return chain.then(function () {
                return fetch("https://api.dexscreener.com/latest/dex/tokens/" + group.join(","))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        (data.pairs || []).forEach(function (p) {
                            if (p.chainId !== "solana" || !p.baseToken?.address) return;
                            var addr = p.baseToken.address;
                            if (!state.mintMeta[addr]) {
                                state.mintMeta[addr] = {
                                    symbol: p.baseToken.symbol,
                                    name: p.baseToken.name,
                                    image: p.info?.imageUrl || "",
                                    mcUsd: Number(p.marketCap) || Number(p.fdv) || 0,
                                };
                            }
                        });
                    })
                    .catch(function () {});
            });
        }, Promise.resolve());
    }

    function bindUi() {
        var tableBody = document.getElementById("ustat-table-body");
        if (tableBody) {
            tableBody.addEventListener("click", function (event) {
                var button = event.target.closest("[data-share-pnl-mint]");
                if (!button) return;
                event.preventDefault();
                var mint = button.getAttribute("data-share-pnl-mint");
                if (!mint || button.disabled) return;
                button.disabled = true;
                ensurePnlHandleSet()
                    .then(function (ready) { return ready ? loadPnlCardTemplate() : null; })
                    .then(function (template) { return template ? buildTokenPnlCardCanvas(mint) : null; })
                    .then(function (canvas) {
                        if (!canvas) return;
                        var slug = String(metaForMint(mint).symbol || "token")
                            .replace(/[^a-z0-9]/gi, "_").toLowerCase();
                        showPnlCardModal(canvas, slug);
                    })
                    .catch(function (error) {
                        console.warn("[pnl-card] token share failed", error);
                        toast("Could not load PnL card", "is-err");
                    })
                    .finally(function () { button.disabled = false; });
            });
        }
        document.querySelectorAll(".ustat-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                state.tab = btn.getAttribute("data-tab") || "history";
                document.querySelectorAll(".ustat-tab").forEach(function (b) {
                    b.classList.toggle("is-active", b === btn);
                });
                renderTable();
            });
        });
        var search = document.getElementById("ustat-search");
        if (search) {
            search.addEventListener("input", function () {
                state.search = search.value;
                renderTable();
            });
        }
        document.querySelectorAll(".ustat-pnl-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                state.pnlPeriod = btn.getAttribute("data-period") || "7d";
                document.querySelectorAll(".ustat-pnl-tab").forEach(function (b) {
                    var active = b === btn;
                    b.classList.toggle("is-active", active);
                    b.setAttribute("aria-selected", active ? "true" : "false");
                });
                renderPeriodPnl();
            });
        });
        var shareBtn = document.getElementById("ustat-share-pnl-btn");
        if (shareBtn) {
            shareBtn.addEventListener("click", function () {
                ensurePnlHandleSet().then(function (ok) {
                    if (!ok) return;
                    return loadPnlCardTemplate();
                }).then(function () {
                    return buildWalletPnlCardCanvas(state.pnlPeriod);
                }).then(function (canvas) {
                    if (!canvas) throw new Error("canvas failed");
                    showPnlCardModal(canvas, "wallet-" + state.pnlPeriod + "-pnl");
                }).catch(function (err) {
                    console.warn("[pnl-card] share failed", err);
                    toast("Could not load PnL template", "is-err");
                });
            });
        }
    }

    function updateWalletLabel() {
        var el = document.getElementById("ustat-wallet-label");
        if (!el || !window.WalletAuth) return;
        if (WalletAuth.isConnected()) {
            var session = WalletAuth.getSession();
            var name = WalletAuth.getDisplayName();
            el.textContent = (name || "Trader") + " · " + WalletAuth.truncateAddress(session?.pubkey || "");
        } else {
            el.textContent = "Paper wallet stats · connect wallet to link your profile";
        }
    }

    function init() {
        state.wallet = loadWallet();
        bindUi();
        updateWalletLabel();
        window.addEventListener("paper:wallet-connected", updateWalletLabel);
        window.addEventListener("paper:wallet-disconnected", updateWalletLabel);

        fetchMintMeta(neededMints()).then(renderAll);

        window.addEventListener("storage", function (e) {
            if (e.key === WALLET_KEY || e.key === WALLET_KEY_LEGACY) {
                state.wallet = loadWallet();
                fetchMintMeta(neededMints()).then(renderAll);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
