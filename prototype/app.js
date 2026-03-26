// ============================================================
//  ANIMAL ESCAPE: RUN TO FREEDOM
//  3D Dice-rolling escape board game
//  Built with BabylonJS — circular planet track
// ============================================================

// ===== CONFIGURATION =====
const BOARD_SIZE = 80;
const TILE_SIZE = 3;
const TILE_SPACING = 6;
const STARTING_DICE = 150;
const MAX_DICE = 500;
const DICE_REFILL_AMT = 5;
const DICE_REFILL_TIME = 30000; // 30 seconds
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SAVE_KEY = 'animal_escape_p1_save';
const FARMER_SPAWN_CHANCE = 0.3;
const FARMER_COST = 500;

// Checkpoint milestones
const TRACK_CITIES = [
    { name: 'Muddy Path',    pct: 12 },
    { name: 'Creek Cross',   pct: 25 },
    { name: 'Wild Fields',   pct: 40 },
    { name: 'Dark Woods',    pct: 55 },
    { name: 'Hill Top',      pct: 72 },
    { name: 'Nature Haven',  pct: 88 },
];

// ===== ANIMALS =====
const ANIMALS = [
    { id: 'brave_pig',   name: 'Brave Piggy',   emoji: '🐷', color: '#FFB6C1', speed: 0, armor: 1, stealth: 0, price: 0,     ability: 'Mud Slide',  desc: 'Loves the mud. Sturdy and reliable.' },
    { id: 'quick_chick', name: 'Swift Chick',    emoji: '🐤', color: '#FFF380', speed: 2, armor: 0, stealth: 0, price: 1500,  ability: 'Wing Flutter', desc: 'Fast but fragile.' },
    { id: 'gentle_cow',  name: 'Gentle Cow',     emoji: '🐮', color: '#F0F0F0', speed: 0, armor: 2, stealth: 0, price: 3000,  ability: 'Stampede',   desc: 'Very tough to stop.' },
];

// ===== IN-GAME UPGRADES =====
const UPGRADES = [
    { id: 'dice30',    name: '30 Rolls',        icon: '🎲', desc: 'Ancient luck stones',           stat: 'dice',    cost: 1000 },
    { id: 'berries',   name: 'Wild Berries',    icon: '🍒', desc: '+1 Speed (Energy boost)',       stat: 'speed',   cost: 500  },
    { id: 'clover',    name: 'Lucky Clover',    icon: '🍀', desc: '+1 Stealth (Natural camo)',      stat: 'stealth', cost: 600  },
    { id: 'bark',      name: 'Oak Bark',        icon: '🌳', desc: '+1 Resilience (Tough skin)',    stat: 'armor',   cost: 700  },
    { id: 'apple',     name: 'Sweet Apple',     icon: '🍎', desc: '+30 Meals (Stamina)',           stat: 'fuel',    cost: 400  },
    { id: 'mushrooms', name: 'Magic Fungi',     icon: '🍄', desc: '+2 Speed (Wild rush)',          stat: 'speed',   cost: 1500 },
    { id: 'feathers',  name: 'Hawk Feather',    icon: '🪶', desc: '+2 Stealth (Silent movement)',   stat: 'stealth', cost: 1200 },
    { id: 'stones',    name: 'River Stones',    icon: '🪨', desc: '+2 Resilience (Hardened)',      stat: 'armor',   cost: 1400 },
];

// Tile pattern
const TILE_PATTERN = [
    { type: 'start',  color: '#228B22', value: 0   },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'cash',   color: '#FFD700', value: 100 },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'danger', color: '#FF4500', value: 0   },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'fuel',   color: '#32CD32', value: 15  },
    { type: 'cop',    color: '#E63946', value: 0   },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'bonus',  color: '#00FA9A', value: 0   },
    { type: 'cash',   color: '#FFD700', value: 150 },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'event',  color: '#4169E1', value: 0   },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'rival',  color: '#FF69B4', value: 0   },
    { type: 'fuel',   color: '#32CD32', value: 20  },
    { type: 'road',   color: '#8B4513', value: 50  },
    { type: 'cash',   color: '#FFD700', value: 200 },
    { type: 'pit',    color: '#98FB98', value: 0   },
    { type: 'road',   color: '#8B4513', value: 50  },
];

