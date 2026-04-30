/**
 * Zone Quest v2 — Farm Verification Game
 * Refactored: cleaner code, professional text-based UI, all functionality preserved.
 */
'use strict';

console.log('Zone Quest — Farm Verification Game');
console.log('Help identify factory farms using satellite imagery');

/* ==================== MAP SETUP ==================== */

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles &copy; Esri' }
);

const googleLayer = L.tileLayer(
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  { attribution: '&copy; Google', maxZoom: 20 }
);

const street = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap contributors' }
);

const map = L.map('map', {
  layers: [satellite],
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([16, 106], 6);

L.control.layers(
  { 'Esri Satellite': satellite, 'Google Satellite': googleLayer, 'Street': street },
  null,
  { position: 'topright' }
).addTo(map);

let isSimpleGoogleMode = false;

/* ==================== CONSTANTS ==================== */

const GAME_CONSTANTS = {
  BASE_POINTS_PER_VOTE: 100,
  MIN_POINTS_PER_VOTE: 10,
  POINTS_REDUCTION_FACTOR: 0.9,
  MYSTERY_BOX_VOTE_FREQUENCY: 25,
  ZONE_GRID_SIZE: 0.5,
  MIN_ZONE_FARMS: 10,
  FIRST_ZONE_UNLOCK_PRICE: 0,
  ZONE_UNLOCK_BASE_PRICE: 1000,
  ZONE_UNLOCK_PRICE_INCREMENT: 500,
  DOUBLE_POINTS_PRICE: 500,
  DOUBLE_POINTS_DURATION: 600000,
  TRIPLE_POINTS_PRICE: 1000,
  TRIPLE_POINTS_DURATION: 300000,
  MYSTERY_BOX_PRICE: 300,
  HISTORICAL_MODE_PRICE: 2000,
  ZONE_VIEW_ZOOM: 12,
  FARM_DETAIL_ZOOM: 14,
  FARM_INSPECT_ZOOM: 18,
  MIN_FARM_PROBABILITY: 0.5,
  PROB_LOW_THRESHOLD: 0.65,
  PROB_MEDIUM_THRESHOLD: 0.75,
  PROB_HIGH_THRESHOLD: 0.85
};

/* ==================== GAME STATE ==================== */

let gameState = {
  points: 0,
  totalVotes: 0,
  yesVotes: 0,
  noVotes: 0,
  votes: {},
  unlockedZones: [0],
  unlockedThemes: ['default'],
  badges: [],
  currentTheme: 'default',
  currentAvatar: 'farmer',
  unlockedAvatars: ['farmer'],
  currentTitle: 'Observer',
  unlockedTitles: ['Observer'],
  activePowerUp: null,
  unlockedPowerUps: [],
  mysteryBoxes: 0,
  historicalUnlocked: false,
  unlockedSatelliteProviders: ['esri', 'bing_2014', 'sentinel2_cloudless'],
  currentSatelliteProvider: 'esri'
};

let zones = [];
let allFarms = [];
let currentZone = null;
let currentFarm = null;
let zoneMarkers = [];
let farmMarkers = [];
let currentZoomLevel = 6;

function loadGameState() {
  const saved = localStorage.getItem('zoneQuestGameState');
  if (saved) {
    gameState = { ...gameState, ...JSON.parse(saved) };
  }
  updateUI();
}

function saveGameState() {
  localStorage.setItem('zoneQuestGameState', JSON.stringify(gameState));
}

/* ==================== DATA LOADING ==================== */

async function loadFarmData() {
  try {
    const response = await fetch('../farm-map/vietnam_json.json');
    const data = await response.json();

    allFarms = data.Farms
      .filter(f => f.farm_probability > GAME_CONSTANTS.MIN_FARM_PROBABILITY)
      .map(f => ({
        id: f.ID,
        lat: f.Latitude,
        lng: f.Longitude,
        probability: f.farm_probability
      }));

    console.log(`Loaded ${allFarms.length} farms with >50% probability`);
    createZones();
    showZoneMarkers();
  } catch (error) {
    console.error('Error loading farm data:', error);
    showToast('Error loading farm data');
  }
}

/* ==================== ZONE CLUSTERING ==================== */

function createZones() {
  const COARSE = GAME_CONSTANTS.ZONE_GRID_SIZE;
  const FINE = COARSE / 2;
  const TARGET = 100;
  const MAX = 130;
  const MIN = 25;

  const coarseMap = {};
  allFarms.forEach(farm => {
    const key = Math.floor(farm.lng / COARSE) + ',' + Math.floor(farm.lat / COARSE);
    if (!coarseMap[key]) coarseMap[key] = [];
    coarseMap[key].push(farm);
  });

  const buckets = [];

  Object.values(coarseMap).forEach(farmList => {
    if (farmList.length < MIN) return;
    if (farmList.length <= MAX) { buckets.push(farmList); return; }

    const fineMap = {};
    farmList.forEach(f => {
      const key = Math.floor(f.lng / FINE) + ',' + Math.floor(f.lat / FINE);
      if (!fineMap[key]) fineMap[key] = [];
      fineMap[key].push(f);
    });

    Object.values(fineMap).forEach(subList => {
      if (subList.length < MIN) return;
      if (subList.length <= MAX) { buckets.push(subList); return; }

      const sorted = subList.slice().sort((a, b) => b.probability - a.probability);
      const n = Math.max(2, Math.round(subList.length / TARGET));
      const chunks = Array.from({ length: n }, () => []);
      sorted.forEach((f, i) => chunks[i % n].push(f));
      chunks.forEach(chunk => { if (chunk.length >= MIN) buckets.push(chunk); });
    });
  });

  zones = buckets.map((farms, i) => {
    const centerLat = farms.reduce((s, f) => s + f.lat, 0) / farms.length;
    const centerLng = farms.reduce((s, f) => s + f.lng, 0) / farms.length;
    const avgProb = farms.reduce((s, f) => s + f.probability, 0) / farms.length;
    const variance = farms.reduce((s, f) => s + Math.pow(f.probability - avgProb, 2), 0) / farms.length;
    const probSpread = Math.sqrt(variance);
    return { id: 'z' + i, farms, centerLat, centerLng, avgProb, probSpread };
  });

  zones.sort((a, b) => {
    const scoreA = a.probSpread * Math.min(1, a.farms.length / 80);
    const scoreB = b.probSpread * Math.min(1, b.farms.length / 80);
    return scoreB - scoreA;
  });

  zones.forEach((zone, i) => {
    zone.name = 'Zone ' + (i + 1);
    zone.index = i;
    zone.unlockPrice = i === 0
      ? GAME_CONSTANTS.FIRST_ZONE_UNLOCK_PRICE
      : GAME_CONSTANTS.ZONE_UNLOCK_BASE_PRICE + GAME_CONSTANTS.ZONE_UNLOCK_PRICE_INCREMENT * (i - 1);
  });

  const avg = Math.round(allFarms.length / zones.length);
  console.log(`Created ${zones.length} zones | avg ${avg} farms/zone`);
}

/* ==================== ZONE DISPLAY ==================== */

function showZoneMarkers() {
  zoneMarkers.forEach(m => map.removeLayer(m));
  zoneMarkers = [];

  // Render locked zones first (back), then unlocked (front), Zone #1 last (top)
  const sorted = zones.map((zone, index) => ({ zone, index }))
    .sort((a, b) => {
      const aUnlocked = gameState.unlockedZones.includes(a.index);
      const bUnlocked = gameState.unlockedZones.includes(b.index);
      if (aUnlocked !== bUnlocked) return aUnlocked ? 1 : -1;
      // Among unlocked, put index 0 (Zone #1) last so it renders on top
      if (aUnlocked && bUnlocked) return a.index === 0 ? 1 : b.index === 0 ? -1 : a.index - b.index;
      return a.index - b.index;
    });

  sorted.forEach(({ zone, index }, renderOrder) => {
    const isUnlocked = gameState.unlockedZones.includes(index);
    const isFirst = index === 0;
    const icon = L.divIcon({
      className: `zone-marker ${isUnlocked ? 'zone-marker--unlocked' : 'zone-marker--locked'}${isFirst ? ' zone-marker--first' : ''}`,
      html: `
        <div class="zone-marker-content ${isUnlocked ? 'unlocked' : 'locked'}${isFirst ? ' first' : ''}">
          <div class="zone-marker-name">${zone.name}</div>
          <div class="zone-marker-detail">${zone.farms.length} farms${!isUnlocked ? ' · ' + zone.unlockPrice + ' pts' : ''}</div>
        </div>
      `,
      iconSize: [130, 50],
      iconAnchor: [65, 25]
    });

    const marker = L.marker([zone.centerLat, zone.centerLng], {
      icon,
      zIndexOffset: isFirst ? 2000 : isUnlocked ? 1000 : 0
    }).addTo(map);
    marker.on('click', () => selectZone(index));
    zoneMarkers.push(marker);
  });
}

/* ==================== ZONE INTERACTION ==================== */

function selectZone(zoneIndex) {
  const zone = zones[zoneIndex];
  const isUnlocked = gameState.unlockedZones.includes(zoneIndex);

  if (!isUnlocked) {
    showToast(`Zone locked — unlock in shop for ${zone.unlockPrice} points`);
    return;
  }

  currentZone = zone;

  const votedCount = zone.farms.filter(f => gameState.votes[f.id]).length;
  const progress = Math.round((votedCount / zone.farms.length) * 100);

  document.getElementById('zoneName').textContent = zone.name;
  document.getElementById('zoneFarmCount').textContent = zone.farms.length;
  document.getElementById('zoneVoteCount').textContent = votedCount;
  document.getElementById('zoneAvgProb').textContent = `${(zone.avgProb * 100).toFixed(1)}%`;
  updateProgressRing(progress);

  const panel = document.getElementById('zonePanel');
  panel.classList.remove('hidden');
  panel.classList.add('active');
}

function updateProgressRing(progress) {
  const ring = document.getElementById('zoneProgressRing');
  if (!ring) return;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (progress / 100) * circumference;
  ring.style.strokeDasharray = `${circumference} ${circumference}`;
  ring.style.strokeDashoffset = offset;
  document.getElementById('zoneProgressText').textContent = `${progress}%`;
}

function exploreZone() {
  if (!currentZone) return;
  document.getElementById('zonePanel').classList.remove('active');
  currentZoomLevel = GAME_CONSTANTS.ZONE_VIEW_ZOOM;
  map.setView([currentZone.centerLat, currentZone.centerLng], GAME_CONSTANTS.ZONE_VIEW_ZOOM, {
    animate: true, duration: 1
  });
  showFarmMarkers(currentZone);
}

function closeZonePanel() {
  const panel = document.getElementById('zonePanel');
  panel.classList.remove('active');
  setTimeout(() => {
    if (!panel.classList.contains('active')) panel.classList.add('hidden');
  }, 300);
  currentZone = null;
}

/* ==================== FARM DISPLAY ==================== */

function showFarmMarkers(zone) {
  farmMarkers.forEach(m => map.removeLayer(m));
  farmMarkers = [];

  zone.farms.forEach(farm => {
    const vote = gameState.votes[farm.id];
    let colorClass = '';

    if (vote) {
      colorClass = vote.vote === 'yes' ? 'voted-yes' : 'voted-no';
    } else {
      if (farm.probability < GAME_CONSTANTS.PROB_LOW_THRESHOLD) colorClass = 'prob-low';
      else if (farm.probability < GAME_CONSTANTS.PROB_MEDIUM_THRESHOLD) colorClass = 'prob-medium';
      else if (farm.probability < GAME_CONSTANTS.PROB_HIGH_THRESHOLD) colorClass = 'prob-high';
      else colorClass = 'prob-very-high';
    }

    const icon = L.divIcon({
      className: 'farm-marker-zone',
      html: `<div class="farm-marker-zone-content ${colorClass}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const marker = L.marker([farm.lat, farm.lng], { icon }).addTo(map);
    marker.on('click', () => selectFarm(farm));
    farmMarkers.push(marker);
  });
}

/* ==================== FARM INTERACTION ==================== */

function selectFarm(farm) {
  currentFarm = farm;

  const voteCount = getGlobalVoteCount(farm.id);
  const points = calculatePoints(voteCount);

  document.getElementById('farmId').textContent = farm.id;
  document.getElementById('farmProb').textContent = `${(farm.probability * 100).toFixed(1)}%`;
  document.getElementById('farmVotes').textContent = voteCount;
  document.getElementById('farmPoints').textContent = points;
  document.getElementById('farmLat').textContent = farm.lat.toFixed(5);
  document.getElementById('farmLng').textContent = farm.lng.toFixed(5);

  const hasVoted = gameState.votes[farm.id];
  if (hasVoted) {
    document.getElementById('votingSection').style.display = 'none';
    document.getElementById('votedSection').style.display = 'block';
    document.getElementById('userVote').textContent = hasVoted.vote.toUpperCase();
  } else {
    document.getElementById('votingSection').style.display = 'block';
    document.getElementById('votedSection').style.display = 'none';
  }

  const farmPanel = document.getElementById('farmPanel');
  farmPanel.classList.add('active');

  map.setView([farm.lat, farm.lng], Math.max(map.getZoom(), GAME_CONSTANTS.FARM_DETAIL_ZOOM), {
    animate: true, duration: 0.5
  });
}

function closeFarmPanel() {
  const panel = document.getElementById('farmPanel');
  panel.classList.remove('active');
  currentFarm = null;

  if (currentZone && map.getZoom() > GAME_CONSTANTS.ZONE_VIEW_ZOOM) {
    map.setView([currentZone.centerLat, currentZone.centerLng], GAME_CONSTANTS.ZONE_VIEW_ZOOM, {
      animate: true, duration: 0.5
    });
  }
}

function zoomInToFarm() {
  if (!currentFarm) return;
  map.setView([currentFarm.lat, currentFarm.lng], GAME_CONSTANTS.FARM_INSPECT_ZOOM, {
    animate: true, duration: 0.8
  });
  showToast('Zoomed in — inspect the satellite imagery');
}

/* ==================== VOTING ==================== */

function vote(voteType) {
  if (!currentFarm) return;
  if (gameState.votes[currentFarm.id]) {
    showToast('Already voted on this farm');
    return;
  }

  const voteCount = getGlobalVoteCount(currentFarm.id);
  let points = calculatePoints(voteCount);

  if (gameState.activePowerUp && gameState.activePowerUp.expiresAt > Date.now()) {
    if (gameState.activePowerUp.type === 'double_points') {
      points *= 2;
      showToast('2x Points active!');
    } else if (gameState.activePowerUp.type === 'triple_points') {
      points *= 3;
      showToast('3x Points active!');
    }
  } else if (gameState.activePowerUp) {
    gameState.activePowerUp = null;
  }

  gameState.votes[currentFarm.id] = { vote: voteType, points, timestamp: Date.now() };
  gameState.points += points;
  gameState.totalVotes++;
  if (voteType === 'yes') gameState.yesVotes++;
  else gameState.noVotes++;

  if (gameState.totalVotes % GAME_CONSTANTS.MYSTERY_BOX_VOTE_FREQUENCY === 0) {
    gameState.mysteryBoxes++;
    showToast('Mystery box earned!');
  }

  checkTitles();
  incrementGlobalVoteCount(currentFarm.id);
  checkBadges();
  saveGameState();
  updateUI();
  showToast(`+${points} points — Total: ${gameState.points}`);
  selectFarm(currentFarm);
  if (currentZone) showFarmMarkers(currentZone);
}

function changeVote() {
  if (!currentFarm || !gameState.votes[currentFarm.id]) return;

  const oldVote = gameState.votes[currentFarm.id];
  delete gameState.votes[currentFarm.id];

  gameState.points -= oldVote.points;
  gameState.totalVotes--;
  if (oldVote.vote === 'yes') gameState.yesVotes--;
  else gameState.noVotes--;

  saveGameState();
  updateUI();
  selectFarm(currentFarm);
  if (currentZone) showFarmMarkers(currentZone);
  showToast('Vote removed — you can vote again');
}

/* ==================== POINTS ==================== */

function calculatePoints(voteCount) {
  const base = GAME_CONSTANTS.BASE_POINTS_PER_VOTE;
  const reduction = Math.pow(GAME_CONSTANTS.POINTS_REDUCTION_FACTOR, voteCount);
  return Math.max(GAME_CONSTANTS.MIN_POINTS_PER_VOTE, Math.floor(base * reduction));
}

function getGlobalVoteCount(farmId) {
  const stored = localStorage.getItem(`globalVotes_${farmId}`);
  return stored ? parseInt(stored) : 0;
}

function incrementGlobalVoteCount(farmId) {
  const current = getGlobalVoteCount(farmId);
  localStorage.setItem(`globalVotes_${farmId}`, current + 1);
}

/* ==================== TITLES ==================== */

const TITLE_DEFINITIONS = [
  { id: 'observer', name: 'Observer', minVotes: 0, minPoints: 0 },
  { id: 'scout', name: 'Scout', minVotes: 10, minPoints: 500 },
  { id: 'investigator', name: 'Investigator', minVotes: 25, minPoints: 2000 },
  { id: 'detective', name: 'Farm Detective', minVotes: 50, minPoints: 5000 },
  { id: 'expert', name: 'Satellite Expert', minVotes: 100, minPoints: 10000 },
  { id: 'master', name: 'Verification Master', minVotes: 250, minPoints: 25000 },
  { id: 'legend', name: 'Legend', minVotes: 500, minPoints: 50000 }
];

function checkTitles() {
  if (!gameState.unlockedTitles) gameState.unlockedTitles = ['observer'];
  if (!gameState.currentTitle) gameState.currentTitle = 'Observer';

  TITLE_DEFINITIONS.forEach(title => {
    if (gameState.totalVotes >= title.minVotes &&
        gameState.points >= title.minPoints &&
        !gameState.unlockedTitles.includes(title.id)) {
      gameState.unlockedTitles.push(title.id);
      gameState.currentTitle = title.name;
      showToast(`New title: ${title.name}`);
    }
  });
}

function getCurrentTitle() {
  return gameState.currentTitle || 'Observer';
}

/* ==================== BADGES ==================== */

const BADGE_DEFINITIONS = [
  { id: 'first_vote', name: 'First Steps', icon: '*', description: 'Cast your first vote',
    condition: () => gameState.totalVotes >= 1 },
  { id: 'ten_votes', name: 'Getting Started', icon: '**', description: 'Cast 10 votes',
    condition: () => gameState.totalVotes >= 10 },
  { id: 'fifty_votes', name: 'Dedicated Verifier', icon: '***', description: 'Cast 50 votes',
    condition: () => gameState.totalVotes >= 50 },
  { id: 'hundred_votes', name: 'Expert Investigator', icon: '****', description: 'Cast 100 votes',
    condition: () => gameState.totalVotes >= 100 },
  { id: 'thousand_points', name: 'Point Collector', icon: '$', description: 'Earn 1,000 points',
    condition: () => gameState.points >= 1000 },
  { id: 'five_thousand_points', name: 'Point Master', icon: '$$', description: 'Earn 5,000 points',
    condition: () => gameState.points >= 5000 },
  { id: 'zone_explorer', name: 'Zone Explorer', icon: 'Z', description: 'Unlock 3 zones',
    condition: () => gameState.unlockedZones.length >= 3 },
  { id: 'balanced_voter', name: 'Balanced Judge', icon: '=', description: 'Vote YES and NO equally (min 20 votes)',
    condition: () => {
      if (gameState.totalVotes < 20) return false;
      const ratio = gameState.yesVotes / gameState.totalVotes;
      return ratio >= 0.4 && ratio <= 0.6;
    }
  }
];

function checkBadges() {
  let newBadges = [];
  BADGE_DEFINITIONS.forEach(badge => {
    if (!gameState.badges.includes(badge.id) && badge.condition()) {
      gameState.badges.push(badge.id);
      newBadges.push(badge);
    }
  });
  newBadges.forEach(badge => {
    setTimeout(() => showToast(`Badge earned: ${badge.name}`), 500);
  });
}

/* ==================== SHOP ==================== */

function openShop() {
  document.getElementById('shopPoints').textContent = gameState.points;

  // Zone shop
  const zoneShop = document.getElementById('zoneShopItems');
  zoneShop.innerHTML = '';
  zones.forEach((zone, index) => {
    if (index === 0) return;
    const isUnlocked = gameState.unlockedZones.includes(index);
    const canAfford = gameState.points >= zone.unlockPrice;
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item__info">
        <div class="shop-item__name">${isUnlocked ? '' : '(Locked) '}${zone.name}</div>
        <div class="shop-item__desc">${zone.farms.length} farms · ${(zone.avgProb * 100).toFixed(0)}% avg probability</div>
      </div>
      <div>
        ${isUnlocked
          ? '<span class="shop-item__unlocked">Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockZone(${index})">${zone.unlockPrice} pts</button>`}
      </div>`;
    zoneShop.appendChild(item);
  });

  // Theme shop
  const themeShop = document.getElementById('themeShopItems');
  themeShop.innerHTML = '';
  const themes = [
    { id: 'ocean', name: 'Ocean', price: 200, color: '#1976d2' },
    { id: 'sunset', name: 'Sunset', price: 300, color: '#ef6c00' },
    { id: 'midnight', name: 'Midnight', price: 300, color: '#7b1fa2' }
  ];
  themes.forEach(theme => {
    const isUnlocked = gameState.unlockedThemes.includes(theme.id);
    const canAfford = gameState.points >= theme.price;
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item__info">
        <div class="shop-item__name">
          <span class="theme-color" style="display:inline-block;width:14px;height:14px;background:${theme.color};border-radius:3px;vertical-align:middle;margin-right:6px;"></span>
          ${theme.name}
        </div>
        <div class="shop-item__desc">Change marker colors</div>
      </div>
      <div>
        ${isUnlocked
          ? '<span class="shop-item__unlocked">Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockTheme('${theme.id}', ${theme.price})">${theme.price} pts</button>`}
      </div>`;
    themeShop.appendChild(item);
  });

  // Cursor shop
  const cursorShop = document.getElementById('cursorShopItems');
  cursorShop.innerHTML = '';
  const cursors = [
    { id: 'pointer', name: 'Fancy Pointer', price: 150 },
    { id: 'crosshair', name: 'Crosshair', price: 150 },
    { id: 'hand', name: 'Hand Cursor', price: 200 },
    { id: 'sparkle', name: 'Sparkle', price: 250 }
  ];
  cursors.forEach(cursor => {
    const isUnlocked = gameState.unlockedCursors?.includes(cursor.id);
    const canAfford = gameState.points >= cursor.price;
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item__info">
        <div class="shop-item__name">${cursor.name}</div>
        <div class="shop-item__desc">Custom cursor style</div>
      </div>
      <div>
        ${isUnlocked
          ? '<span class="shop-item__unlocked">Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockCursor('${cursor.id}', ${cursor.price})">${cursor.price} pts</button>`}
      </div>`;
    cursorShop.appendChild(item);
  });

  renderFeaturesShop();
  document.getElementById('shopModal').classList.add('active');
}

function renderFeaturesShop() {
  const container = document.getElementById('featureShopItems');
  if (!container) return;
  container.innerHTML = '';

  const historicalUnlocked = gameState.historicalUnlocked || false;
  const historicalPrice = 2000;
  const canAffordHistorical = gameState.points >= historicalPrice;

  const historicalItem = document.createElement('div');
  historicalItem.className = `shop-item ${historicalUnlocked ? 'unlocked' : ''}`;
  historicalItem.innerHTML = `
    <div class="shop-item__info">
      <div class="shop-item__name">${historicalUnlocked ? '' : '(Locked) '}Historical Mode</div>
      <div class="shop-item__desc">View historical satellite imagery from different providers and time periods</div>
    </div>
    <div>
      ${historicalUnlocked
        ? '<span class="shop-item__unlocked">Unlocked</span>'
        : `<button class="btn-buy" ${canAffordHistorical ? '' : 'disabled'} onclick="unlockHistoricalMode()">${historicalPrice} pts</button>`}
    </div>`;
  container.appendChild(historicalItem);

  if (historicalUnlocked) {
    const title = document.createElement('h4');
    title.style.cssText = 'margin:16px 0 10px;font-size:12px;font-weight:700;color:var(--c-text-muted);text-transform:uppercase;letter-spacing:.5px;';
    title.textContent = 'Satellite Providers';
    container.appendChild(title);

    const providerContainer = document.createElement('div');
    providerContainer.id = 'satelliteProviderShopItems';
    container.appendChild(providerContainer);
    renderSatelliteProviderShop();
  }
}

function renderSatelliteProviderShop() {
  const container = document.getElementById('satelliteProviderShopItems');
  if (!container) return;
  container.innerHTML = '';
  if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];

  const providersByType = { satellite_historical: [], satellite: [], terrain: [] };
  Object.keys(SATELLITE_PROVIDERS).forEach(id => {
    const p = SATELLITE_PROVIDERS[id];
    const type = p.providerType || 'satellite';
    if (!providersByType[type]) providersByType[type] = [];
    providersByType[type].push({ id, ...p });
  });

  const renderItem = (providerId, provider) => {
    const isUnlocked = gameState.unlockedSatelliteProviders.includes(providerId);
    const canAfford = gameState.points >= provider.price;
    const setupNote = provider.requiresSetup
      ? '<br><small style="color:var(--c-primary);font-weight:600;">Requires setup</small>' : '';
    const noteText = provider.historicalNote
      ? `<br><small style="color:var(--c-warning);font-style:italic;">Note: ${provider.historicalNote}</small>` : '';

    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item__info">
        <div class="shop-item__name">${isUnlocked ? '' : '(Locked) '}${provider.name}</div>
        <div class="shop-item__desc">${provider.description}<br><small style="color:var(--c-text-muted)">Coverage: ${provider.yearCoverage}</small>${setupNote}${noteText}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${provider.requiresSetup && !isUnlocked ? `<button class="btn-buy" style="background:var(--c-accent);" onclick="showSentinelHubSetup()">Setup</button>` : ''}
        ${isUnlocked
          ? '<span class="shop-item__unlocked">Unlocked</span>'
          : provider.price === 0
            ? `<button class="btn-buy" onclick="unlockSatelliteProvider('${providerId}')">Free</button>`
            : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockSatelliteProvider('${providerId}')">${provider.price} pts</button>`}
      </div>`;
    return item;
  };

  const addSection = (title, providers) => {
    if (!providers.length) return;
    const h = document.createElement('h4');
    h.style.cssText = 'color:var(--c-primary);margin:16px 0 8px;font-size:12px;border-bottom:1px solid var(--c-border);padding-bottom:6px;';
    h.textContent = title;
    container.appendChild(h);
    providers.forEach(p => container.appendChild(renderItem(p.id, p)));
  };

  addSection('Satellite with Historical Data', providersByType.satellite_historical);
  addSection('Satellite (Current Only)', providersByType.satellite);
  addSection('Maps & Terrain (Reference)', providersByType.terrain);
}

function unlockSatelliteProvider(providerId) {
  if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];
  if (gameState.unlockedSatelliteProviders.includes(providerId)) { showToast('Provider already unlocked'); return; }
  const provider = SATELLITE_PROVIDERS[providerId];
  if (!provider) return;
  if (gameState.points < provider.price) { showToast('Not enough points'); return; }

  gameState.points -= provider.price;
  gameState.unlockedSatelliteProviders.push(providerId);
  saveGameState();
  updateUI();
  renderSatelliteProviderShop();
  showToast(`${provider.name} unlocked`);
}

function showSentinelHubSetup() {
  const currentId = gameState.sentinelHubInstanceId || '';
  showModal(`
    <div style="padding:20px;max-width:600px;">
      <h2 style="margin-top:0;">Sentinel Hub Setup (Free)</h2>
      <p style="line-height:1.6;">Get real historical Sentinel-2 imagery at 10m resolution from 2015–present.</p>
      <div style="background:var(--c-surface-alt);padding:15px;border-radius:var(--radius);margin:15px 0;border:1px solid var(--c-border);">
        <h3 style="margin-top:0;color:var(--c-primary);">Setup Steps (5 minutes):</h3>
        <ol style="line-height:1.8;padding-left:20px;">
          <li>Go to <a href="https://www.sentinel-hub.com/" target="_blank" style="color:var(--c-primary);font-weight:600;">sentinel-hub.com</a></li>
          <li>Sign Up → Choose <strong>Trial</strong> (free)</li>
          <li>Verify your email</li>
          <li>Go to Dashboard → Configuration Utility</li>
          <li>Create new configuration → Select Sentinel-2 L2A</li>
          <li>Copy your <strong>Instance ID</strong></li>
          <li>Paste it below and save</li>
        </ol>
      </div>
      <div style="background:var(--c-surface-alt);padding:15px;border-radius:var(--radius);margin:15px 0;border:1px solid var(--c-border);">
        <h4 style="margin-top:0;">Free Tier Limits:</h4>
        <ul style="line-height:1.6;">
          <li>1,000 requests/month</li>
          <li>No credit card required</li>
          <li>Full resolution 10m imagery</li>
          <li>Complete archive from 2015–present</li>
        </ul>
      </div>
      <label style="display:block;margin:20px 0 8px;font-weight:600;">Your Instance ID:</label>
      <input type="text" id="sentinelHubInstanceInput" placeholder="abc123-def4-5678-90gh-ijklmnopqrst" value="${currentId}"
        style="width:100%;padding:10px;border:1px solid var(--c-border);border-radius:var(--radius);font-family:var(--font-mono);font-size:14px;">
      <div style="margin-top:20px;display:flex;gap:10px;">
        <button onclick="saveSentinelHubConfig()" class="btn-primary" style="flex:1;">Save &amp; Unlock</button>
        <button onclick="closeModal('dynamicModal')" class="btn-secondary" style="width:auto;margin:0;">Cancel</button>
      </div>
    </div>`);
}

function saveSentinelHubConfig() {
  const input = document.getElementById('sentinelHubInstanceInput');
  const instanceId = input?.value?.trim();
  if (!instanceId) { showToast('Please enter your Instance ID'); return; }
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuidPattern.test(instanceId)) { showToast('Invalid Instance ID format'); return; }

  gameState.sentinelHubInstanceId = instanceId;
  if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];
  if (!gameState.unlockedSatelliteProviders.includes('sentinel_hub')) {
    gameState.unlockedSatelliteProviders.push('sentinel_hub');
  }
  saveGameState();
  updateUI();
  renderSatelliteProviderShop();
  closeModal('dynamicModal');
  showToast('Sentinel Hub configured');
}

function unlockHistoricalMode() {
  if (gameState.historicalUnlocked) { showToast('Historical Mode already unlocked'); return; }
  const price = GAME_CONSTANTS.HISTORICAL_MODE_PRICE;
  if (gameState.points < price) { showToast('Not enough points'); return; }
  gameState.points -= price;
  gameState.historicalUnlocked = true;
  gameState.unlockedHistoricalYears = [2024];
  saveGameState();
  updateUI();
  renderFeaturesShop();
  showToast('Historical Mode unlocked');
}

function unlockZone(zoneIndex) {
  const zone = zones[zoneIndex];
  if (gameState.unlockedZones.includes(zoneIndex)) { showToast('Zone already unlocked'); return; }
  if (gameState.points < zone.unlockPrice) { showToast('Not enough points'); return; }
  gameState.points -= zone.unlockPrice;
  gameState.unlockedZones.push(zoneIndex);
  saveGameState();
  updateUI();
  openShop();
  showZoneMarkers();
  showToast(`${zone.name} unlocked`);
}

function unlockTheme(themeId, price) {
  if (gameState.unlockedThemes.includes(themeId)) { showToast('Theme already unlocked'); return; }
  if (gameState.points < price) { showToast('Not enough points'); return; }
  gameState.points -= price;
  gameState.unlockedThemes.push(themeId);
  saveGameState();
  updateUI();
  openShop();
  showToast('Theme unlocked — select it in the menu');
}

function unlockCursor(cursorId, price) {
  if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
  if (gameState.unlockedCursors.includes(cursorId)) { showToast('Cursor already unlocked'); return; }
  if (gameState.points < price) { showToast('Not enough points'); return; }
  gameState.points -= price;
  gameState.unlockedCursors.push(cursorId);
  saveGameState();
  updateUI();
  openShop();
  renderCursorOptions();
  showToast('Cursor unlocked — select it in the menu');
}

/* ==================== BADGES DISPLAY ==================== */

function openBadges() {
  const badgesList = document.getElementById('badgesList');
  badgesList.innerHTML = '';
  BADGE_DEFINITIONS.forEach(badge => {
    const isEarned = gameState.badges.includes(badge.id);
    const item = document.createElement('div');
    item.className = `badge-item ${isEarned ? 'earned' : 'locked'}`;
    item.innerHTML = `
      <div class="badge-icon">${isEarned ? badge.icon : '?'}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.description}</div>`;
    badgesList.appendChild(item);
  });
  document.getElementById('badgesModal').classList.add('active');
}

function shareBadges() {
  const earnedBadges = BADGE_DEFINITIONS.filter(b => gameState.badges.includes(b.id));
  const badgeText = earnedBadges.map(b => `${b.name}`).join('\n');
  const shareText = `Zone Quest Achievements\n\n${badgeText}\n\n${gameState.totalVotes} votes · ${gameState.points} points`;
  navigator.clipboard.writeText(shareText).then(() => {
    showToast('Badges copied to clipboard');
  }).catch(() => alert(shareText));
}

/* ==================== LEADERBOARD ==================== */

function openLeaderboard() {
  generateLeaderboard('all');
  document.getElementById('leaderboardModal').classList.add('active');
}

function generateLeaderboard(period) {
  const leaderboard = [
    { name: 'FarmHunter2024', points: 8750 },
    { name: 'SatelliteExpert', points: 7200 },
    { name: 'GreenDetective', points: 6800 },
    { name: 'MapMaster', points: 5900 },
    { name: 'AgriScout', points: 5400 },
    { name: 'EcoWarrior', points: 4800 },
    { name: 'FieldAnalyst', points: 4200 },
    { name: 'ZoneExplorer', points: 3900 },
    { name: 'FarmFinder', points: 3500 },
    { name: 'DataCollector', points: 3100 }
  ];

  const userEntry = { name: 'You', points: gameState.points, isYou: true };
  leaderboard.push(userEntry);
  leaderboard.sort((a, b) => b.points - a.points);
  const userRank = leaderboard.findIndex(e => e.isYou) + 1;

  const list = document.getElementById('leaderboardList');
  list.innerHTML = '';
  leaderboard.slice(0, 15).forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${entry.isYou ? 'you' : ''}`;
    let rankClass = '';
    if (index === 0) rankClass = 'top1';
    else if (index === 1) rankClass = 'top2';
    else if (index === 2) rankClass = 'top3';
    item.innerHTML = `
      <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
      <div class="leaderboard-name">${entry.name}</div>
      <div class="leaderboard-points">${entry.points}</div>`;
    list.appendChild(item);
  });

  document.getElementById('yourRank').textContent = `#${userRank}`;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
}

