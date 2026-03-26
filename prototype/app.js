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
const FARMER_SPAWN_CHANCE = 0.25;
const FARMER_COST = 750;

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
    { id: 'brave_pig',    name: 'Brave Piggy',  emoji: '🐷', color: '#FFB6C1', speed: 0, armor: 1, stealth: 0, price: 0,     ability: 'Mud Slide',   desc: 'Loves the mud. Sturdy and reliable.' },
    { id: 'quick_chick',  name: 'Swift Chick',  emoji: '🐤', color: '#FFF380', speed: 2, armor: 0, stealth: 0, price: 1500,  ability: 'Wing Flutter', desc: 'Fast but fragile.' },
    { id: 'gentle_cow',   name: 'Gentle Cow',   emoji: '🐮', color: '#F0F0F0', speed: 0, armor: 2, stealth: 0, price: 3000,  ability: 'Stampede',    desc: 'Very tough to stop.' },
    { id: 'woolly_sheep', name: 'Woolly Sheep', emoji: '🐑', color: '#EFEFEF', speed: 0, armor: 1, stealth: 1, price: 2000,  ability: 'Fleece Veil', desc: 'Blends in anywhere. Quiet and steady.' },
    { id: 'swift_rabbit', name: 'Swift Rabbit', emoji: '🐰', color: '#D4C5B2', speed: 3, armor: 0, stealth: 1, price: 4000,  ability: 'Burrow',      desc: 'Lightning fast. Gone in a flash.' },
    { id: 'lucky_duck',   name: 'Lucky Duck',   emoji: '🦆', color: '#6B9E5E', speed: 1, armor: 0, stealth: 2, price: 5500,  ability: 'Wing Splash', desc: 'Master of disguise. Slips away unseen.' },
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
    // Light blue sky
    scene.clearColor = new BABYLON.Color4(0.43, 0.65, 0.84, 1);

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

    const core = BABYLON.MeshBuilder.CreateSphere("core", { diameter: (game.boardRadius - 0.5) * 2, segments: 48 }, scene);
    core.position.set(0, -game.boardRadius, 0);
    const coreMat = new BABYLON.StandardMaterial("coreMat", scene);
    coreMat.diffuseColor = new BABYLON.Color3(0.05, 0.15, 0.05);
    coreMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    core.material = coreMat;
    core.parent = boardRoot;
    core.receiveShadows = true;
}