// ===== PERSISTENT STATE =====
let persist = {
    totalCash: 0,
    unlockedCars: ['brave_pig'],
    dice: STARTING_DICE,
    lastDiceUpdate: Date.now(),
};

// ===== RUN STATE =====
const game = {
    carDef: null,
    runSpeed: 0,
    runArmor: 0,
    runStealth: 0,
    dice: 0, // synced with persist.dice
    cash: 0,
    fuel: 0,
    heat: 0,
    laps: 0,
    tileIndex: 0,
    multiplier: 1,
    isMoving: false,
    selectedCarId: 'brave_pig',

    engine: null,
    scene: null,
    camera: null,
    cameraAnchor: null,
    playerRoot: null,
    playerMesh: null,
    tiles: [],
    tileDefs: [],
    boardRadius: 0,
    policeOnTiles: {},
    abilityUsed: false,
    purchasedUpgrades: [],
    diceTimer: null,
};

const $ = id => document.getElementById(id);
let feedbackTimer = null;
let diceResultTimer = null;

// ============================================================
//  LOGIC
// ============================================================
function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            persist.totalCash = data.totalCash || 0;
            persist.unlockedCars = data.unlockedCars || ['brave_pig'];
            persist.dice = data.dice !== undefined ? data.dice : STARTING_DICE;
            persist.lastDiceUpdate = data.lastDiceUpdate || Date.now();
        }
    } catch (_) {}
}

function writeSave() {
    persist.dice = game.dice;
    localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
}

function startDiceTimer() {
    if (game.diceTimer) clearInterval(game.diceTimer);
    game.diceTimer = setInterval(() => {
        const now = Date.now();
        const elapsed = now - persist.lastDiceUpdate;
        const progress = Math.min(100, (elapsed / DICE_REFILL_TIME) * 100);
        
        const bar = $('diceTimerFill');
        if (bar) bar.style.width = progress + '%';

        if (elapsed >= DICE_REFILL_TIME) {
            if (game.dice < MAX_DICE) {
                game.dice += DICE_REFILL_AMT;
                updateUI();
            }
            persist.lastDiceUpdate = now;
            writeSave();
        }
    }, 100);
}

function getSpeed()   { return (game.carDef ? game.carDef.speed : 0) + game.runSpeed; }
function getArmor()   { return (game.carDef ? game.carDef.armor : 0) + game.runArmor; }
function getStealth() { return (game.carDef ? game.carDef.stealth : 0) + game.runStealth; }

function initStartScreen() {
    loadSave();
    renderGarage();
}

function renderGarage() {
    $('garageBank').textContent = '🪙 ' + persist.totalCash.toLocaleString();
    const grid = $('carGrid');
    grid.innerHTML = '';

    ANIMALS.forEach(animal => {
        const owned = persist.unlockedCars.includes(animal.id);
        const card = document.createElement('div');
        card.className = 'car-card' + (animal.id === game.selectedCarId ? ' selected' : '') + (!owned ? ' locked' : '');
        card.innerHTML =
            '<div class="car-card-emoji">' + animal.emoji + '</div>' +
            '<div class="car-card-name">' + animal.name + '</div>' +
            (!owned ? '<div class="car-card-price">🪙 ' + animal.price.toLocaleString() + '</div>' : '') +
            (!owned ? '<div class="car-card-lock">🔒</div>' : '');

        card.addEventListener('click', () => {
            if (owned) {
                game.selectedCarId = animal.id;
                renderGarage();
            } else if (persist.totalCash >= animal.price) {
                persist.totalCash -= animal.price;
                persist.unlockedCars.push(animal.id);
                game.selectedCarId = animal.id;
                writeSave();
                renderGarage();
            }
        });
        grid.appendChild(card);
    });

    const animal = ANIMALS.find(c => c.id === game.selectedCarId) || ANIMALS[0];
    $('selCarEmoji').textContent = animal.emoji;
    $('selCarName').textContent = animal.name;
    $('selCarStats').innerHTML =
        '<span class="sel-stat sel-stat-spd">SPD ' + animal.speed + '</span>' +
        '<span class="sel-stat sel-stat-arm">RES ' + animal.armor + '</span>' +
        '<span class="sel-stat sel-stat-stl">STH ' + animal.stealth + '</span>';

    const isOwned = persist.unlockedCars.includes(animal.id);
    $('startRunBtn').disabled = !isOwned;
    $('startRunBtn').textContent = isOwned ? 'BEGIN ESCAPE 🌿' : '🔒 UNLOCK FOR 🪙 ' + animal.price.toLocaleString();
    $('startRunBtn').onclick = () => { if (isOwned) startRun(animal); };
}