/* ==================== STATS ==================== */

function openStats() {
  document.getElementById('statsVotes').textContent = gameState.totalVotes;
  document.getElementById('statsPoints').textContent = gameState.points;
  document.getElementById('statsZones').textContent = gameState.unlockedZones.length;
  document.getElementById('statsBadges').textContent = gameState.badges.length;
  document.getElementById('statsYes').textContent = gameState.yesVotes;
  document.getElementById('statsNo').textContent = gameState.noVotes;
  document.getElementById('statsModal').classList.add('active');
}

function openPowerUps() {
  document.getElementById('powerUpPoints').textContent = gameState.points;
  document.getElementById('powerUpsModal').classList.add('active');
}

function openMysteryBoxModal() {
  document.getElementById('modalBoxCount').textContent = gameState.mysteryBoxes || 0;
  const openBtn = document.getElementById('openBoxBtn');
  openBtn.disabled = (gameState.mysteryBoxes || 0) === 0;
  document.getElementById('mysteryBoxModal').classList.add('active');
}

/* ==================== POWER-UPS ==================== */

function activatePowerUp(powerUpId) {
  const defs = [
    { id: 'double_points', name: '2x Points', price: GAME_CONSTANTS.DOUBLE_POINTS_PRICE, duration: GAME_CONSTANTS.DOUBLE_POINTS_DURATION },
    { id: 'triple_points', name: '3x Points', price: GAME_CONSTANTS.TRIPLE_POINTS_PRICE, duration: GAME_CONSTANTS.TRIPLE_POINTS_DURATION },
    { id: 'mystery_reveal', name: 'Mystery Box', price: GAME_CONSTANTS.MYSTERY_BOX_PRICE, duration: 0 }
  ];
  const powerUp = defs.find(p => p.id === powerUpId);
  if (!powerUp) return;
  if (gameState.points < powerUp.price) { showToast('Not enough points'); return; }

  gameState.points -= powerUp.price;
  if (powerUpId === 'mystery_reveal') {
    gameState.mysteryBoxes++;
    showToast('Mystery box added');
  } else {
    gameState.activePowerUp = { type: powerUpId, expiresAt: Date.now() + powerUp.duration };
    const minutes = Math.floor(powerUp.duration / 60000);
    showToast(`${powerUp.name} active for ${minutes} minutes`);
    updateActivePowerUpDisplay();
  }
  saveGameState();
  updateUI();
  closeModal('powerUpsModal');
}

