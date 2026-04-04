// ============================================================
//  ANIMAL ESCAPE: RUN TO FREEDOM
//  3D Dice-rolling escape board game — circular planet track
//  Engine: BabylonJS
//
//  Architecture overview (sections map to Unity C# scripts):
//  ┌──────────────────────────────────────────────┐
//  │ 1. CONFIG & DATA     Constants, definitions  │
//  │ 2. GAME STATE        Persistent + per-run    │
//  │ 3. SAVE SYSTEM       LocalStorage I/O        │
//  │ 4. SANCTUARY / START    Animal select, purchase  │
//  │ 5. SCENE SETUP       3D world, board, props  │
//  │ 6. PLAYER MODELS     Per-animal mesh builders │
//  │ 7. FARMER OBSTACLES  Spawn, remove, models   │
//  │ 8. MOVEMENT & CAMERA Dice roll, animation    │
//  │ 9. TILE & ENCOUNTERS Landing FX, farmer UI   │
//  │ 10. UI HELPERS       HUD, overlays, feedback │
//  │ 11. ENTRY POINT      DOM ready, screen flow  │
//  └──────────────────────────────────────────────┘
//
//  Core loop: Roll dice → move N tiles on circular track →
//  land on tile (earn coins, find food, dodge farmers) →
//  complete laps to earn big rewards → buy upgrades & animals
// ============================================================

// DOM shorthand
const $ = id => document.getElementById(id);

// ============================================================
//  1. CONFIG & DATA
// ============================================================

// --- Board ---
const BOARD_SIZE        = 80;        // total tiles on the circular track
const TILE_SIZE         = 3;         // visual width of a tile (BabylonJS units)
const TILE_SPACING      = 6;         // arc distance between tile centers

// --- Dice / Rolls ---
const STARTING_DICE     = 100;       // rolls given at start of each run
const MAX_DICE          = 250;       // hard cap on stored rolls
const DICE_REFILL_AMT   = 10;         // rolls recovered per refill tick
const DICE_REFILL_TIME  = 30000;     // ms between auto-refills
const DICE_FACES        = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// --- Economy ---
// (economy constants moved to BALANCE object below)

// --- Persistence ---
const SAVE_KEY          = 'animal_escape_p1_save';

// ============================================================
//  BALANCING LEVERS — tweak these to tune the game feel
// ============================================================
const BALANCE = {
    // --- Meals ---
    MEAL_TILE_BASE:       3,     // meals earned from a meal-type tile (before bonuses)
    MEAL_ROAD_BASE:       0,     // meals from normal road tiles (0 = no meals by default)
    MEAL_LAP_BONUS:       8,     // meals awarded per lap completion
    MEAL_GOLDEN_THRESHOLD: 250,  // total meals for an animal to get golden status

    // --- Passive meal bonuses from powerups (added per tile landed) ---
    MEAL_PASSIVE_CHEAP:   0.4,   // per-tile meal bonus from cheap powerups
    MEAL_PASSIVE_MID:     0.8,   // per-tile meal bonus from mid-tier powerups
    MEAL_PASSIVE_EXPENSIVE: 0,   // expensive tile-altering powerups give no passive

    // --- Meal multiplier on meal tiles from powerups ---
    MEAL_TILE_BONUS_CHEAP:  0,   // extra meals on meal tiles from cheap powerups
    MEAL_TILE_BONUS_MID:    2,   // extra meals on meal tiles from mid-tier powerups
    MEAL_TILE_BONUS_EXPENSIVE: 0,// tile-altering powerups don't boost meal tiles directly

    // --- Instant meal grants from powerups ---
    MEAL_INSTANT_CHEAP:   5,     // instant meals from cheap powerups (e.g. Wild Berries)
    MEAL_INSTANT_MID:     3,     // instant meals from mid powerups
    MEAL_INSTANT_EXPENSIVE: 0,   // tile-altering powerups give no instant meals

    // --- Tile alteration: chance that non-meal tiles become meal tiles ---
    TILE_ALTER_CHANCE:    0.35,  // probability a road/nothing tile becomes a meal source

    // --- Coins ---
    COIN_ROAD:            30,    // coins from road tiles
    COIN_CASH_LOW:        80,    // coins from low-value cash tiles
    COIN_CASH_MID:        120,   // coins from mid-value cash tiles
    COIN_CASH_HIGH:       180,   // coins from high-value cash tiles
    COIN_LAP_BONUS:       500,   // coins per lap completion
    COIN_TRACTOR_CLEAR:   120,   // coins earned for clearing a tractor successfully

    // --- Farmer / Tractor ---
    FARMER_BRIBE_BASE:     400,  // starting bribe cost
    FARMER_BRIBE_ESCALATION: 200,// how much bribe increases each time it's paid
    FARMER_SPAWN_CHANCE:   0.25, // chance a farmer spawns per roll

    // --- Alert ---
    ALERT_CASH_TILE:      2,     // alert from landing on cash tiles
    ALERT_DANGER_FAIL:    5,     // alert from danger tile failure
    ALERT_FARMER_SPOTTED: 15,    // alert from being spotted by farmer
    ALERT_PIT_REDUCE:     10,    // alert reduced at rest stops
    ALERT_FLOCK_REDUCE:   10,    // alert reduced by flock scatter
    ALERT_SNEAK_REDUCE:   10,    // alert reduced by sneaking past farmer
};

// --- 3D Positioning ---
const PLAYER_TILE_OFFSET = 0.5;      // height above tile surface for player mesh
const PROP_SURFACE_OFFSET = 1.0;     // depth below tile center for world props

// --- Checkpoint milestones shown on the progress bar ---
const TRACK_CITIES = [
    { name: 'Muddy Path',   pct: 12 },
    { name: 'Creek Cross',  pct: 25 },
    { name: 'Wild Fields',  pct: 40 },
    { name: 'Dark Woods',   pct: 55 },
    { name: 'Hill Top',     pct: 72 },
    { name: 'Nature Haven', pct: 88 },
];

// --- Playable animals ---
// Each has base stats (speed/armor/stealth), a unique ability, and an unlock price.
const ANIMALS = [
    { id: 'brave_pig',     name: 'Brave Piggy',   emoji: '🐷', color: '#FFB6C1', speed: 0, armor: 1, stealth: 0, price: 0,    ability: 'Mud Slide',    desc: 'Loves the mud. Sturdy and reliable.' },
    { id: 'quick_chick',   name: 'Swift Chick',   emoji: '🐤', color: '#FFF380', speed: 2, armor: 0, stealth: 0, price: 1500, ability: 'Wing Flutter',  desc: 'Fast but fragile.' },
    { id: 'gentle_cow',    name: 'Gentle Cow',    emoji: '🐮', color: '#F0F0F0', speed: 0, armor: 2, stealth: 0, price: 3000, ability: 'Stampede',      desc: 'Very tough to stop.' },
    { id: 'woolly_sheep',  name: 'Woolly Sheep',  emoji: '🐑', color: '#EFEFEF', speed: 0, armor: 1, stealth: 1, price: 2000, ability: 'Fleece Veil',   desc: 'Blends in anywhere. Quiet and steady.' },
    { id: 'swift_rabbit',  name: 'Swift Rabbit',  emoji: '🐰', color: '#D4C5B2', speed: 3, armor: 0, stealth: 1, price: 4000, ability: 'Burrow',        desc: 'Lightning fast. Gone in a flash.' },
    { id: 'lucky_duck',    name: 'Lucky Duck',    emoji: '🦆', color: '#6B9E5E', speed: 1, armor: 0, stealth: 2, price: 5500, ability: 'Wing Splash',   desc: 'Master of disguise. Slips away unseen.' },
    { id: 'chicken_flock', name: 'Chicken Flock',  emoji: '🐔', color: '#FFF380', speed: 1, armor: 0, stealth: 0, price: 8000, ability: 'Scatter',       desc: '5 chickens. Two tiles, double trouble!' },
];

// --- In-run upgrade shop items ---
// mealEffect: 'passive' = bonus meals every tile, 'instant' = immediate meals,
//             'tileAlter' = converts some non-meal tiles into meal sources
// tier: 'cheap' | 'mid' | 'expensive' — maps into BALANCE for meal amounts
const UPGRADES = [
    { id: 'dice30',    name: '30 Rolls',      icon: '🎲', desc: 'Ancient luck stones',                             stat: 'dice',    cost: 1000, tier: 'mid',       mealEffect: 'instant'   },
    { id: 'berries',   name: 'Wild Berries',   icon: '🍒', desc: '+1 Speed, passive meals every tile',              stat: 'speed',   cost: 500,  tier: 'cheap',     mealEffect: 'passive'   },
    { id: 'clover',    name: 'Lucky Clover',   icon: '🍀', desc: '+1 Stealth, passive meals every tile',            stat: 'stealth', cost: 600,  tier: 'cheap',     mealEffect: 'passive'   },
    { id: 'bark',      name: 'Oak Bark',       icon: '🌳', desc: '+1 Resilience, instant meals & small passive',    stat: 'armor',   cost: 700,  tier: 'cheap',     mealEffect: 'instant'   },
    { id: 'apple',     name: 'Sweet Apple',    icon: '🍎', desc: 'Instant meals for your animal',                   stat: 'fuel',    cost: 400,  tier: 'cheap',     mealEffect: 'instant'   },
    { id: 'mushrooms', name: 'Magic Fungi',    icon: '🍄', desc: '+2 Speed, boosts meal tiles',                     stat: 'speed',   cost: 1500, tier: 'mid',       mealEffect: 'passive'   },
    { id: 'feathers',  name: 'Hawk Feather',   icon: '🪶', desc: '+2 Stealth, boosts meal tiles',                   stat: 'stealth', cost: 1200, tier: 'mid',       mealEffect: 'passive'   },
    { id: 'stones',    name: 'River Stones',   icon: '🪨', desc: '+2 Resilience, boosts meal tiles',                stat: 'armor',   cost: 1400, tier: 'mid',       mealEffect: 'passive'   },
    { id: 'vines',     name: 'Wild Vines',     icon: '🌿', desc: 'Road tiles now sometimes yield meals',            stat: 'none',    cost: 1800, tier: 'expensive',  mealEffect: 'tileAlter' },
    { id: 'flowers',   name: 'Blossom Path',   icon: '🌸', desc: 'Even more tiles become meal sources',             stat: 'none',    cost: 2500, tier: 'expensive',  mealEffect: 'tileAlter' },
];