function startRun(animal) {
    game.carDef = animal;
    game.runSpeed = 0; game.runArmor = 0; game.runStealth = 0;
    
    // Reset dice and timer for the start of every run
    game.dice = STARTING_DICE;
    persist.dice = game.dice;
    persist.lastDiceUpdate = Date.now();
    writeSave();

    game.cash = 0; game.fuel = 0; game.heat = 0; game.laps = 0;
    game.tileIndex = 0; game.multiplier = 1; game.isMoving = false;
    game.tiles = []; game.tileDefs = []; game.policeOnTiles = {};
    game.abilityUsed = false; game.purchasedUpgrades = [];

    $('startScreen').classList.add('hidden');
    $('gameScreen').classList.remove('hidden');
    $('trackMarker').textContent = animal.emoji;
    
    initGame();
    startDiceTimer();
}

function returnToGarage() {
    if (game.diceTimer) clearInterval(game.diceTimer);
    persist.totalCash += game.cash;
    writeSave();
    if (game.engine) {
        game.engine.stopRenderLoop();
        game.scene.dispose();
        game.engine.dispose();
        game.engine = null;
    }
    $('gameScreen').classList.add('hidden');
    $('startScreen').classList.remove('hidden');
    renderGarage();
}

function initGame() {
    const canvas = $('renderCanvas');
    game.engine = new BABYLON.Engine(canvas, true);
    game.scene = createScene();
    game.engine.runRenderLoop(() => game.scene.render());
    window.addEventListener('resize', () => { if (game.engine) game.engine.resize(); });

    $('rollBtn').onclick = doRoll;
    $('multBtn').onclick = cycleMultiplier;
    $('eventCloseBtn').onclick = () => closeOverlay('eventOverlay');
    $('upgradeBtn').onclick = () => openUpgradeShop();
    $('upgradeCloseBtn').onclick = () => closeOverlay('upgradeOverlay');

    updateUI();
    updateRibbon();
    renderTrackCities();
}

function createScene() {
    const scene = new BABYLON.Scene(game.engine);
    // Vibrant nature background
    scene.clearColor = new BABYLON.Color4(0.1, 0.25, 0.1, 1);

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new BABYLON.Color3(0.2, 0.4, 0.2);

    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), scene);
    dir.position = new BABYLON.Vector3(50, 50, 50);
    dir.intensity = 0.9;
    
    const shadowGen = new BABYLON.ShadowGenerator(1024, dir);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 48;
    shadowGen.darkness = 0.4; // Softer shadows

    buildBoard(scene);
    buildPlanetProps(scene);
    buildPlayer(scene, shadowGen);

    const startPos = getTileWorldPosition(0);
    const startRot = getTileRotation(0);
    game.playerRoot.position = startPos;
    game.playerRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(startRot);

    game.cameraAnchor = new BABYLON.TransformNode("camAnchor", scene);
    game.cameraAnchor.position = startPos.clone();
    game.cameraAnchor.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(startRot);

    game.camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 10, -20), scene);
    game.camera.parent = game.cameraAnchor;
    game.camera.setTarget(BABYLON.Vector3.Zero());

    return scene;
}

