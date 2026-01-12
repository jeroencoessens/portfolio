// Farm Map Tinder - Zone Verification

/* ---------------- Map Setup ---------------- */

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri' }
);

const map = L.map('map', {
  layers: [satellite],
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([16, 106], 16);

/* ---------------- Data Loading ---------------- */

let farms = [];
let currentIndex = 0;

function loadZoneData() {
  const zoneDataStr = localStorage.getItem('tinderZoneData');
  if (!zoneDataStr) {
    alert('No zone data found. Please select a zone from the main map.');
    window.location.href = '../farm-map/index.html';
    return;
  }

  try {
    farms = JSON.parse(zoneDataStr);
    
    // Shuffle farms for random order
    farms = shuffleArray([...farms]);
    
    if (farms.length === 0) {
      alert('No farms found in this zone.');
      window.location.href = '../farm-map/index.html';
      return;
    }

    // Initialize display
    updateTotalCount();
    showFarm(0);
  } catch (e) {
    console.error('Error loading zone data:', e);
    alert('Error loading zone data.');
    window.location.href = '../farm-map/index.html';
  }
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/* ---------------- Farm Display ---------------- */

function showFarm(index) {
  if (index < 0 || index >= farms.length) return;
  
  currentIndex = index;
  const farm = farms[index];
  
  // Update UI
  document.getElementById('farmId').textContent = farm.id;
  document.getElementById('farmProbability').textContent = (farm.probability * 100).toFixed(1);
  document.getElementById('currentIndex').textContent = index + 1;
  
  // Update map view
  map.setView([farm.lat, farm.lng], 16, {
    animate: true,
    duration: 0.5
  });
  
  // Update navigation buttons
  document.getElementById('prevBtn').disabled = index === 0;
  document.getElementById('nextBtn').disabled = index === farms.length - 1;
}

function updateTotalCount() {
  document.getElementById('totalFarms').textContent = farms.length;
}

function nextFarm() {
  if (currentIndex < farms.length - 1) {
    showFarm(currentIndex + 1);
  }
}

function prevFarm() {
  if (currentIndex > 0) {
    showFarm(currentIndex - 1);
  }
}

/* ---------------- Voting ---------------- */

function vote(yes) {
  const farm = farms[currentIndex];
  if (!farm) return;
  
  // Get existing votes
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  const isFirstVote = !votes[farm.id];
  
  // Save vote
  votes[farm.id] = {
    value: yes ? 'YES' : 'NO',
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('farmVotes', JSON.stringify(votes));
  
  // Update user data (same logic as main map)
  const userData = JSON.parse(localStorage.getItem('userData') || '{}');
  if (!userData.totalVotes) {
    userData.totalVotes = 0;
    userData.highConfidenceVotes = 0;
    userData.firstTimeVotes = 0;
    userData.score = 0;
    userData.firstSeen = new Date().toISOString().slice(0, 10);
  }
  
  userData.totalVotes += 1;
  
  if (farm.probability >= 0.9) {
    userData.highConfidenceVotes = (userData.highConfidenceVotes || 0) + 1;
  }
  
  if (isFirstVote) {
    userData.firstTimeVotes = (userData.firstTimeVotes || 0) + 1;
  }
  
  // Calculate score (same as main map)
  let score = 1; // base
  if (farm.probability >= 0.9) score += 2;
  if (isFirstVote) score += 1;
  
  userData.score = (userData.score || 0) + score;
  userData.lastActive = new Date().toISOString().slice(0, 10);
  localStorage.setItem('userData', JSON.stringify(userData));
  
  // Move to next farm
  nextFarm();
}

/* ---------------- Event Listeners ---------------- */

document.getElementById('nextBtn').onclick = nextFarm;
document.getElementById('prevBtn').onclick = prevFarm;
document.getElementById('voteYes').onclick = () => vote(true);
document.getElementById('voteNo').onclick = () => vote(false);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    prevFarm();
  } else if (e.key === 'ArrowRight') {
    nextFarm();
  } else if (e.key === 'y' || e.key === 'Y') {
    vote(true);
  } else if (e.key === 'n' || e.key === 'N') {
    vote(false);
  }
});

/* ---------------- Initialize ---------------- */

loadZoneData();
