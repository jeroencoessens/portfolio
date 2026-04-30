# Animal Escape: Run to Freedom

A cozy, mobile-first 3D dice-rolling board game built with BabylonJS. Players roll dice to move animals around a circular planet track, collecting coins and meals to unlock new animals and build a peaceful sanctuary.

## Game Philosophy

**Cozy first.** The game is about rolling, collecting, and unlocking — not stress or punishment. Tension should be playful at most. The core loop is a satisfying number-go-up experience wrapped in charming low-poly 3D visuals. There is no death/fail state — the "risk" comes from dice management (a finite resource that refills over time) and the voluntary wager system.

## Tech Stack

- **Engine:** BabylonJS (loaded via CDN)
- **Rendering:** WebGL via `<canvas>`
- **Native wrapper:** Capacitor (iOS + Android)
- **Persistence:** `localStorage` (key: `animal_escape_p1_save`)
- **Styling:** Vanilla CSS with CSS custom properties
- **No bundler.** Source files are `index.html`, `app.js`, `styles.css`. Capacitor copies them to native projects via `npm run cap:sync`.

## File Structure

| File / Folder | Purpose |
|---------------|---------|
| `index.html` | All screen layouts: sanctuary, game, diorama, overlays |
| `app.js` | All game logic, 3D scene creation, UI wiring |
| `styles.css` | All styling, animations, responsive breakpoints |
| `capacitor.config.json` | Capacitor config (app ID, plugins, webDir) |
| `package.json` | npm scripts for build/sync/run |
| `.gitignore` | Ignores `node_modules/`, `www/`, native projects |
| `ios/` | Generated Xcode project (do not edit directly unless customizing native code) |
| `android/` | Generated Android Studio project |
| `www/` | Build output — web files copied here for Capacitor (auto-generated) |

## Code Organization (app.js)

The file is organized into numbered sections with `// ====` header comments:

| Section | Lines | Contents |
|---------|-------|----------|
| Config | 20–108 | All tunable constants, BALANCE object |
| Game Data | 110–244 | SEASONS, ANIMALS, UPGRADES, SANCTUARY_UPGRADES, TILE_PATTERN |
| Game State | 246–340 | `persist` (saved) and `game` (runtime) objects |
| Save System | 342–413 | `loadSave()`, `writeSave()`, sanctuary upgrade helpers, offline refill, daily consumption |
| Sanctuary / Start Screen | 504–640 | `initStartScreen()`, `renderSanctuary()`, animal grid, wager slider |
| Stats & Meals | 642–706 | `getSpeed/Armor/Stealth()`, `awardMeals()`, tile alteration |
| Run Lifecycle | 708–926 | `startRun()`, `returnToSanctuary()`, `abandonRun()`, `teardownGameEngine()`, `initGame()` |
| 3D Scene & World | 928–1106 | `createScene()`, `buildBoard()`, planet props, materials |
| Player Models | 1108–1510 | Per-animal 3D builders (pig, chick, cow, sheep, rabbit, duck) + small variants |
| Seed Planting | 1512–1640 | `plantSeed()`, `growSeeds()`, `checkSeedHarvest()`, 3D seed/tree meshes |
| Season System | 1642–1748 | `advanceSeason()`, seasonal visuals, winter tree death, `getSeasonRewardMult()` |
| Movement & Camera | 1750–1768 | `getTileWorldPosition()`, `getTileRotation()` |
| Dice, Rolling & Auto-Roll | 1770–2020 | `wireRollButton()`, `doRoll()`, `movePlayer()`, auto-mode, hold gesture |
| Tile Logic & Encounters | 2076–2510 | `handleTileLanding()`, event/rival/bonus tiles, `teleportPlayer()`, ability system |
| UI & Overlays | 2600–2810 | `updateUI()`, dice animation, popups, upgrade shop, overlay management |
| Entry Point | 2804–2840 | `DOMContentLoaded`, debug functions |
| Diorama | 2842–3690 | Full 3D sanctuary world, terrain, animal spawning, focus/upgrade/revive system |

## Screens

