document.addEventListener("DOMContentLoaded", () => {
  var dashboardStatEls = document.querySelectorAll("[data-dashboard-stat]");
  if (dashboardStatEls.length) {
    var payoutTimer = 0;
    var statsRetryTimer = 0;

    function setDashboardStat(name, value) {
      var element = document.querySelector('[data-dashboard-stat="' + name + '"]');
      if (element) element.textContent = value;
    }

    function formatCount(value) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function formatSol(value) {
      var amount = Number(value) || 0;
      var digits = amount >= 1000 ? 1 : 2;
      return new Intl.NumberFormat(undefined, {
        notation: amount >= 10000 ? "compact" : "standard",
        maximumFractionDigits: digits,
        minimumFractionDigits: amount > 0 && amount < 10 ? 2 : 0
      }).format(amount) + " SOL";
    }

    function startPayoutCountdown(payoutAt) {
      var target = Date.parse(payoutAt);
      if (!Number.isFinite(target)) return;
      window.clearInterval(payoutTimer);
      function updateCountdown() {
        var remaining = Math.max(0, target - Date.now());
        var hours = Math.floor(remaining / 3600000);
        var minutes = Math.floor((remaining % 3600000) / 60000);
        setDashboardStat("nextPayout", hours > 0 ? hours + "h " + minutes + "m" : minutes + "m");
      }
      updateCountdown();
      payoutTimer = window.setInterval(updateCountdown, 60000);
    }

    function refreshDashboardStats() {
      return fetch("/api/dashboard/stats", { credentials: "same-origin", cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("Dashboard stats request failed");
          return response.json();
        })
        .then(function (stats) {
          window.clearTimeout(statsRetryTimer);
          setDashboardStat("totalUsers", formatCount(stats.totalUsers));
          setDashboardStat("volume24hSol", formatSol(stats.volume24hSol));
          setDashboardStat("paperTrades", formatCount(stats.paperTrades));
          setDashboardStat("activeTraders", formatCount(stats.activeTraders));
          startPayoutCountdown(stats.nextPayoutAt);
        })
        .catch(function (error) {
          console.warn("Dashboard stats load skipped:", error);
          dashboardStatEls.forEach(function (element) { element.textContent = "—"; });
          setDashboardStat("nextPayout", "Unavailable");
          window.clearTimeout(statsRetryTimer);
          statsRetryTimer = window.setTimeout(refreshDashboardStats, 5000);
        });
    }

    refreshDashboardStats();
    window.addEventListener("paper:leaderboard-synced", refreshDashboardStats);
  }

  var header = document.getElementById("landing-header");
  if (header) {
    window.addEventListener("scroll", function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    }, { passive: true });
  }

  var dock = document.getElementById("dashboard-dock");
  if (dock) {
    var items = Array.prototype.slice.call(dock.querySelectorAll(".dash-dock__item"));

    function updateDock(event) {
      var pointerX = event.clientX;
      items.forEach(function (item) {
        var rect = item.getBoundingClientRect();
        var itemCenter = rect.left + rect.width / 2;
        var distance = Math.abs(pointerX - itemCenter);
        var influence = Math.max(0, 1 - distance / 150);
        item.style.setProperty("--dock-scale", (1 + influence * 0.2).toFixed(3));
        item.style.setProperty("--dock-lift", (-influence * 7).toFixed(1) + "px");
      });
    }

    function resetDock() {
      items.forEach(function (item) {
        item.style.removeProperty("--dock-scale");
        item.style.removeProperty("--dock-lift");
      });
    }

    dock.addEventListener("mousemove", updateDock);
    dock.addEventListener("mouseleave", resetDock);

    items.forEach(function (item) {
      item.addEventListener("focus", function () {
        item.style.setProperty("--dock-scale", "1.16");
        item.style.setProperty("--dock-lift", "-6px");
      });
      item.addEventListener("blur", function () {
        item.style.removeProperty("--dock-scale");
        item.style.removeProperty("--dock-lift");
      });
    });
  }

  var statCards = Array.prototype.slice.call(document.querySelectorAll(".dash-rewards-stat"));
  if (statCards.length) {
    var lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var pendingFrame = 0;
    var canHover = !window.matchMedia || window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function setCardMotion(card, clientX, clientY, index) {
      var rect = card.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var dx = clientX - centerX;
      var dy = clientY - centerY;
      var x = clamp((clientX - rect.left) / rect.width, 0, 1);
      var y = clamp((clientY - rect.top) / rect.height, 0, 1);
      var depth = 0.72 + (index % 3) * 0.16;
      var styles = window.getComputedStyle(card);
      var motionX = Number(styles.getPropertyValue("--motion-x")) || 1;
      var motionY = Number(styles.getPropertyValue("--motion-y")) || 1;
      var motionTilt = Number(styles.getPropertyValue("--motion-tilt")) || 1;
      var normalizedX = clamp(dx / window.innerWidth, -0.5, 0.5);
      var normalizedY = clamp(dy / window.innerHeight, -0.5, 0.5);
      var rotateY = normalizedX * 14 * depth * motionTilt * motionX;
      var rotateX = -normalizedY * 12 * depth * motionTilt * motionY;
      var floatX = normalizedX * -20 * depth * motionX;
      var floatY = normalizedY * -16 * depth * motionY;
      card.style.setProperty("--tilt-x", rotateX.toFixed(2) + "deg");
      card.style.setProperty("--tilt-y", rotateY.toFixed(2) + "deg");
      card.style.setProperty("--float-x", floatX.toFixed(1) + "px");
      card.style.setProperty("--float-y", floatY.toFixed(1) + "px");
      card.style.setProperty("--glow-x", (x * 100).toFixed(1) + "%");
      card.style.setProperty("--glow-y", (y * 100).toFixed(1) + "%");
    }

    function updateStatMotion() {
      pendingFrame = 0;
      statCards.forEach(function (card, index) {
        setCardMotion(card, lastPointer.x, lastPointer.y, index);
      });
    }

    function queueStatMotion(event) {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
      if (!pendingFrame) {
        pendingFrame = window.requestAnimationFrame(updateStatMotion);
      }
    }

    function resetCardMotion(card) {
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
      card.style.removeProperty("--float-x");
      card.style.removeProperty("--float-y");
      card.style.removeProperty("--glow-x");
      card.style.removeProperty("--glow-y");
    }

    if (canHover) {
      window.addEventListener("mousemove", queueStatMotion, { passive: true });
      updateStatMotion();
    }

    statCards.forEach(function (card, index) {
      card.addEventListener("focus", function () {
        card.style.setProperty("--tilt-x", "-2.5deg");
        card.style.setProperty("--tilt-y", "3deg");
        card.style.setProperty("--float-x", index % 2 ? "5px" : "-5px");
        card.style.setProperty("--float-y", "-5px");
        card.style.setProperty("--glow-x", "72%");
        card.style.setProperty("--glow-y", "18%");
      });
      card.addEventListener("blur", function () {
        resetCardMotion(card);
      });
    });
  }
});

(function () {
  if (!WalletAuth.requireAuth()) return;

  var greetingEl = document.getElementById("greeting");
  if (greetingEl) {
    greetingEl.textContent = WalletAuth.getDisplayName();
  }

  window.addEventListener("paper:wallet-connected", function () {
    window.location.reload();
  });

  window.addEventListener("paper:wallet-disconnected", function () {
    if (document.body.classList.contains("wallet-modal-open")) return;
    window.location.href = "/?connect=1";
  });

  window.__paperDataReadyPromise
    .then(function () {
      return WalletAuth.ensureWalletUserProfile(WalletAuth.getUserId(), WalletAuth.getSession()?.walletName);
    })
    .then(async function () {
      if (typeof getUserProfile !== "function") return;
      var profile = await getUserProfile(WalletAuth.getUserId());
      if (profile?.username && greetingEl) {
        greetingEl.textContent = profile.username;
        try {
          localStorage.setItem("paper.username", profile.username);
          if (!localStorage.getItem("paper.pnlHandle")) {
            localStorage.setItem("paper.pnlHandle", String(profile.username).replace(/^@+/, "").slice(0, 10));
          }
        } catch (_) {}
      }
    })
    .catch(function (err) {
      console.warn("Profile load skipped:", err);
    });
})();