// --- Tile pattern (repeats every 20 tiles to fill the 80-tile board) ---
// value = coins for cash/road tiles, meals for fuel tiles, 0 for special tiles
const TILE_PATTERN = [
    { type: 'start',  color: '#228B22', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'cash',   color: '#FFD700', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'danger', color: '#FF4500', value: 0   },
    { type: 'fuel',   color: '#32CD32', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'farmer', color: '#E63946', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'bonus',  color: '#00FA9A', value: 0   },
    { type: 'cash',   color: '#FFD700', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'event',  color: '#4169E1', value: 0   },
    { type: 'fuel',   color: '#32CD32', value: 0   },
    { type: 'rival',  color: '#FF69B4', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'road',   color: '#8B4513', value: 0   },
    { type: 'cash',   color: '#FFD700', value: 0   },
    { type: 'pit',    color: '#98FB98', value: 0   },
    { type: 'fuel',   color: '#32CD32', value: 0   },
];

// ============================================================
//  2. GAME STATE
// ============================================================

// Persistent state — survives between runs (saved to localStorage)
let persist = {
    totalCash: 0,
    unlockedAnimals: ['brave_pig'],
    dice: STARTING_DICE,
    lastDiceUpdate: Date.now(),
    animalMeals: {},   // { animal_id: totalMeals } — permanent per-animal meal count
};

// Runtime state — reset at the start of each run
const game = {
    // Current animal definition & stat bonuses from upgrades
    animalDef: null,
    runSpeed: 0,
    runArmor: 0,
    runStealth: 0,

    // Resources
    dice: 0,
    cash: 0,
    fuel: 0,
    heat: 0,

    // Meal system (run-scoped bonuses, accumulate into persist.animalMeals)
    runMeals: 0,           // meals collected this run (displayed as grand total in HUD)
    passiveMealBonus: 0,   // fractional meals earned per tile from powerups
    mealTileBonus: 0,      // extra meals on fuel/meal tiles from powerups
    tileAlterCount: 0,     // how many tile-alter powerups purchased (stacks chance)
    alteredTiles: {},       // { tileIndex: true } — tiles converted to meal sources

    // Farmer / tractor
    bribeCount: 0,         // times bribe has been paid this run (escalates cost)

    // Progress
    laps: 0,
    tileIndex: 0,
    multiplier: 1,
    isMoving: false,
    selectedAnimalId: 'brave_pig',

    // BabylonJS references
    engine: null,
    scene: null,
    camera: null,
    cameraAnchor: null,
    playerRoot: null,
    playerMesh: null,

    // Board data
    tiles: [],         // BabylonJS mesh references per tile
    tileDefs: [],      // tile type/color/value definitions
    boardRadius: 0,    // computed radius of the circular track

    // Farmer obstacles keyed by tile index
    farmersOnTiles: {},

    // Run-specific flags
    abilityUsed: false,
    purchasedUpgrades: [],
    diceTimer: null,

    // Chicken Flock mode (split across two tile positions)
    flockMode: false,
    frontChickens: 0,
    rearChickens: 0,
    rearPlayerRoot: null,
    frontChickenMeshes: [],
    rearChickenMeshes: [],
};

// Timers for auto-clearing feedback/dice result UI
let feedbackTimer = null;
let diceResultTimer = null;

// ============================================================
//  3. SAVE SYSTEM
// ============================================================

function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        persist.totalCash = data.totalCash || 0;
        persist.unlockedAnimals = data.unlockedAnimals || ['brave_pig'];
        persist.dice = data.dice !== undefined ? data.dice : STARTING_DICE;
        persist.lastDiceUpdate = data.lastDiceUpdate || Date.now();
        persist.animalMeals = data.animalMeals || {};
    } catch (_) { /* corrupt save — use defaults */ }
}

function writeSave() {
    persist.dice = game.dice;
    localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
}

/** Periodically refills dice and updates the timer bar in the HUD. */
function startDiceTimer() {
    if (game.diceTimer) clearInterval(game.diceTimer);
    game.diceTimer = setInterval(() => {
        const elapsed = Date.now() - persist.lastDiceUpdate;
        const progress = Math.min(100, (elapsed / DICE_REFILL_TIME) * 100);

        const bar = $('diceTimerFill');
        if (bar) bar.style.width = progress + '%';

        if (elapsed >= DICE_REFILL_TIME) {
            if (game.dice < MAX_DICE) {
                game.dice += DICE_REFILL_AMT;
                updateUI();
            }
            persist.lastDiceUpdate = Date.now();
            writeSave();
        }
    }, 100);
}

// ============================================================
//  4. SANCTUARY / START SCREEN
// ============================================================

function initStartScreen() {
    loadSave();
    renderSanctuary();
    $('debugResetBtn').onclick = debugReset;
    $('debugCoinsBtn').onclick = debugCoins;
}

/** Renders the animal selection grid and selected-animal detail panel. */
function renderSanctuary() {
    $('sanctuaryBank').textContent = '🪙 ' + persist.totalCash.toLocaleString();
    const grid = $('animalGrid');
    grid.innerHTML = '';

    ANIMALS.forEach(animal => {
        const owned = persist.unlockedAnimals.includes(animal.id);
        const selected = animal.id === game.selectedAnimalId;
        const meals = getAnimalMeals(animal.id);
        const isGolden = meals >= BALANCE.MEAL_GOLDEN_THRESHOLD;
        const card = document.createElement('div');
        card.className = 'animal-card'
            + (selected ? ' selected' : '')
            + (!owned ? ' locked' : '')
            + (isGolden && owned ? ' golden' : '');
        card.innerHTML =
            '<div class="animal-card-emoji">' + animal.emoji + '</div>' +
            '<div class="animal-card-name">' + animal.name + '</div>' +
            (owned ? '<div class="animal-card-meals">🍎 ' + meals + '</div>' : '') +
            (!owned ? '<div class="animal-card-price">🪙 ' + animal.price.toLocaleString() + '</div>' : '') +
            (!owned ? '<div class="animal-card-lock">🔒</div>' : '');

        card.addEventListener('click', () => {
            if (owned) {
                game.selectedAnimalId = animal.id;
                renderSanctuary();
            } else if (persist.totalCash >= animal.price) {
                // Purchase and auto-select
                persist.totalCash -= animal.price;
                persist.unlockedAnimals.push(animal.id);
                game.selectedAnimalId = animal.id;
                writeSave();
                renderSanctuary();
            }
        });
        grid.appendChild(card);
    });

    // Update the selected-animal detail panel
    const animal = ANIMALS.find(a => a.id === game.selectedAnimalId) || ANIMALS[0];
    const selMeals = getAnimalMeals(animal.id);
    const selGolden = selMeals >= BALANCE.MEAL_GOLDEN_THRESHOLD;
    $('selAnimalEmoji').textContent = animal.emoji;
    $('selAnimalName').textContent = animal.name;
    $('selAnimalStats').innerHTML =
        '<span class="sel-stat sel-stat-spd">SPD ' + animal.speed + '</span>' +
        '<span class="sel-stat sel-stat-arm">RES ' + animal.armor + '</span>' +
        '<span class="sel-stat sel-stat-stl">STH ' + animal.stealth + '</span>' +
        '<span class="sel-stat sel-stat-meals">🍎 ' + selMeals + ' MEALS</span>' +
        (selGolden ? '<span class="sel-stat sel-stat-golden">✨ GOLDEN</span>' : '');

    const isOwned = persist.unlockedAnimals.includes(animal.id);
    $('startRunBtn').disabled = !isOwned;
    $('startRunBtn').textContent = isOwned
        ? 'BEGIN ESCAPE 🌿'
        : '🔒 UNLOCK FOR 🪙 ' + animal.price.toLocaleString();
    $('startRunBtn').onclick = () => { if (isOwned) startRun(animal); };
}

// ============================================================
//  5. SCENE SETUP
// ============================================================

/** Combine base animal stats with upgrade bonuses. */
function getSpeed()   { return (game.animalDef ? game.animalDef.speed : 0) + game.runSpeed; }
function getArmor()   { return (game.animalDef ? game.animalDef.armor : 0) + game.runArmor; }
function getStealth() { return (game.animalDef ? game.animalDef.stealth : 0) + game.runStealth; }