function updateActivePowerUpDisplay() {
  const container = document.getElementById('activePowerUp');
  if (!container) return;

  if (gameState.activePowerUp && gameState.activePowerUp.expiresAt > Date.now()) {
    const nameMap = { 'double_points': '2x Points', 'triple_points': '3x Points' };
    const name = nameMap[gameState.activePowerUp.type];
    if (!name) { container.style.display = 'none'; return; }
    const remaining = Math.ceil((gameState.activePowerUp.expiresAt - Date.now()) / 1000);
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    container.textContent = `${name}: ${min}:${sec.toString().padStart(2, '0')}`;
    container.style.display = 'block';
    setTimeout(updateActivePowerUpDisplay, 1000);
  } else {
    container.style.display = 'none';
    if (gameState.activePowerUp) { gameState.activePowerUp = null; saveGameState(); }
  }
}

function openMysteryBox() {
  if (gameState.mysteryBoxes <= 0) { showToast('No mystery boxes available'); return; }
  gameState.mysteryBoxes--;

  const rewards = [
    { type: 'points', value: 500, text: '500 Points', weight: 30 },
    { type: 'points', value: 1000, text: '1000 Points', weight: 20 },
    { type: 'points', value: 2000, text: '2000 Points', weight: 10 },
    { type: 'avatar', text: 'New Avatar', weight: 15 },
    { type: 'theme', text: 'Free Theme', weight: 15 },
    { type: 'cursor', text: 'New Cursor', weight: 10 }
  ];

  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  let reward = rewards[0];
  for (const r of rewards) { random -= r.weight; if (random <= 0) { reward = r; break; } }

  if (reward.type === 'points') {
    gameState.points += reward.value;
  } else if (reward.type === 'avatar') {
    const avatars = ['detective', 'scientist', 'explorer', 'robot', 'astronaut'];
    if (!gameState.unlockedAvatars) gameState.unlockedAvatars = ['farmer'];
    const locked = avatars.filter(a => !gameState.unlockedAvatars.includes(a));
    if (locked.length > 0) {
      gameState.unlockedAvatars.push(locked[Math.floor(Math.random() * locked.length)]);
      renderAvatarOptions();
    } else { gameState.points += 1000; reward.text = '1000 Points (all avatars unlocked)'; }
  } else if (reward.type === 'theme') {
    const themes = ['ocean', 'sunset', 'midnight'];
    const locked = themes.filter(t => !gameState.unlockedThemes.includes(t));
    if (locked.length > 0) {
      gameState.unlockedThemes.push(locked[Math.floor(Math.random() * locked.length)]);
      renderThemeOptions();
    } else { gameState.points += 500; reward.text = '500 Points (all themes unlocked)'; }
  } else if (reward.type === 'cursor') {
    const cursors = ['pointer', 'crosshair', 'hand', 'sparkle'];
    if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
    const locked = cursors.filter(c => !gameState.unlockedCursors.includes(c));
    if (locked.length > 0) {
      gameState.unlockedCursors.push(locked[Math.floor(Math.random() * locked.length)]);
      renderCursorOptions();
    } else { gameState.points += 500; reward.text = '500 Points (all cursors unlocked)'; }
  }

  saveGameState();
  updateUI();
  showToast(`Reward: ${reward.text}`);
  closeModal('mysteryBoxModal');
}

