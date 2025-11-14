// ================================================
// SYNCORA Real-Time Power Graph (Linked to Devices)
// ================================================
(() => {
  // --- Match constants to HTML ---
  const DEVICE_POWER = { fan: 0.5, bedroom: 0.8, kitchen: 0.6, geyser: 1.2 };
  const MAX_POINTS = 120;
  const Y_MAX = 3.5;
  const UPDATE_INTERVAL_MS = 1000;
  const TAU_SECONDS = 4.0;

  // --- Internal state ---
  let targetPower = 0;
  let currentPower = 0;
  let realtimeInterval = null;
  let powerChart = null;

  // === Compute targetPower from toggles ===
  function calculateTargetPower() {
    const onSwitches = document.querySelectorAll(".device-card .toggle-switch.online");
    let sum = 0;
    onSwitches.forEach((sw) => {
      const card = sw.closest(".device-card");
      if (!card) return;
      const key = card.getAttribute("data-device");
      if (key && DEVICE_POWER[key]) sum += DEVICE_POWER[key];
    });
    targetPower = Math.min(sum, Y_MAX);
  }

  // === Initialize (or reinitialize) the chart ===
  function initRealtimeChart() {
    if (!window.Chart || !document.getElementById("powerChart")) {
      console.warn("[Realtime Analytics] Chart.js or canvas not found yet.");
      return;
    }

    const ctx = document.getElementById("powerChart").getContext("2d");
    const labels = Array(MAX_POINTS).fill("");
    const data = Array(MAX_POINTS).fill(0);

    // destroy old chart if needed
    if (powerChart) {
      try {
        powerChart.destroy();
      } catch (e) {
        console.warn("Old chart destroy error:", e);
      }
    }

    powerChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Power (kWh)",
            data,
            borderColor: "#4cc9f0",
            backgroundColor: "rgba(76,201,240,0.12)",
            borderWidth: 3,
            fill: true,
            tension: 0.36,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { labels: { color: "white" } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toFixed(2)} kWh`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: Y_MAX,
            ticks: {
              color: "white",
              callback: (v) => v.toFixed(1) + " kWh",
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          x: {
            ticks: { color: "white", display: false },
            grid: { color: "rgba(255,255,255,0.02)" },
          },
        },
      },
    });

    // initial values
    calculateTargetPower();
    currentPower = targetPower;

    startRealtimeLoop();
    console.log("[Realtime Analytics] Chart initialized and loop started.");
  }

  // === Real-time smooth updater ===
  function startRealtimeLoop() {
    if (realtimeInterval) clearInterval(realtimeInterval);

    realtimeInterval = setInterval(() => {
      const dt = UPDATE_INTERVAL_MS / 1000;
      const alpha = 1 - Math.exp(-dt / TAU_SECONDS);
      currentPower += (targetPower - currentPower) * alpha;

      if (powerChart) {
        const now = new Date().toLocaleTimeString();
        powerChart.data.labels.push(now);
        powerChart.data.datasets[0].data.push(Number(currentPower.toFixed(3)));

        while (powerChart.data.labels.length > MAX_POINTS) {
          powerChart.data.labels.shift();
          powerChart.data.datasets[0].data.shift();
        }

        powerChart.update("none");
      }
    }, UPDATE_INTERVAL_MS);
  }

  // === React instantly when devices are toggled ===
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".toggle-switch");
    if (toggle) {
      setTimeout(() => {
        calculateTargetPower();
      }, 150);
    }
  });

  // === Public function: to start after login ===
  window.startRealtimeAnalytics = function () {
    // Wait for DOM + Chart.js
    const check = setInterval(() => {
      if (document.getElementById("powerChart") && window.Chart) {
        clearInterval(check);
        initRealtimeChart();
      }
    }, 200);
  };

  // expose calculator for callers that change state programmatically
  window.calculateTargetPower = calculateTargetPower;

  // === Auto start after DOM ready (in case chart already exists) ===
  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("powerChart")) {
      startRealtimeAnalytics();
    }
  });
})();
