console.log('APP VERSION: 0-3: zone ranking');

/* ---------------- Base layers ---------------- */

const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri' }
);

const map = L.map('map', {
  layers: [satellite],
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([16, 106], 6);

L.control.layers(
  { Street: street, Satellite: satellite },
  null,
  { position: 'topright' }
).addTo(map);

let seedVotes = {};
let showVotedOverlay = false;

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

function getColor(p) {
  if (p >= 0.9) return '#c62828';
  if (p >= 0.7) return '#ef6c00';
  if (p >= 0.5) return '#f9a825';
  return '#2e7d32';
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

      marker.bindPopup(`
        <strong>Farm ID:</strong> ${farm.ID}<br/>
        <strong>Probability:</strong> ${(farm.farm_probability * 100).toFixed(1)}%<br/><br/>
        <button onclick="zoomToFarm(${farm.Latitude}, ${farm.Longitude})" class="secondary">Zoom to location</button>
        <button onclick="vote(${farm.ID}, true)">YES</button>
        <button onclick="vote(${farm.ID}, false)" class="secondary">NO</button>
      `);

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

/* ---------------- High-density zones ---------------- */

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
    const circle = L.circle(zone.center, {
      radius: 1500 + zone.total * 600,
      color: '#c62828',
      fillColor: '#c62828',
      fillOpacity: 0.22,
      weight: 2
    });

    circle.bindPopup(`
      <strong>High-risk zone #${index + 1}</strong><br/>
      ≥90% farms: ${zone.total}<br/>
      <button onclick="map.setView([${zone.center.lat}, ${zone.center.lng}], 11)">
        Zoom into zone
      </button>
    `);

    circle.addTo(zoneLayer);
    window.farmZones.push(zone);
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
    item.innerHTML = `
      <div class="zone-rank">Zone #${index + 1}</div>
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
  votes[id] = { value: yes ? 'YES' : 'NO', timestamp: new Date().toISOString() };
  localStorage.setItem('farmVotes', JSON.stringify(votes));
  updateVoteStyles();
}

function updateVoteStyles() {
  const localVotes = JSON.parse(localStorage.getItem('farmVotes') || '{}');

  allMarkers.forEach(marker => {
    const voted =
      !!localVotes[marker.farmID] || !!seedVotes[marker.farmID];

    marker.hasVote = voted;

    const style = {
      fillColor: getColor(marker.farmProbability),
      color: '#2e2e2e',
      weight: 1
    };

    if (showVotedOverlay && voted) {
      style.fillColor = '#1976d2';
      style.color = '#0d47a1';
    }

    if (!voted && marker.farmProbability >= 0.8 && marker.farmProbability < 0.9) {
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