/** Returns the current bribe cost, escalating each time it's been paid. */
function getBribeCost() {
    return BALANCE.FARMER_BRIBE_BASE + game.bribeCount * BALANCE.FARMER_BRIBE_ESCALATION;
}

/**
 * Awards meals to the current animal. Updates both run total and persistent save.
 * @param {number} amount — meals to add (can be fractional; floored before display)
 */
function awardMeals(amount) {
    if (amount <= 0) return;
    game.runMeals += amount;
    game.fuel += Math.floor(amount);
    const id = game.animalDef ? game.animalDef.id : game.selectedAnimalId;
    persist.animalMeals[id] = (persist.animalMeals[id] || 0) + amount;
    writeSave();
}

/** Returns the grand total of meals for the given animal id. */
function getAnimalMeals(animalId) {
    return Math.floor(persist.animalMeals[animalId] || 0);
}

/**
 * Checks if a tile has been altered by a tileAlter powerup to yield meals.
 * Only non-meal, non-special tiles can be altered.
 */
function isTileAlteredToMeal(physIdx) {
    return !!game.alteredTiles[physIdx];
}

/**
 * When a tile-alter powerup is purchased, randomly convert eligible tiles.
 * Each tile-alter purchase re-rolls all eligible tiles with cumulative chance.
 */
function applyTileAlterations() {
    const chance = BALANCE.TILE_ALTER_CHANCE * game.tileAlterCount;
    const eligibleTypes = ['road', 'start', 'bonus', 'event'];
    for (let i = 0; i < BOARD_SIZE; i++) {
        const def = game.tileDefs[i];
        if (eligibleTypes.includes(def.type) && !game.alteredTiles[i]) {
            if (Math.random() < chance) {
                game.alteredTiles[i] = true;
                // Visually tint the tile slightly green
                if (game.tiles[i] && game.scene) {
                    const mat = new BABYLON.StandardMaterial('altMat_' + i, game.scene);
                    mat.diffuseColor = BABYLON.Color3.FromHexString('#5DBB63');
                    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                    game.tiles[i].material = mat;
                }
            }
        }
    }
}

/** Transitions from sanctuary to gameplay, resets run state, boots 3D scene. */
function startRun(animal) {
    // Reset all run state
    game.animalDef = animal;
    game.runSpeed = 0;
    game.runArmor = 0;
    game.runStealth = 0;
    game.dice = persist.dice;   // carry over persistent dice — NOT reset each run

    game.cash = 0;
    game.fuel = 0;
    game.heat = 0;
    game.laps = 0;
    game.tileIndex = 0;
    game.multiplier = 1;
    game.isMoving = false;
    game.tiles = [];
    game.tileDefs = [];
    game.farmersOnTiles = {};
    game.abilityUsed = false;
    game.purchasedUpgrades = [];

    // Meal system reset for new run
    game.runMeals = 0;
    game.passiveMealBonus = 0;
    game.mealTileBonus = 0;
    game.tileAlterCount = 0;
    game.alteredTiles = {};

    // Tractor bribe escalation reset
    game.bribeCount = 0;

    // Chicken Flock splits into front (3) and rear (2) groups
    game.flockMode = (animal.id === 'chicken_flock');
    game.frontChickens = game.flockMode ? 3 : 0;
    game.rearChickens = game.flockMode ? 2 : 0;
    game.rearPlayerRoot = null;
    game.frontChickenMeshes = [];
    game.rearChickenMeshes = [];

    // Switch screens
    $('startScreen').classList.add('hidden');
    $('gameScreen').classList.remove('hidden');
    $('trackMarker').textContent = animal.emoji;

    initGame();
    startDiceTimer();
}

/** Ends the run, banks earned coins, tears down the 3D engine. */
function returnToSanctuary() {
    if (game.diceTimer) clearInterval(game.diceTimer);
    persist.lastDiceUpdate = Date.now(); // pause refill clock while in menu
    persist.totalCash += game.cash;
    // Meals are already persisted incrementally via awardMeals()
    writeSave();

    if (game.engine) {
        game.engine.stopRenderLoop();
        game.scene.dispose();
        game.engine.dispose();
        game.engine = null;
    }

    $('gameScreen').classList.add('hidden');
    $('startScreen').classList.remove('hidden');
    renderSanctuary();
}

/** Boots BabylonJS, creates the 3D scene, wires up control buttons. */
function initGame() {
    const canvas = $('renderCanvas');

    // The 4th argument (adaptToDeviceRatio = true) tells BabylonJS to render
    // at the device's native pixel density. Without this, high-DPI mobile
    // screens render at CSS-pixel resolution, causing blurry/fuzzy 3D visuals.
    game.engine = new BABYLON.Engine(canvas, true, null, true);

    game.scene = createScene();
    game.engine.runRenderLoop(() => game.scene.render());
    window.addEventListener('resize', () => { if (game.engine) game.engine.resize(); });

    // Wire controls
    $('rollBtn').onclick = doRoll;
    $('multBtn').onclick = cycleMultiplier;
    $('eventCloseBtn').onclick = () => closeOverlay('eventOverlay');
    $('upgradeBtn').onclick = openUpgradeShop;
    $('upgradeCloseBtn').onclick = () => closeOverlay('upgradeOverlay');

    updateUI();
    updateRibbon();
    renderTrackCities();
}

/** Assembles the full 3D scene: lighting, board, props, player, camera. */
function createScene() {
    const scene = new BABYLON.Scene(game.engine);
    scene.clearColor = new BABYLON.Color4(0.3, 0.65, 0.81, 1); // light blue sky

    // --- Lighting ---
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new BABYLON.Color3(0.2, 0.4, 0.2);

    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, -1), scene);
    dir.position = new BABYLON.Vector3(50, 50, 50);
    dir.intensity = 0.9;

    const shadowGen = new BABYLON.ShadowGenerator(1024, dir);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 48;
    shadowGen.darkness = 0.4;

    // --- World ---
    buildBoard(scene);
    buildPlanetProps(scene);
    buildPlayer(scene, shadowGen);

    // Place player at tile 0
    const startPos = getTileWorldPosition(0);
    const startRot = getTileRotation(0);
    game.playerRoot.position = startPos;
    game.playerRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(startRot);

    // Place rear flock group at the last tile (wraps behind)
    if (game.flockMode && game.rearPlayerRoot) {
        const rearPos = getTileWorldPosition(BOARD_SIZE - 1);
        const rearRot = getTileRotation(BOARD_SIZE - 1);
        game.rearPlayerRoot.position = rearPos;
        game.rearPlayerRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(rearRot);
    }

    // --- Camera (follows player via a parented anchor node) ---
    game.cameraAnchor = new BABYLON.TransformNode('camAnchor', scene);
    game.cameraAnchor.position = startPos.clone();
    game.cameraAnchor.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(startRot);

    game.camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 10, -20), scene);
    game.camera.parent = game.cameraAnchor;
    game.camera.setTarget(BABYLON.Vector3.Zero());

    return scene;
}

/**
 * Creates BOARD_SIZE tiles arranged in a circle (planet track)
 * plus a sphere "core" that serves as the planet body.
 */