/* ==================== HISTORICAL IMAGERY ==================== */

let historicalLayer = null;
let isHistoricalMode = false;

function toggleHistoricalMode() {
  if (!gameState.historicalUnlocked) {
    const btn = document.getElementById('historicalToggle');
    if (!isSimpleGoogleMode) {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(googleLayer)) map.addLayer(googleLayer);
      isSimpleGoogleMode = true;
      btn.textContent = 'Switch to Esri';
      btn.classList.add('active');
      showToast('Switched to Google Satellite');
    } else {
      if (map.hasLayer(googleLayer)) map.removeLayer(googleLayer);
      if (!map.hasLayer(satellite)) map.addLayer(satellite);
      isSimpleGoogleMode = false;
      btn.textContent = 'Switch to Google';
      btn.classList.remove('active');
      showToast('Switched back to Esri');
    }
    return;
  }

  isHistoricalMode = !isHistoricalMode;
  const btn = document.getElementById('historicalToggle');
  const slider = document.getElementById('historicalSlider');

  if (isHistoricalMode) {
    btn.classList.add('active');
    btn.textContent = 'Exit Historical Mode';
    slider.style.display = 'block';
    initializeProviderTimeline();
    updateHistoricalLayer(2024);
    showToast('Historical Mode activated');
  } else {
    btn.classList.remove('active');
    btn.textContent = 'Historical Mode';
    slider.style.display = 'none';
    if (historicalLayer) { map.removeLayer(historicalLayer); historicalLayer = null; }
    showToast('Returned to current satellite view');
  }
}

/* ==================== SATELLITE PROVIDERS ==================== */