function buildPlanetProps(scene) {
    const propRoot = new BABYLON.TransformNode("propRoot", scene);

    // ---- Shared materials ----
    const treeMat    = new BABYLON.StandardMaterial("treeMat",    scene); treeMat.diffuseColor    = new BABYLON.Color3(0.15, 0.65, 0.10); treeMat.specularColor    = new BABYLON.Color3(0, 0, 0);
    const trunkMat   = new BABYLON.StandardMaterial("trunkMat",   scene); trunkMat.diffuseColor   = new BABYLON.Color3(0.30, 0.15, 0.05); trunkMat.specularColor   = new BABYLON.Color3(0, 0, 0);
    const coniferMat = new BABYLON.StandardMaterial("coniferMat", scene); coniferMat.diffuseColor = new BABYLON.Color3(0.05, 0.42, 0.06); coniferMat.specularColor = new BABYLON.Color3(0, 0, 0);
    const bushMat    = new BABYLON.StandardMaterial("bushMat",    scene); bushMat.diffuseColor    = new BABYLON.Color3(0.10, 0.52, 0.07); bushMat.specularColor    = new BABYLON.Color3(0, 0, 0);
    const grassMat   = new BABYLON.StandardMaterial("grassMat",   scene); grassMat.diffuseColor   = new BABYLON.Color3(0.28, 0.74, 0.12); grassMat.specularColor   = new BABYLON.Color3(0, 0, 0);

    // ---- Helper: anchor a prop to the planet surface ----
    const makeAnchor = (side, angle) => {
        const a = new BABYLON.TransformNode("a", scene);
        a.position.set(side, (game.boardRadius - 0.5) * Math.cos(angle) - game.boardRadius, (game.boardRadius - 0.5) * Math.sin(angle));
        a.rotation.x = angle;
        a.parent = propRoot;
        return a;
    };

    // ---- Round-canopy trees (55) ----
    for (let i = 0; i < 55; i++) {
        const angle = Math.random() * Math.PI * 2;
        const side  = (Math.random() < 0.5 ? -1 : 1) * (TILE_SIZE + 2 + Math.random() * 8);
        const anchor = makeAnchor(side, angle);
        const h = 0.7 + Math.random() * 0.9;
        const trunk  = BABYLON.MeshBuilder.CreateCylinder("t",  { diameter: 0.15, height: h, tessellation: 6 }, scene);
        trunk.position.y = h / 2; trunk.parent = anchor; trunk.material = trunkMat;
        const canopy = BABYLON.MeshBuilder.CreateSphere("c", { diameter: 0.6 + Math.random() * 0.5, segments: 5 }, scene);
        canopy.position.y = h; canopy.parent = anchor; canopy.material = treeMat;
    }

    // ---- Conifer / pine trees (35) ----
    for (let i = 0; i < 35; i++) {
        const angle = Math.random() * Math.PI * 2;
        const side  = (Math.random() < 0.5 ? -1 : 1) * (TILE_SIZE + 1.5 + Math.random() * 9);
        const anchor = makeAnchor(side, angle);
        const h = 1.3 + Math.random() * 1.0;
        const trunk = BABYLON.MeshBuilder.CreateCylinder("ct",  { diameter: 0.12, height: h * 0.45, tessellation: 5 }, scene);
        trunk.position.y = h * 0.22; trunk.parent = anchor; trunk.material = trunkMat;
        const cone1 = BABYLON.MeshBuilder.CreateCylinder("cc1", { diameterTop: 0, diameterBottom: 1.1,  height: h * 0.65, tessellation: 6 }, scene);
        cone1.position.y = h * 0.50; cone1.parent = anchor; cone1.material = coniferMat;
        const cone2 = BABYLON.MeshBuilder.CreateCylinder("cc2", { diameterTop: 0, diameterBottom: 0.65, height: h * 0.50, tessellation: 6 }, scene);
        cone2.position.y = h * 0.87; cone2.parent = anchor; cone2.material = coniferMat;
    }

    // ---- Bushes — GPU instanced for performance (48) ----
    const bushTpl = BABYLON.MeshBuilder.CreateSphere("bushTpl", { diameter: 1, segments: 4 }, scene);
    bushTpl.material = bushMat;
    bushTpl.setEnabled(false);
    for (let i = 0; i < 48; i++) {
        const angle = Math.random() * Math.PI * 2;
        const side  = (Math.random() < 0.5 ? -1 : 1) * (TILE_SIZE + 1 + Math.random() * 5.5);
        const anchor = makeAnchor(side, angle);
        const s = 0.32 + Math.random() * 0.38;
        const b1 = bushTpl.createInstance("b1_" + i);
        b1.scaling.set(s * 1.4, s, s * 1.3); b1.position.y = s * 0.42; b1.parent = anchor;
        if (Math.random() > 0.45) {
            const b2 = bushTpl.createInstance("b2_" + i);
            b2.scaling.set(s * 0.9, s * 0.72, s * 0.9);
            b2.position.set((Math.random() - 0.5) * 0.55, s * 0.28, (Math.random() - 0.5) * 0.3);
            b2.parent = anchor;
        }
    }

    // ---- Grass tufts — GPU instanced, 2-3 blades per patch (75) ----
    const grassTpl = BABYLON.MeshBuilder.CreateCylinder("grassTpl", { diameterTop: 0.04, diameterBottom: 0.14, height: 0.38, tessellation: 4 }, scene);
    grassTpl.material = grassMat;
    grassTpl.setEnabled(false);
    for (let i = 0; i < 75; i++) {
        const angle = Math.random() * Math.PI * 2;
        const side  = (Math.random() < 0.5 ? -1 : 1) * (TILE_SIZE * 0.4 + Math.random() * 11);
        const anchor = makeAnchor(side, angle);
        const blades = 2 + (Math.random() > 0.5 ? 1 : 0);
        for (let g = 0; g < blades; g++) {
            const blade = grassTpl.createInstance("gr_" + i + "_" + g);
            blade.position.set((Math.random() - 0.5) * 0.5, 0.18, (Math.random() - 0.5) * 0.5);
            blade.rotation.y = Math.random() * Math.PI;
            blade.rotation.z = (Math.random() - 0.5) * 0.28;
            blade.parent = anchor;
        }
    }
}