function buildBoard(scene) {
    const totalLength = BOARD_SIZE * TILE_SPACING;
    game.boardRadius = totalLength / (2 * Math.PI);

    const boardRoot = new BABYLON.TransformNode('boardRoot', scene);
    const matCache = {}; // reuse materials for tiles sharing the same color

    for (let i = 0; i < BOARD_SIZE; i++) {
        const tileDef = Object.assign({}, TILE_PATTERN[i % TILE_PATTERN.length]);
        const tile = BABYLON.MeshBuilder.CreateBox('tile_' + i, {
            width: TILE_SIZE * 2.5, height: 0.5, depth: TILE_SIZE * 1.8
        }, scene);

        // Position tile along the circular track
        const angle = (i * TILE_SPACING) / game.boardRadius;
        tile.position.set(
            0,
            game.boardRadius * Math.cos(angle) - game.boardRadius,
            game.boardRadius * Math.sin(angle)
        );
        tile.rotation.x = angle;

        // Reuse materials by color to minimize GPU draw calls
        if (!matCache[tileDef.color]) {
            const mat = new BABYLON.StandardMaterial('mat_' + tileDef.color, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(tileDef.color);
            mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            matCache[tileDef.color] = mat;
        }
        tile.material = matCache[tileDef.color];
        tile.parent = boardRoot;
        tile.metadata = tileDef;
        tile.receiveShadows = true;

        game.tiles.push(tile);
        game.tileDefs.push(tileDef);
    }

    // Planet core — a dark green sphere inside the tile ring
    const core = BABYLON.MeshBuilder.CreateSphere('core', {
        diameter: (game.boardRadius - 0.5) * 2, segments: 48
    }, scene);
    core.position.set(0, -game.boardRadius, 0);
    const coreMat = new BABYLON.StandardMaterial('coreMat', scene);
    coreMat.diffuseColor = new BABYLON.Color3(0.05, 0.15, 0.05);
    coreMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    core.material = coreMat;
    core.parent = boardRoot;
    core.receiveShadows = true;
}

/**
 * Scatters decorative vegetation around the planet:
 * round-canopy trees, conifers, bushes, and grass tufts.
 * Uses GPU instancing for bushes and grass for performance.
 */
function buildPlanetProps(scene) {
    const propRoot = new BABYLON.TransformNode('propRoot', scene);

    // Shared flat materials (no specular highlight for a toon look)
    const treeMat    = makeFlatMat(scene, 'treeMat',    0.15, 0.65, 0.10);
    const trunkMat   = makeFlatMat(scene, 'trunkMat',   0.30, 0.15, 0.05);
    const coniferMat = makeFlatMat(scene, 'coniferMat', 0.05, 0.42, 0.06);
    const bushMat    = makeFlatMat(scene, 'bushMat',    0.10, 0.52, 0.07);
    const grassMat   = makeFlatMat(scene, 'grassMat',   0.28, 0.74, 0.12);

    /** Anchors a prop to the planet surface at a given angle and lateral offset. */
    const anchor = (side, angle) => {
        const a = new BABYLON.TransformNode('a', scene);
        a.position.set(
            side,
            (game.boardRadius - PROP_SURFACE_OFFSET) * Math.cos(angle) - game.boardRadius,
            (game.boardRadius - PROP_SURFACE_OFFSET) * Math.sin(angle)
        );
        a.rotation.x = angle;
        a.parent = propRoot;
        return a;
    };

    /** Random lateral offset that places props beside (not on) the track. */
    const randSide = (minGap, spread) =>
        (Math.random() < 0.5 ? -1 : 1) * (minGap + Math.random() * spread);

    // --- Round-canopy trees (55) ---
    for (let i = 0; i < 55; i++) {
        const a = anchor(randSide(TILE_SIZE + 2, 8), Math.random() * Math.PI * 2);
        const h = 0.7 + Math.random() * 0.9;
        const trunk = BABYLON.MeshBuilder.CreateCylinder('t', { diameter: 0.15, height: h, tessellation: 6 }, scene);
        trunk.position.y = h / 2; trunk.parent = a; trunk.material = trunkMat;
        const canopy = BABYLON.MeshBuilder.CreateSphere('c', { diameter: 0.6 + Math.random() * 0.5, segments: 5 }, scene);
        canopy.position.y = h; canopy.parent = a; canopy.material = treeMat;
    }

    // --- Conifer / pine trees (35) ---
    for (let i = 0; i < 35; i++) {
        const a = anchor(randSide(TILE_SIZE + 1.5, 9), Math.random() * Math.PI * 2);
        const h = 1.3 + Math.random() * 1.0;
        const trunk = BABYLON.MeshBuilder.CreateCylinder('ct', { diameter: 0.12, height: h * 0.45, tessellation: 5 }, scene);
        trunk.position.y = h * 0.22; trunk.parent = a; trunk.material = trunkMat;
        const cone1 = BABYLON.MeshBuilder.CreateCylinder('cc1', { diameterTop: 0, diameterBottom: 1.1, height: h * 0.65, tessellation: 6 }, scene);
        cone1.position.y = h * 0.50; cone1.parent = a; cone1.material = coniferMat;
        const cone2 = BABYLON.MeshBuilder.CreateCylinder('cc2', { diameterTop: 0, diameterBottom: 0.65, height: h * 0.50, tessellation: 6 }, scene);
        cone2.position.y = h * 0.87; cone2.parent = a; cone2.material = coniferMat;
    }

    // --- Bushes (48) — GPU instanced for performance ---
    const bushTpl = BABYLON.MeshBuilder.CreateSphere('bushTpl', { diameter: 1, segments: 4 }, scene);
    bushTpl.material = bushMat;
    bushTpl.setEnabled(false); // template invisible; instances are drawn
    for (let i = 0; i < 48; i++) {
        const a = anchor(randSide(TILE_SIZE + 1, 5.5), Math.random() * Math.PI * 2);
        const s = 0.32 + Math.random() * 0.38;
        const b1 = bushTpl.createInstance('b1_' + i);
        b1.scaling.set(s * 1.4, s, s * 1.3);
        b1.position.y = s * 0.42;
        b1.parent = a;
        if (Math.random() > 0.45) {
            const b2 = bushTpl.createInstance('b2_' + i);
            b2.scaling.set(s * 0.9, s * 0.72, s * 0.9);
            b2.position.set((Math.random() - 0.5) * 0.55, s * 0.28, (Math.random() - 0.5) * 0.3);
            b2.parent = a;
        }
    }

    // --- Grass tufts (75) — GPU instanced, 2-3 blades per patch ---
    const grassTpl = BABYLON.MeshBuilder.CreateCylinder('grassTpl', {
        diameterTop: 0.04, diameterBottom: 0.14, height: 0.38, tessellation: 4
    }, scene);
    grassTpl.material = grassMat;
    grassTpl.setEnabled(false);
    for (let i = 0; i < 75; i++) {
        const a = anchor(randSide(TILE_SIZE * 0.4, 11), Math.random() * Math.PI * 2);
        const blades = 2 + (Math.random() > 0.5 ? 1 : 0);
        for (let g = 0; g < blades; g++) {
            const blade = grassTpl.createInstance('gr_' + i + '_' + g);
            blade.position.set((Math.random() - 0.5) * 0.5, 0.18, (Math.random() - 0.5) * 0.5);
            blade.rotation.y = Math.random() * Math.PI;
            blade.rotation.z = (Math.random() - 0.5) * 0.28;
            blade.parent = a;
        }
    }
}

/** Creates a StandardMaterial with no specular highlight (flat/toon look). */
function makeFlatMat(scene, name, r, g, b) {
    const mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor = new BABYLON.Color3(r, g, b);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    return mat;
}

// ============================================================
//  6. PLAYER MODELS
// ============================================================

/**
 * Builds the 3D mesh for the selected animal and attaches it to game.playerRoot.
 * Each animal has a unique low-poly model built from box/sphere/cylinder primitives.
 * Delegates to per-animal builder functions for readability.
 */
function buildPlayer(scene, shadowGen) {
    game.playerRoot = new BABYLON.TransformNode('playerRoot', scene);
    const animal = game.animalDef;
    const c3 = BABYLON.Color3.FromHexString(animal.color);
    const mat = makeFlatMat(scene, 'animalMat', c3.r, c3.g, c3.b);

    // Dispatch to per-animal builder (default: pig)
    const builders = {
        quick_chick:   buildChickModel,
        gentle_cow:    buildCowModel,
        woolly_sheep:  buildSheepModel,
        swift_rabbit:  buildRabbitModel,
        lucky_duck:    buildDuckModel,
        chicken_flock: buildChickenFlockModel,
    };
    const builder = builders[animal.id] || buildPigModel;
    const body = builder(scene, mat);

    body.parent = game.playerRoot;
    if (body.isVisible !== false) body.material = mat;
    game.playerMesh = body;

    // Register shadow casters
    body.getChildMeshes().forEach(m => shadowGen.addShadowCaster(m));
    if (body.isVisible !== false) shadowGen.addShadowCaster(body);
    if (game.rearPlayerRoot) {
        game.rearPlayerRoot.getChildMeshes().forEach(m => shadowGen.addShadowCaster(m));
    }
}

// --- Individual animal model builders ---
// Each returns the root body mesh with children parented to it.

function buildPigModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 1.2, height: 1.0, depth: 1.8 }, scene);
    const head = BABYLON.MeshBuilder.CreateBox('head', { width: 0.8, height: 0.8, depth: 0.6 }, scene);
    head.position.set(0, 0.6, 0.8); head.parent = body; head.material = mat;
    const snout = BABYLON.MeshBuilder.CreateBox('snout', { width: 0.4, height: 0.3, depth: 0.2 }, scene);
    snout.position.set(0, 0.5, 1.1); snout.parent = body; snout.material = mat;
    [[-0.4, 0.6], [0.4, 0.6], [-0.4, -0.6], [0.4, -0.6]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.3, height: 0.5, depth: 0.3 }, scene);
        leg.position.set(x, -0.5, z); leg.parent = body; leg.material = mat;
    });
    body.position.y = 0.75;
    return body;
}

function buildChickModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 0.8, height: 0.8, depth: 1.0 }, scene);
    const head = BABYLON.MeshBuilder.CreateBox('head', { width: 0.5, height: 0.5, depth: 0.5 }, scene);
    head.position.set(0, 0.6, 0.4); head.parent = body; head.material = mat;
    const beakMat = makeFlatMat(scene, 'beakMat', 1, 0.5, 0);
    const beak = BABYLON.MeshBuilder.CreateBox('beak', { width: 0.2, height: 0.1, depth: 0.2 }, scene);
    beak.position.set(0, 0.6, 0.7); beak.parent = body; beak.material = beakMat;
    [[-0.2, 0], [0.2, 0]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.1, height: 0.4, depth: 0.1 }, scene);
        leg.position.set(x, -0.4, z); leg.parent = body; leg.material = beakMat;
    });
    body.position.y = 0.6;
    return body;
}

function buildCowModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 1.5, height: 1.2, depth: 2.2 }, scene);
    const head = BABYLON.MeshBuilder.CreateBox('head', { width: 1.0, height: 1.0, depth: 0.8 }, scene);
    head.position.set(0, 0.8, 1.0); head.parent = body; head.material = mat;
    [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.4, height: 0.6, depth: 0.4 }, scene);
        leg.position.set(x, -0.6, z); leg.parent = body; leg.material = mat;
    });
    body.position.y = 0.9;
    return body;
}

function buildSheepModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 1.2, height: 1.0, depth: 1.7 }, scene);
    // Fluffy wool overlay
    const wool = BABYLON.MeshBuilder.CreateSphere('wool', { diameter: 1.5, segments: 5 }, scene);
    wool.scaling.set(1.05, 0.85, 1.25);
    wool.position.set(0, 0.2, 0); wool.parent = body; wool.material = mat;
    const head = BABYLON.MeshBuilder.CreateBox('sHead', { width: 0.55, height: 0.60, depth: 0.55 }, scene);
    head.position.set(0, 0.4, 0.95); head.parent = body; head.material = mat;
    const earMat = makeFlatMat(scene, 'sEarMat', 0.8, 0.75, 0.7);
    [-0.32, 0.32].forEach(x => {
        const ear = BABYLON.MeshBuilder.CreateBox('ear', { width: 0.22, height: 0.14, depth: 0.08 }, scene);
        ear.position.set(x, 0.18, 0); ear.parent = head; ear.material = earMat;
    });
    [[-0.38, 0.55], [0.38, 0.55], [-0.38, -0.55], [0.38, -0.55]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.22, height: 0.52, depth: 0.22 }, scene);
        leg.position.set(x, -0.52, z); leg.parent = body; leg.material = earMat;
    });
    body.position.y = 0.78;
    return body;
}

function buildRabbitModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 0.85, height: 0.90, depth: 1.25 }, scene);
    const head = BABYLON.MeshBuilder.CreateBox('rHead', { width: 0.62, height: 0.62, depth: 0.58 }, scene);
    head.position.set(0, 0.5, 0.72); head.parent = body; head.material = mat;
    const innerEarMat = makeFlatMat(scene, 'ieM', 1.0, 0.72, 0.72);
    [-0.16, 0.16].forEach(x => {
        const ear = BABYLON.MeshBuilder.CreateBox('ear', { width: 0.14, height: 0.72, depth: 0.10 }, scene);
        ear.position.set(x, 0.68, 0.08); ear.parent = head; ear.material = mat;
        const inner = BABYLON.MeshBuilder.CreateBox('inner', { width: 0.07, height: 0.52, depth: 0.06 }, scene);
        inner.position.set(0, 0, 0.06); inner.parent = ear; inner.material = innerEarMat;
    });
    const tail = BABYLON.MeshBuilder.CreateSphere('rTail', { diameter: 0.28, segments: 4 }, scene);
    tail.position.set(0, 0.22, -0.68); tail.parent = body; tail.material = mat;
    [[-0.28, 0.44], [0.28, 0.44], [-0.28, -0.38], [0.28, -0.38]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.18, height: 0.38, depth: 0.24 }, scene);
        leg.position.set(x, -0.44, z); leg.parent = body; leg.material = mat;
    });
    body.position.y = 0.62;
    return body;
}

function buildDuckModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 1.0, height: 0.9, depth: 1.4 }, scene);
    const neck = BABYLON.MeshBuilder.CreateCylinder('neck', { diameterTop: 0.28, diameterBottom: 0.40, height: 0.52, tessellation: 7 }, scene);
    neck.position.set(0, 0.55, 0.55); neck.parent = body; neck.material = mat;
    const head = BABYLON.MeshBuilder.CreateSphere('dHead', { diameter: 0.50, segments: 6 }, scene);
    head.position.set(0, 0.46, 0.12); head.parent = neck; head.material = mat;
    const billMat = makeFlatMat(scene, 'billMat', 1.0, 0.62, 0.05);
    const bill = BABYLON.MeshBuilder.CreateBox('bill', { width: 0.30, height: 0.08, depth: 0.30 }, scene);
    bill.position.set(0, -0.03, 0.27); bill.parent = head; bill.material = billMat;
    const tail = BABYLON.MeshBuilder.CreateBox('dtail', { width: 0.25, height: 0.35, depth: 0.12 }, scene);
    tail.position.set(0, 0.26, -0.78); tail.rotation.x = 0.45; tail.parent = body; tail.material = mat;
    [-0.25, 0.25].forEach(x => {
        const leg = BABYLON.MeshBuilder.CreateCylinder('dleg', { diameter: 0.13, height: 0.38, tessellation: 5 }, scene);
        leg.position.set(x, -0.52, 0); leg.parent = body; leg.material = billMat;
        const foot = BABYLON.MeshBuilder.CreateBox('foot', { width: 0.30, height: 0.07, depth: 0.35 }, scene);
        foot.position.set(0, -0.22, 0.1); foot.parent = leg; foot.material = billMat;
    });
    body.position.y = 0.65;
    return body;
}

/** Builds the Chicken Flock — 3 front + 2 rear chickens across two tile positions. */
function buildChickenFlockModel(scene, mat) {
    const body = BABYLON.MeshBuilder.CreateBox('body', { width: 0.01, height: 0.01, depth: 0.01 }, scene);
    body.isVisible = false;
    const accentMat = makeFlatMat(scene, 'chickAccent', 1, 0.5, 0);

    // Front group: 3 chickens
    [[-0.70, 0], [0, 0.38], [0.70, 0]].forEach(([x, z]) => {
        game.frontChickenMeshes.push(buildSmallChicken(scene, body, x, z, mat, accentMat));
    });
    body.position.y = 0.62;

    // Rear group: 2 chickens on a separate root (one tile behind)
    game.rearPlayerRoot = new BABYLON.TransformNode('rearRoot', scene);
    const rearBody = BABYLON.MeshBuilder.CreateBox('rearBody', { width: 0.01, height: 0.01, depth: 0.01 }, scene);
    rearBody.isVisible = false;
    rearBody.parent = game.rearPlayerRoot;
    [[-0.45, 0], [0.45, 0]].forEach(([x, z]) => {
        game.rearChickenMeshes.push(buildSmallChicken(scene, rearBody, x, z, mat, accentMat));
    });
    rearBody.position.y = 0.62;

    return body;
}

/** Builds a single small chicken mesh (body, head, beak, legs). */
function buildSmallChicken(scene, parent, offsetX, offsetZ, mat, accentMat) {
    const root = new BABYLON.TransformNode('chick', scene);
    root.parent = parent;
    root.position.set(offsetX, 0.0, offsetZ);
    const b = BABYLON.MeshBuilder.CreateBox('cb', { width: 0.60, height: 0.50, depth: 0.76 }, scene);
    b.parent = root; b.material = mat;
    const h = BABYLON.MeshBuilder.CreateBox('ch', { width: 0.38, height: 0.38, depth: 0.38 }, scene);
    h.position.set(0, 0.40, 0.30); h.parent = root; h.material = mat;
    const bk = BABYLON.MeshBuilder.CreateBox('cbk', { width: 0.15, height: 0.10, depth: 0.15 }, scene);
    bk.position.set(0, 0.38, 0.50); bk.parent = root; bk.material = accentMat;
    [[-0.17, 0], [0.17, 0]].forEach(([x, z]) => {
        const leg = BABYLON.MeshBuilder.CreateBox('cl', { width: 0.10, height: 0.30, depth: 0.10 }, scene);
        leg.position.set(x, -0.37, z); leg.parent = root; leg.material = accentMat;
    });
    return root;
}

// ============================================================
//  7. FARMER OBSTACLES
// ============================================================