### 1. Sanctuary (Start Screen)
The main menu. Shows:
- Coin bank and dice count with refill timer
- Solo animal grid (6 animals) and Group animal grid (6 animals)
- Selected animal panel with stats (SPD/RES/STH), ability name, golden status
- Wager slider (invest banked coins into a run)
- Start button showing current dice + bonus
- Diorama button (3D sanctuary view)
- Sanctuary Upgrades button (permanent upgrades)

### 2. Game Screen (Run)
The core gameplay. Shows:
- Top HUD: dice, coins, meals, seeds, season indicator
- 3D canvas: circular planet with 80 tiles, player model, camera following
- Stats ribbon: animal name, SPD, RES, STH (or front/rear count for groups)
- Progress track bar with checkpoint names
- Bottom controls: dice count + timer, multiplier button, RUN button (tap/hold), plant seed button, ability button
- Exit run button (top-right)

### 3. Diorama Screen
A peaceful 3D terrain view of all unlocked animals. Tap animals to:
- Upgrade to golden (250 meals)
- Revive hungry animals (500 coins)
- Collect daily dice rewards

### 4. Overlays
- **Event popup**: Choice-based encounters (hedgehog, fox, butterfly, etc.)
- **Lap celebration**: Shows rewards, option to keep running or return
- **Upgrade shop**: In-run consumable powerups
- **Sanctuary upgrades**: Permanent upgrades shop

## Player Journey

### First 5 Minutes
1. Only Brave Piggy (🐷) is unlocked — free starter animal
2. Player has 100 dice, 0 coins
3. Tap RUN to roll → watch pig hop across tiles on spinning planet
4. Collect coins from road/cash tiles, meals from fuel tiles
5. Hit event/rival/bonus tiles for choice-based encounters
6. Complete first lap → escape overlay → choose to keep running or return
7. Return to sanctuary → coins banked → buy next animal

### Mid-Game (30–60 min)
- 2-3 animals unlocked, experimenting with different stats
- Discovering the shop (in-run powerups), seed planting system
- Seasons cycle each lap: spring → summer (1.5× rewards) → fall (2× rewards + traps) → winter (no planting, tree death risk)
- Starting to accumulate meals for golden upgrades
- First sanctuary upgrades purchased (Trail Map, Thick Hide, etc.)

### Late Game
- All 12 animals unlocked (6 solo + 6 group forms)
- Golden upgrades giving +1 to all stats
- Maxed sanctuary upgrades providing strong base stats
- High-multiplier runs for efficiency
- Daily loop: feed animals → collect dice rewards → run → earn meals

## Core Mechanics

### Dice & Rolling
- Dice are the primary resource gate. Start with up to 125, refill +10 every 10 minutes
- Each roll costs `1 × multiplier` dice (x1 to x50)
- Roll result: 1-6 + speed bonus → move that many tiles
- Hold RUN button for 1.2s to activate auto-roll mode

### Stats
| Stat | Effect |
|------|--------|
| **SPD (Speed)** | +1 tile per roll per point |
| **RES (Armor/Resilience)** | +10% dodge chance on danger tiles per point |
| **STH (Stealth)** | +8% dodge on danger, +12% trap avoidance, improves event outcomes |

Stats come from: base animal stats + golden bonus (+1 all) + sanctuary upgrades + in-run powerups + abilities.

### Animal Abilities
Each animal has a unique once-per-lap ability activated via the purple button:
- **Stat buffs:** Mud Slide (+2 RES), Fleece Veil (+2 STH), Wool Screen (+3 STH), etc.
- **Teleports:** Stampede (8 tiles), Burrow (12 tiles), Flash Burrow (15 tiles)
- **Hybrid:** Wing Splash (+2 STH + trap shield), Scatter (+10 dice + 1 SPD)
- Resets at the start of each new lap

### Tile Types (20-tile repeating pattern, 80 total)
| Type | Count | Effect |
|------|-------|--------|
| Road | 8 | +30 coins |
| Cash | 3 | +80/120/180 coins (varies by position) |
| Fuel | 3 | +3 meals (+ bonuses from upgrades) |
| Danger | 1 | RES+STH check → lose 100 coins or dodge |
| Bonus | 1 | Random positive: dice, coins, meals, or +1 SPD/RES |
| Event | 1 | Choice encounter: hedgehog, shortcut, butterfly, fox, well |
| Rival | 1 | Competition: race (SPD), hide & seek (STH), foraging (all) |
| Pit | 1 | +15 dice (+ Cozy Burrow bonus) |
| Start | 1 | Lap boundary marker |