const SATELLITE_PROVIDERS = {
  esri: {
    name: 'Esri WorldImagery',
    description: 'High-resolution satellite imagery with visual time simulation',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri', price: 0,
    yearCoverage: '2000–2024*', maxZoom: 19,
    providerType: 'satellite_historical', hasSatelliteImagery: true,
    hasHistoricalData: true, historicalDataType: 'simulated'
  },
  google: {
    name: 'Google Satellite',
    description: "Google's satellite imagery with frequent updates",
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google', price: 500,
    yearCoverage: '2010–2024', maxZoom: 20,
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  },
  bing_2014: {
    name: 'Bing 2010–2014 Archive',
    description: 'Free historical satellite from Bing. Real imagery from the 2010–2014 era.',
    url: 'https://t.ssl.ak.tiles.virtualearth.net/tiles/a{q}.jpeg?g=854&mkt=en-US&n=z',
    attribution: '© Microsoft', price: 0,
    yearCoverage: '2010–2014 (Real)', maxZoom: 19,
    providerType: 'satellite_historical', hasSatelliteImagery: true,
    hasHistoricalData: true, historicalDataType: 'static_old',
    isQuadKey: true, historicalNote: 'Real historical imagery from 2010–2014 era — static archive'
  },
  carto_light: {
    name: 'CARTO Light', description: 'Clean, minimal street map',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© CARTO', price: 300,
    yearCoverage: '2015–2024', maxZoom: 19,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  carto_dark: {
    name: 'CARTO Dark', description: 'Dark mode street map',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© CARTO', price: 300,
    yearCoverage: '2015–2024', maxZoom: 19,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  osm: {
    name: 'OpenStreetMap', description: 'Street map view for reference',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors', price: 200,
    yearCoverage: '2005–2024', maxZoom: 19,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  stamen_terrain: {
    name: 'Stamen Terrain', description: 'Terrain and elevation visualization',
    url: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: '© Stamen Design', price: 250,
    yearCoverage: '2010–2024', maxZoom: 18,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  stamen_toner: {
    name: 'Stamen Toner', description: 'High-contrast black and white map',
    url: 'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    attribution: '© Stamen Design', price: 250,
    yearCoverage: '2010–2024', maxZoom: 18,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  stamen_watercolor: {
    name: 'Stamen Watercolor', description: 'Artistic watercolor-style map',
    url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
    attribution: '© Stamen Design', price: 400,
    yearCoverage: '2012–2024', maxZoom: 16,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  opentopomap: {
    name: 'OpenTopoMap', description: 'Topographic map based on OSM data',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap', price: 350,
    yearCoverage: '2010–2024', maxZoom: 17,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  usgs: {
    name: 'USGS Imagery', description: 'US Geological Survey satellite imagery',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: '© USGS', price: 600,
    yearCoverage: '2005–2024', maxZoom: 16,
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  },
  usgs_topo: {
    name: 'USGS Historical Topos', description: 'Genuine historical topographic maps from 1880s–2000s',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: '© USGS', price: 800,
    yearCoverage: '1880–2024 (Real)', maxZoom: 16,
    providerType: 'terrain', hasSatelliteImagery: false,
    hasHistoricalData: true, historicalDataType: 'real'
  },
  thunderforest_landscape: {
    name: 'Thunderforest Landscape', description: 'Detailed landscape and terrain visualization',
    url: 'https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=',
    attribution: '© Thunderforest', price: 450,
    yearCoverage: '2012–2024', maxZoom: 18,
    requiresApiKey: true, providerType: 'terrain',
    hasSatelliteImagery: false, hasHistoricalData: false
  },
  arcgis_world_street: {
    name: 'ArcGIS World Street', description: 'Detailed street map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri', price: 350,
    yearCoverage: '2000–2024', maxZoom: 19,
    providerType: 'terrain', hasSatelliteImagery: false, hasHistoricalData: false
  },
  sentinel2: {
    name: 'Sentinel-2 (ESA)', description: 'European satellite with 10m resolution',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© ESA/Copernicus', price: 650,
    yearCoverage: '2015–2024', maxZoom: 18,
    historicalNote: 'Current simulation — for real historical Sentinel-2, use Sentinel Hub',
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  },
  sentinel2_cloudless: {
    name: 'Sentinel-2 Cloudless (EOx)',
    description: 'Free 10m resolution cloudless mosaic — excellent for farm identification',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: '© EOx', price: 0,
    yearCoverage: '2022 (Cloudless composite)', maxZoom: 15,
    historicalNote: 'Single year composite — for timelapse use Sentinel Hub API',
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  },
  sentinel_hub: {
    name: 'Sentinel Hub (Real Historical)',
    description: 'Best option: free 10m resolution Sentinel-2 with real historical data from 2015–present. Requires free signup.',
    url: 'SENTINEL_HUB', attribution: '© Sentinel Hub / ESA Copernicus', price: 0,
    yearCoverage: '2015–2024 (Real)', maxZoom: 16,
    hasRealHistorical: true, requiresDate: true, requiresSetup: true,
    providerType: 'satellite_historical', hasSatelliteImagery: true,
    hasHistoricalData: true, historicalDataType: 'real'
  },
  planet_skysat: {
    name: 'Planet SkySat', description: 'Commercial high-resolution with daily global coverage',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Planet Labs', price: 900,
    yearCoverage: '2016–2024', maxZoom: 19,
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  },
  landsat: {
    name: 'Landsat (NASA/USGS)', description: 'Long-running Earth observation program with 30m resolution',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: '© NASA/USGS', price: 550,
    yearCoverage: '1984–2024 (Real)', maxZoom: 17,
    hasRealHistorical: true, historicalNote: 'Visual simulation — true historical requires Google Earth Engine',
    providerType: 'satellite_historical', hasSatelliteImagery: true,
    hasHistoricalData: true, historicalDataType: 'simulated'
  },
  modis: {
    name: 'MODIS (NASA Terra)',
    description: 'NASA satellite with daily global coverage and true historical data via NASA GIBS. Low resolution (250m–1km).',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    attribution: '© NASA EOSDIS', price: 600,
    yearCoverage: '2000–2024 (Real)', maxZoom: 9,
    hasRealHistorical: true, requiresDate: true,
    historicalNote: 'Max zoom too low for farm-level detail',
    providerType: 'satellite_historical', hasSatelliteImagery: true,
    hasHistoricalData: true, historicalDataType: 'real'
  },
  maxar_worldview: {
    name: 'Maxar WorldView', description: 'Ultra high-resolution commercial imagery with 0.31m resolution',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Maxar', price: 1200,
    yearCoverage: '2014–2024', maxZoom: 20,
    providerType: 'satellite', hasSatelliteImagery: true, hasHistoricalData: false
  }
};

/* ==================== TILE HELPERS ==================== */

function createSentinelHubTileUrl(instanceId, date) {
  window._sentinelHubConfig = { instanceId, date };
  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`;
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', LAYERS: 'TRUE-COLOR',
    MAXCC: '20', WIDTH: '512', HEIGHT: '512',
    FORMAT: 'image/jpeg', TIME: `${date}/${date}`, CRS: 'EPSG:3857'
  });
  return `${baseUrl}?${params.toString()}&BBOX={bbox}`;
}

function tileToBbox(x, y, z) {
  const earthCircumference = 40075016.686;
  const tileCount = Math.pow(2, z);
  const tileMeters = earthCircumference / tileCount;
  const minx = (x * tileMeters) - (earthCircumference / 2);
  const maxx = ((x + 1) * tileMeters) - (earthCircumference / 2);
  const miny = (earthCircumference / 2) - ((y + 1) * tileMeters);
  const maxy = (earthCircumference / 2) - (y * tileMeters);
  return `${minx},${miny},${maxx},${maxy}`;
}

function tileToQuadKey(x, y, z) {
  let quadKey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit++;
    if ((y & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }
  return quadKey;
}

function updateHistoricalLayer(year) {
  if (!gameState.historicalUnlocked) return;
  gameState.currentHistoricalYear = year;

  const providerId = gameState.currentSatelliteProvider || 'esri';
  const provider = SATELLITE_PROVIDERS[providerId];
  if (!provider) return;

  let tileUrl = provider.url;
  let simulationNote = '';

  if (provider.historicalDataType === 'static_old') {
    simulationNote = ` (${provider.yearCoverage})`;
  } else if (providerId === 'sentinel_hub') {
    const instanceId = gameState.sentinelHubInstanceId;
    if (!instanceId) { showToast('Please configure Sentinel Hub first'); return; }
    const dateStr = `${year}-07-01`;
    tileUrl = createSentinelHubTileUrl(instanceId, dateStr);
    simulationNote = ` (${dateStr})`;
  } else if (provider.requiresDate && provider.hasRealHistorical) {
    const dateStr = `${year}-07-01`;
    tileUrl = provider.url.replace('{date}', dateStr);
    simulationNote = ` (${dateStr})`;
  } else {
    simulationNote = provider.hasSatelliteImagery ? '' : ' (Map view)';
  }

  const oldLayer = historicalLayer;
  const timestamp = Date.now();
  let newLayer;

  const tileOptions = {
    attribution: `${provider.attribution} - ${year}${simulationNote}`,
    maxZoom: provider.maxZoom,
    className: `historical-tiles-${timestamp}`,
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  };

  if (providerId === 'sentinel_hub') {
    newLayer = L.tileLayer(tileUrl, tileOptions);
    newLayer.getTileUrl = function(coords) {
      const bbox = tileToBbox(coords.x, coords.y, coords.z);
      return tileUrl.replace('{bbox}', bbox);
    };
  } else if (provider.isQuadKey) {
    newLayer = L.tileLayer(tileUrl, tileOptions);
    newLayer.getTileUrl = function(coords) {
      return tileUrl.replace('{q}', tileToQuadKey(coords.x, coords.y, coords.z));
    };
  } else {
    newLayer = L.tileLayer(tileUrl, tileOptions);
  }

  historicalLayer = newLayer;
  map.addLayer(newLayer);

  if (oldLayer) {
    setTimeout(() => { try { map.removeLayer(oldLayer); } catch (e) {} }, 500);
  }

  updateProviderDisplay(provider);
  saveGameState();
}

function toggleProviderMenu() {
  const menu = document.getElementById('providerMenu');
  if (!menu) return;

  if (menu.style.display === 'none' || !menu.style.display) {
    menu.innerHTML = '';
    if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];

    const terrainProviders = gameState.unlockedSatelliteProviders
      .filter(id => { const p = SATELLITE_PROVIDERS[id]; return p && !p.hasSatelliteImagery; })
      .map(id => ({ id, ...SATELLITE_PROVIDERS[id] }));

    if (terrainProviders.length === 0) {
      const notice = document.createElement('div');
      notice.style.cssText = 'padding:15px;text-align:center;color:var(--c-text-muted);font-size:12px;';
      notice.textContent = 'No terrain/map providers unlocked yet.';
      menu.appendChild(notice);
    } else {
      terrainProviders.forEach(p => {
        const option = document.createElement('div');
        option.className = `provider-option ${gameState.currentSatelliteProvider === p.id ? 'active' : ''}`;
        option.innerHTML = `
          <div class="provider-name">${p.name}</div>
          <div class="provider-coverage">Coverage: ${p.yearCoverage}</div>`;
        option.onclick = () => switchSatelliteProvider(p.id);
        menu.appendChild(option);
      });
    }
    menu.style.display = 'block';
  } else {
    menu.style.display = 'none';
  }
}

function updateProviderDisplay(provider) {
  const display = document.getElementById('currentProviderDisplay');
  if (display && provider) display.textContent = provider.name;
}

function switchSatelliteProvider(providerId) {
  const provider = SATELLITE_PROVIDERS[providerId];
  if (!provider) return;
  if (!gameState.unlockedSatelliteProviders.includes(providerId)) {
    showToast('Provider locked — unlock in shop');
    return;
  }

  gameState.currentSatelliteProvider = providerId;
  updateProviderDisplay(provider);

  const historicalNote = document.getElementById('historicalNote');
  if (!provider.hasSatelliteImagery) {
    if (historicalNote) { historicalNote.textContent = 'This is a map/terrain view. Move the slider to switch to satellite imagery.'; }
    showToast(`Switched to ${provider.name} (map view)`);
  } else {
    if (isHistoricalMode) initializeProviderTimeline();
    if (historicalNote) { historicalNote.textContent = 'Slide to explore different satellite providers'; }
    showToast(`Switched to ${provider.name}`);
  }

  updateHistoricalLayer(2024);
  const menu = document.getElementById('providerMenu');
  if (menu) menu.style.display = 'none';
  saveGameState();
}

/* ==================== PROVIDER TIMELINE ==================== */

const PROVIDER_TIMELINE = [
  { id: 'esri', era: '2024', label: 'Esri', group: 'modern' },
  { id: 'google', era: '2024', label: 'Google', group: 'modern' },
  { id: 'sentinel2_cloudless', era: '2022', label: 'S2 Cloudless', group: 'modern' },
  { id: 'sentinel2', era: '2024', label: 'Sentinel-2', group: 'modern' },
  { id: 'usgs', era: '2024', label: 'USGS', group: 'modern' },
  { id: 'maxar_worldview', era: '2024', label: 'Maxar', group: 'modern' },
  { id: 'planet_skysat', era: '2024', label: 'Planet', group: 'modern' },
  { id: 'bing_2014', era: '2010–2014', label: 'Bing Archive', group: 'historical' },
  { id: 'sentinel_hub', era: '2015+', label: 'Sentinel Hub', group: 'historical' },
  { id: 'landsat', era: '1984+', label: 'Landsat', group: 'historical' },
  { id: 'modis', era: '2000+', label: 'MODIS', group: 'historical' }
];

function initializeProviderTimeline() {
  const slider = document.getElementById('providerSlider');
  const markersContainer = document.getElementById('providerMarkers');
  if (!slider || !markersContainer) return;

  const unlockedProviders = PROVIDER_TIMELINE.filter(p => {
    const provider = SATELLITE_PROVIDERS[p.id];
    return provider && provider.hasSatelliteImagery && gameState.unlockedSatelliteProviders.includes(p.id);
  });
  if (unlockedProviders.length === 0) return;

  slider.max = unlockedProviders.length - 1;
  const currentProviderId = gameState.currentSatelliteProvider || 'esri';
  const currentIndex = unlockedProviders.findIndex(p => p.id === currentProviderId);
  slider.value = currentIndex >= 0 ? currentIndex : 0;

  markersContainer.innerHTML = '';

  const modernCount = unlockedProviders.filter(p => p.group === 'modern').length;
  if (modernCount > 0) {
    const bg = document.createElement('div');
    bg.className = 'modern-section-background';
    bg.style.width = `${(modernCount / unlockedProviders.length) * 100}%`;
    markersContainer.appendChild(bg);
    const label = document.createElement('div');
    label.className = 'modern-section-label';
    label.textContent = 'MODERN';
    label.style.width = `${(modernCount / unlockedProviders.length) * 100}%`;
    markersContainer.style.position = 'relative';
    markersContainer.appendChild(label);
  }

  unlockedProviders.forEach((tp, index) => {
    const marker = document.createElement('div');
    marker.className = `provider-marker ${index === parseInt(slider.value) ? 'active' : ''}`;
    marker.innerHTML = `
      <div class="provider-marker-name">${tp.label}</div>
      <div class="provider-marker-era">${tp.era}</div>`;
    markersContainer.appendChild(marker);
  });

  window._unlockedProviderTimeline = unlockedProviders;
}

function handleProviderSlide(value) {
  const index = parseInt(value);
  const timeline = window._unlockedProviderTimeline;
  if (!timeline || index < 0 || index >= timeline.length) return;

  const selectedProvider = timeline[index];
  const provider = SATELLITE_PROVIDERS[selectedProvider.id];
  if (!provider) return;

  document.querySelectorAll('.provider-marker').forEach((m, idx) => {
    m.classList.toggle('active', idx === index);
  });

  gameState.currentSatelliteProvider = selectedProvider.id;
  updateProviderDisplay(provider);
  updateHistoricalLayer(2024);
  saveGameState();
  showToast(`${provider.name} — ${selectedProvider.era}`);
}

/* ==================== THEMES & CUSTOMIZATION ==================== */

function renderCursorOptions() {
  const container = document.getElementById('cursorOptions');
  if (!container) return;
  container.innerHTML = '';
  if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
  if (!gameState.currentCursor) gameState.currentCursor = 'default';

  const cursors = [
    { id: 'default', name: 'Default' },
    { id: 'pointer', name: 'Pointer' },
    { id: 'crosshair', name: 'Crosshair' },
    { id: 'hand', name: 'Hand' },
    { id: 'sparkle', name: 'Sparkle' }
  ];

  cursors.forEach(cursor => {
    const isUnlocked = cursor.id === 'default' || gameState.unlockedCursors.includes(cursor.id);
    if (!isUnlocked) return;
    const isActive = gameState.currentCursor === cursor.id;
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `<div class="theme-name">${cursor.name}</div>`;
    option.onclick = () => {
      gameState.currentCursor = cursor.id;
      saveGameState();
      applyCursor(cursor.id);
      renderCursorOptions();
    };
    container.appendChild(option);
  });
}

function renderAvatarOptions() {
  const container = document.getElementById('avatarOptions');
  if (!container) return;
  container.innerHTML = '';
  if (!gameState.unlockedAvatars) gameState.unlockedAvatars = ['farmer'];
  if (!gameState.currentAvatar) gameState.currentAvatar = 'farmer';

  const avatars = [
    { id: 'farmer', name: 'Farmer' },
    { id: 'detective', name: 'Detective' },
    { id: 'scientist', name: 'Scientist' },
    { id: 'explorer', name: 'Explorer' },
    { id: 'robot', name: 'Robot' },
    { id: 'astronaut', name: 'Astronaut' }
  ];

  avatars.forEach(avatar => {
    if (!gameState.unlockedAvatars.includes(avatar.id)) return;
    const isActive = gameState.currentAvatar === avatar.id;
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `<div class="theme-name">${avatar.name}</div>`;
    option.onclick = () => {
      gameState.currentAvatar = avatar.id;
      saveGameState();
      renderAvatarOptions();
      showToast(`Avatar changed to ${avatar.name}`);
    };
    container.appendChild(option);
  });
}

function applyCursor(cursorId) {
  const cursorMap = { 'default': 'default', 'pointer': 'pointer', 'crosshair': 'crosshair', 'hand': 'grab', 'sparkle': 'pointer' };
  document.body.style.cursor = cursorMap[cursorId] || 'default';
}

function renderThemeOptions() {
  const container = document.getElementById('themeOptions');
  container.innerHTML = '';

  const themes = [
    { id: 'default', name: 'Default', color: '#2d6a4f' },
    { id: 'dark', name: 'Dark', color: '#1a237e' },
    { id: 'ocean', name: 'Ocean', color: '#1976d2' },
    { id: 'sunset', name: 'Sunset', color: '#ef6c00' },
    { id: 'midnight', name: 'Midnight', color: '#7b1fa2' }
  ];

  themes.forEach(theme => {
    const isUnlocked = theme.id === 'default' || theme.id === 'dark' || gameState.unlockedThemes.includes(theme.id);
    if (!isUnlocked) return;
    const isActive = gameState.currentTheme === theme.id;
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `
      <div class="theme-color" style="background:${theme.color};"></div>
      <div class="theme-name">${theme.name}</div>`;
    option.onclick = () => {
      gameState.currentTheme = theme.id;
      saveGameState();
      applyTheme(theme);
      renderThemeOptions();
    };
    container.appendChild(option);
  });
}

function applyTheme(theme) {
  document.documentElement.style.setProperty('--c-primary', theme.color);
  if (theme.id === 'dark') document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
  showToast(`Theme: ${theme.name}`);
}

/* ==================== UI UPDATES ==================== */

function updateUI() {
  document.getElementById('userPoints').textContent = gameState.points;
  document.getElementById('totalVotes').textContent = gameState.totalVotes;
  document.getElementById('zonesUnlocked').textContent = gameState.unlockedZones.length;
  document.getElementById('badgesEarned').textContent = gameState.badges.length;

  const titleDisplay = document.getElementById('userTitle');
  if (titleDisplay) titleDisplay.textContent = getCurrentTitle();

  const boxCount = document.getElementById('mysteryBoxCount');
  if (boxCount) boxCount.textContent = gameState.mysteryBoxes || 0;

  syncHistoricalToggleBtn();

  if (typeof updateActivePowerUpDisplay === 'function') updateActivePowerUpDisplay();
}

function syncHistoricalToggleBtn() {
  const btn = document.getElementById('historicalToggle');
  if (!btn) return;
  if (gameState.historicalUnlocked) {
    if (isSimpleGoogleMode) {
      if (map.hasLayer(googleLayer)) map.removeLayer(googleLayer);
      if (!map.hasLayer(satellite)) map.addLayer(satellite);
      isSimpleGoogleMode = false;
    }
    btn.classList.toggle('active', isHistoricalMode);
    btn.textContent = isHistoricalMode ? 'Exit Historical Mode' : 'Historical Mode';
  } else {
    btn.classList.toggle('active', isSimpleGoogleMode);
    btn.textContent = isSimpleGoogleMode ? 'Switch to Esri' : 'Switch to Google';
  }
}

/* ==================== MODAL HELPERS ==================== */

function showModal(htmlContent) {
  let modal = document.getElementById('dynamicModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dynamicModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-height:90vh;overflow-y:auto;">
        <button class="btn-close" onclick="closeModal('dynamicModal')" style="position:absolute;top:10px;right:10px;">&times;</button>
        <div id="dynamicModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('dynamicModalBody').innerHTML = htmlContent;
  modal.classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

/* ==================== EXPORT & RESET ==================== */

function exportVotes() {
  const votedFarmIds = Object.keys(gameState.votes);
  if (votedFarmIds.length === 0) { showToast('No votes to export yet'); return; }

  const exportData = votedFarmIds.map(farmId => {
    const farm = allFarms.find(f => String(f.id) === String(farmId));
    const voteEntry = gameState.votes[farmId];
    return {
      farmId, latitude: farm ? farm.lat : null, longitude: farm ? farm.lng : null,
      originalProbability: farm ? parseFloat((farm.probability * 100).toFixed(2)) : null,
      yesVote: voteEntry.vote === 'yes', noVote: voteEntry.vote === 'no'
    };
  });

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zone-quest-votes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${exportData.length} votes`);
}

function resetAllData() {
  if (!confirm('Reset all votes, points, and progress? This cannot be undone.')) return;
  localStorage.removeItem('zoneQuestGameState');
  location.reload();
}

/* ==================== PROBABILITY BROWSE ==================== */

let probSortedFarms = [];
let probBrowseIndex = 0;
let isProbBrowseMode = false;

function enterProbBrowseMode() {
  if (allFarms.length === 0) { showToast('Farm data not loaded yet'); return; }

  probSortedFarms = [...allFarms].sort((a, b) => b.probability - a.probability);
  probBrowseIndex = 0;
  isProbBrowseMode = true;

  document.getElementById('sideMenu').classList.remove('active');
  document.getElementById('farmPanel').classList.remove('active');
  const zonePanel = document.getElementById('zonePanel');
  zonePanel.classList.remove('active');
  zonePanel.classList.add('hidden');
  currentFarm = null;

  farmMarkers.forEach(m => map.removeLayer(m));
  farmMarkers = [];
  zoneMarkers.forEach(m => map.removeLayer(m));
  zoneMarkers = [];

  document.getElementById('probBrowsePanel').style.display = 'flex';
  _probBrowseGoto(0);
}

function exitProbBrowseMode() {
  isProbBrowseMode = false;
  document.getElementById('probBrowsePanel').style.display = 'none';
  document.getElementById('farmPanel').classList.remove('active');
  currentFarm = null;

  if (currentZone) {
    map.setView([currentZone.centerLat, currentZone.centerLng], GAME_CONSTANTS.ZONE_VIEW_ZOOM, { animate: true, duration: 0.8 });
    showFarmMarkers(currentZone);
  } else {
    map.setView([16, 106], 6, { animate: true, duration: 0.8 });
    showZoneMarkers();
  }
}

function _probBrowseGoto(index) {
  const farm = probSortedFarms[index];
  if (!farm) return;
  currentFarm = farm;

  document.getElementById('probBrowseCounter').textContent = `${index + 1} / ${probSortedFarms.length}`;
  document.getElementById('probBrowsePct').textContent = `${(farm.probability * 100).toFixed(1)}%`;
  document.getElementById('probFarmId').textContent = farm.id;
  document.getElementById('probFarmLat').textContent = farm.lat.toFixed(5);
  document.getElementById('probFarmLng').textContent = farm.lng.toFixed(5);

  const hasVoted = gameState.votes[farm.id];
  const voteEl = document.getElementById('probFarmVote');
  if (hasVoted) {
    voteEl.textContent = hasVoted.vote.toUpperCase();
    voteEl.style.color = hasVoted.vote === 'yes' ? 'var(--c-yes)' : 'var(--c-no)';
    voteEl.style.fontWeight = '700';
  } else {
    voteEl.textContent = 'Not voted';
    voteEl.style.color = 'var(--c-text-muted)';
    voteEl.style.fontWeight = '400';
  }

  document.getElementById('farmPanel').classList.remove('active');
  map.stop();
  map.setView([farm.lat, farm.lng], GAME_CONSTANTS.FARM_INSPECT_ZOOM, { animate: true, duration: 0.5 });

  setTimeout(() => {
    map.invalidateSize();
    map.eachLayer(layer => { if (typeof layer.redraw === 'function') layer.redraw(); });
  }, 550);
}

function probBrowseNext() {
  probBrowseIndex = (probBrowseIndex + 1) % probSortedFarms.length;
  _probBrowseGoto(probBrowseIndex);
}

function probBrowsePrev() {
  probBrowseIndex = (probBrowseIndex - 1 + probSortedFarms.length) % probSortedFarms.length;
  _probBrowseGoto(probBrowseIndex);
}

/* ==================== DEBUG ==================== */

function addDebugPoints() {
  gameState.points += 1000;
  saveGameState();
  updateUI();
  showToast('Debug: added 1000 points');
}

function resetDebugPoints() {
  gameState.points = 0;
  saveGameState();
  updateUI();
  showToast('Debug: points reset to 0');
}

/* ==================== TOAST ==================== */

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ==================== AI ANALYSIS ==================== */

const AI_ANALYSIS_PROMPT = `You are an expert in satellite imagery analysis, agriculture, and animal farming.

You are looking at a satellite image centered on coordinates ({lat}, {lng}).

Your task:
1. Describe what you see in the satellite image — buildings, structures, land use patterns, vegetation, water bodies, roads, etc.
2. Based on the visual evidence, assess whether this location could be a factory farm (intensive animal farming operation). Look for indicators such as:
   - Long rectangular buildings typical of poultry or pig houses
   - Waste lagoons or retention ponds
   - Feed storage facilities
   - Patterns of cleared land with uniform structures
   - Scale and density of buildings
3. Based on the coordinates, provide any relevant geographic context (region, country, known agricultural zones) that might help assess the likelihood.
4. Give your overall assessment: how likely is this to be a factory farm? Provide a confidence level (Low / Medium / High) and explain your reasoning.

Be concise but thorough. Focus on observable evidence from the image and factual geographic context.`;

let aiButtonsEnabled = localStorage.getItem('ai_buttons_enabled') !== 'false';

function toggleAiButtons() {
  aiButtonsEnabled = document.getElementById('aiToggle').checked;
  localStorage.setItem('ai_buttons_enabled', aiButtonsEnabled);
  updateAiButtonsVisibility();
}

function updateAiButtonsVisibility() {
  const display = aiButtonsEnabled ? '' : 'none';
  document.querySelectorAll('.ai-row').forEach(row => { row.style.display = display; });
  const toggle = document.getElementById('aiToggle');
  if (toggle) toggle.checked = aiButtonsEnabled;
}

const GEMINI_COST_HINTS = {
  'gemini-2.5-flash': 'Recommended — good balance of speed and quality',
  'gemini-2.5-flash-lite': 'Cheapest — fastest and most budget-friendly',
  'gemini-2.5-pro': 'Premium — best reasoning, higher token cost',
  'gemini-3-flash-preview': 'Frontier-class, may cost more tokens (Preview)',
  'gemini-3.1-flash-lite-preview': 'Frontier performance at lower cost (Preview)',
  'gemini-3.1-pro-preview': 'Most capable, highest token cost (Preview)'
};
function updateGeminiCostHint() {
  const model = document.getElementById('geminiModelSelect').value;
  document.getElementById('geminiCostHint').textContent = GEMINI_COST_HINTS[model] || '';
}

const CLAUDE_COST_HINTS = {
  'claude-haiku-4-5': 'Cheapest — fastest with near-frontier intelligence',
  'claude-sonnet-4-6': 'Good balance — fast with strong vision capabilities',
  'claude-opus-4-6': 'Premium — most intelligent, highest cost'
};
function updateClaudeCostHint() {
  const model = document.getElementById('claudeModelSelect').value;
  document.getElementById('claudeCostHint').textContent = CLAUDE_COST_HINTS[model] || '';
}

const AI_LOADING_MESSAGES = [
  'Analyzing satellite imagery...',
  'Identifying structures...',
  'Assessing land use patterns...',
  'Evaluating farm indicators...',
  'Preparing analysis...'
];

function toggleApiKeyVisibility(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

function displayAiResult(resultDivId, analyzeBtnId, heading, text) {
  const resultDiv = document.getElementById(resultDivId);
  let html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  resultDiv.innerHTML = `<h4>${heading}</h4>${html}`;
  resultDiv.style.display = 'block';
  document.getElementById(analyzeBtnId).disabled = false;
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function openAiPanel({ loadKey, apiKey, ids, previewImgId }) {
  if (!currentFarm) return;
  loadKey();
  const panel = document.getElementById(ids.panel);
  const keySection = document.getElementById(ids.keySection);
  const analysisSection = document.getElementById(ids.analysisSection);
  document.getElementById(ids.result).style.display = 'none';
  document.getElementById(ids.result).innerHTML = '';
  document.getElementById(ids.loading).style.display = 'none';
  document.getElementById(ids.analyzeBtn).disabled = false;
  if (apiKey()) { keySection.style.display = 'none'; analysisSection.style.display = 'block'; }
  else { keySection.style.display = 'block'; analysisSection.style.display = 'none'; }
  document.getElementById(ids.lat).textContent = currentFarm.lat.toFixed(5);
  document.getElementById(ids.lng).textContent = currentFarm.lng.toFixed(5);
  captureMapTilesFor(previewImgId);
  panel.style.display = 'block';
}

function saveAiApiKey({ inputId, statusId, keySectionId, analysisSectionId, previewImgId, storageKey, setKey }) {
  const val = document.getElementById(inputId).value.trim();
  const statusEl = document.getElementById(statusId);
  if (!val) {
    statusEl.textContent = 'Please enter a valid API key.';
    statusEl.className = 'ai-status error';
    statusEl.style.display = 'block';
    return;
  }
  setKey(val);
  localStorage.setItem(storageKey, val);
  statusEl.textContent = 'API key saved';
  statusEl.className = 'ai-status success';
  statusEl.style.display = 'block';
  setTimeout(() => {
    document.getElementById(keySectionId).style.display = 'none';
    document.getElementById(analysisSectionId).style.display = 'block';
    captureMapTilesFor(previewImgId);
  }, 600);
}

function changeAiApiKey({ storageKey, clearKey, inputId, statusId, keySectionId, analysisSectionId }) {
  clearKey();
  localStorage.removeItem(storageKey);
  document.getElementById(inputId).value = '';
  document.getElementById(statusId).style.display = 'none';
  document.getElementById(keySectionId).style.display = 'block';
  document.getElementById(analysisSectionId).style.display = 'none';
}

async function performAiAnalysis({ loadKey, getKey, keyName, previewImgId, analyzeBtnId, loadingId, loadingTextId, resultId, firstLoadingMsg, buildRequest, parseResponse, onDisplay }) {
  if (!currentFarm) { showToast('No farm selected'); return; }
  loadKey();
  if (!getKey()) { showToast(`Please set your ${keyName} API key first`); return; }
  const previewImg = document.getElementById(previewImgId);
  if (!previewImg.src || previewImg.src === window.location.href) {
    showToast('No satellite image captured — try zooming in first');
    return;
  }
  const analyzeBtn = document.getElementById(analyzeBtnId);
  const loadingDiv = document.getElementById(loadingId);
  const loadingText = document.getElementById(loadingTextId);
  const resultDiv = document.getElementById(resultId);
  analyzeBtn.disabled = true;
  loadingDiv.style.display = 'flex';
  resultDiv.style.display = 'none';
  const messages = [firstLoadingMsg, ...AI_LOADING_MESSAGES];
  let msgIdx = 0;
  loadingText.textContent = messages[0];
  const interval = setInterval(() => { msgIdx = (msgIdx + 1) % messages.length; loadingText.textContent = messages[msgIdx]; }, 2500);
  try {
    const prompt = AI_ANALYSIS_PROMPT.replace(/\{lat\}/g, currentFarm.lat.toFixed(5)).replace(/\{lng\}/g, currentFarm.lng.toFixed(5));
    const dataUrl = previewImg.src;
    const base64Data = dataUrl.split(',')[1];
    const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
    const { url, headers, body } = buildRequest({ prompt, base64Data, mimeType });
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    clearInterval(interval);
    loadingDiv.style.display = 'none';
    if (!resp.ok) {
      const errBody = await resp.text();
      let hint = '';
      if (resp.status === 400) hint = 'Check your API key or request format.';
      else if (resp.status === 401 || resp.status === 403) hint = 'API key may be invalid or expired.';
      else if (resp.status === 429) hint = 'Rate limit exceeded — wait and try again.';
      throw new Error(`API error ${resp.status}: ${hint || errBody}`);
    }
    const data = await resp.json();
    onDisplay(parseResponse(data));
  } catch (err) {
    clearInterval(interval);
    loadingDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<div style="color:var(--c-danger);"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
    analyzeBtn.disabled = false;
  }
}

/* ---- Gemini ---- */
let geminiApiKey = '';
function loadGeminiApiKey() { const s = localStorage.getItem('gemini_api_key'); if (s) geminiApiKey = s; }

const GEMINI_IDS = {
  panel: 'geminiPanel', keySection: 'geminiKeySection', analysisSection: 'geminiAnalysisSection',
  result: 'geminiResult', loading: 'geminiLoading', analyzeBtn: 'geminiAnalyzeBtn',
  lat: 'geminiFarmLat', lng: 'geminiFarmLng'
};

function openGeminiPanel() { openAiPanel({ loadKey: loadGeminiApiKey, apiKey: () => geminiApiKey, ids: GEMINI_IDS, previewImgId: 'geminiPreviewImg' }); }
function closeGeminiPanel() { document.getElementById('geminiPanel').style.display = 'none'; }
function toggleGeminiKeyVisibility() { toggleApiKeyVisibility('geminiApiKeyInput', 'geminiKeyToggle'); }
function saveGeminiApiKey() {
  saveAiApiKey({ inputId: 'geminiApiKeyInput', statusId: 'geminiKeyStatus', keySectionId: 'geminiKeySection', analysisSectionId: 'geminiAnalysisSection', previewImgId: 'geminiPreviewImg', storageKey: 'gemini_api_key', setKey: v => { geminiApiKey = v; } });
}
function changeGeminiApiKey() {
  changeAiApiKey({ storageKey: 'gemini_api_key', clearKey: () => { geminiApiKey = ''; }, inputId: 'geminiApiKeyInput', statusId: 'geminiKeyStatus', keySectionId: 'geminiKeySection', analysisSectionId: 'geminiAnalysisSection' });
}

async function analyzeWithGemini() {
  await performAiAnalysis({
    loadKey: loadGeminiApiKey, getKey: () => geminiApiKey, keyName: 'Gemini',
    previewImgId: 'geminiPreviewImg', analyzeBtnId: 'geminiAnalyzeBtn',
    loadingId: 'geminiLoading', loadingTextId: 'geminiLoadingText', resultId: 'geminiResult',
    firstLoadingMsg: 'Sending image to Gemini...',
    buildRequest: ({ prompt, base64Data, mimeType }) => {
      const model = document.getElementById('geminiModelSelect').value;
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }] }
      };
    },
    parseResponse: data => {
      if (!data.candidates?.[0]?.content?.parts?.[0]) throw new Error('Unexpected response from Gemini.');
      return data.candidates[0].content.parts[0].text;
    },
    onDisplay: text => displayAiResult('geminiResult', 'geminiAnalyzeBtn', 'Gemini Analysis', text)
  });
}

/* ---- Claude ---- */
let claudeApiKey = '';
function loadClaudeApiKey() { const s = localStorage.getItem('claude_api_key'); if (s) claudeApiKey = s; }

const CLAUDE_IDS = {
  panel: 'claudePanel', keySection: 'claudeKeySection', analysisSection: 'claudeAnalysisSection',
  result: 'claudeResult', loading: 'claudeLoading', analyzeBtn: 'claudeAnalyzeBtn',
  lat: 'claudeFarmLat', lng: 'claudeFarmLng'
};

function openClaudePanel() { openAiPanel({ loadKey: loadClaudeApiKey, apiKey: () => claudeApiKey, ids: CLAUDE_IDS, previewImgId: 'claudePreviewImg' }); }
function closeClaudePanel() { document.getElementById('claudePanel').style.display = 'none'; }
function toggleClaudeKeyVisibility() { toggleApiKeyVisibility('claudeApiKeyInput', 'claudeKeyToggle'); }
function saveClaudeApiKey() {
  saveAiApiKey({ inputId: 'claudeApiKeyInput', statusId: 'claudeKeyStatus', keySectionId: 'claudeKeySection', analysisSectionId: 'claudeAnalysisSection', previewImgId: 'claudePreviewImg', storageKey: 'claude_api_key', setKey: v => { claudeApiKey = v; } });
}
function changeClaudeApiKey() {
  changeAiApiKey({ storageKey: 'claude_api_key', clearKey: () => { claudeApiKey = ''; }, inputId: 'claudeApiKeyInput', statusId: 'claudeKeyStatus', keySectionId: 'claudeKeySection', analysisSectionId: 'claudeAnalysisSection' });
}

async function analyzeWithClaude() {
  await performAiAnalysis({
    loadKey: loadClaudeApiKey, getKey: () => claudeApiKey, keyName: 'Anthropic',
    previewImgId: 'claudePreviewImg', analyzeBtnId: 'claudeAnalyzeBtn',
    loadingId: 'claudeLoading', loadingTextId: 'claudeLoadingText', resultId: 'claudeResult',
    firstLoadingMsg: 'Sending image to Claude...',
    buildRequest: ({ prompt, base64Data, mimeType }) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: {
        model: document.getElementById('claudeModelSelect').value,
        max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
          { type: 'text', text: prompt }
        ] }]
      }
    }),
    parseResponse: data => {
      if (!data.content?.[0]) throw new Error('Unexpected response from Claude.');
      return data.content[0].text;
    },
    onDisplay: text => displayAiResult('claudeResult', 'claudeAnalyzeBtn', 'Claude Analysis', text)
  });
}

