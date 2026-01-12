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
let currentMarker = null; // Marker for currently displayed farm

function loadZoneData() {
  const zoneDataStr = localStorage.getItem('tinderZoneData');
  console.log('Loading zone data from localStorage:', zoneDataStr ? 'Found' : 'Not found');
  
  if (!zoneDataStr) {
    console.error('No zone data found in localStorage');
    alert('No zone data found. Please select a zone from the main map.');
    window.location.href = '../farm-map/index.html';
    return;
  }

  try {
    farms = JSON.parse(zoneDataStr);
    console.log('Parsed farms data:', farms.length, 'farms');
    
    if (!Array.isArray(farms) || farms.length === 0) {
      console.error('Invalid farms data:', farms);
      alert('No farms found in this zone.');
      window.location.href = '../farm-map/index.html';
      return;
    }
    
    // Shuffle farms for random order
    farms = shuffleArray([...farms]);
    console.log('Shuffled farms:', farms.length);
    
    // Initialize display
    updateTotalCount();
    showFarm(0);
  } catch (e) {
    console.error('Error loading zone data:', e);
    console.error('Raw data:', zoneDataStr);
    alert('Error loading zone data: ' + e.message);
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
  
  // Check for existing vote
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  const existingVote = votes[farm.id];
  
  // Update UI
  document.getElementById('farmId').textContent = farm.id;
  document.getElementById('farmProbability').textContent = (farm.probability * 100).toFixed(1);
  document.getElementById('currentIndex').textContent = index + 1;
  
  // Update vote status display
  const voteStatusEl = document.getElementById('voteStatus');
  const votingSectionEl = document.getElementById('votingSection');
  
  if (existingVote) {
    // Show vote status, hide voting buttons
    voteStatusEl.style.display = 'flex';
    votingSectionEl.style.display = 'none';
    
    // Update cancel button handler
    const cancelBtn = document.getElementById('cancelVoteBtn');
    cancelBtn.onclick = () => cancelVote(farm.id);
  } else {
    // Hide vote status, show voting buttons
    voteStatusEl.style.display = 'none';
    votingSectionEl.style.display = 'block';
  }
  
  // Update map view
  map.setView([farm.lat, farm.lng], 16, {
    animate: true,
    duration: 0.5
  });
  
  // Update marker for current farm
  updateFarmMarker(farm);
  
  // Update navigation buttons
  document.getElementById('prevBtn').disabled = index === 0;
  document.getElementById('nextBtn').disabled = index === farms.length - 1;
}

function updateFarmMarker(farm) {
  // Remove existing marker if any
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  
  // Create custom icon with farm info
  const icon = L.divIcon({
    className: 'farm-marker',
    html: `
      <div class="farm-marker-content">
        <div class="farm-marker-id">ID: ${farm.id}</div>
        <div class="farm-marker-prob">${(farm.probability * 100).toFixed(1)}%</div>
      </div>
    `,
    iconSize: [120, 50],
    iconAnchor: [60, 50], // Center horizontally, anchor at bottom
    popupAnchor: [0, -50]
  });
  
  // Create marker positioned slightly above the farm location
  // Offset by ~0.001 degrees (roughly 100m) to the north
  const markerLat = farm.lat + 0.001;
  currentMarker = L.marker([markerLat, farm.lng], {
    icon: icon,
    zIndexOffset: 1000 // Ensure it's on top
  }).addTo(map);
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

function cancelVote(farmId) {
  const votes = JSON.parse(localStorage.getItem('farmVotes') || '{}');
  if (!votes[farmId]) return;
  
  // Get the vote before deleting
  const vote = votes[farmId];
  delete votes[farmId];
  localStorage.setItem('farmVotes', JSON.stringify(votes));
  
  // Update user data (reverse the vote)
  const userData = JSON.parse(localStorage.getItem('userData') || '{}');
  if (userData.totalVotes > 0) {
    userData.totalVotes -= 1;
  }
  
  // Find the farm to check probability
  const farm = farms.find(f => f.id === farmId);
  if (farm) {
    if (farm.probability >= 0.9 && userData.highConfidenceVotes > 0) {
      userData.highConfidenceVotes -= 1;
    }
    
    // Calculate score to remove (same logic as vote function)
    let scoreToRemove = 1; // base
    if (farm.probability >= 0.9) scoreToRemove += 2;
    // Check if this was a first-time vote by checking if there are other votes now
    // Since we just deleted this vote, if there are no other votes for this farm ID in the system,
    // it was likely a first-time vote. But we can't be 100% sure, so we'll be conservative
    // and only subtract the base + probability bonus
    // Note: We subtract 1 for first-time vote bonus as a reasonable estimate
    scoreToRemove += 1;
    
    userData.score = Math.max(0, (userData.score || 0) - scoreToRemove);
  }
  
  userData.lastActive = new Date().toISOString().slice(0, 10);
  localStorage.setItem('userData', JSON.stringify(userData));
  
  // Update UI to show voting buttons again
  showFarm(currentIndex);
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