### Seasons (cycle each lap)
| Season | Multiplier | Special |
|--------|-----------|---------|
| 🌸 Spring | 1.0× | Kills unharvested winter trees |
| ☀️ Summer | 1.5× | Best planting season |
| 🍂 Fall | 2.0× | 30% of tiles become traps (coin/meal/powerup loss) |
| ❄️ Winter | 2.0× | No planting, kills ungrown seeds, 3× harvest for survivors |

### Seed System
- Plant seeds on tiles for coins (escalating cost: 150 + 75n)
- Seeds grow into trees after 1 lap (instant with Deep Roots upgrade)
- Pass through a tree: +200 coins, +4 meals
- Land exactly on a tree: +500 coins, +10 meals, +8 dice
- Winter kills ungrown seeds; spring kills unharvested trees

### Wager System
- Invest banked coins via slider before starting a run
- Wagered coins become your starting `game.cash`
- Return to sanctuary normally → all coins (wager + earnings) banked
- Exit/abandon run → all coins forfeited (meals still saved)

## Economy

### Currencies
| Currency | Cap | Primary Source | Primary Sink |
|----------|-----|---------------|-------------|
| 🪙 Coins | None | Tile landings, seed harvests | Animal unlocks (1.5k–6.5k), sanctuary upgrades (2k–20k) |
| 🍎 Meals | Per-animal | Fuel tiles, lap bonuses, seeds | Daily consumption (10/animal/day), golden upgrade (250) |
| 🎲 Dice | 125 | Refill timer (+10/10min), pit tiles (+15) | Rolls (1 × multiplier per roll) |

### Permanent Progression
- **Animals:** 12 total, purchased with coins (permanent)
- **Golden status:** 250 meals per animal → +1 all stats (permanent)
- **Sanctuary upgrades:** 8 upgrades with 1-3 levels each, coin-based (permanent)
  - Total cost to max everything: ~138,500 coins

### Daily Loop
1. Each calendar day, every owned animal consumes 10 meals
2. Fed animals → status `'rewarded'` → collect +5 dice each in diorama
3. Underfed animals → status `'hungry'` → must revive (500 coins) before playing
4. General meals pool acts as fallback for underfed animals
5. Caps at 7 days of missed consumption (offline catch-up)

## State Management

### Persistent State (`persist` object → localStorage)
```
totalCash, unlockedAnimals, dice, lastDiceUpdate, animalMeals,
goldenAnimals, generalMeals, lastDailyConsume, animalStatus,
sanctuaryUpgrades
```

### Runtime State (`game` object → reset each run)
```
animalDef, runSpeed/runArmor/runStealth, dice, cash, fuel,
laps, tileIndex, multiplier, isMoving, abilityUsed, trapShield,
purchasedUpgrades, seeds, seedMeshes, seasonIndex, seasonCycle,
fallTraps, flockMode, frontGroup, rearGroup, BabylonJS refs...
```

### Save Triggers
- `writeSave()` is called after: dice changes, meal awards, purchases, lap completion, run start/end
- Meals are saved incrementally during runs (not just on return)
- `persist.dice = game.dice` is synced before every save

## Key Design Decisions

1. **No death/fail state.** The "tension" comes from dice scarcity and the wager system, not from losing progress. This keeps the game cozy.

2. **Multiplier is a speed-vs-efficiency tradeoff.** x50 means 50 dice for 1 roll — fast progress but burns dice quickly. It's not "free" because dice are finite.

3. **Meals are the real bottleneck currency.** Coins inflate quickly, but meals gate the most meaningful upgrades (golden status, daily animal maintenance).

4. **In-run upgrades are non-permanent.** Every run starts from base stats (+ sanctuary upgrades + golden bonus). This keeps runs feeling fresh.

5. **Group animals** are prestige unlocks requiring the solo form first + 200 meals. They have different stat distributions and unique abilities.

