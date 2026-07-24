function _chatContainer() {
  return document.getElementById("chat-container");
}

function isPriceQuotePayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "price_quote_widget");
}

function isTokenInfoPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "token_info_widget");
}

function isLaunchpadVolumePayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "launchpad_volume_widget");
}

function isHotTokensPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "hot_tokens_widget");
}

function isWalletAnalysisPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "wallet_analysis_widget");
}

function isSwapQuotePayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "swap_quote_widget");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendMessage(message, sender) {
  const container = _chatContainer();
  if (!container) return null;
  const el = document.createElement("div");
  el.classList.add("message", sender);
  el.textContent = message;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function appendTypingIndicator() {
  const container = _chatContainer();
  if (!container) return null;
  const el = document.createElement("div");
  el.classList.add("message", "bot", "typing");
  el.innerHTML = `
    <span class="typing-dots" aria-label="Assistant is typing">
      <span></span><span></span><span></span>
    </span>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderPriceWidget(element, quote) {
  if (!element || !quote) return;
  const container = _chatContainer();
  const changeClass =
    quote.changeDirection === "up" ? "price-up" :
    quote.changeDirection === "down" ? "price-down" : "price-flat";
  const safeName = escapeHtml(quote.assetName || quote.symbol || "Asset");
  const safeSymbol = escapeHtml(quote.symbol || "");
  const safePrice = escapeHtml(quote.priceUsd || "N/A");
  const safeChange = escapeHtml(quote.change24h || "N/A");
  const safeImage = quote.imageUrl ? escapeHtml(quote.imageUrl) : "";

  element.classList.add("price-quote-widget");
  element.innerHTML = `
    <div class="price-widget-header">
      ${safeImage ? `<img class="price-widget-image" src="${safeImage}" alt="${safeName} logo" loading="lazy" />` : ""}
      <div class="price-widget-title-wrap">
        <span class="price-asset">${safeName}</span>
        <span class="price-symbol">${safeSymbol}/USD</span>
      </div>
    </div>
    <div class="price-main-row">
      <span class="price-value">${safePrice}</span>
      <span class="price-change ${changeClass}">${safeChange}</span>
    </div>
  `;
  if (container) container.scrollTop = container.scrollHeight;
}

function openBubbleMapModal(tokenAddress, tokenName) {
  const existing = document.getElementById("bubble-map-modal");
  if (existing) existing.remove();

  const safeName = escapeHtml(tokenName || tokenAddress);
  const iframeSrc = `https://app.insightx.network/atlas/solana/${tokenAddress}`;

  const modal = document.createElement("div");
  modal.id = "bubble-map-modal";
  modal.className = "bubble-map-modal-overlay";
  modal.innerHTML = `
    <div class="bubble-map-modal-box">
      <div class="bubble-map-modal-header">
        <span class="bubble-map-modal-title">Bubble Map · ${safeName}</span>
        <button class="bubble-map-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="bubble-map-modal-body">
        <iframe
          src="${iframeSrc}"
          allow="clipboard-write"
          allowfullscreen
          class="bubble-map-iframe"
          title="Bubble Map for ${safeName}"
        ></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("is-open"));

  const close = () => {
    modal.classList.remove("is-open");
    setTimeout(() => modal.remove(), 220);
  };

  modal.querySelector(".bubble-map-modal-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  });
}

function renderTokenWidget(element, token) {
  if (!element || !token) return;
  const container = _chatContainer();
  const safeName = escapeHtml(token.name || "Unknown token");
  const safeSymbol = escapeHtml(token.symbol || "N/A");
  const safeAddress = escapeHtml(token.address || "N/A");
  const safePrice = escapeHtml(token.priceUsd || "N/A");
  const safeMarketCap = escapeHtml(token.marketCap || "N/A");
  const safeVol = escapeHtml(token.volume24h || "N/A");
  const safeDex = escapeHtml(token.dexId || "N/A");
  const safeLore = escapeHtml(token.lore || "");
  const safeImage = token.imageUrl ? escapeHtml(token.imageUrl) : "";
  const safePairUrl = token.pairUrl ? escapeHtml(token.pairUrl) : "";
  const safeLinks = Array.isArray(token.links) ? token.links.slice(0, 5) : [];
  const rawAddress = String(token.address || "").trim();
  const tradeUrl = rawAddress ? `https://trade.padre.gg/trade/solana/${encodeURIComponent(rawAddress)}?rk=ppotato` : "";

  element.classList.add("token-info-widget");
  element.innerHTML = `
    <div class="token-widget-header">
      ${safeImage ? `<img class="token-widget-image" src="${safeImage}" alt="${safeName} logo" loading="lazy" />` : ""}
      <div class="token-widget-title-wrap">
        <span class="token-widget-name">${safeName}</span>
        <span class="token-widget-symbol">${safeSymbol}</span>
      </div>
    </div>
    <div class="token-widget-grid">
      <div><span class="token-key">Price</span><span class="token-value">${safePrice}</span></div>
      <div><span class="token-key">Market Cap</span><span class="token-value">${safeMarketCap}</span></div>
      <div><span class="token-key">Volume (24h)</span><span class="token-value">${safeVol}</span></div>
      <div><span class="token-key">Launchpad</span><span class="token-value">${safeDex}</span></div>
    </div>
    <div class="token-widget-address">${safeAddress}</div>
    <div class="token-widget-lore${safeLore ? "" : " is-empty"}">${safeLore}</div>
    <button class="token-generate-lore-btn" type="button">Generate lore</button>
    <div class="token-widget-actions">
      ${rawAddress ? `<button class="token-bubble-map-btn" type="button">Bubble Map</button>` : ""}
    </div>
    <div class="token-widget-links">
      ${safePairUrl ? `<a href="${safePairUrl}" target="_blank" rel="noopener noreferrer">Dexscreener</a>` : ""}
      ${tradeUrl ? `<a href="${tradeUrl}" target="_blank" rel="noopener noreferrer" class="token-trade-link">Trade</a>` : ""}
      ${safeLinks
        .map((link) => {
          const url = escapeHtml(link?.url || "");
          if (!url) return "";
          const label = escapeHtml(link?.label || "Website");
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        })
        .join("")}
    </div>
  `;

  const loreBtn = element.querySelector(".token-generate-lore-btn");
  const loreEl = element.querySelector(".token-widget-lore");
  if (loreBtn && loreEl) {
    loreBtn.addEventListener("click", async () => {
      loreBtn.disabled = true;
      loreBtn.textContent = "Generating lore...";
      try {
        if (typeof window.generateTokenLoreForWidget !== "function") {
          throw new Error("Lore generator unavailable");
        }
        const generated = await window.generateTokenLoreForWidget(token);
        loreEl.textContent = String(generated || "No lore could be generated.");
        loreEl.classList.remove("is-empty");
        loreBtn.textContent = "Lore generated";
      } catch {
        loreEl.textContent = "Could not generate lore right now. Try again.";
        loreEl.classList.remove("is-empty");
        loreBtn.disabled = false;
        loreBtn.textContent = "Generate lore";
      }
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  const bubbleBtn = element.querySelector(".token-bubble-map-btn");
  if (bubbleBtn && rawAddress) {
    bubbleBtn.addEventListener("click", () => openBubbleMapModal(rawAddress, token.name || token.symbol));
  }

  if (container) container.scrollTop = container.scrollHeight;
}

function renderLaunchpadVolumeWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const launchpads = Array.isArray(payload.launchpads) ? payload.launchpads : [];
  const daily = payload.daily && typeof payload.daily === "object" ? payload.daily : null;
  const hasDaily = Boolean(daily);
  const renderDaily = hasDaily
    ? `
      <div class="launchpad-daily">
        <div class="launchpad-daily-title">🟣 Daily Trench Stats</div>
        <div>├ Volume: ${escapeHtml(daily.volume || "N/A")} (${escapeHtml(daily.volumeChange || "N/A")})</div>
        <div>├ Traders: ${escapeHtml(daily.traders || "N/A")} (${escapeHtml(daily.tradersChange || "N/A")})</div>
        <div>├ Created: ${escapeHtml(daily.created || "N/A")} (${escapeHtml(daily.createdChange || "N/A")})</div>
        <div>└ Graduated: ${escapeHtml(daily.graduated || "N/A")} (${escapeHtml(daily.graduatedChange || "N/A")})</div>
      </div>
    `
    : "";

  element.classList.add("launchpad-volume-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">${escapeHtml(payload.title || "Launchpad volume snapshot")}</div>
    <div class="launchpad-widget-subtitle">${payload.scannedPools ? `Scanned pools: ${escapeHtml(String(payload.scannedPools))} · ` : ""}Window: ${escapeHtml(payload.timeframe || "24h")}</div>
    ${renderDaily}
    <div class="launchpad-list">
      ${launchpads.map((lp, index) => `
        <div class="launchpad-item" data-launchpad-id="${escapeHtml(lp.id)}">
          <div class="launchpad-item-head">
            <span class="launchpad-rank">#${index + 1}</span>
            <span class="launchpad-name">${escapeHtml(lp.emoji || "")} ${escapeHtml(lp.name)} ${lp.shareChange ? `(${escapeHtml(lp.shareChange)})` : ""}</span>
          </div>
          <div class="launchpad-stats">
            <span>Volume: ${escapeHtml(lp.volume24h || "N/A")} ${lp.volumeChange ? `(${escapeHtml(lp.volumeChange)})` : ""}</span>
            <span>Traders: ${escapeHtml(lp.traders || "N/A")} ${lp.tradersChange ? `(${escapeHtml(lp.tradersChange)})` : ""}</span>
            <span>Created: ${escapeHtml(String(lp.created24h || "N/A"))} ${lp.createdChange ? `(${escapeHtml(lp.createdChange)})` : ""}</span>
            <span>Graduated: ${escapeHtml(String(lp.graduated || "N/A"))} ${lp.graduatedChange ? `(${escapeHtml(lp.graduatedChange)})` : ""} ${escapeHtml(lp.graduatedEmoji || "")}</span>
          </div>
          <button class="launchpad-load-btn" type="button">Top 10 tokens (last 24h)</button>
          <div class="launchpad-tokens"></div>
        </div>
      `).join("")}
    </div>
  `;

  const buttons = element.querySelectorAll(".launchpad-load-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const launchpadItem = btn.closest(".launchpad-item");
      if (!launchpadItem) return;
      const launchpadId = launchpadItem.getAttribute("data-launchpad-id");
      const tokensEl = launchpadItem.querySelector(".launchpad-tokens");
      if (!launchpadId || !tokensEl) return;
      btn.disabled = true;
      btn.textContent = "Loading...";
      tokensEl.innerHTML = "";
      try {
        if (typeof window.getTopTokensForLaunchpad !== "function") {
          throw new Error("Launchpad loader unavailable");
        }
        const tokens = await window.getTopTokensForLaunchpad(launchpadId);
        if (!Array.isArray(tokens) || !tokens.length) {
          tokensEl.innerHTML = `<div class="launchpad-no-tokens">No 24h token data found for this launchpad.</div>`;
        } else {
          tokensEl.innerHTML = `
            <ol class="launchpad-token-list launchpad-token-cards">
              ${tokens.map((token, i) => `
                <li class="launchpad-token-card">
                  <div class="launchpad-token-card-head">
                    <span class="launchpad-token-rank">#${i + 1}</span>
                    <div class="launchpad-token-main">
                      ${token.imageUrl
                        ? `<img class="launchpad-token-icon" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.symbol)} icon" loading="lazy" />`
                        : `<span class="launchpad-token-icon-fallback">${escapeHtml(String(token.symbol || "?").slice(0, 1))}</span>`
                      }
                      <div class="launchpad-token-name-wrap">
                        <span class="launchpad-token-name">${escapeHtml(token.symbol)} · ${escapeHtml(token.name)}</span>
                        <span class="launchpad-token-meta">Vol ${escapeHtml(token.volume24h)} · Price ${escapeHtml(token.priceUsd)}</span>
                      </div>
                    </div>
                  </div>
                  ${token.pairUrl ? `<a href="${escapeHtml(token.pairUrl)}" target="_blank" rel="noopener noreferrer">View chart</a>` : ""}
                </li>
              `).join("")}
            </ol>
          `;
        }
        btn.textContent = "Loaded";
      } catch {
        tokensEl.innerHTML = `<div class="launchpad-no-tokens">Could not load tokens right now.</div>`;
        btn.disabled = false;
        btn.textContent = "Top 10 tokens (last 24h)";
      }
      if (container) container.scrollTop = container.scrollHeight;
    });
  });

  if (container) container.scrollTop = container.scrollHeight;
}

function renderHotTokensWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  const generated = payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString() : "";
  element.classList.add("hot-tokens-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">${escapeHtml(payload.title || "Hot Solana tokens")}</div>
    <div class="launchpad-widget-subtitle">Window: ${escapeHtml(payload.timeframe || "24h")} · Ranked by volume then market cap · Source: ${escapeHtml(payload.source || "N/A")}${generated ? ` · Updated: ${escapeHtml(generated)}` : ""}</div>
    ${tokens.length ? "" : `<div class="launchpad-no-tokens">No reliable tokens matched strict market cap/volume filters right now.</div>`}
    <ol class="launchpad-token-list launchpad-token-cards">
      ${tokens.map((token, i) => `
        <li class="launchpad-token-card">
          <div class="launchpad-token-card-head">
            <span class="launchpad-token-rank">#${i + 1}</span>
            <div class="launchpad-token-main">
              ${token.imageUrl
                ? `<img class="launchpad-token-icon" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.symbol)} icon" loading="lazy" />`
                : `<span class="launchpad-token-icon-fallback">${escapeHtml(String(token.symbol || "?").slice(0, 1))}</span>`
              }
              <div class="launchpad-token-name-wrap">
                <span class="launchpad-token-name">${escapeHtml(token.symbol)} · ${escapeHtml(token.name)}</span>
                <span class="launchpad-token-meta">${escapeHtml(token.launchpad || "launchpad")} · Vol ${escapeHtml(token.volume24h)} · MC ${escapeHtml(token.marketCap)}</span>
              </div>
            </div>
          </div>
          ${token.pairUrl ? `<a href="${escapeHtml(token.pairUrl)}" target="_blank" rel="noopener noreferrer">Trade in terminal / view chart</a>` : ""}
        </li>
      `).join("")}
    </ol>
  `;
  if (container) container.scrollTop = container.scrollHeight;
}

function renderSwapQuoteWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  element.classList.remove("typing");
  element.classList.add("swap-quote-widget", "typewriter-done");

  const walletShort = payload.walletShort || "wallet";
  const side = payload.side === "sell" ? "sell" : "buy";
  const inputLabel = escapeHtml(payload.inputLabel || "—");
  const outputLabel = escapeHtml(payload.outputLabel || "—");
  const impact = escapeHtml(payload.priceImpact || "N/A");
  const slippage = escapeHtml(payload.slippage || "1%");
  const summary = escapeHtml(payload.textSummary || "Review this swap before confirming.");
  const assistantNote = payload.assistantNote ? `<p class="swap-widget-note">${escapeHtml(payload.assistantNote)}</p>` : "";

  element.innerHTML = `
    <div class="launchpad-widget-title">On-chain swap</div>
    <div class="launchpad-widget-subtitle">Wallet ${walletShort} · ${side === "buy" ? "Buy with SOL" : "Sell for SOL"}</div>
    <p class="swap-widget-summary">${summary}</p>
    ${assistantNote}
    <div class="swap-widget-grid">
      <div><span class="token-key">You pay</span><strong>${inputLabel}</strong></div>
      <div><span class="token-key">You receive</span><strong>${outputLabel}</strong></div>
      <div><span class="token-key">Price impact</span><strong>${impact}</strong></div>
      <div><span class="token-key">Slippage</span><strong>${slippage}</strong></div>
    </div>
    <div class="swap-widget-actions">
      <button type="button" class="swap-confirm-btn" data-swap-confirm="1">Confirm swap</button>
      <button type="button" class="swap-cancel-btn" data-swap-cancel="1">Cancel</button>
    </div>
    <div class="swap-widget-status" hidden></div>
  `;

  const statusEl = element.querySelector(".swap-widget-status");
  const confirmBtn = element.querySelector("[data-swap-confirm]");
  const cancelBtn = element.querySelector("[data-swap-cancel]");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Swap cancelled.";
      }
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!window.JupiterSwap || typeof window.JupiterSwap.executeSwap !== "function") {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Swap module not loaded.";
        }
        return;
      }
      confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Approve the transaction in your wallet…";
      }
      try {
        const result = await window.JupiterSwap.executeSwap(payload);
        if (statusEl) {
          const label = result && result.recovered
            ? "Wallet reported send failed, but the swap was confirmed on-chain."
            : "Swap submitted.";
          statusEl.innerHTML = `${escapeHtml(label)} <a href="${escapeHtml(result.explorerUrl)}" target="_blank" rel="noopener noreferrer">View on Solscan</a>`;
        }
      } catch (err) {
        if (statusEl) {
          const msg = (err && err.message) || "Swap failed.";
          statusEl.textContent = msg === "Send failed"
            ? "Wallet reported send failed. If your balances changed, the swap may still have landed; check wallet activity or Solscan."
            : msg;
        }
        confirmBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });
  }

  if (container) container.scrollTop = container.scrollHeight;
}

function renderWalletAnalysisWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const trades = Array.isArray(payload.topTrades) ? payload.topTrades : [];
  const netSol = String(payload.weekProfitSol || "");
  const netClass = netSol.trim().startsWith("-") ? "wallet-net-down" : "wallet-net-up";
  const hasDeep = payload.deepAnalysis
    && Array.isArray(payload.deepAnalysis.events)
    && payload.deepAnalysis.events.length > 0;
  element.classList.add("wallet-analysis-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">Solana Wallet Analysis</div>
    <div class="launchpad-widget-subtitle">${escapeHtml(payload.wallet || "")}</div>
    ${payload.errorMessage ? `<div class="wallet-analysis-error">${escapeHtml(payload.errorMessage)}</div>` : ""}
    <div class="wallet-balance-block">
      <span class="token-key">Balance</span>
      <span class="wallet-balance-usd">${escapeHtml(payload.balanceUsd || "N/A")}</span>
      <span class="wallet-balance-sol">${escapeHtml(payload.balanceSol || "N/A")}</span>
    </div>
    <div class="wallet-net-block ${netClass}">
      <span class="token-key">7D Net</span>
      <span class="wallet-net-usd">${escapeHtml(payload.weekProfitUsd || "N/A")}</span>
      <span class="wallet-net-sol">${escapeHtml(payload.weekProfitSol || "N/A")}</span>
    </div>
    <div class="wallet-trades-title">Top Trades</div>
    <div class="wallet-trades-table" role="table" aria-label="Top wallet trades">
      <div class="wallet-trades-row wallet-trades-head" role="row">
        <span role="columnheader">Token</span>
        <span role="columnheader">Bought</span>
        <span role="columnheader">Sold</span>
        <span role="columnheader">P&amp;L</span>
      </div>
      ${trades.map((trade) => {
        const pnlText = String(trade.pnlSol || "N/A");
        const pnlClass = pnlText.trim().startsWith("-") ? "wallet-pnl-down" : "wallet-pnl-up";
        return `
          <div class="wallet-trades-row" role="row">
            <span class="wallet-trade-token" role="cell">${escapeHtml(trade.tokenLabel || "SOL")}</span>
            <span class="wallet-trade-value" role="cell">${escapeHtml(trade.boughtSol || "0.0000 SOL")}</span>
            <span class="wallet-trade-value" role="cell">${escapeHtml(trade.soldSol || "0.0000 SOL")}</span>
            <span class="wallet-trade-pnl ${pnlClass}" role="cell">${escapeHtml(pnlText)}</span>
          </div>
        `;
      }).join("")}
    </div>
    ${trades.length ? "" : `<div class="wallet-analysis-error">No token trade summaries were found in the last 7 days for this wallet.</div>`}
    ${hasDeep ? `
      <button type="button" class="wallet-more-btn" data-action="wallet-more">
        <span class="wallet-more-label">Get more info</span>
        <span class="wallet-more-arrow">→</span>
      </button>
      <div class="wallet-more-slot" data-slot="wallet-more"></div>
    ` : ""}
  `;

  if (hasDeep) {
    const btn = element.querySelector('[data-action="wallet-more"]');
    const slot = element.querySelector('[data-slot="wallet-more"]');
    if (btn && slot) {
      btn.addEventListener("click", async () => {
        if (btn.dataset.loading === "1" || btn.dataset.loaded === "1") return;
        btn.dataset.loading = "1";
        btn.disabled = true;
        const originalLabel = btn.querySelector(".wallet-more-label");
        if (originalLabel) originalLabel.textContent = "Crunching…";
        try {
          await renderWalletDeepWidgets(slot, payload);
          btn.dataset.loaded = "1";
          btn.style.display = "none";
        } catch (err) {
          console.error("Deep wallet analysis failed", err);
          if (originalLabel) originalLabel.textContent = "Try again";
          btn.disabled = false;
          delete btn.dataset.loading;
        }
        if (container) container.scrollTop = container.scrollHeight;
      });
    }
  }

  if (container) container.scrollTop = container.scrollHeight;
}

async function renderWalletDeepWidgets(slot, payload) {
  const deep = payload.deepAnalysis || {};
  const events = Array.isArray(deep.events) ? deep.events : [];
  const solPeers = Array.isArray(deep.solPeers) ? deep.solPeers : [];
  const api = (typeof window !== "undefined" && window.PaperDeep) || {};
  if (!api.computeTradeHeatmap || !api.computeAvgHoldTime || !api.findSideWallets) {
    slot.innerHTML = `<div class="wallet-analysis-error">Deep analysis unavailable.</div>`;
    return;
  }

  const heatmap = api.computeTradeHeatmap(events);
  const hold = api.computeAvgHoldTime(events);

  const peerMap = new Map();
  for (const p of solPeers) peerMap.set(p.address, p);

  const sideWallets = await api.findSideWallets(
    payload.wallet,
    events,
    peerMap,
  );

  slot.innerHTML = `
    ${renderHeatmapBlock(heatmap, api.describeHeatmap ? api.describeHeatmap(heatmap) : "")}
    ${renderHoldTimeBlock(hold, api.formatDuration)}
    ${renderSideWalletsBlock(sideWallets)}
  `;
}

function renderHeatmapBlock(heatmap, description) {
  if (!heatmap || heatmap.total === 0) {
    return `
      <div class="wallet-deep-card">
        <div class="wallet-deep-title">Trade Frequency</div>
        <div class="wallet-deep-empty">No timestamps to plot.</div>
      </div>
    `;
  }
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const hourTotals = new Array(24).fill(0);
  const dayTotals = new Array(7).fill(0);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      hourTotals[h] += heatmap.grid[d][h];
      dayTotals[d] += heatmap.grid[d][h];
    }
  }
  const hourPeak = Math.max(1, ...hourTotals);
  const dayPeak = Math.max(1, ...dayTotals);

  let peakHour = 0, peakHourCount = 0;
  hourTotals.forEach((c, h) => { if (c > peakHourCount) { peakHourCount = c; peakHour = h; } });
  let peakDay = 0, peakDayCount = 0;
  dayTotals.forEach((c, d) => { if (c > peakDayCount) { peakDayCount = c; peakDay = d; } });

  const hourBars = hourTotals.map((count, h) => {
    const ratio = count / hourPeak;
    const isPeak = h === peakHour && count > 0;
    const title = `${String(h).padStart(2, "0")}:00 UTC · ${count} trade${count === 1 ? "" : "s"}`;
    return `
      <div class="hour-bar-col" title="${escapeHtml(title)}">
        <div class="hour-bar-fill${isPeak ? " hour-bar-peak" : ""}" style="height:${(ratio * 100).toFixed(1)}%"></div>
      </div>
    `;
  }).join("");

  const hourAxis = [0, 6, 12, 18, 24].map((h) => `<span>${String(h % 24).padStart(2, "0")}</span>`).join("");

  const dayRows = dayTotals.map((count, d) => {
    const ratio = count / dayPeak;
    const isPeak = d === peakDay && count > 0;
    return `
      <div class="day-row">
        <span class="day-row-label">${dayLabels[d]}</span>
        <div class="day-row-track">
          <div class="day-row-fill${isPeak ? " day-row-peak" : ""}" style="width:${(ratio * 100).toFixed(1)}%"></div>
        </div>
        <span class="day-row-count">${count}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="wallet-deep-card">
      <div class="wallet-deep-title">Trade Frequency</div>
      <div class="wallet-deep-sub">${escapeHtml(description || "")}</div>

      <div class="freq-section-title">By hour (UTC)</div>
      <div class="hour-bar-chart" role="img" aria-label="Trades by hour of day">
        ${hourBars}
      </div>
      <div class="hour-bar-axis" aria-hidden="true">${hourAxis}</div>

      <div class="freq-section-title">By day of week</div>
      <div class="day-row-chart">${dayRows}</div>

      <div class="wallet-deep-meta">${heatmap.total} trade${heatmap.total === 1 ? "" : "s"} analyzed</div>
    </div>
  `;
}

function renderHoldTimeBlock(hold, formatDuration) {
  if (!hold || !hold.matchedPairs) {
    return `
      <div class="wallet-deep-card">
        <div class="wallet-deep-title">Average Hold Time</div>
        <div class="wallet-deep-empty">No matched buy→sell pairs in this window.</div>
      </div>
    `;
  }
  const avg = formatDuration ? formatDuration(hold.avgHoldMs) : `${Math.round(hold.avgHoldMs / 60000)}m`;
  const fastest = hold.perMint[0];
  const slowest = hold.perMint[hold.perMint.length - 1];
  return `
    <div class="wallet-deep-card">
      <div class="wallet-deep-title">Average Hold Time</div>
      <div class="wallet-deep-big">${escapeHtml(avg)}</div>
      <div class="wallet-deep-meta">${hold.matchedPairs} matched buy→sell pair${hold.matchedPairs === 1 ? "" : "s"}</div>
      ${fastest && slowest && fastest !== slowest ? `
        <div class="wallet-deep-row">
          <span class="wallet-deep-key">Fastest flip</span>
          <span class="wallet-deep-val">${escapeHtml(formatDuration ? formatDuration(fastest.avgHoldMs) : "")}</span>
        </div>
        <div class="wallet-deep-row">
          <span class="wallet-deep-key">Longest hold</span>
          <span class="wallet-deep-val">${escapeHtml(formatDuration ? formatDuration(slowest.avgHoldMs) : "")}</span>
        </div>
      ` : ""}
    </div>
  `;
}

function renderSideWalletsBlock(sideWallets) {
  if (!sideWallets || sideWallets.length === 0) {
    return `
      <div class="wallet-deep-card">
        <div class="wallet-deep-title">Possible Side Wallets</div>
        <div class="wallet-deep-empty">No linked trading wallets detected.</div>
      </div>
    `;
  }
  const rows = sideWallets.map((w) => {
    const short = `${w.address.slice(0, 4)}…${w.address.slice(-4)}`;
    const tags = [];
    for (const r of w.reasons) tags.push(r);
    if (w.sharedMints > 0) tags.push(`${w.sharedMints} shared token${w.sharedMints === 1 ? "" : "s"}`);
    if (w.tradesTokens) tags.push("Trades actively");
    return `
      <div class="side-wallet-row">
        <a class="side-wallet-addr" href="https://solscan.io/account/${encodeURIComponent(w.address)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(w.address)}">${escapeHtml(short)}</a>
        <div class="side-wallet-tags">
          ${tags.map((t) => `<span class="side-wallet-tag">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");
  return `
    <div class="wallet-deep-card">
      <div class="wallet-deep-title">Possible Side Wallets</div>
      <div class="wallet-deep-sub">SOL transfers + shared token entries</div>
      ${rows}
    </div>
  `;
}

function getTypewriterDelay(length) {
  if (length > 1400) return 1;
  if (length > 800) return 2;
  if (length > 450) return 4;
  if (length > 250) return 7;
  return 12;
}

async function typewriterToElement(element, text) {
  if (!element) return;
  const container = _chatContainer();
  element.textContent = "";
  const safeText = String(text || "");
  const delayMs = getTypewriterDelay(safeText.length);
  for (let i = 0; i < safeText.length; i += 1) {
    element.textContent += safeText[i];
    if (container) container.scrollTop = container.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function stripMarkdownNoise(text) {
  let value = String(text || "");
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  value = value.replace(/^\s*[-*]\s+/gm, "• ");
  value = value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  value = value.replace(/^\s*>\s?/gm, "");
  value = value.replace(/\n{3,}/g, "\n\n");
  return value.trim();
}

function enforceConciseResponse(text, userMessage) {
  const input = String(text || "").trim();
  if (!input) return "";
  const query = String(userMessage || "").toLowerCase();
  const isCapabilitiesPrompt =
    /\bwhat can you do\b/.test(query) ||
    /\bwhat do you do\b/.test(query) ||
    /\byour features\b/.test(query) ||
    /\bhow can you help\b/.test(query);
  const asksComparisonOrGuide =
    /\b(vs|versus|difference|compare|how to|guide|steps?|explain|why|pros|cons|strategy|breakdown)\b/.test(query);
  const wantsList = /(list|give me\s+\d+|top\s+\d+|name\s+\d+)/.test(query);
  const wantsLongForm = /(explain|deep dive|in detail|step by step|comprehensive|everything you know|full guide|breakdown|all about)/.test(query);
  const wantsLongList = /(list out|all the|top \d+|best \d+|steps|strategies|reasons)/.test(query);
  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^(\d+\.\s+|[•\-]\s+)/.test(l));

  if (isCapabilitiesPrompt) {
    return input;
  }

  if ((wantsList || wantsLongList) && numbered.length >= 2) {
    const limit = wantsLongList ? 10 : 6;
    return numbered
      .slice(0, limit)
      .map((l, i) => `${i + 1}. ${l.replace(/^(\d+\.\s+|[•\-]\s+)/, "")}`)
      .join("\n");
  }

  if (wantsLongForm || asksComparisonOrGuide) {
    return input;
  }

  const sentences = input.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  // Keep answers concise by default, but avoid over-truncating useful detail.
  if (sentences && sentences.length > 8 && input.length > 1200 && !wantsLongForm && !wantsLongList) {
    return sentences.slice(0, 4).join(" ").trim();
  }

  return input;
}

function formatAssistantText(text, userMessage) {
  let value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value) return "";

  value = stripMarkdownNoise(value);
  value = enforceConciseResponse(value, userMessage);
  value = value.replace(/\n{3,}/g, "\n\n");

  const hasStructuredBlocks =
    /(^|\n)\s*([-*]\s+|\d+\.\s+)/m.test(value) || value.includes("\n\n");

  if (!hasStructuredBlocks && value.length > 280) {
    const sentences = value.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
    if (sentences && sentences.length > 2) {
      const paragraphs = [];
      for (let i = 0; i < sentences.length; i += 2) {
        paragraphs.push(sentences.slice(i, i + 2).join(" ").trim());
      }
      value = paragraphs.join("\n\n");
    }
  }

  return value;
}
