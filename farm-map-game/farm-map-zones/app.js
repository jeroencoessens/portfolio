console.log('🎮 Zone Quest - Farm Verification Game');
console.log('📍 Help identify factory farms using satellite imagery');

/* ==================== GAME OVERVIEW ====================
 * This is a gamified crowdsourcing application where users:
 * 1. Explore geographic zones with high farm density
 * 2. Vote on whether satellite-detected locations are factory farms
 * 3. Earn points to unlock new zones, themes, and historical satellite data
 * 4. View real and simulated historical satellite imagery to see changes over time
 * 
 * Technical Stack:
 * - Leaflet.js for interactive maps
 * - NASA GIBS for real historical satellite imagery
 * - localStorage for persistent game state
 * ==================== */

/* ==================== MAP SETUP ====================
 * Initialize Leaflet map with satellite and street view layers
 * Default view centered on Southeast Asia (Vietnam/Thailand region)
 * ==================== */

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri' }
);

const street = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap contributors' }
);

const map = L.map('map', {
  layers: [satellite],
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([16, 106], 6);

L.control.layers(
  { Satellite: satellite, Street: street },
  null,
  { position: 'topright' }
).addTo(map);

/* ==================== GAME CONSTANTS ==================== */

const GAME_CONSTANTS = {
  // Points & Rewards
  BASE_POINTS_PER_VOTE: 100,
  MIN_POINTS_PER_VOTE: 10,
  POINTS_REDUCTION_FACTOR: 0.9,
  MYSTERY_BOX_VOTE_FREQUENCY: 25,
  
  // Zone Configuration
  ZONE_GRID_SIZE: 0.5, // degrees (~55km at equator)
  MIN_ZONE_FARMS: 10,
  FIRST_ZONE_UNLOCK_PRICE: 0,
  ZONE_UNLOCK_BASE_PRICE: 1000,
  ZONE_UNLOCK_PRICE_INCREMENT: 500,
  
  // Power-Ups
  DOUBLE_POINTS_PRICE: 500,
  DOUBLE_POINTS_DURATION: 600000, // 10 minutes in ms
  TRIPLE_POINTS_PRICE: 1000,
  TRIPLE_POINTS_DURATION: 300000, // 5 minutes in ms
  MYSTERY_BOX_PRICE: 300,
  
  // Features
  HISTORICAL_MODE_PRICE: 2000,
  
  // Zoom Levels
  ZONE_VIEW_ZOOM: 12,
  FARM_DETAIL_ZOOM: 14,
  FARM_INSPECT_ZOOM: 18,
  
  // Probabilities
  MIN_FARM_PROBABILITY: 0.5,
  PROB_LOW_THRESHOLD: 0.65,
  PROB_MEDIUM_THRESHOLD: 0.75,
  PROB_HIGH_THRESHOLD: 0.85
};

/* ==================== GAME STATE ====================
 * Central state object persisted to localStorage
 * Tracks:
 * - User progress (points, votes, badges, titles)
 * - Unlocked content (zones, themes, providers, historical years)
 * - Active features (power-ups, customization)
 * ==================== */

let gameState = {
  points: 0,
  totalVotes: 0,
  yesVotes: 0,
  noVotes: 0,
  votes: {}, // farmId: {vote: 'yes'/'no', points: 100}
  unlockedZones: [0], // Array of unlocked zone indices
  unlockedThemes: ['default'],
  badges: [],
  currentTheme: 'default',
  currentAvatar: 'farmer',
  unlockedAvatars: ['farmer'],
  currentTitle: 'Observer',
  unlockedTitles: ['Observer'],
  activePowerUp: null, // {type: 'double_points', expiresAt: timestamp}
  unlockedPowerUps: [],
  mysteryBoxes: 0,
  historicalUnlocked: false,
  unlockedHistoricalYears: [2024], // Current year always unlocked
  currentHistoricalYear: 2024,
  unlockedSatelliteProviders: ['esri'], // Esri is default with best historical coverage
  currentSatelliteProvider: 'esri'
};

let zones = [];
let allFarms = [];
let currentZone = null;
let currentFarm = null;
let zoneMarkers = [];
let farmMarkers = [];
let currentZoomLevel = 6;

/**
 * Load saved game state from browser localStorage
 * Merges saved data with current state to preserve any new properties
 */
function loadGameState() {
  const saved = localStorage.getItem('zoneQuestGameState');
  if (saved) {
    const parsedState = JSON.parse(saved);
    gameState = { ...gameState, ...parsedState };
  }
  updateUI();
}

/**
 * Save current game state to browser localStorage
 * Called after any state-changing action
 */
function saveGameState() {
  localStorage.setItem('zoneQuestGameState', JSON.stringify(gameState));
}

/* ==================== DATA LOADING ====================
 * Load farm detection data from JSON file
 * Data contains coordinates and ML model probabilities
 * ==================== */

async function loadFarmData() {
  try {
    const response = await fetch('../farm-map/vietnam_json.json');
    const data = await response.json();
    
    // Filter farms with probability > 50%
    allFarms = data.Farms
      .filter(f => f.farm_probability > GAME_CONSTANTS.MIN_FARM_PROBABILITY)
      .map(f => ({
        id: f.ID,
        lat: f.Latitude,
        lng: f.Longitude,
        probability: f.farm_probability
      }));
    
    console.log(`Loaded ${allFarms.length} farms with >50% probability`);
    
    // Create zones from high-density areas
    createZones();
    
    // Show zones on map
    showZoneMarkers();
    
  } catch (error) {
    console.error('Error loading farm data:', error);
    showToast('Error loading farm data');
  }
}

/* ==================== ZONE CLUSTERING ====================
 * Group farms into geographic zones using simple grid-based clustering
 * Each zone represents a high-density area of detected farms
 * ==================== */

/**
 * Create geographic zones by clustering nearby farms
 * Uses a grid-based approach for simplicity and performance
 */
function createZones() {
  // Simple grid-based clustering (0.5° grid = ~55km at equator)
  const gridSize = GAME_CONSTANTS.ZONE_GRID_SIZE;
  const zoneMap = {};
  
  allFarms.forEach(farm => {
    const gridX = Math.floor(farm.lng / gridSize);
    const gridY = Math.floor(farm.lat / gridSize);
    const key = `${gridX},${gridY}`;
    
    if (!zoneMap[key]) {
      zoneMap[key] = {
        farms: [],
        centerLat: 0,
        centerLng: 0
      };
    }
    
    zoneMap[key].farms.push(farm);
  });
  
  // Convert to array and filter out small zones
  zones = Object.entries(zoneMap)
    .map(([key, data]) => {
      // Calculate center
      const centerLat = data.farms.reduce((sum, f) => sum + f.lat, 0) / data.farms.length;
      const centerLng = data.farms.reduce((sum, f) => sum + f.lng, 0) / data.farms.length;
      const avgProb = data.farms.reduce((sum, f) => sum + f.probability, 0) / data.farms.length;
      
      return {
        id: key,
        farms: data.farms,
        centerLat,
        centerLng,
        avgProb,
        name: `Zone ${zones.length + 1}`
      };
    })
    .filter(z => z.farms.length >= GAME_CONSTANTS.MIN_ZONE_FARMS) // Only zones with 10+ farms
    .sort((a, b) => b.farms.length - a.farms.length); // Sort by farm count
  
  // Assign names based on position
  zones.forEach((zone, i) => {
    zone.name = `Zone ${i + 1}`;
    zone.index = i;
    // First unlock costs 1000, then each subsequent zone costs +500 more
    zone.unlockPrice = i === 0 ? GAME_CONSTANTS.FIRST_ZONE_UNLOCK_PRICE : GAME_CONSTANTS.ZONE_UNLOCK_BASE_PRICE + (GAME_CONSTANTS.ZONE_UNLOCK_PRICE_INCREMENT * (i - 1));
  });
  
  console.log(`Created ${zones.length} zones`);
}

/* ==================== ZONE DISPLAY ==================== */

function showZoneMarkers() {
  // Clear existing markers
  zoneMarkers.forEach(m => map.removeLayer(m));
  zoneMarkers = [];
  
  zones.forEach((zone, index) => {
    const isUnlocked = gameState.unlockedZones.includes(index);
    
    const icon = L.divIcon({
      className: 'zone-marker',
      html: `
        <div class="zone-marker-content ${isUnlocked ? '' : 'locked'}">
          ${isUnlocked ? '🌾' : '🔒'} ${zone.name}
          <div style="font-size: 11px; margin-top: 2px;">
            ${zone.farms.length} farms
          </div>
        </div>
      `,
      iconSize: [120, 50],
      iconAnchor: [60, 25]
    });
    
    const marker = L.marker([zone.centerLat, zone.centerLng], { icon })
      .addTo(map);
    
    marker.on('click', () => selectZone(index));
    
    zoneMarkers.push(marker);
  });
}

/* ==================== ZONE INTERACTION ==================== */

function selectZone(zoneIndex) {
  const zone = zones[zoneIndex];
  const isUnlocked = gameState.unlockedZones.includes(zoneIndex);
  
  if (!isUnlocked) {
    showToast(`🔒 Zone locked! Unlock in shop for ${zone.unlockPrice} points`);
    return;
  }
  
  currentZone = zone;
  
  // Calculate zone progress
  const votedCount = zone.farms.filter(f => gameState.votes[f.id]).length;
  const progress = Math.round((votedCount / zone.farms.length) * 100);
  
  // Update zone panel
  document.getElementById('zoneName').textContent = zone.name;
  document.getElementById('zoneFarmCount').textContent = zone.farms.length;
  document.getElementById('zoneVoteCount').textContent = votedCount;
  document.getElementById('zoneAvgProb').textContent = `${(zone.avgProb * 100).toFixed(1)}%`;
  
  // Update progress ring
  updateProgressRing(progress);
  
  // Show panel
  document.getElementById('zonePanel').classList.add('active');
}

function updateProgressRing(progress) {
  const ring = document.getElementById('zoneProgressRing');
  if (!ring) return;
  
  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference - (progress / 100) * circumference;
  
  ring.style.strokeDasharray = `${circumference} ${circumference}`;
  ring.style.strokeDashoffset = offset;
  
  document.getElementById('zoneProgressText').textContent = `${progress}%`;
}

function exploreZone() {
  if (!currentZone) return;
  
  // Hide zone panel
  document.getElementById('zonePanel').classList.remove('active');
  
  // Zoom to zone
  currentZoomLevel = GAME_CONSTANTS.ZONE_VIEW_ZOOM;
  map.setView([currentZone.centerLat, currentZone.centerLng], GAME_CONSTANTS.ZONE_VIEW_ZOOM, {
    animate: true,
    duration: 1
  });
  
  // Show farm markers
  showFarmMarkers(currentZone);
}

function closeZonePanel() {
  document.getElementById('zonePanel').classList.remove('active');
  currentZone = null;
}

/* ==================== FARM DISPLAY ==================== */

function showFarmMarkers(zone) {
  // Clear existing farm markers
  farmMarkers.forEach(m => map.removeLayer(m));
  farmMarkers = [];
  
  zone.farms.forEach(farm => {
    const vote = gameState.votes[farm.id];
    let colorClass = '';
    
    if (vote) {
      // Color based on vote
      colorClass = vote.vote === 'yes' ? 'voted-yes' : 'voted-no';
    } else {
      // Color based on probability (50-100%)
      if (farm.probability < GAME_CONSTANTS.PROB_LOW_THRESHOLD) {
        colorClass = 'prob-low'; // Yellow (50-65%)
      } else if (farm.probability < GAME_CONSTANTS.PROB_MEDIUM_THRESHOLD) {
        colorClass = 'prob-medium'; // Orange (65-75%)
      } else if (farm.probability < GAME_CONSTANTS.PROB_HIGH_THRESHOLD) {
        colorClass = 'prob-high'; // Dark orange (75-85%)
      } else {
        colorClass = 'prob-very-high'; // Red-orange (85%+)
      }
    }
    
    const icon = L.divIcon({
      className: 'farm-marker-zone',
      html: `<div class="farm-marker-zone-content ${colorClass}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    
    const marker = L.marker([farm.lat, farm.lng], { icon })
      .addTo(map);
    
    marker.on('click', () => selectFarm(farm));
    
    farmMarkers.push(marker);
  });
}

/* ==================== FARM INTERACTION ==================== */

function selectFarm(farm) {
  currentFarm = farm;
  
  // Calculate points for this farm (decreases with vote count)
  const voteCount = getGlobalVoteCount(farm.id);
  const points = calculatePoints(voteCount);
  
  // Update farm panel
  document.getElementById('farmId').textContent = farm.id;
  document.getElementById('farmProb').textContent = `${(farm.probability * 100).toFixed(1)}%`;
  document.getElementById('farmVotes').textContent = voteCount;
  document.getElementById('farmPoints').textContent = points;
  
  // Check if already voted
  const hasVoted = gameState.votes[farm.id];
  
  if (hasVoted) {
    document.getElementById('votingSection').style.display = 'none';
    document.getElementById('votedSection').style.display = 'block';
    document.getElementById('userVote').textContent = hasVoted.vote.toUpperCase();
  } else {
    document.getElementById('votingSection').style.display = 'block';
    document.getElementById('votedSection').style.display = 'none';
  }
  
  // Show panel
  document.getElementById('farmPanel').classList.add('active');
  
  // Gently zoom to farm
  map.setView([farm.lat, farm.lng], Math.max(map.getZoom(), GAME_CONSTANTS.FARM_DETAIL_ZOOM), {
    animate: true,
    duration: 0.5
  });
}

function closeFarmPanel() {
  document.getElementById('farmPanel').classList.remove('active');
  currentFarm = null;
  
  // Zoom back to zone view if we're zoomed in
  if (currentZone && map.getZoom() > GAME_CONSTANTS.ZONE_VIEW_ZOOM) {
    map.setView([currentZone.centerLat, currentZone.centerLng], GAME_CONSTANTS.ZONE_VIEW_ZOOM, {
      animate: true,
      duration: 0.5
    });
  }
}

function zoomInToFarm() {
  if (!currentFarm) return;
  
  map.setView([currentFarm.lat, currentFarm.lng], GAME_CONSTANTS.FARM_INSPECT_ZOOM, {
    animate: true,
    duration: 0.8
  });
  
  showToast('🔍 Zoomed in! Inspect the satellite imagery');
}

/* ==================== VOTING ====================
 * Core gameplay mechanic: users vote YES/NO on detected farms
 * Points are awarded based on:
 * - Base value (100 points)
 * - Diminishing returns (more votes = fewer points)
 * - Active power-ups (2x or 3x multipliers)
 * ==================== */

/**
 * Record a user's vote on whether a location is a factory farm
 * @param {string} voteType - 'yes' or 'no'
 */
function vote(voteType) {
  if (!currentFarm) return;
  
  // Check if already voted
  if (gameState.votes[currentFarm.id]) {
    showToast('Already voted on this farm!');
    return;
  }
  
  // Calculate base points
  const voteCount = getGlobalVoteCount(currentFarm.id);
  let points = calculatePoints(voteCount);
  
  // Apply power-up multiplier
  if (gameState.activePowerUp && gameState.activePowerUp.expiresAt > Date.now()) {
    if (gameState.activePowerUp.type === 'double_points') {
      points *= 2;
      showToast('🔥 2x Points Active!');
    }
  } else if (gameState.activePowerUp) {
    // Power-up expired
    gameState.activePowerUp = null;
  }
  
  // Record vote
  gameState.votes[currentFarm.id] = {
    vote: voteType,
    points: points,
    timestamp: Date.now()
  };
  
  // Update stats
  gameState.points += points;
  gameState.totalVotes++;
  if (voteType === 'yes') {
    gameState.yesVotes++;
  } else {
    gameState.noVotes++;
  }
  
  // Award mystery box every 25 votes
  if (gameState.totalVotes % GAME_CONSTANTS.MYSTERY_BOX_VOTE_FREQUENCY === 0) {
    gameState.mysteryBoxes++;
    showToast('🎁 Mystery Box earned!');
  }
  
  // Check for title upgrades
  checkTitles();
  
  // Increment global vote count (simulated)
  incrementGlobalVoteCount(currentFarm.id);
  
  // Check for badges
  checkBadges();
  
  // Save state
  saveGameState();
  
  // Update UI
  updateUI();
  
  // Show success
  showToast(`✓ +${points} points! Total: ${gameState.points}`);
  
  // Update farm panel to show voted state
  selectFarm(currentFarm);
  
  // Update farm marker color
  if (currentZone) {
    showFarmMarkers(currentZone);
  }
}

function changeVote() {
  if (!currentFarm || !gameState.votes[currentFarm.id]) return;
  
  // Remove the vote
  const oldVote = gameState.votes[currentFarm.id];
  delete gameState.votes[currentFarm.id];
  
  // Restore points
  gameState.points -= oldVote.points;
  gameState.totalVotes--;
  if (oldVote.vote === 'yes') {
    gameState.yesVotes--;
  } else {
    gameState.noVotes--;
  }
  
  // Save and update
  saveGameState();
  updateUI();
  
  // Update panel
  selectFarm(currentFarm);
  
  // Update markers
  if (currentZone) {
    showFarmMarkers(currentZone);
  }
  
  showToast('Vote removed. You can vote again!');
}

/* ==================== POINTS CALCULATION ====================
 * Dynamic point system with diminishing returns
 * Encourages users to vote on less-visited farms
 * Formula: Base 100 * 0.9^(vote_count), minimum 10 points
 * ==================== */

/**
 * Calculate points awarded for voting on a farm
 * @param {number} voteCount - Number of existing votes on this farm
 * @returns {number} Points to award (10-100)
 */
function calculatePoints(voteCount) {
  // Base points = 100
  // Decreases by 10% for each existing vote, minimum 10 points
  const base = GAME_CONSTANTS.BASE_POINTS_PER_VOTE;
  const reduction = Math.pow(GAME_CONSTANTS.POINTS_REDUCTION_FACTOR, voteCount);
  return Math.max(GAME_CONSTANTS.MIN_POINTS_PER_VOTE, Math.floor(base * reduction));
}

/**
 * Get total vote count for a farm from all users
 * NOTE: Currently simulated with localStorage. In production,
 * this would query a backend database.
 * @param {string} farmId - Unique farm identifier
 * @returns {number} Total votes across all users
 */
function getGlobalVoteCount(farmId) {
  const stored = localStorage.getItem(`globalVotes_${farmId}`);
  return stored ? parseInt(stored) : 0;
}

function incrementGlobalVoteCount(farmId) {
  const current = getGlobalVoteCount(farmId);
  localStorage.setItem(`globalVotes_${farmId}`, current + 1);
}

/* ==================== TITLES/RANKS ==================== */

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
      showToast(`🏆 New Title: ${title.name}!`);
    }
  });
}

function getCurrentTitle() {
  return gameState.currentTitle || 'Observer';
}

/* ==================== BADGES ====================
 * Achievement system to reward milestones and encourage engagement
 * Badges are checked after each vote and automatically awarded
 * ==================== */

const BADGE_DEFINITIONS = [
  {
    id: 'first_vote',
    name: 'First Steps',
    icon: '🌱',
    description: 'Cast your first vote',
    condition: () => gameState.totalVotes >= 1
  },
  {
    id: 'ten_votes',
    name: 'Getting Started',
    icon: '🌿',
    description: 'Cast 10 votes',
    condition: () => gameState.totalVotes >= 10
  },
  {
    id: 'fifty_votes',
    name: 'Dedicated Verifier',
    icon: '🌾',
    description: 'Cast 50 votes',
    condition: () => gameState.totalVotes >= 50
  },
  {
    id: 'hundred_votes',
    name: 'Expert Investigator',
    icon: '🏆',
    description: 'Cast 100 votes',
    condition: () => gameState.totalVotes >= 100
  },
  {
    id: 'thousand_points',
    name: 'Point Collector',
    icon: '💰',
    description: 'Earn 1,000 points',
    condition: () => gameState.points >= 1000
  },
  {
    id: 'five_thousand_points',
    name: 'Point Master',
    icon: '💎',
    description: 'Earn 5,000 points',
    condition: () => gameState.points >= 5000
  },
  {
    id: 'zone_explorer',
    name: 'Zone Explorer',
    icon: '🗺️',
    description: 'Unlock 3 zones',
    condition: () => gameState.unlockedZones.length >= 3
  },
  {
    id: 'balanced_voter',
    name: 'Balanced Judge',
    icon: '⚖️',
    description: 'Vote YES and NO equally (min 20 votes)',
    condition: () => {
      if (gameState.totalVotes < 20) return false;
      const ratio = gameState.yesVotes / gameState.totalVotes;
      return ratio >= 0.4 && ratio <= 0.6;
    }
  }
];

/**
 * Check if user has earned any new badges
 * Called after voting or other significant actions
 */
function checkBadges() {
  let newBadges = [];
  
  BADGE_DEFINITIONS.forEach(badge => {
    if (!gameState.badges.includes(badge.id) && badge.condition()) {
      gameState.badges.push(badge.id);
      newBadges.push(badge);
    }
  });
  
  if (newBadges.length > 0) {
    newBadges.forEach(badge => {
      setTimeout(() => {
        showToast(`🏅 New Badge: ${badge.name}!`);
      }, 500);
    });
  }
}

/* ==================== SHOP ====================
 * In-game store for purchasing:
 * - New geographic zones to explore
 * - Visual themes and customization
 * - Historical satellite data years
 * - Satellite imagery providers
 * All purchases use earned points (no real money)
 * ==================== */

/**
 * Helper function to create a shop item DOM element
 * @param {Object} config - Shop item configuration
 * @returns {HTMLElement} - Shop item element
 */
function createShopItem(config) {
  const {
    icon,
    name,
    description,
    isUnlocked,
    canAfford,
    price,
    onUnlock
  } = config;
  
  const item = document.createElement('div');
  item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
  
  const actionButton = isUnlocked
    ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
    : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="${onUnlock}">
        💰 ${price} points
      </button>`;
  
  item.innerHTML = `
    <div class="shop-item-info">
      <div class="shop-item-name">${icon} ${name}</div>
      <div class="shop-item-desc">${description}</div>
    </div>
    <div class="shop-item-action">
      ${actionButton}
    </div>
  `;
  
  return item;
}

function openShop() {
  document.getElementById('shopPoints').textContent = gameState.points;
  
  // Render zone shop items
  const zoneShop = document.getElementById('zoneShopItems');
  zoneShop.innerHTML = '';
  
  zones.forEach((zone, index) => {
    if (index === 0) return; // Skip first zone (always unlocked)
    
    const isUnlocked = gameState.unlockedZones.includes(index);
    const canAfford = gameState.points >= zone.unlockPrice;
    
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${isUnlocked ? '🌾' : '🔒'} ${zone.name}</div>
        <div class="shop-item-desc">${zone.farms.length} farms · ${(zone.avgProb * 100).toFixed(0)}% avg probability</div>
      </div>
      <div class="shop-item-action">
        ${isUnlocked 
          ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockZone(${index})">
              💰 ${zone.unlockPrice} points
            </button>`
        }
      </div>
    `;
    zoneShop.appendChild(item);
  });
  
  // Render theme shop items
  const themeShop = document.getElementById('themeShopItems');
  themeShop.innerHTML = '';
  
  const themes = [
    { id: 'ocean', name: 'Ocean Theme', price: 200, color: '#1976d2' },
    { id: 'sunset', name: 'Sunset Theme', price: 300, color: '#ef6c00' },
    { id: 'midnight', name: 'Midnight Theme', price: 300, color: '#7b1fa2' }
  ];
  
  themes.forEach(theme => {
    const isUnlocked = gameState.unlockedThemes.includes(theme.id);
    const canAfford = gameState.points >= theme.price;
    
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">
          <span class="theme-color" style="display: inline-block; width: 16px; height: 16px; background: ${theme.color}; border-radius: 3px; margin-right: 6px;"></span>
          ${theme.name}
        </div>
        <div class="shop-item-desc">Change marker colors</div>
      </div>
      <div class="shop-item-action">
        ${isUnlocked 
          ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockTheme('${theme.id}', ${theme.price})">
              💰 ${theme.price} points
            </button>`
        }
      </div>
    `;
    themeShop.appendChild(item);
  });
  
  // Render cursor shop items
  const cursorShop = document.getElementById('cursorShopItems');
  cursorShop.innerHTML = '';
  
  const cursors = [
    { id: 'pointer', name: 'Fancy Pointer', price: 150, emoji: '👆' },
    { id: 'crosshair', name: 'Crosshair', price: 150, emoji: '🎯' },
    { id: 'hand', name: 'Hand Cursor', price: 200, emoji: '👋' },
    { id: 'sparkle', name: 'Sparkle', price: 250, emoji: '✨' }
  ];
  
  cursors.forEach(cursor => {
    const isUnlocked = gameState.unlockedCursors?.includes(cursor.id);
    const canAfford = gameState.points >= cursor.price;
    
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">
          ${cursor.emoji} ${cursor.name}
        </div>
        <div class="shop-item-desc">Custom cursor style</div>
      </div>
      <div class="shop-item-action">
        ${isUnlocked 
          ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockCursor('${cursor.id}', ${cursor.price})">
              💰 ${cursor.price} points
            </button>`
        }
      </div>
    `;
    cursorShop.appendChild(item);
  });
  
  // Render features tab
  renderFeaturesShop();
  
  document.getElementById('shopModal').classList.add('active');
}

function renderFeaturesShop() {
  const container = document.getElementById('featureShopItems');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Historical Mode unlock
  const historicalUnlocked = gameState.historicalUnlocked || false;
  const historicalPrice = 2000;
  const canAffordHistorical = gameState.points >= historicalPrice;
  
  const historicalItem = document.createElement('div');
  historicalItem.className = `shop-item ${historicalUnlocked ? 'unlocked' : ''}`;
  historicalItem.innerHTML = `
    <div class="shop-item-info">
      <div class="shop-item-name">${historicalUnlocked ? '📅' : '🔒'} Historical Mode</div>
      <div class="shop-item-desc">Travel back in time to view historical satellite imagery</div>
    </div>
    <div class="shop-item-action">
      ${historicalUnlocked 
        ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
        : `<button class="btn-buy" ${canAffordHistorical ? '' : 'disabled'} onclick="unlockHistoricalMode()">
            💰 ${historicalPrice} points
          </button>`
      }
    </div>
  `;
  container.appendChild(historicalItem);
  
  // Historical years section (only show if historical mode is unlocked)
  if (historicalUnlocked) {
    const yearSectionTitle = document.createElement('h3');
    yearSectionTitle.style.cssText = 'margin: 20px 0 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px; font-size: 14px;';
    yearSectionTitle.textContent = '📅 Historical Years';
    container.appendChild(yearSectionTitle);
    
    const yearContainer = document.createElement('div');
    yearContainer.id = 'historicalYearShopItems';
    container.appendChild(yearContainer);
    
    renderHistoricalShop();
    
    // Satellite providers section
    const providerSectionTitle = document.createElement('h3');
    providerSectionTitle.style.cssText = 'margin: 20px 0 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px; font-size: 14px;';
    providerSectionTitle.textContent = '🛰️ Satellite Providers';
    container.appendChild(providerSectionTitle);
    
    const providerContainer = document.createElement('div');
    providerContainer.id = 'satelliteProviderShopItems';
    container.appendChild(providerContainer);
    
    renderSatelliteProviderShop();
  }
}

/**
 * Render the satellite provider shop with available imagery sources
 * Shows real vs simulated data and pricing
 */
function renderSatelliteProviderShop() {
  const container = document.getElementById('satelliteProviderShopItems');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];
  
  // Define which providers are true satellite imagery
  const trueSatelliteProviders = ['esri', 'google', 'usgs', 'sentinel2', 'sentinel2_cloudless', 'sentinel_hub', 'planet_skysat', 'landsat', 'maxar_worldview', 'modis'];
  
  Object.keys(SATELLITE_PROVIDERS).forEach(providerId => {
    const provider = SATELLITE_PROVIDERS[providerId];
    const isUnlocked = gameState.unlockedSatelliteProviders.includes(providerId);
    const canAfford = gameState.points >= provider.price;
    
    // Check if this has real historical data capability
    const hasRealData = provider.hasRealHistorical === true && provider.requiresDate === true;
    const dataNote = hasRealData ? ' ⭐ Real historical data' : '';
    const setupNote = provider.requiresSetup ? '<br><small style="color:#1976d2;font-weight:600;">⚙️ Requires setup - click info button</small>' : '';
    const noteText = provider.historicalNote ? `<br><small style="color:#f57c00;font-style:italic;">Note: ${provider.historicalNote}</small>` : '';
    
    // Determine provider type
    const isSatellite = trueSatelliteProviders.includes(providerId);
    const typeLabel = isSatellite 
      ? '<span style="display:inline-block;padding:2px 8px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-size:11px;font-weight:600;margin-top:4px;">🛰️ Satellite Imagery</span>'
      : '<span style="display:inline-block;padding:2px 8px;background:#f5f5f5;color:#666;border-radius:4px;font-size:11px;margin-top:4px;">🗺️ Map/Terrain Data</span>';
    
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${isUnlocked ? provider.emoji : '🔒'} ${provider.name}${dataNote}</div>
        <div class="shop-item-desc">${provider.description}<br><small style="color: var(--muted)">Coverage: ${provider.yearCoverage}</small>${setupNote}${noteText}<br>${typeLabel}</div>
      </div>
      <div class="shop-item-action">
        ${provider.requiresSetup && !isUnlocked ? `<button class="btn-buy" style="background:#1976d2;margin-right:8px;" onclick="showSentinelHubSetup()">ℹ️ Setup</button>` : ''}
        ${isUnlocked 
          ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
          : provider.price === 0
            ? '<span class="shop-item-unlocked">Default</span>'
            : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockSatelliteProvider('${providerId}')">
                💰 ${provider.price} points
              </button>`
        }
      </div>
    `;
    container.appendChild(item);
  });
}

function unlockSatelliteProvider(providerId) {
  if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];
  
  if (gameState.unlockedSatelliteProviders.includes(providerId)) {
    showToast('Provider already unlocked!');
    return;
  }
  
  const provider = SATELLITE_PROVIDERS[providerId];
  if (!provider) return;
  
  if (gameState.points < provider.price) {
    showToast('Not enough points!');
    return;
  }
  
  gameState.points -= provider.price;
  gameState.unlockedSatelliteProviders.push(providerId);
  
  saveGameState();
  updateUI();
  renderSatelliteProviderShop();
  
  showToast(`${provider.emoji} ${provider.name} unlocked!`);
}

/**
 * Show setup instructions for Sentinel Hub free tier
 * Allows users to configure their instance ID for real historical imagery
 */
function showSentinelHubSetup() {
  const currentId = gameState.sentinelHubInstanceId || '';
  
  const setupHtml = `
    <div style="padding: 20px; max-width: 600px;">
      <h2 style="margin-top:0;">🎯 Sentinel Hub Setup (FREE!)</h2>
      
      <p style="line-height:1.6;">Get <strong>real historical Sentinel-2 imagery</strong> at 10m resolution from 2015-present - perfect for identifying farms over time!</p>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="margin-top:0; color:#1976d2;">📝 Setup Steps (5 minutes):</h3>
        <ol style="line-height:1.8; padding-left: 20px;">
          <li>Go to <a href="https://www.sentinel-hub.com/" target="_blank" style="color:#1976d2; font-weight:600;">sentinel-hub.com</a></li>
          <li>Click "Sign Up" → Choose <strong>"Trial"</strong> (FREE forever!)</li>
          <li>Verify your email</li>
          <li>Go to Dashboard → "Configuration Utility"</li>
          <li>Create new configuration → Select "Sentinel-2 L2A"</li>
          <li>Copy your <strong>Instance ID</strong> (looks like: abc123-def4-5678-90gh-ijklmnopqrst)</li>
          <li>Paste it below and save!</li>
        </ol>
      </div>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h4 style="margin-top:0;">💡 Free Tier Limits:</h4>
        <ul style="line-height:1.6;">
          <li>✅ 1,000 requests/month (plenty for farm checking!)</li>
          <li>✅ No credit card required</li>
          <li>✅ Full resolution 10m imagery</li>
          <li>✅ Complete archive from 2015-present</li>
        </ul>
      </div>
      
      <label style="display:block; margin: 20px 0 8px; font-weight:600;">Your Instance ID:</label>
      <input 
        type="text" 
        id="sentinelHubInstanceInput" 
        placeholder="abc123-def4-5678-90gh-ijklmnopqrst"
        value="${currentId}"
        style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 14px;"
      />
      
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="saveSentinelHubConfig()" style="flex:1; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
          💾 Save & Unlock
        </button>
        <button onclick="closeModal()" style="padding: 12px 20px; background: #999; color: white; border: none; border-radius: 6px; cursor: pointer;">
          Cancel
        </button>
      </div>
      
      <p style="margin-top: 15px; font-size: 12px; color: #666;">
        <strong>Don't want to sign up?</strong> Use "Sentinel-2 Cloudless (EOx)" for FREE high-res imagery (single year only).
      </p>
    </div>
  `;
  
  showModal(setupHtml);
}

/**
 * Save Sentinel Hub instance ID and unlock the provider
 */
function saveSentinelHubConfig() {
  const input = document.getElementById('sentinelHubInstanceInput');
  const instanceId = input?.value?.trim();
  
  if (!instanceId) {
    showToast('❌ Please enter your Instance ID');
    return;
  }
  
  // Basic validation - Sentinel Hub instance IDs are UUIDs
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuidPattern.test(instanceId)) {
    showToast('❌ Invalid Instance ID format. Should be like: abc123-def4-5678-90gh-ijklmnopqrst');
    return;
  }
  
  gameState.sentinelHubInstanceId = instanceId;
  
  // Auto-unlock Sentinel Hub provider
  if (!gameState.unlockedSatelliteProviders) {
    gameState.unlockedSatelliteProviders = ['esri'];
  }
  if (!gameState.unlockedSatelliteProviders.includes('sentinel_hub')) {
    gameState.unlockedSatelliteProviders.push('sentinel_hub');
  }
  
  saveGameState();
  updateUI();
  renderSatelliteProviderShop();
  closeModal();
  
  showToast('🎯 Sentinel Hub configured! Switch to it in the provider menu.');
}

function unlockHistoricalMode() {
  if (gameState.historicalUnlocked) {
    showToast('Historical Mode already unlocked!');
    return;
  }
  
  const price = GAME_CONSTANTS.HISTORICAL_MODE_PRICE;
  
  if (gameState.points < price) {
    showToast('Not enough points!');
    return;
  }
  
  gameState.points -= price;
  gameState.historicalUnlocked = true;
  gameState.unlockedHistoricalYears = [2024]; // Start with current year
  
  saveGameState();
  updateUI();
  renderFeaturesShop();
  
  showToast('📅 Historical Mode unlocked! Use the button on the map.');
}

function unlockZone(zoneIndex) {
  const zone = zones[zoneIndex];
  
  if (gameState.unlockedZones.includes(zoneIndex)) {
    showToast('Zone already unlocked!');
    return;
  }
  
  if (gameState.points < zone.unlockPrice) {
    showToast('Not enough points!');
    return;
  }
  
  // Deduct points
  gameState.points -= zone.unlockPrice;
  
  // Unlock zone
  gameState.unlockedZones.push(zoneIndex);
  
  // Save and update
  saveGameState();
  updateUI();
  
  // Refresh shop
  openShop();
  
  // Update zone markers
  showZoneMarkers();
  
  showToast(`🌾 ${zone.name} unlocked!`);
}

function unlockTheme(themeId, price) {
  if (gameState.unlockedThemes.includes(themeId)) {
    showToast('Theme already unlocked!');
    return;
  }
  
  if (gameState.points < price) {
    showToast('Not enough points!');
    return;
  }
  
  // Deduct points
  gameState.points -= price;
  
  // Unlock theme
  gameState.unlockedThemes.push(themeId);
  
  // Save and update
  saveGameState();
  updateUI();
  
  // Refresh shop
  openShop();
  
  showToast(`🎨 Theme unlocked! Select it in the menu`);
}

function unlockCursor(cursorId, price) {
  if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
  
  if (gameState.unlockedCursors.includes(cursorId)) {
    showToast('Cursor already unlocked!');
    return;
  }
  
  if (gameState.points < price) {
    showToast('Not enough points!');
    return;
  }
  
  // Deduct points
  gameState.points -= price;
  
  // Unlock cursor
  gameState.unlockedCursors.push(cursorId);
  
  // Save and update
  saveGameState();
  updateUI();
  
  // Refresh shop and cursor options
  openShop();
  renderCursorOptions();
  
  showToast(`✨ Cursor unlocked! Select it in the menu`);
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
      <div class="badge-icon">${isEarned ? badge.icon : '🔒'}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.description}</div>
    `;
    badgesList.appendChild(item);
  });
  
  document.getElementById('badgesModal').classList.add('active');
}

function shareBadges() {
  const earnedBadges = BADGE_DEFINITIONS.filter(b => gameState.badges.includes(b.id));
  const badgeText = earnedBadges.map(b => `${b.icon} ${b.name}`).join('\n');
  
  const shareText = `🌾 My FarmMap Zone Quest Achievements!\n\n${badgeText}\n\n📊 ${gameState.totalVotes} votes · 🪙 ${gameState.points} points\n\nHelp identify factory farms: [Your URL]`;
  
  // Copy to clipboard
  navigator.clipboard.writeText(shareText).then(() => {
    showToast('✓ Badges copied to clipboard!');
  }).catch(() => {
    // Fallback: show in alert
    alert(shareText);
  });
}

/* ==================== LEADERBOARD ==================== */

function openLeaderboard() {
  generateLeaderboard('all');
  document.getElementById('leaderboardModal').classList.add('active');
}

function generateLeaderboard(period) {
  // Simulated leaderboard data
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
  
  // Add current user
  const userEntry = { name: 'You', points: gameState.points, isYou: true };
  leaderboard.push(userEntry);
  
  // Sort by points
  leaderboard.sort((a, b) => b.points - a.points);
  
  // Find user rank
  const userRank = leaderboard.findIndex(e => e.isYou) + 1;
  
  // Render leaderboard
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
      <div class="leaderboard-points">${entry.points}</div>
    `;
    list.appendChild(item);
  });
  
  document.getElementById('yourRank').textContent = `#${userRank}`;
  
  // Update filter buttons
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

/* ==================== POWER-UPS ====================
 * Temporary boosts that enhance gameplay:
 * - 2x Points: Double points for 10 minutes
 * - 3x Points: Triple points for 5 minutes  
 * - Mystery Box: Random rewards
 * ==================== */

function activatePowerUp(powerUpId) {
  const POWERUP_DEFINITIONS = [
    { id: 'double_points', name: '2x Points', price: GAME_CONSTANTS.DOUBLE_POINTS_PRICE, duration: GAME_CONSTANTS.DOUBLE_POINTS_DURATION, emoji: '🔥' },
    { id: 'triple_points', name: '3x Points', price: GAME_CONSTANTS.TRIPLE_POINTS_PRICE, duration: GAME_CONSTANTS.TRIPLE_POINTS_DURATION, emoji: '⚡' },
    { id: 'mystery_reveal', name: 'Mystery Box', price: GAME_CONSTANTS.MYSTERY_BOX_PRICE, duration: 0, emoji: '🎁' }
  ];
  
  const powerUp = POWERUP_DEFINITIONS.find(p => p.id === powerUpId);
  if (!powerUp) return;
  
  if (gameState.points < powerUp.price) {
    showToast('Not enough points!');
    return;
  }
  
  // Deduct points
  gameState.points -= powerUp.price;
  
  if (powerUpId === 'mystery_reveal') {
    gameState.mysteryBoxes++;
    showToast('🎁 Mystery Box added!');
  } else {
    gameState.activePowerUp = {
      type: powerUpId,
      expiresAt: Date.now() + powerUp.duration
    };
    
    const minutes = Math.floor(powerUp.duration / 60000);
    showToast(`${powerUp.emoji} ${powerUp.name} active for ${minutes} minutes!`);
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
    const powerUpMap = {
      'double_points': { emoji: '🔥', name: '2x Points' },
      'triple_points': { emoji: '⚡', name: '3x Points' }
    };
    
    const powerUp = powerUpMap[gameState.activePowerUp.type];
    if (!powerUp) {
      container.style.display = 'none';
      return;
    }
    
    const remaining = Math.ceil((gameState.activePowerUp.expiresAt - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    
    container.innerHTML = `${powerUp.emoji} ${powerUp.name}: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    container.style.display = 'block';
    
    setTimeout(updateActivePowerUpDisplay, 1000);
  } else {
    container.style.display = 'none';
    if (gameState.activePowerUp) {
      gameState.activePowerUp = null;
      saveGameState();
    }
  }
}

function openMysteryBox() {
  if (gameState.mysteryBoxes <= 0) {
    showToast('No mystery boxes available!');
    return;
  }
  
  gameState.mysteryBoxes--;
  
  const rewards = [
    { type: 'points', value: 500, text: '🪙 500 Points!', weight: 30 },
    { type: 'points', value: 1000, text: '🪙 1000 Points!', weight: 20 },
    { type: 'points', value: 2000, text: '🪙 2000 Points!', weight: 10 },
    { type: 'avatar', text: '🎭 New Avatar!', weight: 15 },
    { type: 'theme', text: '🎨 Free Theme!', weight: 15 },
    { type: 'cursor', text: '✨ New Cursor!', weight: 10 }
  ];
  
  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  let reward = rewards[0];
  
  for (const r of rewards) {
    random -= r.weight;
    if (random <= 0) {
      reward = r;
      break;
    }
  }
  
  if (reward.type === 'points') {
    gameState.points += reward.value;
  } else if (reward.type === 'avatar') {
    const avatars = ['detective', 'scientist', 'explorer', 'robot', 'astronaut'];
    if (!gameState.unlockedAvatars) gameState.unlockedAvatars = ['farmer'];
    const locked = avatars.filter(a => !gameState.unlockedAvatars.includes(a));
    if (locked.length > 0) {
      const newAvatar = locked[Math.floor(Math.random() * locked.length)];
      gameState.unlockedAvatars.push(newAvatar);
      renderAvatarOptions();
    } else {
      gameState.points += 1000;
      reward.text = '🪙 1000 Points! (All avatars unlocked)';
    }
  } else if (reward.type === 'theme') {
    const themes = ['ocean', 'sunset', 'midnight'];
    const locked = themes.filter(t => !gameState.unlockedThemes.includes(t));
    if (locked.length > 0) {
      const newTheme = locked[Math.floor(Math.random() * locked.length)];
      gameState.unlockedThemes.push(newTheme);
      renderThemeOptions();
    } else {
      gameState.points += 500;
      reward.text = '🪙 500 Points! (All themes unlocked)';
    }
  } else if (reward.type === 'cursor') {
    const cursors = ['pointer', 'crosshair', 'hand', 'sparkle'];
    if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
    const locked = cursors.filter(c => !gameState.unlockedCursors.includes(c));
    if (locked.length > 0) {
      const newCursor = locked[Math.floor(Math.random() * locked.length)];
      gameState.unlockedCursors.push(newCursor);
      renderCursorOptions();
    } else {
      gameState.points += 500;
      reward.text = '🪙 500 Points! (All cursors unlocked)';
    }
  }
  
  saveGameState();
  updateUI();
  showToast(`🎁 ${reward.text}`);
  closeModal('mysteryBoxModal');
}

/* ==================== HISTORICAL IMAGERY ====================
 * Time-travel feature allowing users to view satellite imagery from past years
 * 
 * Three approaches:
 * 1. REAL DATA (FREE): NASA GIBS provides actual historical tiles
 *    - MODIS: 2000-2024, but LOW RESOLUTION (250m-1km) - too zoomed out for farms
 *    - Best for: Regional trends, large-scale land use changes
 * 
 * 2. REAL DATA (FREE with signup): Sentinel Hub Free Tier
 *    - Sentinel-2: 10m resolution, 2015-present
 *    - Free tier: 1000 Processing Units/month (~1000 tile requests)
 *    - Requires API key: https://www.sentinel-hub.com/
 *    - BEST FOR FARM IDENTIFICATION!
 * 
 * 3. SIMULATED: Visual filters applied to current imagery
 *    - Used as fallback when real data unavailable
 *    - Educational purposes only
 * 
 * Current implementation:
 * - MODIS works but too low resolution
 * - Sentinel-2 Cloudless (EOx) is FREE and high-res but single year only
 * - For real historical Sentinel-2, implement Sentinel Hub integration
 * ==================== */

let historicalLayer = null;
let isHistoricalMode = false;

function toggleHistoricalMode() {
  if (!gameState.historicalUnlocked) {
    showToast('🔒 Unlock Historical Mode in the shop!');
    return;
  }
  
  isHistoricalMode = !isHistoricalMode;
  
  const btn = document.getElementById('historicalToggle');
  const slider = document.getElementById('historicalSlider');
  
  if (isHistoricalMode) {
    btn.classList.add('active');
    btn.textContent = '📅 Exit Historical Mode';
    slider.style.display = 'block';
    showToast('📅 Historical Mode activated');
    
    // Load initial historical layer
    updateHistoricalLayer(gameState.currentHistoricalYear || 2024);
  } else {
    btn.classList.remove('active');
    btn.textContent = '📅 Historical Mode';
    slider.style.display = 'none';
    
    // Remove historical layer
    if (historicalLayer) {
      map.removeLayer(historicalLayer);
      historicalLayer = null;
    }
    
    showToast('Returned to current satellite view');
  }
}

// Satellite provider definitions
const SATELLITE_PROVIDERS = {
  esri: {
    name: 'Esri WorldImagery',
    description: 'High-resolution satellite imagery (Current data with visual time simulation)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    price: 0, // Default provider
    emoji: '🛰️',
    yearCoverage: '2000-2024*',
    maxZoom: 19
  },
  google: {
    name: 'Google Satellite',
    description: 'Google\'s satellite imagery with frequent updates',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google',
    price: 500,
    emoji: '🌍',
    yearCoverage: '2010-2024',
    maxZoom: 20
  },
  carto_light: {
    name: 'CARTO Light',
    description: 'Clean, minimal satellite basemap',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© CARTO',
    price: 300,
    emoji: '🗺️',
    yearCoverage: '2015-2024',
    maxZoom: 19
  },
  carto_dark: {
    name: 'CARTO Dark',
    description: 'Dark mode satellite view',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© CARTO',
    price: 300,
    emoji: '🌙',
    yearCoverage: '2015-2024',
    maxZoom: 19
  },
  osm: {
    name: 'OpenStreetMap',
    description: 'Community-driven street map with global coverage',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    price: 200,
    emoji: '🗺️',
    yearCoverage: '2005-2024',
    maxZoom: 19
  },
  stamen_terrain: {
    name: 'Stamen Terrain',
    description: 'Terrain and elevation visualization',
    url: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: '© Stamen Design',
    price: 250,
    emoji: '⛰️',
    yearCoverage: '2010-2024',
    maxZoom: 18
  },
  stamen_toner: {
    name: 'Stamen Toner',
    description: 'High-contrast black and white map',
    url: 'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    attribution: '© Stamen Design',
    price: 250,
    emoji: '⬛',
    yearCoverage: '2010-2024',
    maxZoom: 18
  },
  stamen_watercolor: {
    name: 'Stamen Watercolor',
    description: 'Artistic watercolor-style map',
    url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
    attribution: '© Stamen Design',
    price: 400,
    emoji: '🎨',
    yearCoverage: '2012-2024',
    maxZoom: 16
  },
  opentopomap: {
    name: 'OpenTopoMap',
    description: 'Topographic map based on OSM data',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap',
    price: 350,
    emoji: '🗻',
    yearCoverage: '2010-2024',
    maxZoom: 17
  },
  usgs: {
    name: 'USGS Imagery',
    description: 'US Geological Survey satellite imagery',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: '© USGS',
    price: 600,
    emoji: '🇺🇸',
    yearCoverage: '2005-2024',
    maxZoom: 16
  },
  usgs_topo: {
    name: 'USGS Historical Topos',
    description: 'Genuine historical topographic maps from 1880s-2000s',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: '© USGS',
    price: 800,
    emoji: '📜',
    yearCoverage: '1880-2024 (Real)',
    maxZoom: 16
  },
  thunderforest_landscape: {
    name: 'Thunderforest Landscape',
    description: 'Detailed landscape and terrain visualization',
    url: 'https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=',
    attribution: '© Thunderforest',
    price: 450,
    emoji: '🏔️',
    yearCoverage: '2012-2024',
    maxZoom: 18,
    requiresApiKey: true
  },
  arcgis_world_street: {
    name: 'ArcGIS World Street',
    description: 'Detailed street map with different historical rendering',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    price: 350,
    emoji: '🛣️',
    yearCoverage: '2000-2024',
    maxZoom: 19
  },
  sentinel2: {
    name: 'Sentinel-2 (ESA)',
    description: 'European satellite with 10m resolution, excellent for agriculture monitoring in Southeast Asia',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© ESA/Copernicus',
    price: 650,
    emoji: '🇪🇺',
    yearCoverage: '2015-2024',
    maxZoom: 18,
    historicalNote: 'Current simulation - for REAL historical Sentinel-2, use Sentinel Hub (free tier available)'
  },
  sentinel2_cloudless: {
    name: 'Sentinel-2 Cloudless (EOx)',
    description: 'FREE 10m resolution cloudless Sentinel-2 mosaic - perfect for farm identification! Updated regularly with latest imagery.',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: '© EOx - Sentinel-2 cloudless by EOx',
    price: 0,
    emoji: '☁️',
    yearCoverage: '2022 (Cloudless composite)',
    maxZoom: 15,
    historicalNote: 'Single year composite - for timelapse, use Sentinel Hub API'
  },
  sentinel_hub: {
    name: 'Sentinel Hub (Real Historical!)',
    description: '🎯 BEST OPTION! FREE 10m resolution Sentinel-2 with REAL historical data from 2015-present. Perfect for farm identification over time. Requires free signup.',
    url: 'SENTINEL_HUB', // Special handler - requires configuration
    attribution: '© Sentinel Hub / ESA Copernicus',
    price: 0,
    emoji: '🎯',
    yearCoverage: '2015-2024 (Real)',
    maxZoom: 16,
    hasRealHistorical: true,
    requiresDate: true,
    requiresSetup: true,
    setupInstructions: 'Get free instance ID at sentinel-hub.com'
  },
  planet_skysat: {
    name: 'Planet SkySat',
    description: 'Commercial high-resolution satellite with daily global coverage and sub-meter imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Planet Labs',
    price: 900,
    emoji: '🌐',
    yearCoverage: '2016-2024',
    maxZoom: 19
  },
  landsat: {
    name: 'Landsat (NASA/USGS)',
    description: 'Long-running Earth observation program with 30m resolution and historical data since 1984',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: '© NASA/USGS',
    price: 550,
    emoji: '🛰️',
    yearCoverage: '1984-2024 (Real)',
    maxZoom: 17,
    hasRealHistorical: true,
    historicalNote: 'Visual simulation only - true historical Landsat requires Google Earth Engine'
  },
  modis: {
    name: 'MODIS (NASA Terra)',
    description: 'NASA satellite with daily global coverage and TRUE historical data via NASA GIBS from 2000-present. Low resolution (250m-1km) - good for regional view, but TOO ZOOMED OUT for individual farms.',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    attribution: '© NASA EOSDIS',
    price: 600,
    emoji: '🛰️',
    yearCoverage: '2000-2024 (Real)',
    maxZoom: 9,
    hasRealHistorical: true,
    requiresDate: true,
    historicalNote: 'Max zoom too low for farm-level detail - use for regional context only'
  },
  maxar_worldview: {
    name: 'Maxar WorldView',
    description: 'Ultra high-resolution commercial satellite imagery with 0.31m resolution for detailed farm inspection',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Maxar',
    price: 1200,
    emoji: '🔬',
    yearCoverage: '2014-2024',
    maxZoom: 20
  }
};

/**
 * Create a custom tile URL function for Sentinel Hub WMS
 * @param {string} instanceId - Sentinel Hub instance ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {string} - Template URL for Leaflet tile loading
 */
function createSentinelHubTileUrl(instanceId, date) {
  // Sentinel Hub uses WMS, which requires bbox per tile
  // We create a custom URL that will be processed by a tile loading function
  // Store the date and instanceId for use in tile loading
  window._sentinelHubConfig = { instanceId, date };
  
  // For Leaflet compatibility, we use their Process API with tile endpoint
  // Format: https://sh.dataspace.copernicus.eu/ogc/wms/{instanceId}
  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`;
  
  // WMS parameters for Sentinel-2 L2A true color
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    LAYERS: 'TRUE-COLOR',
    MAXCC: '20', // Max 20% cloud coverage
    WIDTH: '512',
    HEIGHT: '512',
    FORMAT: 'image/jpeg',
    TIME: `${date}/${date}`,
    CRS: 'EPSG:3857'
  });
  
  // Return URL template - Leaflet will replace bbox
  // We'll use a custom tile layer to calculate bbox per tile
  return `${baseUrl}?${params.toString()}&BBOX={bbox}`;
}

/**
 * Convert tile coordinates to Web Mercator bbox
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level  
 * @returns {string} - Bbox string "minx,miny,maxx,maxy"
 */
function tileToBbox(x, y, z) {
  const tileSize = 256;
  const earthCircumference = 40075016.686; // meters
  const tileCount = Math.pow(2, z);
  const tileMeters = earthCircumference / tileCount;
  
  const minx = (x * tileMeters) - (earthCircumference / 2);
  const maxx = ((x + 1) * tileMeters) - (earthCircumference / 2);
  const miny = (earthCircumference / 2) - ((y + 1) * tileMeters);
  const maxy = (earthCircumference / 2) - (y * tileMeters);
  
  return `${minx},${miny},${maxx},${maxy}`;
}

/**
 * Updates the map layer to show satellite imagery from a specific historical year
 * Handles both real historical data (NASA GIBS) and simulated visual effects
 * @param {number} year - The year to display (1984-2024)
 */
function updateHistoricalLayer(year) {
  if (!gameState.historicalUnlocked) return;
  
  gameState.currentHistoricalYear = year;
  
  // Get current provider
  const providerId = gameState.currentSatelliteProvider || 'esri';
  const provider = SATELLITE_PROVIDERS[providerId];
  
  console.log('🔄 Updating historical layer:', { year, providerId, provider: provider?.name });
  
  if (!provider) {
    console.error('Unknown provider:', providerId);
    return;
  }
  
  // Check if provider has REAL historical data capability
  const hasRealHistoricalData = provider.hasRealHistorical === true;
  const requiresDate = provider.requiresDate === true;
  
  // Calculate visual effects based on year age
  const yearAge = 2024 - year;
  
  let filterString = '';
  let simulationNote = '';
  let tileUrl = provider.url;
  
  // Special handling for Sentinel Hub (requires custom URL construction)
  if (providerId === 'sentinel_hub') {
    const instanceId = gameState.sentinelHubInstanceId;
    
    if (!instanceId) {
      showToast('⚙️ Please configure Sentinel Hub first (click Setup button)');
      return;
    }
    
    // Convert year to date format
    const dateStr = `${year}-07-01`;
    
    // Construct Sentinel Hub WMS URL for Leaflet tiles
    // Using WMS GetMap with bbox calculation per tile
    tileUrl = createSentinelHubTileUrl(instanceId, dateStr);
    
    console.log('🎯 Using Sentinel Hub REAL historical data:', { dateStr, instanceId: instanceId.substring(0, 8) + '...' });
    
    filterString = '';
    simulationNote = ' (Real Sentinel-2 satellite data)';
    
    const noteElement = document.getElementById('historicalNote');
    if (noteElement) {
      noteElement.innerHTML = `🎯 Real historical Sentinel-2 data (10m resolution) - ${dateStr}`;
      noteElement.style.color = '#2e7d32';
      noteElement.style.fontWeight = '600';
    }
  }
  // For providers that require date parameter (like NASA GIBS)
  else if (requiresDate && hasRealHistoricalData) {
    // Convert year to date format (use July 1st as middle of year for best coverage)
    const dateStr = `${year}-07-01`;
    tileUrl = provider.url.replace('{date}', dateStr);
    
    console.log('✅ Using REAL historical data:', { dateStr, tileUrl: tileUrl.substring(0, 100) + '...' });
    
    // Minimal filtering for real data
    filterString = '';
    simulationNote = ' (Real NASA satellite data)';
    
    // Update the note in the UI
    const noteElement = document.getElementById('historicalNote');
    if (noteElement) {
      noteElement.innerHTML = `✅ Real historical satellite data from NASA - ${dateStr}`;
      noteElement.style.color = '#2e7d32';
      noteElement.style.fontWeight = '600';
    }
  } else if (hasRealHistoricalData) {
    // Provider claims historical data but uses standard tiles (simulated)
    const opacity = Math.max(0.85, 1 - (yearAge * 0.01));
    filterString = `opacity(${opacity})`;
    simulationNote = provider.historicalNote ? ` - Note: ${provider.historicalNote}` : ' (Simulated)';
    
    const noteElement = document.getElementById('historicalNote');
    if (noteElement) {
      noteElement.innerHTML = `⚠️ ${provider.historicalNote || 'Simulated historical view - not actual historical tiles'}`;
      noteElement.style.color = '#f57c00';
      noteElement.style.fontWeight = '500';
    }
  } else {
    // No historical data - full simulation with visual filters
    const opacity = Math.max(0.6, 1 - (yearAge * 0.04));
    const sepia = Math.min(yearAge * 0.08, 0.5);
    const brightness = Math.max(0.7, 1 - (yearAge * 0.02));
    const contrast = 1 + (yearAge * 0.03);
    
    filterString = `brightness(${brightness}) contrast(${contrast}) sepia(${sepia}) opacity(${opacity})`;
    simulationNote = yearAge > 10 ? ' (Simulated vintage)' : yearAge > 0 ? ' (Simulated)' : '';
    
    const noteElement = document.getElementById('historicalNote');
    if (noteElement) {
      noteElement.innerHTML = `💡 Visual simulation - vintage effects applied to current imagery`;
      noteElement.style.color = '#666';
      noteElement.style.fontWeight = 'normal';
    }
  }
  
  // Store reference to old layer BEFORE creating new one
  const oldLayer = historicalLayer;
  
  // Create new layer with unique class
  const timestamp = Date.now();
  
  // Special handling for Sentinel Hub WMS (requires bbox calculation per tile)
  let newLayer;
  if (providerId === 'sentinel_hub') {
    newLayer = L.tileLayer(
      tileUrl,
      { 
        attribution: `${provider.attribution} - ${year}${simulationNote}`,
        maxZoom: provider.maxZoom,
        className: `historical-tiles-${timestamp}`,
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        tileLoadFunction: function(tile, tilePoint, zoom) {
          // Replace {bbox} with actual bbox for this tile
          const bbox = tileToBbox(tilePoint.x, tilePoint.y, zoom);
          tile.src = tileUrl.replace('{bbox}', bbox);
        }
      }
    );
    
    // Override getTileUrl to inject bbox
    const originalGetTileUrl = newLayer.getTileUrl;
    newLayer.getTileUrl = function(coords) {
      const bbox = tileToBbox(coords.x, coords.y, coords.z);
      return tileUrl.replace('{bbox}', bbox);
    };
  } else {
    newLayer = L.tileLayer(
      tileUrl,
      { 
        attribution: `${provider.attribution} - ${year}${simulationNote}`,
        maxZoom: provider.maxZoom,
        className: `historical-tiles-${timestamp}`,
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' // Transparent 1x1 for missing tiles
      }
    );
  }
  
  // Add debugging event handlers for tile loading
  newLayer.on('tileloadstart', (e) => {
    console.log('📡 Tile request:', e.url);
  });
  
  newLayer.on('tileerror', (e) => {
    console.error('❌ Tile load error:', e.url, e.error);
  });
  
  newLayer.on('tileload', (e) => {
    console.log('✅ Tile loaded successfully:', e.url);
  });
  
  // Update reference immediately
  historicalLayer = newLayer;
  
  // Add new layer to map
  map.addLayer(newLayer);
  
  // Apply CSS filters to the new layer only
  setTimeout(() => {
    const tiles = document.querySelectorAll(`.historical-tiles-${timestamp}`);
    tiles.forEach(tile => {
      tile.style.filter = filterString;
    });
  }, 100);
  
  // Remove old layer after new one loads (only if it exists)
  if (oldLayer) {
    setTimeout(() => {
      try {
        map.removeLayer(oldLayer);
      } catch (e) {
        console.log('Old layer already removed');
      }
    }, 500);
  }
  
  // Update display
  const displayElement = document.getElementById('yearDisplay');
  if (displayElement) {
    const shortName = provider.name.replace('Stamen ', '').replace('CARTO ', '');
    displayElement.textContent = `${year} - ${shortName}`;
  }
  
  const providerDisplay = document.getElementById('currentProviderDisplay');
  if (providerDisplay) {
    providerDisplay.textContent = `${provider.emoji} ${provider.name}`;
  }
  
  saveGameState();
  
  // Show toast with appropriate icon based on data type
  const toastIcon = requiresDate && hasRealHistoricalData ? '✅' : hasRealHistoricalData ? '⚠️' : '📅';
  showToast(`${toastIcon} ${year} - ${provider.name}${simulationNote}`);
}

function toggleProviderMenu() {
  const menu = document.getElementById('providerMenu');
  if (!menu) return;
  
  if (menu.style.display === 'none' || !menu.style.display) {
    // Populate and show menu
    menu.innerHTML = '';
    
    if (!gameState.unlockedSatelliteProviders) gameState.unlockedSatelliteProviders = ['esri'];
    
    gameState.unlockedSatelliteProviders.forEach(providerId => {
      const provider = SATELLITE_PROVIDERS[providerId];
      if (!provider) return;
      
      const option = document.createElement('div');
      option.className = `provider-option ${gameState.currentSatelliteProvider === providerId ? 'active' : ''}`;
      option.innerHTML = `
        <div class="provider-name">${provider.emoji} ${provider.name}</div>
        <div class="provider-coverage">Coverage: ${provider.yearCoverage}</div>
      `;
      option.onclick = () => switchSatelliteProvider(providerId);
      menu.appendChild(option);
    });
    
    menu.style.display = 'block';
  } else {
    menu.style.display = 'none';
  }
}

/**
 * Switch to a different satellite imagery provider
 * Updates the map layer and re-applies current historical year
 * @param {string} providerId - ID of provider to switch to
 */
function switchSatelliteProvider(providerId) {
  const provider = SATELLITE_PROVIDERS[providerId];
  if (!provider) return;
  
  if (!gameState.unlockedSatelliteProviders.includes(providerId)) {
    showToast('🔒 Provider locked! Unlock in shop.');
    return;
  }
  
  gameState.currentSatelliteProvider = providerId;
  
  // Update the layer with current year
  updateHistoricalLayer(gameState.currentHistoricalYear || 2024);
  
  // Close menu
  const menu = document.getElementById('providerMenu');
  if (menu) menu.style.display = 'none';
  
  saveGameState();
}

function unlockHistoricalYear(year) {
  if (!gameState.unlockedHistoricalYears) gameState.unlockedHistoricalYears = [2024];
  
  if (gameState.unlockedHistoricalYears.includes(year)) {
    showToast('Year already unlocked!');
    return;
  }
  
  // Use same pricing logic as shop display
  const yearDiff = 2024 - year;
  const price = yearDiff <= 4 ? 200 : 
                yearDiff <= 9 ? 300 :
                yearDiff <= 14 ? 400 :
                yearDiff <= 19 ? 500 :
                yearDiff <= 24 ? 700 :
                yearDiff <= 29 ? 900 :
                yearDiff <= 34 ? 1100 :
                yearDiff <= 39 ? 1300 : 1500;
  
  if (gameState.points < price) {
    showToast('Not enough points!');
    return;
  }
  
  gameState.points -= price;
  gameState.unlockedHistoricalYears.push(year);
  
  saveGameState();
  updateUI();
  renderHistoricalShop();
  
  showToast(`📅 Year ${year} unlocked!`);
}

function renderHistoricalShop() {
  const container = document.getElementById('historicalYearShopItems');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!gameState.unlockedHistoricalYears) gameState.unlockedHistoricalYears = [2024];
  
  // Extended years to support Landsat's historical range back to 1984
  const years = [2020, 2015, 2010, 2005, 2000, 1995, 1990, 1985, 1984];
  
  years.forEach(year => {
    const isUnlocked = gameState.unlockedHistoricalYears.includes(year);
    // Dynamic pricing - older years cost more
    const yearDiff = 2024 - year;
    const price = yearDiff <= 4 ? 200 : 
                  yearDiff <= 9 ? 300 :
                  yearDiff <= 14 ? 400 :
                  yearDiff <= 19 ? 500 :
                  yearDiff <= 24 ? 700 :
                  yearDiff <= 29 ? 900 :
                  yearDiff <= 34 ? 1100 :
                  yearDiff <= 39 ? 1300 : 1500;
    const canAfford = gameState.points >= price;
    
    const item = document.createElement('div');
    item.className = `shop-item ${isUnlocked ? 'unlocked' : ''}`;
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${isUnlocked ? '📅' : '🔒'} Year ${year}</div>
        <div class="shop-item-desc">${2024 - year} years back in time</div>
      </div>
      <div class="shop-item-action">
        ${isUnlocked 
          ? '<span class="shop-item-unlocked">✓ Unlocked</span>'
          : `<button class="btn-buy" ${canAfford ? '' : 'disabled'} onclick="unlockHistoricalYear(${year})">
              💰 ${price} points
            </button>`
        }
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * Handle user interaction with the historical year slider
 * @param {string} value - Slider position (0-10)
 */
function handleYearSlide(value) {
  if (!gameState.historicalUnlocked) return;
  
  // Map slider values (0-10) to available years - extended to 1984 for Landsat
  const allYears = [2024, 2020, 2015, 2010, 2005, 2000, 1995, 1990, 1985, 1984];
  const selectedYear = allYears[parseInt(value)];
  
  // Check if year is unlocked
  if (!gameState.unlockedHistoricalYears) gameState.unlockedHistoricalYears = [2024];
  
  if (!gameState.unlockedHistoricalYears.includes(selectedYear)) {
    showToast(`🔒 Year ${selectedYear} is locked! Unlock it in the shop.`);
    // Reset slider to current year
    const currentIndex = allYears.indexOf(gameState.currentHistoricalYear);
    document.getElementById('yearSlider').value = currentIndex;
    return;
  }
  
  updateHistoricalLayer(selectedYear);
}

/* ==================== THEMES ==================== */

function renderCursorOptions() {
  const container = document.getElementById('cursorOptions');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!gameState.unlockedCursors) gameState.unlockedCursors = [];
  if (!gameState.currentCursor) gameState.currentCursor = 'default';
  
  const cursors = [
    { id: 'default', name: 'Default', emoji: '🖱️' },
    { id: 'pointer', name: 'Fancy Pointer', emoji: '👆' },
    { id: 'crosshair', name: 'Crosshair', emoji: '🎯' },
    { id: 'hand', name: 'Hand', emoji: '👋' },
    { id: 'sparkle', name: 'Sparkle', emoji: '✨' }
  ];
  
  cursors.forEach(cursor => {
    const isUnlocked = cursor.id === 'default' || gameState.unlockedCursors.includes(cursor.id);
    const isActive = gameState.currentCursor === cursor.id;
    
    if (!isUnlocked) return;
    
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `
      <div style="font-size: 20px;">${cursor.emoji}</div>
      <div class="theme-name">${cursor.name}</div>
    `;
    
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
    { id: 'farmer', name: 'Farmer', emoji: '👨‍🌾' },
    { id: 'detective', name: 'Detective', emoji: '🕵️' },
    { id: 'scientist', name: 'Scientist', emoji: '👨‍🔬' },
    { id: 'explorer', name: 'Explorer', emoji: '🧭' },
    { id: 'robot', name: 'Robot', emoji: '🤖' },
    { id: 'astronaut', name: 'Astronaut', emoji: '👨‍🚀' }
  ];
  
  avatars.forEach(avatar => {
    const isUnlocked = gameState.unlockedAvatars.includes(avatar.id);
    const isActive = gameState.currentAvatar === avatar.id;
    
    if (!isUnlocked) return;
    
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `
      <div style="font-size: 20px;">${avatar.emoji}</div>
      <div class="theme-name">${avatar.name}</div>
    `;
    
    option.onclick = () => {
      gameState.currentAvatar = avatar.id;
      saveGameState();
      updateAvatarDisplay();
      renderAvatarOptions();
      showToast(`${avatar.emoji} Avatar changed!`);
    };
    
    container.appendChild(option);
  });
}

function updateAvatarDisplay() {
  const avatars = {
    'farmer': '👨‍🌾',
    'detective': '🕵️',
    'scientist': '👨‍🔬',
    'explorer': '🧭',
    'robot': '🤖',
    'astronaut': '👨‍🚀'
  };
  
  const emoji = avatars[gameState.currentAvatar] || '👨‍🌾';
  const displays = document.querySelectorAll('.user-avatar');
  displays.forEach(d => d.textContent = emoji);
}

function applyCursor(cursorId) {
  const cursorMap = {
    'default': 'default',
    'pointer': 'pointer',
    'crosshair': 'crosshair',
    'hand': 'grab',
    'sparkle': 'pointer'
  };
  
  document.body.style.cursor = cursorMap[cursorId] || 'default';
  showToast(`✨ Cursor changed!`);
}

function renderThemeOptions() {
  const container = document.getElementById('themeOptions');
  container.innerHTML = ''; // Clear existing options to prevent duplication
  
  const themes = [
    { id: 'default', name: 'Default Green', color: '#2e7d32' },
    { id: 'dark', name: 'Dark Mode', color: '#1a237e' },
    { id: 'ocean', name: 'Ocean', color: '#1976d2' },
    { id: 'sunset', name: 'Sunset', color: '#ef6c00' },
    { id: 'midnight', name: 'Midnight', color: '#7b1fa2' }
  ];
  
  themes.forEach(theme => {
    const isUnlocked = theme.id === 'default' || theme.id === 'dark' || gameState.unlockedThemes.includes(theme.id);
    const isActive = gameState.currentTheme === theme.id;
    
    if (!isUnlocked) return;
    
    const option = document.createElement('div');
    option.className = `theme-option ${isActive ? 'active' : ''}`;
    option.innerHTML = `
      <div class="theme-color" style="background: ${theme.color};"></div>
      <div class="theme-name">${theme.name}</div>
    `;
    
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
  document.documentElement.style.setProperty('--green', theme.color);
  
  // Apply dark mode if selected
  if (theme.id === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  showToast(`🎨 Theme changed to ${theme.name}`);
}

/* ==================== UI UPDATES ====================
 * Sync UI elements with current game state
 * Updates points, titles, avatars, and statistics displays
 * ==================== */

function updateUI() {
  document.getElementById('userPoints').textContent = gameState.points;
  document.getElementById('totalVotes').textContent = gameState.totalVotes;
  document.getElementById('zonesUnlocked').textContent = gameState.unlockedZones.length;
  document.getElementById('badgesEarned').textContent = gameState.badges.length;
  
  // Update title
  const titleDisplay = document.getElementById('userTitle');
  if (titleDisplay) {
    titleDisplay.textContent = getCurrentTitle();
  }
  
  // Update mystery box count
  const boxCount = document.getElementById('mysteryBoxCount');
  if (boxCount) {
    boxCount.textContent = gameState.mysteryBoxes || 0;
  }
  
  // Update avatar
  updateAvatarDisplay();
  
  // Update active power-up
  if (typeof updateActivePowerUpDisplay === 'function') {
    updateActivePowerUpDisplay();
  }
}

/* ==================== MODAL HELPERS ==================== */

/**
 * Show a dynamic modal with custom HTML content
 */
function showModal(htmlContent) {
  // Check if dynamic modal exists, create if not
  let modal = document.getElementById('dynamicModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dynamicModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-height: 90vh; overflow-y: auto;">
        <button class="btn-close-modal" onclick="closeModal('dynamicModal')" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">✕</button>
        <div id="dynamicModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  const modalBody = document.getElementById('dynamicModalBody');
  modalBody.innerHTML = htmlContent;
  modal.classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

/* ==================== TOAST NOTIFICATIONS ==================== */

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ==================== EVENT LISTENERS ==================== */

// Tutorial
document.getElementById('tutorialStart').addEventListener('click', () => {
  document.getElementById('tutorialOverlay').style.display = 'none';
});

// Menu
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sideMenu').classList.add('active');
});

document.getElementById('closeMenu').addEventListener('click', () => {
  document.getElementById('sideMenu').classList.remove('active');
});

// Menu buttons
document.getElementById('shopBtn').addEventListener('click', () => {
  openShop();
  document.getElementById('sideMenu').classList.remove('active');
});

document.getElementById('badgesBtn').addEventListener('click', () => {
  openBadges();
  document.getElementById('sideMenu').classList.remove('active');
});

document.getElementById('leaderboardBtn').addEventListener('click', () => {
  openLeaderboard();
  document.getElementById('sideMenu').classList.remove('active');
});

document.getElementById('statsBtn').addEventListener('click', () => {
  openStats();
  document.getElementById('sideMenu').classList.remove('active');
});

document.getElementById('powerUpsBtn').addEventListener('click', () => {
  openPowerUps();
  document.getElementById('sideMenu').classList.remove('active');
});

// Zone panel
document.getElementById('closeZone').addEventListener('click', closeZonePanel);
document.getElementById('exploreZone').addEventListener('click', exploreZone);

// Farm panel
document.getElementById('closeFarm').addEventListener('click', closeFarmPanel);
document.getElementById('voteYes').addEventListener('click', () => vote('yes'));
document.getElementById('voteNo').addEventListener('click', () => vote('no'));
document.getElementById('zoomInBtn').addEventListener('click', zoomInToFarm);
document.getElementById('changeVoteBtn').addEventListener('click', changeVote);

// Badges
document.getElementById('shareBadges').addEventListener('click', shareBadges);

// Leaderboard filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    generateLeaderboard(btn.dataset.period);
  });
});

// Shop tabs
function initShopTabs() {
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs and content
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.shop-tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active to clicked tab
      tab.classList.add('active');
      
      // Show corresponding content
      const tabName = tab.dataset.tab;
      if (tabName === 'zones') {
        document.getElementById('zonesTab').classList.add('active');
      } else if (tabName === 'cosmetics') {
        document.getElementById('cosmeticsTab').classList.add('active');
      } else if (tabName === 'features') {
        document.getElementById('featuresTab').classList.add('active');
      }
    });
  });
}

/* ==================== INITIALIZATION ====================
 * App startup sequence:
 * 1. Load saved game state
 * 2. Load farm data from JSON
 * 3. Create geographic zones
 * 4. Display zone markers on map
 * 5. Initialize UI and shop
 * ==================== */

async function init() {
  console.log('Initializing Zone Quest...');
  
  // Load game state
  loadGameState();
  
  // Load farm data
  await loadFarmData();
  
  // Render theme options
  renderThemeOptions();
  
  // Render cursor options
  renderCursorOptions();
  
  // Render avatar options
  renderAvatarOptions();
  
  // Apply saved cursor
  if (gameState.currentCursor) {
    applyCursor(gameState.currentCursor);
  }
  
  // Update avatar display
  updateAvatarDisplay();
  
  // Update power-up display
  updateActivePowerUpDisplay();
  
  // Initialize shop tabs
  initShopTabs();
  
  console.log('Zone Quest initialized!');
}

// Start the app
init();