6. **Events and rivals are choice-based.** Every encounter offers a safe option and a risky option, keeping the cozy feel while adding light strategy.

## Common Modification Points

### To add a new animal:
1. Add entry to `ANIMALS` array (~line 152) with stats, price, ability name
2. Add `buildXxxModel()` and `buildSmallXxxModel()` functions in section 9
3. Add ability definition to `ABILITY_DEFS` object (~line 2445)
4. Add model references in `buildPlayer()` switch statement

### To add a new tile type:
1. Add to `TILE_PATTERN` array (~line 210)
2. Add case in `handleTileLanding()` switch (~line 2130)
3. Add color entries in `applySeasonVisuals()` palette objects (~line 1705)

### To add a new sanctuary upgrade:
1. Add to `SANCTUARY_UPGRADES` array (~line 190)
2. Apply the effect in `startRun()` (~line 830) where other sanctuary upgrades are applied

### To add a new in-run upgrade:
1. Add to `UPGRADES` array (~line 174)
2. Handle new stat/effect in `applyUpgrade()` (~line 2690)

### To tune the economy:
- All balance values are in the `BALANCE` object (~line 65)
- Animal prices are in the `ANIMALS` array
- Sanctuary upgrade costs are in `SANCTUARY_UPGRADES`
- Season multipliers are in `SEASONS` array and `BALANCE.SEASON_*` constants

## Known Quirks

- `game.tileIndex` is an ever-increasing absolute index (not wrapped to 0-79). Physical position is always `tileIndex % BOARD_SIZE`. Lap detection uses `Math.floor(tileIndex / BOARD_SIZE)`.
- Group animals (flock mode) have `frontGroup` (3) and `rearGroup` (2) member counts set at run start but never decremented during play — the split mechanic is visual only.
- The 3D dice is a CSS cube, not a BabylonJS mesh. It lives in a separate DOM element (`#diceStage`).
- Auto-roll uses `AbortController` to prevent event listener stacking across runs.

## Native App (Capacitor)

