console.log('APP VERSION: 0-3: zone ranking');

/* ---------------- Base layers ---------------- */

const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri' }
);

const labeled = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }
);

const map = L.map('map', {
  layers: [satellite],
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([16, 106], 6);

L.control.layers(
  { Street: street, Labeled: labeled, Satellite: satellite },
  null,
  { position: 'topright' }
).addTo(map);

let seedVotes = {};
let showVotedOverlay = false;

// -- MODEL VERSION ---
const MODEL_VERSION = 'v0.1';

const TIERS = [
  { name: 'Observer', min: 0 },
  { name: 'Verifier', min: 10 },
  { name: 'Investigator', min: 50 },
  { name: 'Field Auditor', min: 200 }
];

function getTier(score) {
  return [...TIERS].reverse().find(t => score >= t.min).name;
}

/* ---------------- Slider control ---------------- */

const ProbabilityControl = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create('div', 'leaflet-control probability-control');
    div.innerHTML = `
      <div class="title">Minimum probability</div>
      <div class="row">
        <input id="probabilitySlider" type="range" min="0" max="100" value="50">
        <div id="probabilityMeta" class="meta">50% · 0 shown</div>
      </div>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  }
});
map.addControl(new ProbabilityControl({ position: 'topleft' }));

/* ---------------- Utilities ---------------- */

const USER_VOTED_COLOR = '#1976d2';
const USER_VOTED_BORDER = '#0d47a1';

function getColor(p) {
  if (p >= 0.9) return '#c62828';
  if (p >= 0.7) return '#ef6c00';
  if (p >= 0.5) return '#f9a825';
  return '#2e7d32';
}

function loadUserData() {
  let data = localStorage.getItem('userData');

  if (!data) {
    data = {
      totalVotes: 0,
      highConfidenceVotes: 0,
      firstTimeVotes: 0,
      score: 0,
      firstSeen: new Date().toISOString().slice(0, 10),
      lastActive: new Date().toISOString().slice(0, 10)
    };
    localStorage.setItem('userData', JSON.stringify(data));
    return data;
  }

  return JSON.parse(data);
}

function saveUserData(data) {
  data.lastActive = new Date().toISOString().slice(0, 10);
  localStorage.setItem('userData', JSON.stringify(data));
}

function calculateVoteScore(marker, isFirstVote) {
  let score = 1; // base

  if (marker.farmProbability >= 0.9) score += 2;
  if (isFirstVote) score += 1;

  return score;
}

function renderVotePopup(marker) {
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  const vote = votes[marker.farmID];

  const votedBlock = vote
    ? `
      <div style="font-weight:600; color:#2e7d32; margin-bottom:6px;">
        VOTED (${vote.value})
      </div>
      <button onclick="cancelVote('${marker.farmID}')" class="secondary">
        Cancel vote
      </button>
    `
    : `
      <button onclick="vote(${marker.farmID}, true)">YES</button>
      <button onclick="vote(${marker.farmID}, false)" class="secondary">NO</button>
    `;

  return `
    <strong>Farm ID:</strong> ${marker.farmID}<br/>
    <strong>Probability:</strong> ${(marker.farmProbability * 100).toFixed(1)}%<br/><br/>
    <button onclick="zoomToFarm(${marker.getLatLng().lat}, ${marker.getLatLng().lng})" class="secondary">
      Zoom to location
    </button>
    <div style="margin-top:8px;">
      ${votedBlock}
    </div>
  `;
}

/* ---------------- Layers ---------------- */

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction(cluster) {
    const markers = cluster.getAllChildMarkers();
    const probs = markers.map(m => m.farmProbability);
    const maxP = Math.max(...probs);
    const minP = Math.min(...probs);

    const high90 = markers.filter(m => m.farmProbability >= 0.9).length;
    const unvotedHigh = markers.filter(
      m => m.farmProbability >= 0.8 && !m.hasVote
    ).length;

    cluster.bindTooltip(
      `
      <strong>${markers.length} farms</strong><br/>
      Probability: ${(minP * 100).toFixed(0)}–${(maxP * 100).toFixed(0)}%<br/>
      ≥90%: ${high90}<br/>
      Needs review (≥80%): ${unvotedHigh}
      `,
      { sticky: true, opacity: 0.95 }
    );

    return L.divIcon({
      html: `<div class="cluster-icon" style="background:${getColor(maxP)}">${markers.length}</div>`,
      className: '',
      iconSize: [40, 40]
    });
  }
});

const plainLayer = L.layerGroup();
const zoneLayer = L.layerGroup().addTo(map);

let clusteringEnabled = true;
let heatEnabled = false;
let zonesEnabled = false;

let allMarkers = [];
let heatLayer;
let filterTimeout = null;

window.farmZones = [];

/* Ensure zones recompute after clustering */
clusterGroup.on('clusteringend', () => {
  if (zonesEnabled) computeHighDensityZones();
});

/* ---------------- Data ---------------- */

fetch('vietnam_json.json')
  .then(r => r.json())
  .then(data => {
    const heatPoints = [];

    data.Farms.forEach(farm => {
      const marker = L.circleMarker([farm.Latitude, farm.Longitude], {
        radius: 9,
        fillColor: getColor(farm.farm_probability),
        color: '#2e2e2e',
        weight: 1,
        fillOpacity: 0.85
      });

      marker.farmID = String(farm.ID);
      marker.hasVote = false;
      marker.voteSource = null;
      marker.farmProbability = farm.farm_probability;

      marker.bindTooltip(
        `ID ${farm.ID}<br>${(farm.farm_probability * 100).toFixed(1)}%`,
        { direction: 'top', opacity: 0.9 }
      );

     marker.bindPopup(() => renderVotePopup(marker), {
  offset: L.point(0, -50)
});

      allMarkers.push(marker);

      if (farm.farm_probability >= 0.75) {
        heatPoints.push([farm.Latitude, farm.Longitude, farm.farm_probability]);
      }
    });

    heatLayer = L.heatLayer(heatPoints, {
      radius: 20,
      blur: 20,
      maxZoom: 8,
      gradient: {
        0.75: '#f9a825',
        0.9: '#ef6c00',
        1.0: '#c62828'
      }
    });

    applyFilter(0.5);
  });

fetch('votes_seed.json')
  .then(r => r.json())
  .then(data => {
    seedVotes = data;
    updateVoteStyles();
  })
  .catch(() => console.warn('No seed votes found'));

renderContributionPanel();

/* ---------------- High-density zones ---------------- */

function getZoneColor(index, totalZones) {
  // Generate purple gradient from brightest (index 0) to darkest (index 7)
  // Using purple shades from Material Design palette
  const purpleShades = [
    '#BA68C8', // purple 300 - brightest
    '#AB47BC', // purple 400
    '#9C27B0', // purple 500
    '#8E24AA', // purple 600
    '#7B1FA2', // purple 700
    '#6A1B9A', // purple 800
    '#4A148C', // purple 900
    '#38006B'  // darkest purple
  ];
  return purpleShades[Math.min(index, purpleShades.length - 1)];
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function computeHighDensityZones() {
  if (!zonesEnabled) {
    zoneLayer.clearLayers();
    renderZonesList();
    return;
  }

  zoneLayer.clearLayers();
  window.farmZones = [];

  const strong = allMarkers.filter(m => m.farmProbability >= 0.9);
  if (strong.length < 2) {
    renderZonesList();
    return;
  }

  const used = new Set();
  const zones = [];
  const RADIUS_KM = 5;
  const MIN_POINTS = 2;

  strong.forEach((m, i) => {
    if (used.has(i)) return;

    const center = m.getLatLng();
    const members = [m];
    used.add(i);

    strong.forEach((n, j) => {
      if (i === j || used.has(j)) return;
      if (distanceKm(center, n.getLatLng()) <= RADIUS_KM) {
        members.push(n);
        used.add(j);
      }
    });

    if (members.length >= MIN_POINTS) {
      const lat = members.reduce((s, m) => s + m.getLatLng().lat, 0) / members.length;
      const lng = members.reduce((s, m) => s + m.getLatLng().lng, 0) / members.length;

      zones.push({ center: L.latLng(lat, lng), total: members.length });
    }
  });

  zones.sort((a, b) => b.total - a.total);

  zones.slice(0, 8).forEach((zone, index) => {
    const zoneColor = getZoneColor(index, zones.length);
    const circle = L.circle(zone.center, {
      radius: 1500 + zone.total * 600,
      color: zoneColor,
      fillColor: zoneColor,
      fillOpacity: 0.35,
      weight: 2
    });

    circle.bindPopup(`
      <strong>High-risk zone #${index + 1}</strong><br/>
      ≥90% farms: ${zone.total}<br/>
      <p>This is a high-density zone with multiple high-probability farms. Explore this area in detail.</p>
      <button onclick="window.location.href='../farm-map-tinder/index.html'" style="margin-top: 8px; width: 100%;">
        Explore Zone
      </button>
      <button onclick="map.setView([${zone.center.lat}, ${zone.center.lng}], 11)" class="secondary" style="margin-top: 8px; width: 100%;">
        Zoom into zone
      </button>
    `);

    circle.addTo(zoneLayer);
    // Store color with zone for panel display
    window.farmZones.push({ ...zone, color: zoneColor, index: index });
  });

  renderZonesList();
}

/* ---------------- Zones panel ---------------- */

function renderZonesList() {
  const panel = document.getElementById('zonesPanel');
  const list = document.getElementById('zonesList');

  if (!panel || !list) return;

  list.innerHTML = '';

  if (!zonesEnabled || !window.farmZones.length) {
    panel.classList.remove('active');
    return;
  }

  panel.classList.add('active');

  window.farmZones.forEach((zone, index) => {
    const item = document.createElement('div');
    item.className = 'zone-item';
    // Use the stored color or fallback to default
    const zoneIndex = zone.index !== undefined ? zone.index : index;
    const zoneColor = zone.color || getZoneColor(zoneIndex, window.farmZones.length);
    item.style.background = zoneColor;
    item.style.color = 'white';
    item.innerHTML = `
      <div class="zone-rank">Zone #${zoneIndex + 1}</div>
      Farms: ${zone.total}
    `;
    item.onclick = () =>
      map.setView([zone.center.lat, zone.center.lng], Math.max(map.getZoom(), 10));
    list.appendChild(item);
  });
}

/* ---------------- Filtering ---------------- */

function applyFilter(minP) {
  clusterGroup.clearLayers();
  plainLayer.clearLayers();

  let count = 0;

  allMarkers.forEach(m => {
    if (m.farmProbability >= minP) {
      clusterGroup.addLayer(m);
      plainLayer.addLayer(m);
      count++;
    }
  });

  updateVoteStyles();

  document.getElementById('probabilityMeta').textContent =
    `${Math.round(minP * 100)}% · ${count} shown`;

  map.removeLayer(clusteringEnabled ? plainLayer : clusterGroup);
  map.addLayer(clusteringEnabled ? clusterGroup : plainLayer);

  computeHighDensityZones();
}

document.addEventListener('input', e => {
  if (e.target.id !== 'probabilitySlider') return;
  const value = e.target.value;
  e.target.style.backgroundSize = `${value}% 100%`;
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => applyFilter(e.target.value / 100), 150);
});

/* ---------------- Toggles ---------------- */

document.getElementById('toggleCluster').onclick = () => {
  clusteringEnabled = !clusteringEnabled;
  map.removeLayer(clusteringEnabled ? plainLayer : clusterGroup);
  map.addLayer(clusteringEnabled ? clusterGroup : plainLayer);
};

document.getElementById('toggleHeat').onclick = () => {
  heatEnabled = !heatEnabled;
  heatEnabled ? map.addLayer(heatLayer) : map.removeLayer(heatLayer);
};

document.getElementById('toggleZones').onclick = () => {
  zonesEnabled = !zonesEnabled;
  computeHighDensityZones();
};

document.getElementById('toggleVoted').onclick = () => {
  showVotedOverlay = !showVotedOverlay;
  updateVoteStyles();
};

document.getElementById('closeZonesPanel').onclick = () => {
  document.getElementById('zonesPanel').classList.remove('active');
};

/* Recompute zones on map movement */
map.on('moveend zoomend', () => {
  if (zonesEnabled) computeHighDensityZones();
});

/* Mobile heatmap fix */
map.on('zoomanim move', () => {
  if (heatEnabled && heatLayer) {
    heatLayer._reset();
  }
});

document.getElementById('toggleMenu').onclick = () =>
  document.getElementById('menuPanel').classList.toggle('active');

document.getElementById('exportVotes').onclick = exportVotes;

/* ---------------- Voting ---------------- */

function vote(id, yes) {
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  const isFirstVote = !votes[id];

  votes[id] = {
    value: yes ? 'YES' : 'NO',
    timestamp: new Date().toISOString()
  };

  localStorage.setItem('farmVotes', JSON.stringify(votes));

  const userData = loadUserData();
  const marker = allMarkers.find(m => m.farmID === String(id));

  userData.totalVotes += 1;

  if (marker.farmProbability >= 0.9) {
    userData.highConfidenceVotes += 1;
  }

  if (isFirstVote) {
    userData.firstTimeVotes += 1;
  }

  userData.score += calculateVoteScore(marker, isFirstVote);

  saveUserData(userData);

  updateVoteStyles();
  renderContributionPanel();

  if (marker) {
    marker.setPopupContent(renderVotePopup(marker));
  }
}

function updateVoteStyles() {
  const localVotes = JSON.parse(localStorage.getItem('farmVotes') || '{}');

  allMarkers.forEach(marker => {
    const userVoted = !!localVotes[marker.farmID];
    const seedVoted = !!seedVotes[marker.farmID];

    marker.hasVote = userVoted || seedVoted;

    const style = {
  fillColor: getColor(marker.farmProbability),
  color: '#2e2e2e',
  weight: 1
};

/* User-voted farms: always blue */
if (userVoted) {
  style.fillColor = USER_VOTED_COLOR;
  style.color = USER_VOTED_BORDER;
  style.weight = 2;
}

/* Optional overlay toggle (kept intact) */
if (showVotedOverlay && marker.hasVote && !userVoted) {
  style.fillColor = '#1976d2';
  style.color = '#0d47a1';
}

/* Needs-review emphasis (only if unvoted) */
if (!marker.hasVote && marker.farmProbability >= 0.8 && marker.farmProbability < 0.9) {
  style.weight = 2;
  style.color = '#000';
}

    marker.setStyle(style);
  });

  updateUnvotedCounter();
}

function countUnvotedHigh() {
  return allMarkers.filter(
    m => m.farmProbability >= 0.8 && !m.hasVote
  ).length;
}

function updateUnvotedCounter() {
  const el = document.getElementById('unvotedCounter');
  if (el) el.textContent = `Needs review: ${countUnvotedHigh()}`;
}

function zoomToFarm(lat, lng) {
  map.setView([lat, lng], 17, { animate: true });
}

function exportVotes() {
  const blob = new Blob(
    [localStorage.getItem('farmVotes') || '{}'],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'farm_votes.json';
  a.click();
}

function cancelVote(id) {
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  if (!votes[id]) return;

  delete votes[id];
  localStorage.setItem('farmVotes', JSON.stringify(votes));

  updateVoteStyles();
  renderContributionPanel();

  const marker = allMarkers.find(m => m.farmID === String(id));
  if (marker) {
    marker.setPopupContent(renderVotePopup(marker));
  }
}

/* ---------------- Intro tutorial ---------------- */

const introOverlay = document.getElementById('introOverlay');
const introReady = document.getElementById('introReady');

if (!localStorage.getItem('farmMapIntroSeen')) {
  introOverlay.style.display = 'flex';
}

introReady.onclick = () => {
  localStorage.setItem('farmMapIntroSeen', 'true');
  introOverlay.style.display = 'none';
};

/* ---------------- Contribution panel ---------------- */

function renderContributionPanel() {
  const data = loadUserData();

  document.getElementById('userTier').textContent =
    getTier(data.score);

  document.getElementById('userScore').textContent =
    `${data.score} points`;

  document.getElementById('userVotes').textContent =
    data.totalVotes;

  document.getElementById('userHigh').textContent =
    data.highConfidenceVotes;

  document.getElementById('modelVersion').textContent =
    MODEL_VERSION;
}