/** Spawns a tractor (farmer obstacle) on the given tile index. */
function buildFarmerAt(scene, physIdx) {
    if (game.farmersOnTiles[physIdx]) return;
    const tile = game.tiles[physIdx];
    const root = new BABYLON.TransformNode('farmer_' + physIdx, scene);
    root.position.copyFrom(getTileWorldPosition(physIdx));
    root.rotation.x = tile.rotation.x;

    const tMat = makeFlatMat(scene, 'tMat', 0.8, 0.1, 0.1);
    const wMat = makeFlatMat(scene, 'wMat', 0.1, 0.1, 0.1);

    const body = BABYLON.MeshBuilder.CreateBox('tBody', { width: 1.2, height: 0.8, depth: 1.6 }, scene);
    body.position.set(2.5, 0.5, 0); body.parent = root; body.material = tMat;
    const cab = BABYLON.MeshBuilder.CreateBox('tCab', { width: 0.8, height: 0.8, depth: 0.8 }, scene);
    cab.position.set(0, 0.8, -0.2); cab.parent = body; cab.material = tMat;
    const engine = BABYLON.MeshBuilder.CreateBox('tEng', { width: 0.7, height: 0.5, depth: 0.6 }, scene);
    engine.position.set(0, 0.2, 0.7); engine.parent = body; engine.material = tMat;

    // Large rear wheels
    [[-0.6, -0.4], [0.6, -0.4]].forEach(([x, z]) => {
        const w = BABYLON.MeshBuilder.CreateCylinder('w', { diameter: 0.8, height: 0.3 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(x, -0.1, z); w.parent = body; w.material = wMat;
    });
    // Small front wheels
    [[-0.5, 0.5], [0.5, 0.5]].forEach(([x, z]) => {
        const w = BABYLON.MeshBuilder.CreateCylinder('w', { diameter: 0.4, height: 0.2 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(x, -0.3, z); w.parent = body; w.material = wMat;
    });

    game.farmersOnTiles[physIdx] = { root };
}

/** Removes a farmer obstacle from the given tile and disposes its meshes. */
function removeFarmerAt(physIdx) {
    const data = game.farmersOnTiles[physIdx];
    if (!data) return;
    data.root.getChildMeshes().forEach(m => {
        if (m.material) m.material.dispose();
        m.dispose();
    });
    data.root.dispose();
    delete game.farmersOnTiles[physIdx];
}

// ============================================================
//  8. MOVEMENT & CAMERA
// ============================================================

/** Returns world-space position for a tile, offset upward by PLAYER_TILE_OFFSET. */
function getTileWorldPosition(index) {
    const tile = game.tiles[index % BOARD_SIZE];
    const pos = tile.position.clone();
    const angle = tile.rotation.x;
    pos.y += Math.cos(angle) * PLAYER_TILE_OFFSET;
    pos.z += Math.sin(angle) * PLAYER_TILE_OFFSET;
    return pos;
}

/** Returns the rotation for a tile (orients the player on the curved track). */
function getTileRotation(index) {
    return game.tiles[index % BOARD_SIZE].rotation.clone();
}

/** Main roll action — consumes dice, moves player, then triggers tile events. */
function doRoll() {
    if (game.isMoving || game.dice < game.multiplier) return;
    if (game.flockMode && game.frontChickens + game.rearChickens <= 0) return;

    // Consume dice
    game.dice -= game.multiplier;
    writeSave();

    // Roll 1-6, add speed bonus
    let roll = Math.floor(Math.random() * 6) + 1;
    roll += Math.floor(getSpeed() / 2);

    showDiceResult(Math.min(roll, 6));
    showFeedback('Moved ' + roll + ' fields!');

    // Build the sequence of positions to animate through
    const currentTile = game.tileIndex;
    const positions = [];
    const rotations = [];
    for (let i = 1; i <= roll; i++) {
        const next = (currentTile + i) % BOARD_SIZE;
        positions.push(getTileWorldPosition(next));
        rotations.push(getTileRotation(next));
    }

    // Rear flock group follows one tile behind
    let rearPositions = null;
    let rearRotations = null;
    if (game.flockMode) {
        rearPositions = [];
        rearRotations = [];
        for (let i = 1; i <= roll; i++) {
            const rearNext = (currentTile + i - 1) % BOARD_SIZE;
            rearPositions.push(getTileWorldPosition(rearNext));
            rearRotations.push(getTileRotation(rearNext));
        }
    }

    game.isMoving = true;
    movePlayer(positions, rotations, () => {
        game.isMoving = false;
        const prevIndex = game.tileIndex;
        game.tileIndex += roll;
        const physIdx = game.tileIndex % BOARD_SIZE;
        const rearPhysIdx = game.flockMode
            ? (game.tileIndex - 1 + BOARD_SIZE) % BOARD_SIZE
            : -1;

        // Check for farmer encounters along the path
        const passedFarmerIndices = collectFarmerEncounters(currentTile, roll, physIdx, rearPhysIdx);

        const finishTurn = () => {
            // Check for lap completion
            if (Math.floor(game.tileIndex / BOARD_SIZE) > Math.floor(prevIndex / BOARD_SIZE)) {
                game.laps++;
                const lapCoins = BALANCE.COIN_LAP_BONUS * game.multiplier;
                game.cash += lapCoins;
                awardMeals(BALANCE.MEAL_LAP_BONUS * game.multiplier);
                showEscapeOverlay(game.laps, lapCoins);
            }

            // Handle tile landing effects for active groups
            if (!game.flockMode || game.frontChickens > 0) handleTileLanding(physIdx);
            if (game.flockMode && game.rearChickens > 0) handleTileLanding(rearPhysIdx);

            // Possibly spawn new farmers ahead
            if (!game.flockMode || game.frontChickens > 0) {
                if (Math.random() < BALANCE.FARMER_SPAWN_CHANCE) {
                    buildFarmerAt(game.scene, (physIdx + 40) % BOARD_SIZE);
                }
            }
            if (game.flockMode && game.rearChickens > 0) {
                if (Math.random() < BALANCE.FARMER_SPAWN_CHANCE) {
                    buildFarmerAt(game.scene, (rearPhysIdx + 40) % BOARD_SIZE);
                }
            }

            updateUI();
        };

        if (passedFarmerIndices.length > 0) {
            // Reward for successfully passing/clearing tractors
            const clearBonus = BALANCE.COIN_TRACTOR_CLEAR * passedFarmerIndices.length;
            game.cash += clearBonus;
            awardMeals(2 * passedFarmerIndices.length);
            showFeedback('🍎 Escaped the farmer! +🪙' + clearBonus + ' +🍎' + (2 * passedFarmerIndices.length));

            // Did either group land directly on a farmer tile?
            const frontLandedOnFarmer = (!game.flockMode || game.frontChickens > 0) && !!game.farmersOnTiles[physIdx];
            const rearLandedOnFarmer = game.flockMode && game.rearChickens > 0 && !!game.farmersOnTiles[rearPhysIdx];

            // Farmers that were passed through (not at a landing tile) require an encounter
            const passedThroughFarmers = passedFarmerIndices.filter(idx =>
                idx !== physIdx && !(game.flockMode && idx === rearPhysIdx)
            );

            passedFarmerIndices.forEach(idx => removeFarmerAt(idx));

            if (frontLandedOnFarmer || rearLandedOnFarmer) {
                // Landed directly on a tractor — insta-clear, coins already awarded above
                finishTurn();
            } else if (passedThroughFarmers.length > 0) {
                // Passed through a tractor without landing on it — show escape options
                if (game.flockMode) {
                    showFlockFarmerEncounter(finishTurn);
                } else {
                    showFarmerEncounter(finishTurn);
                }
            } else {
                finishTurn();
            }
        } else {
            finishTurn();
        }
    }, rearPositions, rearRotations);

    animateCamera(positions, rotations);
}

/**
 * Scans the tiles traversed this turn for farmer obstacles.
 * Returns an array of tile indices where farmers were found.
 */
function collectFarmerEncounters(currentTile, roll, physIdx, rearPhysIdx) {
    const indices = [];

    // Front group path
    if (!game.flockMode || game.frontChickens > 0) {
        for (let i = 1; i <= roll; i++) {
            const checkIdx = (currentTile + i) % BOARD_SIZE;
            if (game.farmersOnTiles[checkIdx] && !indices.includes(checkIdx)) {
                indices.push(checkIdx);
            }
        }
    }

    // Rear group starting tile
    if (game.flockMode && game.rearChickens > 0) {
        const rearCheck = currentTile % BOARD_SIZE;
        if (game.farmersOnTiles[rearCheck] && !indices.includes(rearCheck)) {
            indices.push(rearCheck);
        }
    }

    return indices;
}

/** Animates the player (and optionally the rear flock) tile-by-tile. */
function movePlayer(positions, rotations, onComplete, rearPos, rearRot) {
    let idx = 0;
    const fps = 60;
    const frameDuration = 10; // frames per hop

    const step = () => {
        if (idx >= positions.length) { onComplete(); return; }

        const startPos = game.playerRoot.position.clone();
        const startRot = game.playerRoot.rotationQuaternion.clone();
        const endPos = positions[idx];
        const endRot = BABYLON.Quaternion.FromEulerVector(rotations[idx]);

        // Animate main player
        const animP = new BABYLON.Animation('mP', 'position', fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animP.setKeys([{ frame: 0, value: startPos }, { frame: frameDuration, value: endPos }]);
        const animR = new BABYLON.Animation('mR', 'rotationQuaternion', fps, BABYLON.Animation.ANIMATIONTYPE_QUATERNION, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animR.setKeys([{ frame: 0, value: startRot }, { frame: frameDuration, value: endRot }]);

        // Animate rear flock group in parallel
        if (rearPos && rearRot && game.rearPlayerRoot) {
            const rs = game.rearPlayerRoot.position.clone();
            const rr = game.rearPlayerRoot.rotationQuaternion.clone();
            const raP = new BABYLON.Animation('rP', 'position', fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            raP.setKeys([{ frame: 0, value: rs }, { frame: frameDuration, value: rearPos[idx] }]);
            const raR = new BABYLON.Animation('rR', 'rotationQuaternion', fps, BABYLON.Animation.ANIMATIONTYPE_QUATERNION, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            raR.setKeys([{ frame: 0, value: rr }, { frame: frameDuration, value: BABYLON.Quaternion.FromEulerVector(rearRot[idx]) }]);
            game.scene.beginDirectAnimation(game.rearPlayerRoot, [raP, raR], 0, frameDuration, false, 1.0);
        }

        game.scene.beginDirectAnimation(game.playerRoot, [animP, animR], 0, frameDuration, false, 1.0, () => {
            idx++;
            step();
        });
    };
    step();
}

/** Smoothly moves the camera anchor to follow the player's path. */
function animateCamera(positions, rotations) {
    let idx = 0;
    const fps = 60;
    const frameDuration = 10;

    const step = () => {
        if (idx >= positions.length) return;

        const startPos = game.cameraAnchor.position.clone();
        const startRot = game.cameraAnchor.rotationQuaternion.clone();
        const endPos = positions[idx];
        const endRot = BABYLON.Quaternion.FromEulerVector(rotations[idx]);

        const animP = new BABYLON.Animation('cP', 'position', fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animP.setKeys([{ frame: 0, value: startPos }, { frame: frameDuration, value: endPos }]);
        const animR = new BABYLON.Animation('cR', 'rotationQuaternion', fps, BABYLON.Animation.ANIMATIONTYPE_QUATERNION, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animR.setKeys([{ frame: 0, value: startRot }, { frame: frameDuration, value: endRot }]);

        game.scene.beginDirectAnimation(game.cameraAnchor, [animP, animR], 0, frameDuration, false, 1.0, () => {
            idx++;
            step();
        });
    };
    step();
}

// ============================================================
//  9. TILE LOGIC & ENCOUNTERS
// ============================================================

/** Applies the effect of landing on a specific tile type. */
function handleTileLanding(physIdx) {
    const def = game.tileDefs[physIdx];
    const mult = game.multiplier;

    // --- Passive meals from powerups (earned on every tile) ---
    if (game.passiveMealBonus > 0) {
        awardMeals(game.passiveMealBonus * mult);
    }

    // --- Tile-altered meal bonus (non-meal tiles converted by tileAlter powerups) ---
    if (isTileAlteredToMeal(physIdx) && def.type !== 'fuel') {
        const alteredMeals = BALANCE.MEAL_TILE_BASE * mult;
        awardMeals(alteredMeals);
        showFeedback('🌿 Altered path! +🍎' + Math.floor(alteredMeals));
        updateUI();
        return; // Altered tiles override their original effect
    }

    switch (def.type) {
        case 'road':
            game.cash += BALANCE.COIN_ROAD * mult;
            showFeedback('🍃 Peaceful path +🪙' + (BALANCE.COIN_ROAD * mult));
            break;
        case 'cash': {
            // Vary the cash amount based on tile position in the pattern
            const patIdx = physIdx % TILE_PATTERN.length;
            let coinAmount;
            if (patIdx <= 5) coinAmount = BALANCE.COIN_CASH_LOW;
            else if (patIdx <= 12) coinAmount = BALANCE.COIN_CASH_MID;
            else coinAmount = BALANCE.COIN_CASH_HIGH;
            game.cash += coinAmount * mult;
            game.heat += BALANCE.ALERT_CASH_TILE;
            showFeedback('🪙 Found shiny coins! +' + (coinAmount * mult));
            break;
        }
        case 'fuel': {
            const baseMeals = BALANCE.MEAL_TILE_BASE + game.mealTileBonus;
            const totalMeals = baseMeals * mult;
            awardMeals(totalMeals);
            showFeedback('🍎 Found a meal! +' + Math.floor(totalMeals));
            break;
        }
        case 'danger':
            if (Math.random() > 0.3 + getArmor() * 0.1) {
                game.cash = Math.max(0, game.cash - 100);
                game.heat += BALANCE.ALERT_DANGER_FAIL;
                showEventPopup('🕸️', 'TRAPPED!', 'Got caught in a bramble! Lost 🪙100.');
            } else {
                showFeedback('🛡️ Resilience saved you from a trap!');
            }
            break;
        case 'farmer':
            if (game.flockMode) {
                game.heat = Math.max(0, game.heat - BALANCE.ALERT_FLOCK_REDUCE);
                showFeedback('🐔 Chickens scattered! Alert reduced.');
            } else if (Math.random() < 0.2 + getStealth() * 0.1) {
                game.heat = Math.max(0, game.heat - BALANCE.ALERT_SNEAK_REDUCE);
                showFeedback('🦊 Slipped away unseen!');
            } else {
                game.heat += BALANCE.ALERT_FARMER_SPOTTED;
                showEventPopup('🚨', 'SPOTTED!', 'A farmer saw you! Alert +' + BALANCE.ALERT_FARMER_SPOTTED + '.');
            }
            break;
        case 'pit':
            game.dice = Math.min(MAX_DICE, game.dice + 15);
            game.heat = Math.max(0, game.heat - BALANCE.ALERT_PIT_REDUCE);
            showFeedback('💤 Rested in a burrow. +15 Rolls');
            break;
    }

    updateUI();
}

// --- Encounter UI helpers ---

/** Creates a styled choice button and appends it to the container. */
function addChoiceButton(container, label, active, onClick) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn' + (active ? '' : ' choice-disabled');
    btn.textContent = label;
    if (active) btn.onclick = onClick;
    container.appendChild(btn);
}

/** Removes a random purchased upgrade as a distraction. Shared by both encounter types. */
function sacrificePowerup(onDone) {
    const idx = Math.floor(Math.random() * game.purchasedUpgrades.length);
    const upId = game.purchasedUpgrades.splice(idx, 1)[0];
    const up = UPGRADES.find(u => u.id === upId);
    closeOverlay('farmerOverlay');
    showFeedback('🍃 Dropped ' + (up ? up.icon + ' ' + up.name : 'a powerup') + ' as a distraction!');
    onDone();
}

/** Shows the farmer encounter overlay for normal (non-flock) animals. */
function showFarmerEncounter(onResolved) {
    const div = $('farmerChoices');
    div.innerHTML = '';

    const bribeCost = getBribeCost();
    addChoiceButton(div, '🪙 Bribe the farmer (🪙' + bribeCost + ')', game.cash >= bribeCost, () => {
        game.cash -= bribeCost;
        game.bribeCount++;
        closeOverlay('farmerOverlay');
        onResolved();
    });

    addChoiceButton(div, '⚡ Use ' + game.animalDef.ability, !game.abilityUsed, () => {
        game.abilityUsed = true;
        closeOverlay('farmerOverlay');
        onResolved();
    });

    const hasPowerup = game.purchasedUpgrades.length > 0;
    addChoiceButton(div,
        '🍃 Sacrifice a Powerup' + (hasPowerup ? ' (' + game.purchasedUpgrades.length + ' owned)' : ' (none)'),
        hasPowerup, () => sacrificePowerup(onResolved)
    );

    addChoiceButton(div, '🎲 Run for it! (4-6 success)', true, () => {
        const r = Math.floor(Math.random() * 6) + 1;
        showDiceResult(r);
        closeOverlay('farmerOverlay');
        setTimeout(() => {
            if (r >= 4) {
                showEventPopup('🏃', 'SUCCESS!', 'You outran the farmer!', [
                    { label: 'CONTINUE', action: onResolved }
                ]);
            } else {
                showEventPopup('🚜', 'FAILURE!', 'The farmer caught you!', [
                    { label: 'BACK TO SANCTUARY', action: () => { game.cash = 0; returnToSanctuary(); } }
                ]);
            }
        }, 800);
    });

    openOverlay('farmerOverlay');
}

/** Shows the farmer encounter overlay for the Chicken Flock (sacrifice chicken option). */
function showFlockFarmerEncounter(onResolved) {
    const div = $('farmerChoices');
    div.innerHTML = '';

    const total = game.frontChickens + game.rearChickens;
    addChoiceButton(div, '🐔 Sacrifice a Chicken (' + total + ' left)', total > 1, () => {
        sacrificeRandomChicken();
        closeOverlay('farmerOverlay');
        showFeedback('🐔 Left a chicken behind as bait!');
        onResolved();
    });

    const hasPowerup = game.purchasedUpgrades.length > 0;
    addChoiceButton(div,
        '🍃 Sacrifice a Powerup' + (hasPowerup ? ' (' + game.purchasedUpgrades.length + ')' : ' (none)'),
        hasPowerup, () => sacrificePowerup(onResolved)
    );

    addChoiceButton(div, '🎲 Run for it! (4-6 success)', true, () => {
        const r = Math.floor(Math.random() * 6) + 1;
        showDiceResult(r);
        closeOverlay('farmerOverlay');
        setTimeout(() => {
            if (r >= 4) {
                showEventPopup('🏃', 'SUCCESS!', 'The flock outran the farmer!', [
                    { label: 'CONTINUE', action: onResolved }
                ]);
            } else {
                sacrificeRandomChicken();
                const remaining = game.frontChickens + game.rearChickens;
                if (remaining <= 0) {
                    showEventPopup('🚜', 'ALL LOST!', 'The farmer caught all your chickens!', [
                        { label: 'BACK TO SANCTUARY', action: () => { game.cash = 0; returnToSanctuary(); } }
                    ]);
                } else {
                    showEventPopup('🚜', 'CAUGHT!', remaining + ' chickens remaining.', [
                        { label: 'CONTINUE', action: onResolved }
                    ]);
                }
            }
        }, 800);
    });

    openOverlay('farmerOverlay');
}

/** Removes one random chicken from either the front or rear flock group. */
function sacrificeRandomChicken() {
    const candidates = [];
    if (game.frontChickens > 0) candidates.push('front');
    if (game.rearChickens > 0) candidates.push('rear');
    if (candidates.length === 0) return;

    const group = candidates[Math.floor(Math.random() * candidates.length)];
    if (group === 'front') {
        game.frontChickens--;
        const mesh = game.frontChickenMeshes.pop();
        if (mesh) { mesh.getChildMeshes().forEach(m => m.dispose()); mesh.dispose(); }
    } else {
        game.rearChickens--;
        const mesh = game.rearChickenMeshes.pop();
        if (mesh) { mesh.getChildMeshes().forEach(m => m.dispose()); mesh.dispose(); }
    }
    updateRibbon();
}

// ============================================================
//  10. UI HELPERS
// ============================================================

/** Cycles the roll multiplier: 1 → 5 → 20 → 1. */
function cycleMultiplier() {
    game.multiplier = game.multiplier === 1 ? 5 : (game.multiplier === 5 ? 20 : 1);
    $('multBtn').textContent = 'x' + game.multiplier;
    $('rollCost').textContent = 'Cost: ' + game.multiplier + ' 🎲';
}

/** Refreshes all HUD stat values and the progress track bar. */
function updateUI() {
    $('statDice').querySelector('.hud-stat-val').textContent = game.dice;
    $('statCash').querySelector('.hud-stat-val').textContent = game.cash;
    // Show grand total meals for this animal (persistent + current run)
    const animalId = game.animalDef ? game.animalDef.id : game.selectedAnimalId;
    $('statFuel').querySelector('.hud-stat-val').textContent = getAnimalMeals(animalId);
    $('statHeat').querySelector('.hud-stat-val').textContent = game.heat;

    const pct = ((game.tileIndex % BOARD_SIZE) / BOARD_SIZE) * 100;
    $('trackFill').style.width = pct + '%';
    $('trackMarker').style.left = pct + '%';
    $('trackMarker').textContent = game.animalDef ? game.animalDef.emoji : '🐷';
    $('trackProgress').textContent = (game.tileIndex % BOARD_SIZE) + '/' + BOARD_SIZE;
}

/** Updates the animal stats ribbon under the progress track. */
function updateRibbon() {
    if (!game.animalDef) return;
    $('ribbonAnimal').textContent = game.animalDef.emoji + ' ' + game.animalDef.name;
    $('ribbonSpd').textContent = 'SPD ' + getSpeed();
    if (game.flockMode) {
        $('ribbonArm').textContent = '🐔 Front ' + game.frontChickens;
        $('ribbonStl').textContent = '🐔 Rear ' + game.rearChickens;
    } else {
        $('ribbonArm').textContent = 'RES ' + getArmor();
        $('ribbonStl').textContent = 'STH ' + getStealth();
    }
}

/** Displays the dice face briefly in the 3D viewport. */
function showDiceResult(r) {
    const el = $('diceResult');
    el.textContent = DICE_FACES[r - 1];
    el.classList.add('visible');
    clearTimeout(diceResultTimer);
    diceResultTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

/** Shows a floating text feedback message in the 3D viewport. */
function showFeedback(txt) {
    const el = $('feedbackText');
    el.textContent = txt;
    el.classList.add('visible');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

/** Opens a generic event popup with optional choice buttons. */
function showEventPopup(icon, title, desc, choices) {
    $('eventIcon').textContent = icon;
    $('eventTitle').textContent = title;
    $('eventDesc').textContent = desc;

    const choicesDiv = $('eventChoices');
    choicesDiv.innerHTML = '';
    const closeBtn = $('eventCloseBtn');

    if (choices && choices.length > 0) {
        closeBtn.style.display = 'none';
        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = ch.label;
            btn.addEventListener('click', () => {
                ch.action();
                closeOverlay('eventOverlay');
                closeBtn.style.display = '';
            });
            choicesDiv.appendChild(btn);
        });
    } else {
        closeBtn.style.display = '';
    }
    openOverlay('eventOverlay');
}

/** Shows the lap completion celebration overlay. */
function showEscapeOverlay(laps, bonus) {
    const ordinal = laps === 1 ? '1ST' : laps === 2 ? '2ND' : laps === 3 ? '3RD' : laps + 'TH';
    const emojis = ['🌿🦋🌿', '🌻🌞🌻', '🦊🍀🦊', '🌈🕊️🌈', '🦋🌺🦋'];
    const lapMeals = BALANCE.MEAL_LAP_BONUS * game.multiplier;

    $('lapCelebration').textContent = emojis[(laps - 1) % emojis.length];
    $('lapTitle').textContent = ordinal + ' ESCAPE!';
    $('lapDesc').textContent = laps === 1
        ? 'You reached the wild for the first time!'
        : 'Keep running — nature awaits!';
    $('lapRewards').innerHTML =
        '<div class="lap-reward lap-reward-gold">🪙 Coins: +' + bonus.toLocaleString() + '</div>' +
        '<div class="lap-reward lap-reward-green">🍎 Meals: +' + lapMeals + '</div>' +
        '<div class="lap-reward lap-reward-info">★ Total laps: ' + laps + '</div>';

    $('lapKeepBtn').onclick = () => closeOverlay('lapOverlay');
    $('lapSanctuaryBtn').onclick = () => { closeOverlay('lapOverlay'); returnToSanctuary(); };

    openOverlay('lapOverlay');
}

/** Opens the in-run upgrade shop overlay. */
function openUpgradeShop() {
    $('upgradeCash').textContent = '🪙 ' + game.cash.toLocaleString();
    const grid = $('upgradeGrid');
    grid.innerHTML = '';

    UPGRADES.forEach(up => {
        const canAfford = game.cash >= up.cost;
        const item = document.createElement('div');
        item.className = 'upgrade-item' + (canAfford ? '' : ' cant-afford');
        item.innerHTML =
            '<div class="upgrade-icon">' + up.icon + '</div>' +
            '<div class="upgrade-info"><b>' + up.name + '</b><br><small>' + up.desc + '</small></div>' +
            '<div class="upgrade-price">🪙' + up.cost + '</div>';

        if (canAfford) {
            item.onclick = () => {
                game.cash -= up.cost;
                game.purchasedUpgrades.push(up.id);
                applyUpgrade(up);
                openUpgradeShop(); // refresh shop display
                updateUI();
                updateRibbon();
            };
        }
        grid.appendChild(item);
    });

    openOverlay('upgradeOverlay');
}

/** Applies a purchased upgrade's stat bonus and meal effect. */
function applyUpgrade(up) {
    // --- Stat bonuses ---
    switch (up.stat) {
        case 'dice':    game.dice = Math.min(MAX_DICE, game.dice + 30); break;
        case 'speed':   game.runSpeed += (up.id === 'mushrooms' ? 2 : 1); break;
        case 'stealth': game.runStealth += (up.id === 'feathers' ? 2 : 1); break;
        case 'armor':   game.runArmor += (up.id === 'stones' ? 2 : 1); break;
        case 'fuel':    /* meals handled below */ break;
        case 'none':    /* tile-alter powerups have no stat */ break;
    }

    // --- Meal effects ---
    const tier = up.tier;
    if (up.mealEffect === 'passive') {
        const passiveAmount = tier === 'cheap' ? BALANCE.MEAL_PASSIVE_CHEAP
                            : tier === 'mid'   ? BALANCE.MEAL_PASSIVE_MID
                            :                    BALANCE.MEAL_PASSIVE_EXPENSIVE;
        game.passiveMealBonus += passiveAmount;

        const tileBonus = tier === 'cheap' ? BALANCE.MEAL_TILE_BONUS_CHEAP
                        : tier === 'mid'   ? BALANCE.MEAL_TILE_BONUS_MID
                        :                    BALANCE.MEAL_TILE_BONUS_EXPENSIVE;
        game.mealTileBonus += tileBonus;
    }

    if (up.mealEffect === 'instant') {
        const instantMeals = tier === 'cheap' ? BALANCE.MEAL_INSTANT_CHEAP
                           : tier === 'mid'   ? BALANCE.MEAL_INSTANT_MID
                           :                    BALANCE.MEAL_INSTANT_EXPENSIVE;
        if (instantMeals > 0) awardMeals(instantMeals);
    }

    if (up.mealEffect === 'tileAlter') {
        game.tileAlterCount++;
        applyTileAlterations();
    }

    showFeedback('🍃 ' + up.name + ' used!');
    writeSave();
}

/** Renders checkpoint markers on the progress track bar. */
function renderTrackCities() {
    const container = $('trackCities');
    container.innerHTML = '';
    TRACK_CITIES.forEach(c => {
        const m = document.createElement('div');
        m.className = 'track-city-mark';
        m.style.left = c.pct + '%';
        m.innerHTML = '<span class="city-dot"></span><span class="city-name">' + c.name + '</span>';
        container.appendChild(m);
    });
}

function openOverlay(id) { $(id).classList.add('active'); }
function closeOverlay(id) { $(id).classList.remove('active'); }

// ============================================================
//  11. ENTRY POINT
// ============================================================

function debugReset() {
    if (!confirm('Reset all progress? This cannot be undone.')) return;
    localStorage.removeItem(SAVE_KEY);
    persist.totalCash = 0;
    persist.unlockedAnimals = ['brave_pig'];
    persist.dice = STARTING_DICE;
    persist.lastDiceUpdate = Date.now();
    persist.animalMeals = {};
    game.selectedAnimalId = 'brave_pig';
    renderSanctuary();
}

function debugCoins() {
    persist.totalCash += 5000;
    writeSave();
    renderSanctuary();
}

document.addEventListener('DOMContentLoaded', initStartScreen);
