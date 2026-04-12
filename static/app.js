(function () {
  "use strict";

  const DEFAULT_LAT = 14.5995;
  const DEFAULT_LON = 120.9842;
  const MAX_GAUGE_YEARS = 20;

  let currentLat = DEFAULT_LAT;
  let currentLon = DEFAULT_LON;
  let monthlyGhi = null;
  let marker = null;

  // ── Stars ──────────────────────────────────────────────
  (function generateStars() {
    const container = document.getElementById("stars");
    if (!container) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("div");
      s.className = "star";
      const size = Math.random() * 2 + 1;
      s.style.cssText = [
        `width:${size}px`, `height:${size}px`,
        `top:${Math.random() * 100}%`, `left:${Math.random() * 100}%`,
        `opacity:${(Math.random() * 0.7 + 0.1).toFixed(2)}`,
      ].join(";");
      frag.appendChild(s);
    }
    container.appendChild(frag);
  })();

  // ── Loading Screen ─────────────────────────────────────
  setTimeout(function () {
    const screen = document.getElementById("loading-screen");
    if (screen) {
      screen.classList.add("hidden");
      setTimeout(function () { screen.style.display = "none"; }, 700);
    }
  }, 7000);

  // ── Leaflet Map ────────────────────────────────────────
  const map = L.map("map", { zoomControl: true }).setView([DEFAULT_LAT, DEFAULT_LON], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  const markerIcon = L.divIcon({
    className: "",
    html: '<div style="width:16px;height:16px;border-radius:50%;background:linear-gradient(135deg,#f97316,#c026d3);box-shadow:0 0 8px rgba(249,115,22,0.7);border:2px solid white;"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  function setMarker(lat, lon) {
    if (marker) { map.removeLayer(marker); }
    marker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
  }

  function updateCoords(lat, lon) {
    currentLat = lat;
    currentLon = lon;
    document.getElementById("coord-display").innerHTML =
      `Lat: ${lat.toFixed(4)}° &nbsp;|&nbsp; Lon: ${lon.toFixed(4)}°`;
    setMarker(lat, lon);
    fetchIrradiance(lat, lon);
  }

  map.on("click", function (e) {
    updateCoords(e.latlng.lat, e.latlng.lng);
  });

  // Initial marker + irradiance fetch
  setMarker(DEFAULT_LAT, DEFAULT_LON);
  fetchIrradiance(DEFAULT_LAT, DEFAULT_LON);

  // ── GHI Status helpers ─────────────────────────────────
  function setGhiLoading() {
    const el = document.getElementById("ghi-status-text");
    el.className = "status-loading";
    el.innerHTML = '<span class="status-dot"></span>Fetching...';
    monthlyGhi = null;
    document.getElementById("btn-analyze").disabled = true;
  }

  function setGhiReady() {
    const el = document.getElementById("ghi-status-text");
    el.className = "status-ready";
    el.innerHTML = '<span class="status-dot"></span>Data Ready';
    document.getElementById("btn-analyze").disabled = false;
  }

  function setGhiError(msg) {
    const el = document.getElementById("ghi-status-text");
    el.className = "status-pending";
    el.innerHTML = `<span class="status-dot"></span>${msg || "Error"}`;
  }

  // ── Fetch NASA Irradiance ──────────────────────────────
  function fetchIrradiance(lat, lon) {
    setGhiLoading();
    fetch(`/api/irradiance?lat=${lat}&lon=${lon}`)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { setGhiError("Error"); return; }
        monthlyGhi = data.monthly_ghi;
        setGhiReady();
      })
      .catch(function () { setGhiError("Failed"); });
  }

  // ── Analyze Button ─────────────────────────────────────
  document.getElementById("btn-analyze").addEventListener("click", function () {
    if (!monthlyGhi) return;
    runCalculation();
  });

  function runCalculation() {
    const nPanels = parseFloat(document.getElementById("n-panels").value);
    const panelWattage = parseFloat(document.getElementById("panel-wattage").value);
    const panelEff = parseFloat(document.getElementById("panel-efficiency").value) / 100;
    const invEff = parseFloat(document.getElementById("inverter-efficiency").value) / 100;
    const sysLosses = parseFloat(document.getElementById("system-losses").value) / 100;
    const tariff = parseFloat(document.getElementById("tariff").value);
    const cost = parseFloat(document.getElementById("installation-cost").value);

    showSpinner();

    fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: currentLat,
        lon: currentLon,
        monthly_ghi: monthlyGhi,
        n_panels: nPanels,
        panel_wattage: panelWattage,
        panel_efficiency: panelEff,
        inverter_efficiency: invEff,
        system_losses: sysLosses,
        tariff: tariff,
        installation_cost: cost,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { showPlaceholder(); return; }
        renderResults(data);
      })
      .catch(function () { showPlaceholder(); });
  }

  // ── UI State Helpers ───────────────────────────────────
  function showPlaceholder() {
    document.getElementById("results-placeholder").style.display = "";
    document.getElementById("results-spinner").style.display = "none";
    document.getElementById("results-content").style.display = "none";
  }

  function showSpinner() {
    document.getElementById("results-placeholder").style.display = "none";
    document.getElementById("results-spinner").style.display = "";
    document.getElementById("results-content").style.display = "none";
  }

  function showResults() {
    document.getElementById("results-placeholder").style.display = "none";
    document.getElementById("results-spinner").style.display = "none";
    document.getElementById("results-content").style.display = "";
  }

  // ── Render Results ─────────────────────────────────────
  function renderResults(r) {
    // KPI values
    document.getElementById("kpi-yield").textContent =
      Math.round(r.annual_ac_kwh).toLocaleString();
    document.getElementById("kpi-capacity").textContent =
      r.system_capacity_kwp.toFixed(2);
    document.getElementById("kpi-area").textContent =
      r.panel_area.toFixed(1);
    document.getElementById("kpi-inverter").textContent =
      r.inverter_capacity_kva.toFixed(1);
    document.getElementById("kpi-payback").textContent =
      r.payback_years.toFixed(1);
    document.getElementById("kpi-co2").textContent =
      Math.round(r.co2_offset_kg).toLocaleString();

    // Payback badge
    const badge = document.getElementById("payback-badge");
    const cls = r.payback_classification.toLowerCase();
    badge.className = `badge-payback badge-${cls}`;
    badge.textContent = r.payback_classification + " Payback";

    // Gauge
    renderGauge(r.payback_years, r.payback_classification);

    // Chart
    renderChart(r.monthly_results);

    // Table
    renderTable(r.monthly_results, r.annual_dc_kwh, r.annual_ac_kwh);

    showResults();
  }

  // ── SVG Payback Gauge ──────────────────────────────────
  function renderGauge(years, classification) {
    const svg = document.getElementById("gauge-svg");
    const cx = 120, cy = 100, r = 80;

    function toRad(deg) { return deg * Math.PI / 180; }
    function polar(angleDeg) {
      return {
        x: cx + r * Math.cos(toRad(angleDeg)),
        y: cy + r * Math.sin(toRad(angleDeg)),
      };
    }
    function arcPath(a1, a2) {
      const s = polar(a1), e = polar(a2);
      const large = a2 - a1 > 180 ? 1 : 0;
      return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
    }

    const startAngle = 180;
    const totalDeg = 180;
    const clamped = Math.min(years, MAX_GAUGE_YEARS);
    const fraction = clamped / MAX_GAUGE_YEARS;
    const needleAngle = startAngle + fraction * totalDeg;

    const zones = [
      { from: 0, to: 5, color: "#10b981" },
      { from: 5, to: 10, color: "#3b82f6" },
      { from: 10, to: 15, color: "#f59e0b" },
      { from: 15, to: 20, color: "#ef4444" },
    ];

    const clrMap = {
      Excellent: "#10b981", Good: "#3b82f6",
      Moderate: "#f59e0b", Poor: "#ef4444",
    };
    const clrNeedle = clrMap[classification] || "#f97316";

    let html = "";

    // Zone arcs (faded)
    zones.forEach(function (z) {
      const a1 = startAngle + (z.from / MAX_GAUGE_YEARS) * totalDeg;
      const a2 = startAngle + (z.to / MAX_GAUGE_YEARS) * totalDeg;
      html += `<path d="${arcPath(a1, a2)}" stroke="${z.color}" stroke-width="16" fill="none" stroke-linecap="butt" opacity="0.22"/>`;
    });

    // Active arc
    html += `<path d="${arcPath(startAngle, needleAngle)}" stroke="${clrNeedle}" stroke-width="16" fill="none" stroke-linecap="round"/>`;

    // Needle
    const tip = polar(needleAngle);
    html += `<line x1="${cx}" y1="${cy}" x2="${tip.x}" y2="${tip.y}" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="5" fill="white"/>`;
    html += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="18" font-weight="700" fill="${clrNeedle}">${years.toFixed(1)} yr</text>`;

    svg.innerHTML = html;
    svg.setAttribute("aria-label", `Payback gauge: ${years.toFixed(1)} years`);
  }

  // ── Plotly Chart ───────────────────────────────────────
  function renderChart(monthly) {
    const months = monthly.map(function (m) { return m.month; });
    const acKwh = monthly.map(function (m) { return m.ac_kwh; });
    const ghi = monthly.map(function (m) { return m.ghi; });

    const barTrace = {
      x: months, y: acKwh, type: "bar", name: "AC Energy (kWh)",
      marker: {
        color: acKwh.map(function () { return "#f97316"; }),
        opacity: 0.85,
      },
      yaxis: "y",
    };

    const lineTrace = {
      x: months, y: ghi, type: "scatter", mode: "lines+markers",
      name: "GHI (kWh/m²/day)", line: { color: "#e879f9", width: 2 },
      marker: { color: "#e879f9", size: 5 },
      yaxis: "y2",
    };

    const layout = {
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Space Grotesk, Inter, sans-serif", color: "rgba(255,255,255,0.5)", size: 10 },
      margin: { t: 10, r: 40, b: 30, l: 40 },
      legend: {
        font: { size: 10, color: "rgba(255,255,255,0.5)" },
        bgcolor: "transparent",
        x: 0, y: 1.15, orientation: "h",
      },
      xaxis: {
        showgrid: false, zeroline: false,
        tickfont: { size: 10, color: "rgba(255,255,255,0.4)" },
        linecolor: "transparent",
      },
      yaxis: {
        showgrid: true, zeroline: false,
        gridcolor: "rgba(255,255,255,0.06)",
        tickfont: { size: 10, color: "rgba(255,255,255,0.4)" },
        linecolor: "transparent",
      },
      yaxis2: {
        overlaying: "y", side: "right", showgrid: false, zeroline: false,
        tickfont: { size: 10, color: "rgba(255,255,255,0.4)" },
        linecolor: "transparent",
      },
      bargap: 0.3,
    };

    Plotly.react("monthly-chart", [barTrace, lineTrace], layout, {
      displayModeBar: false, responsive: true,
    });
  }

  // ── Monthly Table ──────────────────────────────────────
  function renderTable(monthly, totalDc, totalAc) {
    const tbody = document.getElementById("monthly-table-body");
    let rows = "";
    monthly.forEach(function (m) {
      rows += `<tr>
        <td>${m.month}</td>
        <td>${m.ghi.toFixed(2)}</td>
        <td>${Math.round(m.dc_kwh).toLocaleString()}</td>
        <td class="td-orange">${Math.round(m.ac_kwh).toLocaleString()}</td>
      </tr>`;
    });
    rows += `<tr class="tr-total">
      <td>Total</td>
      <td>—</td>
      <td>${Math.round(totalDc).toLocaleString()}</td>
      <td class="td-orange">${Math.round(totalAc).toLocaleString()}</td>
    </tr>`;
    tbody.innerHTML = rows;
  }

})();