The game is wrapped as a native iOS and Android app using [Capacitor](https://capacitorjs.com/). This embeds the web code inside a native WebView and provides access to platform APIs (haptics, status bar, etc.) that browsers restrict.

### Why Capacitor?

| Option | Why not |
|--------|---------|
| PWA | Apple blocks haptics and other native APIs in Safari PWAs. Won't pass App Store review. |
| Cordova | Predecessor to Capacitor — older, less maintained. |
| React Native / Flutter | Would require a full rewrite of the game. |
| **Capacitor** ✅ | Wraps existing HTML/CSS/JS. Edit in VS Code. Native plugins. App Store approved. Actively maintained. |

### Prerequisites

- **Node.js** ≥ 18
- **Xcode** ≥ 15 (for iOS) — install from Mac App Store
- **CocoaPods** — `sudo gem install cocoapods` (if not using Swift Package Manager)
- **Android Studio** (for Android) — [download](https://developer.android.com/studio)
- **Apple Developer account** ($99/year) for App Store submission
- **Google Play Developer account** ($25 one-time) for Play Store submission

### Development Workflow

**The core workflow is: edit source → build → sync → run.**

```bash
# 1. Edit your web files (index.html, app.js, styles.css) in VS Code

# 2. Build & sync to native projects
npm run cap:sync

# 3. Open in Xcode / Android Studio
npm run cap:open:ios
npm run cap:open:android

# 4. Or run directly on a connected device/simulator
npm run cap:run:ios
npm run cap:run:android
```

### Available npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run build` | Copies web files to `www/` | Prepare web assets |
| `npm run cap:sync` | Build + `npx cap sync` | Full sync to native projects |
| `npm run cap:open:ios` | `npx cap open ios` | Open Xcode project |
| `npm run cap:open:android` | `npx cap open android` | Open Android Studio project |
| `npm run cap:run:ios` | Build + sync + run on iOS device/sim | Quick test on iOS |
| `npm run cap:run:android` | Build + sync + run on Android device/emu | Quick test on Android |

### Native Plugins Installed

| Plugin | Package | Purpose |
|--------|---------|---------|
| **Haptics** | `@capacitor/haptics` | Native haptic feedback (replaces browser Vibration API) |
| **Status Bar** | `@capacitor/status-bar` | Control status bar appearance (dark mode, background color) |
| **Splash Screen** | `@capacitor/splash-screen` | Native splash screen on app launch |

### Haptics Implementation

The `haptic()` function in `app.js` automatically detects the runtime environment:

- **Native app (Capacitor):** Uses `Capacitor.Plugins.Haptics` for real iOS Taptic Engine / Android haptic feedback
- **Browser:** Falls back to the Vibration API (`navigator.vibrate`)
- **Desktop browser:** No-ops silently

```javascript
// Duration hint maps to iOS haptic styles:
haptic(10);  // LIGHT impact — subtle tap
haptic(20);  // MEDIUM impact — noticeable tap
haptic(30);  // HEAVY impact — strong thud

// Special haptic types:
haptic(0, 'notification', 'success');  // Success pattern
haptic(0, 'notification', 'warning');  // Warning pattern
haptic(0, 'notification', 'error');    // Error pattern
haptic(0, 'selection');                // Selection tick
```

### App Store Submission Checklist

#### iOS (App Store)

1. **Apple Developer Program** — Enroll at [developer.apple.com](https://developer.apple.com/programs/) ($99/year)
2. **Bundle ID** — Currently set to `com.animalEscape.app` in `capacitor.config.json`
3. **App Icons** — Add 1024×1024 icon to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
4. **Splash Screen** — Replace default splash in `ios/App/App/Assets.xcassets/Splash.imageset/`
5. **Signing** — In Xcode: select your Team under Signing & Capabilities
6. **Privacy** — No special permissions needed (no camera, location, etc.)
7. **App Store Connect** — Create app listing with screenshots, description, age rating
8. **Archive & Upload** — In Xcode: Product → Archive → Distribute App → App Store Connect
9. **Review** — Apple reviews typically take 1-3 days

#### Android (Google Play)

1. **Google Play Console** — Register at [play.google.com/console](https://play.google.com/console/) ($25 one-time)
2. **App Icons** — Configure in `android/app/src/main/res/` (multiple density folders)
3. **Signing** — Generate a keystore: `keytool -genkey -v -keystore release.keystore -alias animal-escape -keyalg RSA -keysize 2048 -validity 10000`
4. **Build release APK/AAB** — In Android Studio: Build → Generate Signed Bundle/APK
5. **Store listing** — Screenshots, description, content rating questionnaire
6. **Upload & Review** — Upload AAB to Play Console, submit for review

### Adding New Native Features

To add more native capabilities (e.g., push notifications, in-app purchases, audio):

```bash
# 1. Install the Capacitor plugin
npm install @capacitor/push-notifications

# 2. Sync to native projects
npm run cap:sync

# 3. Use in app.js via Capacitor.Plugins
if (IS_NATIVE) {
    const { PushNotifications } = Capacitor.Plugins;
    // ... use the plugin
}
```

Browse available plugins: [capacitorjs.com/docs/plugins](https://capacitorjs.com/docs/plugins)

### Capacitor Config Reference

`capacitor.config.json` controls native behavior:

```json
{
  "appId": "com.animalEscape.app",     // Bundle ID (must match App Store / Play Store)
  "appName": "Animal Escape",           // Display name on device
  "webDir": "www",                       // Where built web files live
  "server": {
    "androidScheme": "https"             // Required for modern Android WebView security
  },
  "plugins": {
    "SplashScreen": { ... },
    "StatusBar": { ... }
  }
}
```

### Troubleshooting

| Issue | Fix |
|-------|-----|
| `"www" is not a valid webDir` | Run `npm run build` first to create the `www/` folder |
| Xcode build fails on plugins | Run `npm run cap:sync` to update native plugin bindings |
| Changes not showing on device | Always run `npm run cap:sync` after editing web files |
| Haptics not working in simulator | Haptics only work on real devices, not simulators |
| White screen on launch | Check Xcode console for JS errors; ensure BabylonJS CDN is reachable |
| `localStorage` not persisting | Capacitor uses `WKWebView` on iOS which persists localStorage correctly |