function buildPlayer(scene, shadowGen) {
    game.playerRoot = new BABYLON.TransformNode("playerRoot", scene);
    const animal = game.carDef;
    const mat = new BABYLON.StandardMaterial("animalMat", scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(animal.color);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);

    let body;
    if (animal.id === 'quick_chick') {
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 0.8, height: 0.8, depth: 1.0 }, scene);
        const head = BABYLON.MeshBuilder.CreateBox("head", { width: 0.5, height: 0.5, depth: 0.5 }, scene);
        head.position.set(0, 0.6, 0.4); head.parent = body; head.material = mat;
        const beak = BABYLON.MeshBuilder.CreateBox("beak", { width: 0.2, height: 0.1, depth: 0.2 }, scene);
        beak.position.set(0, 0.6, 0.7); beak.parent = body;
        const bMat = new BABYLON.StandardMaterial("bMat", scene); bMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0); bMat.specularColor = new BABYLON.Color3(0, 0, 0);
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

    } else if (animal.id === 'woolly_sheep') {
        // Fluffy wool body with sphere overlay
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 1.2, height: 1.0, depth: 1.7 }, scene);
        const wool = BABYLON.MeshBuilder.CreateSphere("wool", { diameter: 1.5, segments: 5 }, scene);
        wool.scaling.set(1.05, 0.85, 1.25); wool.position.set(0, 0.2, 0); wool.parent = body; wool.material = mat;
        const sHead = BABYLON.MeshBuilder.CreateBox("sHead", { width: 0.55, height: 0.60, depth: 0.55 }, scene);
        sHead.position.set(0, 0.4, 0.95); sHead.parent = body; sHead.material = mat;
        const earMat = new BABYLON.StandardMaterial("sEarMat", scene); earMat.diffuseColor = new BABYLON.Color3(0.8, 0.75, 0.7); earMat.specularColor = new BABYLON.Color3(0, 0, 0);
        [-0.32, 0.32].forEach(x => {
            const ear = BABYLON.MeshBuilder.CreateBox("ear", { width: 0.22, height: 0.14, depth: 0.08 }, scene);
            ear.position.set(x, 0.18, 0); ear.parent = sHead; ear.material = earMat;
        });
        [[-0.38, 0.55], [0.38, 0.55], [-0.38, -0.55], [0.38, -0.55]].forEach(p => {
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.22, height: 0.52, depth: 0.22 }, scene);
            leg.position.set(p[0], -0.52, p[1]); leg.parent = body; leg.material = earMat;
        });
        body.position.y = 0.78;

    } else if (animal.id === 'swift_rabbit') {
        // Lean body with long ears and fluffy tail
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 0.85, height: 0.90, depth: 1.25 }, scene);
        const rHead = BABYLON.MeshBuilder.CreateBox("rHead", { width: 0.62, height: 0.62, depth: 0.58 }, scene);
        rHead.position.set(0, 0.5, 0.72); rHead.parent = body; rHead.material = mat;
        const innerEarMat = new BABYLON.StandardMaterial("ieM", scene); innerEarMat.diffuseColor = new BABYLON.Color3(1.0, 0.72, 0.72); innerEarMat.specularColor = new BABYLON.Color3(0, 0, 0);
        [-0.16, 0.16].forEach(x => {
            const ear = BABYLON.MeshBuilder.CreateBox("ear", { width: 0.14, height: 0.72, depth: 0.10 }, scene);
            ear.position.set(x, 0.68, 0.08); ear.parent = rHead; ear.material = mat;
            const inner = BABYLON.MeshBuilder.CreateBox("inner", { width: 0.07, height: 0.52, depth: 0.06 }, scene);
            inner.position.set(0, 0, 0.06); inner.parent = ear; inner.material = innerEarMat;
        });
        const rTail = BABYLON.MeshBuilder.CreateSphere("rTail", { diameter: 0.28, segments: 4 }, scene);
        rTail.position.set(0, 0.22, -0.68); rTail.parent = body; rTail.material = mat;
        [[-0.28, 0.44], [0.28, 0.44], [-0.28, -0.38], [0.28, -0.38]].forEach(p => {
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.18, height: 0.38, depth: 0.24 }, scene);
            leg.position.set(p[0], -0.44, p[1]); leg.parent = body; leg.material = mat;
        });
        body.position.y = 0.62;

    } else if (animal.id === 'lucky_duck') {
        // Rounded body, neck, round head, flat bill, webbed feet
        body = BABYLON.MeshBuilder.CreateBox("body", { width: 1.0, height: 0.9, depth: 1.4 }, scene);
        const neck = BABYLON.MeshBuilder.CreateCylinder("neck", { diameterTop: 0.28, diameterBottom: 0.40, height: 0.52, tessellation: 7 }, scene);
        neck.position.set(0, 0.55, 0.55); neck.parent = body; neck.material = mat;
        const dHead = BABYLON.MeshBuilder.CreateSphere("dHead", { diameter: 0.50, segments: 6 }, scene);
        dHead.position.set(0, 0.46, 0.12); dHead.parent = neck; dHead.material = mat;
        const billMat = new BABYLON.StandardMaterial("billMat", scene); billMat.diffuseColor = new BABYLON.Color3(1.0, 0.62, 0.05); billMat.specularColor = new BABYLON.Color3(0, 0, 0);
        const bill = BABYLON.MeshBuilder.CreateBox("bill", { width: 0.30, height: 0.08, depth: 0.30 }, scene);
        bill.position.set(0, -0.03, 0.27); bill.parent = dHead; bill.material = billMat;
        const dTail = BABYLON.MeshBuilder.CreateBox("dtail", { width: 0.25, height: 0.35, depth: 0.12 }, scene);
        dTail.position.set(0, 0.26, -0.78); dTail.rotation.x = 0.45; dTail.parent = body; dTail.material = mat;
        [-0.25, 0.25].forEach(x => {
            const leg = BABYLON.MeshBuilder.CreateCylinder("dleg", { diameter: 0.13, height: 0.38, tessellation: 5 }, scene);
            leg.position.set(x, -0.52, 0); leg.parent = body; leg.material = billMat;
            const foot = BABYLON.MeshBuilder.CreateBox("foot", { width: 0.30, height: 0.07, depth: 0.35 }, scene);
            foot.position.set(0, -0.22, 0.1); foot.parent = leg; foot.material = billMat;
        });
        body.position.y = 0.65;

    } else {
        // Default: Brave Pig
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
    const tMat = new BABYLON.StandardMaterial('tMat', scene); tMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1); tMat.specularColor = new BABYLON.Color3(0, 0, 0);
    const wMat = new BABYLON.StandardMaterial('wMat', scene); wMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1); wMat.specularColor = new BABYLON.Color3(0, 0, 0);

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
    const hasPowerup = game.purchasedUpgrades.length > 0;
    addBtn('🍃 Sacrifice a Powerup' + (hasPowerup ? ' (' + game.purchasedUpgrades.length + ' owned)' : ' (none)'), hasPowerup, () => {
        const sacIdx = Math.floor(Math.random() * game.purchasedUpgrades.length);
        const sacId = game.purchasedUpgrades.splice(sacIdx, 1)[0];
        const sacUp = UPGRADES.find(u => u.id === sacId);
        closeOverlay('policeOverlay');
        showFeedback('🍃 Dropped ' + (sacUp ? sacUp.icon + ' ' + sacUp.name : 'a powerup') + ' as a distraction!');
        onResolved();
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
            game.cash -= up.cost; game.purchasedUpgrades.push(up.id); applyUpgrade(up); openUpgradeShop(); updateUI(); updateRibbon();
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