/* ==================== MAP CAPTURE ==================== */

function getComputedTranslate(el) {
  const style = window.getComputedStyle(el);
  const transform = style.transform || style.webkitTransform || '';
  if (transform === 'none' || !transform) {
    return { x: parseInt(style.left) || 0, y: parseInt(style.top) || 0 };
  }
  const match = transform.match(/matrix.*\((.+)\)/);
  if (match) {
    const values = match[1].split(',').map(Number);
    if (values.length === 6) return { x: values[4], y: values[5] };
    if (values.length === 16) return { x: values[12], y: values[13] };
  }
  return { x: 0, y: 0 };
}

function captureMapTilesFor(previewImgId) {
  const mapContainer = document.getElementById('map');
  const canvas = document.getElementById('geminiCaptureCanvas');
  const previewImg = document.getElementById(previewImgId);

  const width = mapContainer.offsetWidth;
  const height = mapContainer.offsetHeight;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const mapPane = map.getPane('mapPane');
  const mapTransform = mapPane ? getComputedTranslate(mapPane) : { x: 0, y: 0 };
  const tilePane = map.getPane('tilePane');
  if (!tilePane) { previewImg.src = ''; return; }

  const tileImages = tilePane.querySelectorAll('img');
  const loadPromises = [];

  tileImages.forEach(img => {
    if (!img.src || !img.complete || img.naturalWidth === 0) return;
    const tileTransform = getComputedTranslate(img);
    let parentTransform = { x: 0, y: 0 };
    let parent = img.parentElement;
    while (parent && parent !== tilePane) {
      const pt = getComputedTranslate(parent);
      parentTransform.x += pt.x;
      parentTransform.y += pt.y;
      parent = parent.parentElement;
    }
    const x = mapTransform.x + parentTransform.x + tileTransform.x;
    const y = mapTransform.y + parentTransform.y + tileTransform.y;
    const promise = new Promise(resolve => {
      const proxyImg = new Image();
      proxyImg.crossOrigin = 'anonymous';
      proxyImg.onload = () => { try { ctx.drawImage(proxyImg, x, y, img.width || 256, img.height || 256); } catch (e) {} resolve(); };
      proxyImg.onerror = () => resolve();
      proxyImg.src = img.src;
    });
    loadPromises.push(promise);
  });

  Promise.all(loadPromises).then(() => {
    try { previewImg.src = canvas.toDataURL('image/jpeg', 0.85); } catch (e) { previewImg.src = ''; }
  });
}