function buildBoard(scene) {
    const totalLength = BOARD_SIZE * TILE_SPACING;
    game.boardRadius = totalLength / (2 * Math.PI);
    const boardRoot = new BABYLON.TransformNode("boardRoot", scene);
    const matCache = {};

    for (let i = 0; i < BOARD_SIZE; i++) {
        const configIdx = i % TILE_PATTERN.length;
        const tileDef = Object.assign({}, TILE_PATTERN[configIdx]);
        const tile = BABYLON.MeshBuilder.CreateBox('tile_' + i, { width: TILE_SIZE * 2.5, height: 0.5, depth: TILE_SIZE * 1.8 }, scene);
        const angle = (i * TILE_SPACING) / game.boardRadius;
        tile.position.set(0, game.boardRadius * Math.cos(angle) - game.boardRadius, game.boardRadius * Math.sin(angle));
        tile.rotation.x = angle;

        if (!matCache[tileDef.color]) {
            const mat = new BABYLON.StandardMaterial('mat_' + tileDef.color, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(tileDef.color);
            matCache[tileDef.color] = mat;
        }
        tile.material = matCache[tileDef.color];
        tile.parent = boardRoot;
        tile.metadata = tileDef;
        tile.receiveShadows = true;
        game.tiles.push(tile);
        game.tileDefs.push(tileDef);
    }

    const core = BABYLON.MeshBuilder.CreateSphere("core", { diameter: (game.boardRadius - 0.5) * 2, segments: 48 }, scene);
    core.position.set(0, -game.boardRadius, 0);
    const coreMat = new BABYLON.StandardMaterial("coreMat", scene);
    coreMat.diffuseColor = new BABYLON.Color3(0.05, 0.15, 0.05);
    core.material = coreMat;
    core.parent = boardRoot;
    core.receiveShadows = true;
}

function buildPlanetProps(scene) {
    const propRoot = new BABYLON.TransformNode("propRoot", scene);
    const treeMat = new BABYLON.StandardMaterial("treeMat", scene);
    treeMat.diffuseColor = new BABYLON.Color3(0.1, 0.6, 0.1);
    const trunkMat = new BABYLON.StandardMaterial("trunkMat", scene);
    trunkMat.diffuseColor = new BABYLON.Color3(0.3, 0.15, 0.05);

    for (let i = 0; i < 120; i++) {
        const angle = Math.random() * Math.PI * 2;
        const side = (Math.random() < 0.5 ? -1 : 1) * (TILE_SIZE + 2 + Math.random() * 8);
        const anchor = new BABYLON.TransformNode("p", scene);
        anchor.position.set(side, (game.boardRadius - 0.5) * Math.cos(angle) - game.boardRadius, (game.boardRadius - 0.5) * Math.sin(angle));
        anchor.rotation.x = angle;
        anchor.parent = propRoot;

        const h = 0.8 + Math.random();
        const trunk = BABYLON.MeshBuilder.CreateCylinder("t", { diameter: 0.15, height: h, tessellation: 6 }, scene);
        trunk.position.y = h / 2; trunk.parent = anchor; trunk.material = trunkMat;
        const canopy = BABYLON.MeshBuilder.CreateSphere("c", { diameter: 0.6 + Math.random(), segments: 6 }, scene);
        canopy.position.y = h; canopy.parent = anchor; canopy.material = treeMat;
    }
}

function buildPlayer(scene, shadowGen) {
    game.playerRoot = new BABYLON.TransformNode("playerRoot", scene);
    const animal = game.carDef;
    const mat = new BABYLON.StandardMaterial("animalMat", scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(animal.color);

    let body;
    if (animal.id === 'quick_chick') {
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 0.8, height: 0.8, depth: 1.0 }, scene);
        const head = BABYLON.MeshBuilder.CreateBox("head", { width: 0.5, height: 0.5, depth: 0.5 }, scene);
        head.position.set(0, 0.6, 0.4); head.parent = body; head.material = mat;
        const beak = BABYLON.MeshBuilder.CreateBox("beak", { width: 0.2, height: 0.1, depth: 0.2 }, scene);
        beak.position.set(0, 0.6, 0.7); beak.parent = body;
        const bMat = new BABYLON.StandardMaterial("bMat", scene); bMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0);
        beak.material = bMat;
        [[ -0.2, 0 ], [ 0.2, 0 ]].forEach(p => {
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.1, height: 0.4, depth: 0.1 }, scene);
            leg.position.set(p[0], -0.4, p[1]); leg.parent = body; leg.material = bMat;
        });
        body.position.y = 0.6;
    } else if (animal.id === 'gentle_cow') {
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 1.5, height: 1.2, depth: 2.2 }, scene);
        const head = BABYLON.MeshBuilder.CreateBox("head", { width: 1.0, height: 1.0, depth: 0.8 }, scene);
        head.position.set(0, 0.8, 1.0); head.parent = body; head.material = mat;
        [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]].forEach(p => {
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.4, height: 0.6, depth: 0.4 }, scene);
            leg.position.set(p[0], -0.6, p[1]); leg.parent = body; leg.material = mat;
        });
        body.position.y = 0.9;
    } else {
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 1.2, height: 1.0, depth: 1.8 }, scene);
        const head = BABYLON.MeshBuilder.CreateBox("head", { width: 0.8, height: 0.8, depth: 0.6 }, scene);
        head.position.set(0, 0.6, 0.8); head.parent = body; head.material = mat;
        const snout = BABYLON.MeshBuilder.CreateBox("snout", { width: 0.4, height: 0.3, depth: 0.2 }, scene);
        snout.position.set(0, 0.5, 1.1); snout.parent = body; snout.material = mat;
        [[-0.4, 0.6], [0.4, 0.6], [-0.4, -0.6], [0.4, -0.6]].forEach(p => {
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.3, height: 0.5, depth: 0.3 }, scene);
            leg.position.set(p[0], -0.5, p[1]); leg.parent = body; leg.material = mat;
        });
        body.position.y = 0.75;
    }

    body.parent = game.playerRoot;
    body.material = mat;
    game.playerMesh = body;
    body.getChildMeshes().forEach(m => shadowGen.addShadowCaster(m));
    shadowGen.addShadowCaster(body);
}

