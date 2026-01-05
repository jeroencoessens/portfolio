console.log('APP VERSION: 0-1: zone ranking');
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
    const highCount = probs.filter(p => p >= 0.9).length;

    cluster.bindTooltip(
      `
      <strong>${markers.length} farms</strong><br/>
      Probability: ${(minP * 100).toFixed(0)}–${(maxP * 100).toFixed(0)}%<br/>
      ≥90%: ${highCount}
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

/* ---------------- High-density zones (ranked + menu-linked) ---------------- */

function computeHighDensityZones() {
  if (!zonesEnabled) {
    zoneLayer.clearLayers();
    renderZonesList();
    return;
  }

  zoneLayer.clearLayers();
  window.farmZones = [];

  const candidates = [];

  clusterGroup.eachLayer(cluster => {
    if (!cluster.getAllChildMarkers) return;

    const markers = cluster.getAllChildMarkers();
    if (markers.length < 4) return;

    const high90 = markers.filter(m => m.farmProbability >= 0.9);
    if (high90.length < 1) return;

    const score = high90.length * Math.log(markers.length + 1);

    candidates.push({
      center: cluster.getLatLng(),
      total: markers.length,
      high90: high90.length,
      score
    });
  });

  if (!candidates.length) {
    renderZonesList();
    return;
  }

  candidates.sort((a, b) => b.score - a.score);

  candidates.slice(0, 8).forEach((zone, index) => {
    const circle = L.circle(zone.center, {
      radius: 2200 + zone.high90 * 500,
      color: '#c62828',
      fillColor: '#c62828',
      fillOpacity: 0.18,
      weight: 1
    });

    circle.bindPopup(`
      <div class="zone-popup">
        <strong>High-risk zone #${index + 1}</strong><br/>
        Farms: ${zone.total}<br/>
        ≥90%: ${zone.high90}<br/>
        <button onclick="map.setView([${zone.center.lat}, ${zone.center.lng}], 10)">
          Zoom into zone
        </button>
      </div>
    `);

    circle.addTo(zoneLayer);
    window.farmZones.push(zone);
  });

  renderZonesList();
}

/* ---------------- Zones panel rendering ---------------- */

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
      Farms: ${zone.total}<br/>
      ≥90%: ${zone.high90}
    `;

    item.onclick = () => {
      map.setView(
        [zone.center.lat, zone.center.lng],
        Math.max(map.getZoom(), 10),
        { animate: true }
      );
    };

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
  filterTimeout = setTimeout(() => applyFilter(value / 100), 150);
});

/* ---------------- Toggles & actions ---------------- */

document.getElementById('toggleCluster').onclick = () => {
  clusteringEnabled = !clusteringEnabled;
  map.removeLayer(clusteringEnabled ? plainLayer : clusterGroup);
  map.addLayer(clusteringEnabled ? clusterGroup : plainLayer);
  toggleCluster.textContent =
    clusteringEnabled ? 'Disable clustering' : 'Enable clustering';
};

document.getElementById('toggleHeat').onclick = () => {
  heatEnabled = !heatEnabled;

  if (heatEnabled) {
    map.addLayer(heatLayer);
    map.options.zoomAnimation = false;
  } else {
    map.removeLayer(heatLayer);
    map.options.zoomAnimation = true;
  }

  toggleHeat.textContent =
    heatEnabled ? 'Hide suspicious areas' : 'Show suspicious areas';
};

document.getElementById('toggleZones').onclick = () => {
  zonesEnabled = !zonesEnabled;
  computeHighDensityZones();
  toggleZones.textContent =
    zonesEnabled ? 'Hide high-density zones' : 'High-density zones';
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

/* ---------------- Actions ---------------- */

function zoomToFarm(lat, lng) {
  map.setView([lat, lng], 16, { animate: true });
}

function vote(id, yes) {
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  votes[id] = { value: yes ? 'YES' : 'NO', timestamp: new Date().toISOString() };
  localStorage.setItem('farmVotes', JSON.stringify(votes));
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
