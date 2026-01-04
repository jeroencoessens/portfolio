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

/* Zone layer is ALWAYS attached to the map */
const zoneLayer = L.layerGroup().addTo(map);

let clusteringEnabled = true;
let heatEnabled = false;
let zonesEnabled = false;

let allMarkers = [];
let heatLayer;
let filterTimeout = null;

/* Exposed for UI listing */
window.farmZones = [];

/* Recompute zones after clustering finishes */
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

/* ---------------- High-density zones ---------------- */

function computeHighDensityZones() {
  if (!zonesEnabled) {
    zoneLayer.clearLayers();
    return;
  }

  zoneLayer.clearLayers();
  window.farmZones = [];

  const clusters = [];

  clusterGroup.eachLayer(cluster => {
    if (!cluster.getAllChildMarkers) return;

    const markers = cluster.getAllChildMarkers();
    if (markers.length < 3) return;

    const probs = markers.map(m => m.farmProbability);
    const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
    const high80 = probs.filter(p => p >= 0.8).length;

    const score = avg * (high80 / probs.length);

    clusters.push({
      center: cluster.getLatLng(),
      total: markers.length,
      high80,
      avg,
      score
    });
  });

  if (!clusters.length) return;

  clusters.sort((a, b) => b.score - a.score);

  const cutoff = Math.max(1, Math.ceil(clusters.length * 0.3));
  const selected = clusters.slice(0, cutoff);

  selected.forEach(zone => {
    window.farmZones.push(zone);

    L.circle(zone.center, {
      radius: 2000 + zone.total * 120,
      color: getColor(zone.avg),
      fillColor: getColor(zone.avg),
      fillOpacity: 0.2,
      weight: 1
    })
      .bindTooltip(
        `
        <strong>High-density zone</strong><br/>
        Farms: ${zone.total}<br/>
        ≥80%: ${zone.high80}<br/>
        Avg: ${(zone.avg * 100).toFixed(0)}%
        `,
        { sticky: true }
      )
      .addTo(zoneLayer);
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

  if (zonesEnabled) {
    computeHighDensityZones();
  } else {
    zoneLayer.clearLayers();
  }

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