/* ==================== EVENT LISTENERS ==================== */

document.getElementById('tutorialStart').addEventListener('click', () => {
  document.getElementById('tutorialOverlay').style.display = 'none';
});

document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sideMenu').classList.add('active');
});
document.getElementById('closeMenu').addEventListener('click', () => {
  document.getElementById('sideMenu').classList.remove('active');
});

document.getElementById('shopBtn').addEventListener('click', () => { openShop(); document.getElementById('sideMenu').classList.remove('active'); });
document.getElementById('badgesBtn').addEventListener('click', () => { openBadges(); document.getElementById('sideMenu').classList.remove('active'); });
document.getElementById('leaderboardBtn').addEventListener('click', () => { openLeaderboard(); document.getElementById('sideMenu').classList.remove('active'); });
document.getElementById('statsBtn').addEventListener('click', () => { openStats(); document.getElementById('sideMenu').classList.remove('active'); });
document.getElementById('powerUpsBtn').addEventListener('click', () => { openPowerUps(); document.getElementById('sideMenu').classList.remove('active'); });

document.getElementById('closeZone').addEventListener('click', closeZonePanel);
document.getElementById('exploreZone').addEventListener('click', exploreZone);

document.getElementById('closeFarm').addEventListener('click', closeFarmPanel);
document.getElementById('voteYes').addEventListener('click', () => vote('yes'));
document.getElementById('voteNo').addEventListener('click', () => vote('no'));
document.getElementById('zoomInBtn').addEventListener('click', zoomInToFarm);
document.getElementById('changeVoteBtn').addEventListener('click', changeVote);

document.getElementById('shareBadges').addEventListener('click', shareBadges);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => generateLeaderboard(btn.dataset.period));
});

function initShopTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      if (tabName === 'zones') document.getElementById('zonesTab').classList.add('active');
      else if (tabName === 'cosmetics') document.getElementById('cosmeticsTab').classList.add('active');
      else if (tabName === 'features') document.getElementById('featuresTab').classList.add('active');
    });
  });
}

/* ==================== INIT ==================== */

async function init() {
  console.log('Initializing Zone Quest v2...');
  loadGameState();
  await loadFarmData();
  renderThemeOptions();
  renderCursorOptions();
  renderAvatarOptions();
  if (gameState.currentCursor) applyCursor(gameState.currentCursor);
  updateActivePowerUpDisplay();
  initShopTabs();
  loadGeminiApiKey();
  loadClaudeApiKey();
  updateAiButtonsVisibility();
  console.log('Zone Quest v2 initialized');
}

init();