function buildFarmerAt(scene, physIdx) {
    if (game.policeOnTiles[physIdx]) return;
    const tile = game.tiles[physIdx];
    const root = new BABYLON.TransformNode('farmer_' + physIdx, scene);
    root.position.copyFrom(getTileWorldPosition(physIdx));
    root.rotation.x = tile.rotation.x;

    // Simple Tractor Model
    const tMat = new BABYLON.StandardMaterial('tMat', scene); tMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
    const wMat = new BABYLON.StandardMaterial('wMat', scene); wMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const body = BABYLON.MeshBuilder.CreateBox('tBody', { width: 1.2, height: 0.8, depth: 1.6 }, scene);
    body.position.set(2.5, 0.5, 0); body.parent = root; body.material = tMat;

    const cab = BABYLON.MeshBuilder.CreateBox('tCab', { width: 0.8, height: 0.8, depth: 0.8 }, scene);
    cab.position.set(0, 0.8, -0.2); cab.parent = body; cab.material = tMat;

    const engine = BABYLON.MeshBuilder.CreateBox('tEng', { width: 0.7, height: 0.5, depth: 0.6 }, scene);
    engine.position.set(0, 0.2, 0.7); engine.parent = body; engine.material = tMat;

    // Large rear wheels
    [[-0.6, -0.4], [0.6, -0.4]].forEach(p => {
        const w = BABYLON.MeshBuilder.CreateCylinder('w', { diameter: 0.8, height: 0.3 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(p[0], -0.1, p[1]); w.parent = body; w.material = wMat;
    });
    // Small front wheels
    [[-0.5, 0.5], [0.5, 0.5]].forEach(p => {
        const w = BABYLON.MeshBuilder.CreateCylinder('w', { diameter: 0.4, height: 0.2 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(p[0], -0.3, p[1]); w.parent = body; w.material = wMat;
    });

    game.policeOnTiles[physIdx] = { root };
}

function removeFarmerAt(physIdx) {
    const data = game.policeOnTiles[physIdx];
    if (data) { 
        data.root.getChildMeshes().forEach(m => { if (m.material) m.material.dispose(); m.dispose(); });
        data.root.dispose(); delete game.policeOnTiles[physIdx]; 
    }
}

function getTileWorldPosition(index) {
    const tile = game.tiles[index % BOARD_SIZE];
    const pos = tile.position.clone();
    const angle = tile.rotation.x;
    pos.y += Math.cos(angle) * 1.0; pos.z += Math.sin(angle) * 1.0;
    return pos;
}

function getTileRotation(index) { return game.tiles[index % BOARD_SIZE].rotation.clone(); }

function doRoll() {
    if (game.isMoving || game.dice < game.multiplier) return;
    game.dice -= game.multiplier;
    writeSave();
    
    let roll = Math.floor(Math.random() * 6) + 1;
    const speedBonus = Math.floor(getSpeed() / 2);
    roll += speedBonus;

    showDiceResult(Math.min(roll, 6));
    showFeedback('Moved ' + roll + ' fields!');

    const currentTile = game.tileIndex;
    const positions = [], rotations = [];
    for (let i = 1; i <= roll; i++) {
        const next = (currentTile + i) % BOARD_SIZE;
        positions.push(getTileWorldPosition(next)); rotations.push(getTileRotation(next));
    }

    game.isMoving = true;
    movePlayer(positions, rotations, () => {
        game.isMoving = false;
        const prevIndex = game.tileIndex;
        game.tileIndex += roll;
        const physIdx = game.tileIndex % BOARD_SIZE;

        const passedFarmerIndices = [];
        for (let i = 1; i <= roll; i++) {
            const checkIdx = (currentTile + i) % BOARD_SIZE;
            if (game.policeOnTiles[checkIdx]) passedFarmerIndices.push(checkIdx);
        }

        const finish = () => {
            if (Math.floor(game.tileIndex / BOARD_SIZE) > Math.floor(prevIndex / BOARD_SIZE)) {
                game.laps++; game.cash += 500 * game.multiplier; game.fuel += 50;
                showEscapeOverlay(game.laps, 500 * game.multiplier);
            }
            handleTileLanding(physIdx);
            if (Math.random() < FARMER_SPAWN_CHANCE) buildFarmerAt(game.scene, (physIdx + 40) % BOARD_SIZE);
            updateUI();
        };

        if (passedFarmerIndices.length > 0) {
            game.fuel += 20 * passedFarmerIndices.length;
            showFeedback('🍎 Successfully escaped the farmer! +20 Meals');
            const landedOnFarmer = game.policeOnTiles[physIdx];
            passedFarmerIndices.forEach(idx => removeFarmerAt(idx));
            if (landedOnFarmer) finish(); else showFarmerEncounter(finish);
        } else {
            finish();
        }
    });
    animateCamera(positions, rotations);
}

function movePlayer(pos, rot, cb) {
    let idx = 0; const fps = 60, dur = 10;
    const step = () => {
        if (idx >= pos.length) { cb(); return; }
        const startPos = game.playerRoot.position.clone(), startRot = game.playerRoot.rotationQuaternion.clone();
        const endPos = pos[idx], endRot = BABYLON.Quaternion.FromEulerVector(rot[idx]);
        const animP = new BABYLON.Animation("mP", "position", fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animP.setKeys([{ frame: 0, value: startPos }, { frame: dur, value: endPos }]);
        const animR = new BABYLON.Animation("mR", "rotationQuaternion", fps, BABYLON.Animation.ANIMATIONTYPE_QUATERNION, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animR.setKeys([{ frame: 0, value: startRot }, { frame: dur, value: endRot }]);
        game.scene.beginDirectAnimation(game.playerRoot, [animP, animR], 0, dur, false, 1.0, () => { idx++; step(); });
    };
    step();
}

function animateCamera(pos, rot) {
    let idx = 0; const fps = 60, dur = 10;
    const step = () => {
        if (idx >= pos.length) return;
        const startPos = game.cameraAnchor.position.clone(), startRot = game.cameraAnchor.rotationQuaternion.clone();
        const endPos = pos[idx], endRot = BABYLON.Quaternion.FromEulerVector(rot[idx]);
        const animP = new BABYLON.Animation("cP", "position", fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animP.setKeys([{ frame: 0, value: startPos }, { frame: dur, value: endPos }]);
        const animR = new BABYLON.Animation("cR", "rotationQuaternion", fps, BABYLON.Animation.ANIMATIONTYPE_QUATERNION, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animR.setKeys([{ frame: 0, value: startRot }, { frame: dur, value: endRot }]);
        game.scene.beginDirectAnimation(game.cameraAnchor, [animP, animR], 0, dur, false, 1.0, () => { idx++; step(); });
    };
    step();
}

function handleTileLanding(physIdx) {
    const def = game.tileDefs[physIdx];
    const mult = game.multiplier;
    switch (def.type) {
        case 'road': game.cash += 50 * mult; showFeedback('🍃 Peaceful path +🪙' + (50 * mult)); break;
        case 'cash': game.cash += 100 * mult; game.heat += 2; showFeedback('🪙 Found shiny coins! + ' + (100 * mult)); break;
        case 'fuel': game.fuel += 15 * mult; showFeedback('🍎 Found a meal! +' + (15 * mult)); break;
        case 'danger': 
            if (Math.random() > 0.3 + getArmor() * 0.1) {
                game.cash = Math.max(0, game.cash - 100); game.heat += 5;
                showEventPopup('🕸️', 'TRAPPED!', 'Got caught in a bramble! Lost 🪙100.');
            } else showFeedback('🛡️ Resilience saved you from a trap!');
            break;
        case 'cop':
            if (Math.random() < 0.2 + getStealth() * 0.1) {
                game.heat = Math.max(0, game.heat - 10); showFeedback('🦊 Slipped away unseen!');
            } else {
                game.heat += 15; showEventPopup('🚨', 'SPOTTED!', 'A farmer saw you! Alert +15.');
            }
            break;
        case 'pit': game.dice = Math.min(MAX_DICE, game.dice + 15); game.heat = Math.max(0, game.heat - 10); showFeedback('💤 Rested in a burrow. +15 Rolls'); break;
    }
    updateUI();
}

function showFarmerEncounter(onResolved) {
    const div = $('policeChoices'); div.innerHTML = '';
    const addBtn = (txt, active, fn) => {
        const b = document.createElement('button'); b.className = 'choice-btn' + (active ? '' : ' choice-disabled');
        b.textContent = txt; if (active) b.onclick = () => { fn(); };
        div.appendChild(b);
    };
    addBtn('🪙 Give 500 Coins bribe', game.cash >= FARMER_COST, () => {
        game.cash -= FARMER_COST; closeOverlay('policeOverlay'); onResolved();
    });
    addBtn('⚡ Use ' + game.carDef.ability, !game.abilityUsed, () => {
        game.abilityUsed = true; closeOverlay('policeOverlay'); onResolved();
    });
    addBtn('🎲 Run for it! (4-6 success)', true, () => {
        const r = Math.floor(Math.random() * 6) + 1;
        showDiceResult(r);
        closeOverlay('policeOverlay');
        setTimeout(() => {
            if (r >= 4) showEventPopup('🏃', 'SUCCESS!', 'You outran the farmer!', [{ label: 'CONTINUE', action: onResolved }]);
            else showEventPopup('🚜', 'FAILURE!', 'The farmer caught you!', [{ label: 'BACK TO SANCTUARY', action: () => { game.cash = 0; returnToGarage(); } }]);
        }, 800);
    });
    openOverlay('policeOverlay');
}

function openUpgradeShop() {
    $('upgradeCash').textContent = '🪙 ' + game.cash.toLocaleString();
    const grid = $('upgradeGrid'); grid.innerHTML = '';
    UPGRADES.forEach(up => {
        const item = document.createElement('div'); item.className = 'upgrade-item' + (game.cash < up.cost ? ' cant-afford' : '');
        item.innerHTML = `<div class="upgrade-icon">${up.icon}</div><div class="upgrade-info"><b>${up.name}</b><br><small>${up.desc}</small></div><div class="upgrade-price">🪙${up.cost}</div>`;
        if (game.cash >= up.cost) item.onclick = () => {
            game.cash -= up.cost; applyUpgrade(up); openUpgradeShop(); updateUI(); updateRibbon();
        };
        grid.appendChild(item);
    });
    openOverlay('upgradeOverlay');
}

function applyUpgrade(up) {
    if (up.stat === 'dice') game.dice = Math.min(MAX_DICE, game.dice + 30);
    else if (up.stat === 'speed') game.runSpeed += (up.id === 'mushrooms' ? 2 : 1);
    else if (up.stat === 'stealth') game.runStealth += (up.id === 'feathers' ? 2 : 1);
    else if (up.stat === 'armor') game.runArmor += (up.id === 'stones' ? 2 : 1);
    else if (up.stat === 'fuel') game.fuel += 30;
    showFeedback('🍃 ' + up.name + ' used!');
    writeSave();
}

function cycleMultiplier() {
    game.multiplier = game.multiplier === 1 ? 5 : (game.multiplier === 5 ? 20 : 1);
    $('multBtn').textContent = 'x' + game.multiplier;
    $('rollCost').textContent = 'Cost: ' + game.multiplier + ' 🎲';
}

function updateUI() {
    $('statDice').querySelector('.hud-stat-val').textContent = game.dice;
    $('statCash').querySelector('.hud-stat-val').textContent = game.cash;
    $('statFuel').querySelector('.hud-stat-val').textContent = game.fuel;
    $('statHeat').querySelector('.hud-stat-val').textContent = game.heat;
    const pct = ((game.tileIndex % BOARD_SIZE) / BOARD_SIZE) * 100;
    $('trackFill').style.width = pct + '%';
    $('trackMarker').style.left = pct + '%'; /* Changed from right to left */
    $('trackMarker').textContent = game.carDef ? game.carDef.emoji : '🐷';
    $('trackProgress').textContent = (game.tileIndex % BOARD_SIZE) + '/' + BOARD_SIZE;
}

function updateRibbon() {
    if (!game.carDef) return;
    $('ribbonCar').textContent = game.carDef.emoji + ' ' + game.carDef.name;
    $('ribbonSpd').textContent = 'SPD ' + getSpeed();
    $('ribbonArm').textContent = 'RES ' + getArmor();
    $('ribbonStl').textContent = 'STH ' + getStealth();
}

function showDiceResult(r) {
    const el = $('diceResult'); el.textContent = DICE_FACES[r-1]; el.classList.add('visible');
    clearTimeout(diceResultTimer); diceResultTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

function showFeedback(txt) {
    const el = $('feedbackText'); el.textContent = txt; el.classList.add('visible');
    clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

function showEventPopup(icon, title, desc, choices) {
    $('eventIcon').textContent = icon; $('eventTitle').textContent = title; $('eventDesc').textContent = desc;
    const choicesDiv = $('eventChoices'); choicesDiv.innerHTML = '';
    const closeBtn = $('eventCloseBtn');
    if (choices && choices.length > 0) {
        closeBtn.style.display = 'none';
        choices.forEach(ch => {
            const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = ch.label;
            btn.addEventListener('click', () => { ch.action(); closeOverlay('eventOverlay'); closeBtn.style.display = ''; });
            choicesDiv.appendChild(btn);
        });
    } else closeBtn.style.display = '';
    openOverlay('eventOverlay');
}

function showEscapeOverlay(laps, bonus) {
    $('lapTitle').textContent = 'FREEDOM REACHED #' + laps;
    $('lapRewards').innerHTML = `<div class="lap-reward">🪙 Bonus: ${bonus}</div><div class="lap-reward">🍎 +50 Meals</div>`;
    $('lapKeepBtn').onclick = () => closeOverlay('lapOverlay');
    $('lapGarageBtn').onclick = () => { closeOverlay('lapOverlay'); returnToGarage(); };
    openOverlay('lapOverlay');
}

function renderTrackCities() {
    const container = $('trackCities'); container.innerHTML = '';
    TRACK_CITIES.forEach(c => {
        const m = document.createElement('div'); m.className = 'track-city-mark'; m.style.left = c.pct + '%'; /* Changed from right to left */
        m.innerHTML = `<span class="city-dot"></span><span class="city-name">${c.name}</span>`;
        container.appendChild(m);
    });
}

function openOverlay(id) { $(id).classList.add('active'); }
function closeOverlay(id) { $(id).classList.remove('active'); }

document.addEventListener('DOMContentLoaded', initStartScreen);
