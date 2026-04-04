# Animal Escape: Run to Freedom

A 3D dice-rolling board game where farm animals escape to the wild. Built as a web prototype with BabylonJS, HTML/CSS — designed to be ported to Unity/C#.

## Game Overview

**Concept:** Players choose a farm animal and roll dice to move along an 80-tile circular track wrapped around a small planet. The goal is to escape the farm, avoid farmers, collect coins, and complete laps to earn rewards. Coins unlock new animals and in-run upgrades.

**Theme:** Animal liberation. The farm is oppressive; nature is freedom. The tone is playful and family-friendly, with a light strategic layer.

### Core Loop

1. **Sanctuary** — Pick an animal (or buy a new one with banked coins)
2. **Roll dice** — Move 1–6 tiles (plus speed bonuses) along the circular track
3. **Tile effects** — Land on tiles that give coins, food, traps, farmer sightings, rest spots
4. **Farmer encounters** — When passing/landing on a farmer, choose: bribe, use ability, sacrifice a powerup, or gamble with a dice roll
5. **Lap rewards** — Completing a full circuit awards big coin/food bonuses
6. **Upgrade shop** — Spend in-run coins on stat boosts (speed, stealth, resilience, food, extra rolls)
7. **Bank & repeat** — Return to the sanctuary to bank coins and unlock more animals

### Animals (7 playable characters)

| Animal | Specialty | Unique Mechanic |
|--------|-----------|-----------------|
| Brave Piggy | Balanced starter | Mud Slide ability |
| Swift Chick | High speed | Wing Flutter |
| Gentle Cow | High resilience | Stampede |
| Woolly Sheep | Stealth + resilience | Fleece Veil |
| Swift Rabbit | Fastest | Burrow |
| Lucky Duck | Highest stealth | Wing Splash |
| Chicken Flock | Multi-unit | 5 chickens split across 2 tiles; can sacrifice individuals |

### Key Systems

- **Circular planet track** — 80 tiles arranged on a sphere using trigonometric positioning
- **Dice economy** — 150 starting rolls per run, auto-refill timer (5 rolls every 30s), max 250
- **Multiplier** — x1 / x5 / x20 roll cost for risk/reward scaling
- **Farmer obstacles** — 3D tractor models that spawn randomly and block the path
- **Flock mode** — The Chicken Flock splits into front (3) and rear (2) groups on adjacent tiles, each moving independently

## Technical Architecture

### File Structure

```
prototype/
├── index.html      # Single-page HTML with all overlay/UI markup
├── styles.css      # Full responsive CSS (mobile-first, dark theme)
├── app.js          # All game logic — organized into 11 sections
└── README.md       # This file
```

### app.js Section Map

The code is organized into clearly labeled sections that roughly map to Unity MonoBehaviours/ScriptableObjects:

| Section | Lines | Unity Equivalent |
|---------|-------|-----------------|
| 1. CONFIG & DATA | Constants, animal/upgrade/tile definitions | `GameConfig` ScriptableObject |
| 2. GAME STATE | Persistent + per-run state objects | `GameManager` singleton |
| 3. SAVE SYSTEM | LocalStorage load/save | `SaveManager` (PlayerPrefs or JSON serialization) |
| 4. SANCTUARY / START | Animal selection, purchase flow | `SanctuaryUI` MonoBehaviour |
| 5. SCENE SETUP | BabylonJS scene, lighting, board, camera | `BoardBuilder`, `SceneManager` |
| 6. PLAYER MODELS | Per-animal mesh builders (7 functions) | Prefabs with `AnimalModel` components |
| 7. FARMER OBSTACLES | Spawn/remove tractor meshes | `FarmerSpawner` + `Farmer` prefab |
| 8. MOVEMENT & CAMERA | Dice roll logic, hop animation, camera follow | `MovementController`, `CameraController` |
| 9. TILE & ENCOUNTERS | Tile landing effects, farmer encounter UI | `TileEffectHandler`, `EncounterManager` |
| 10. UI HELPERS | HUD updates, overlay management, shop | Various UI scripts |
| 11. ENTRY POINT | DOMContentLoaded bootstrap | Unity `Awake()`/`Start()` |

### 3D World

- **Engine:** BabylonJS (via CDN)
- **Geometry:** All models are low-poly primitives (boxes, spheres, cylinders) — no imported meshes
- **Lighting:** Hemispheric (ambient) + directional (sun) with soft shadow maps
- **Camera:** UniversalCamera parented to an anchor node that animates along the track
- **Board:** Tiles positioned on a circle using `angle = (i * TILE_SPACING) / boardRadius`, with Y/Z calculated from cos/sin
- **Props:** ~213 scattered objects (trees, conifers, bushes, grass) with GPU instancing for bushes and grass

### Mobile Rendering

The BabylonJS engine is initialized with `adaptToDeviceRatio: true` (4th constructor argument), which renders at the device's native pixel density. Without this flag, high-DPI mobile screens (2x–3x) render at CSS resolution, causing blurry/fuzzy 3D visuals while 2D UI remains crisp.

## Unity Migration Guide

### Recommended Unity Project Structure

```
Assets/
├── Scripts/
│   ├── Config/
│   │   ├── GameConfig.cs              # ScriptableObject: all constants from Section 1
│   │   ├── AnimalDefinition.cs        # ScriptableObject: per-animal data
│   │   ├── UpgradeDefinition.cs       # ScriptableObject: per-upgrade data
│   │   └── TileDefinition.cs          # ScriptableObject: tile pattern data
│   ├── Core/
│   │   ├── GameManager.cs             # Singleton: game state (Section 2)
│   │   ├── SaveManager.cs             # JSON save/load (Section 3)
│   │   └── TurnController.cs          # Roll logic, turn sequencing (Section 8)
│   ├── Board/
│   │   ├── BoardBuilder.cs            # Generate circular tile track (Section 5)
│   │   ├── TileController.cs          # Individual tile behavior
│   │   ├── PropScatterer.cs           # Vegetation spawning (Section 5)
│   │   └── FarmerSpawner.cs           # Farmer obstacle management (Section 7)
│   ├── Player/
│   │   ├── PlayerController.cs        # Movement + animation (Section 8)
│   │   ├── CameraController.cs        # Follow camera (Section 8)
│   │   └── FlockController.cs         # Chicken Flock split-group logic
│   ├── Gameplay/
│   │   ├── TileEffectHandler.cs       # Landing effects (Section 9)
│   │   ├── EncounterManager.cs        # Farmer encounter flow (Section 9)
│   │   └── UpgradeShop.cs             # In-run upgrades (Section 10)
│   └── UI/
│       ├── HUDController.cs           # Stats display (Section 10)
│       ├── SanctuaryUI.cs                # Animal select screen (Section 4)
│       ├── OverlayManager.cs          # Modal overlay system (Section 10)
│       └── TrackProgressUI.cs         # Progress bar + checkpoints
├── Prefabs/
│   ├── Animals/                       # One prefab per animal (Section 6)
│   ├── Tiles/                         # Tile prefab with material variants
│   ├── Props/                         # Tree, bush, grass prefabs
│   └── Farmer/                        # Tractor prefab
├── ScriptableObjects/
│   ├── Animals/                       # 7 AnimalDefinition assets
│   ├── Upgrades/                      # 8 UpgradeDefinition assets
│   └── GameConfig.asset               # Singleton config
└── Scenes/
    ├── Sanctuary.unity                   # Start/sanctuary screen
    └── Game.unity                     # Main gameplay scene
```

### Migration Notes

1. **Data-driven design** — All constants (`ANIMALS`, `UPGRADES`, `TILE_PATTERN`, `TRACK_CITIES`) should become ScriptableObjects. This enables designer-friendly tuning in the Unity Inspector without touching code.

2. **Circular board math** — The core formula `angle = (i * tileSpacing) / boardRadius` with `position = (0, R*cos(a) - R, R*sin(a))` translates directly to Unity's `Vector3`. The board radius is `(boardSize * tileSpacing) / (2π)`.

3. **Animation system** — BabylonJS `beginDirectAnimation` with keyframes maps to Unity's `DOTween` or coroutine-based lerps. The tile-by-tile hop pattern (sequential animations with callbacks) is ideal for coroutines:
   ```csharp
   IEnumerator MoveAlongPath(List<Vector3> positions, List<Quaternion> rotations) {
       foreach (var (pos, rot) in positions.Zip(rotations)) {
           yield return transform.DOMove(pos, hopDuration).SetEase(Ease.InOutQuad)
               .Join(transform.DORotateQuaternion(rot, hopDuration));
       }
   }
   ```

4. **Animal models** — Replace procedural primitive assembly with proper prefabs. Each `buildXxxModel()` function describes the exact geometry (box dimensions, positions, hierarchy) that can guide prefab construction or procedural mesh generation.

5. **State management** — The `game` object maps cleanly to a `GameManager` singleton. The `persist` object maps to a serializable save class.

6. **UI** — Replace DOM manipulation with Unity UI Toolkit or Canvas. The overlay pattern (show/hide with CSS classes) maps to `SetActive()` on Canvas GameObjects.

7. **Farmer encounter flow** — The callback-based encounter system (`showFarmerEncounter(onResolved)`) maps to `async/await` or coroutines in Unity. The choice buttons map to Unity UI buttons with dynamic listeners.

8. **Flock mode** — The dual-position Chicken Flock (front 3, rear 2) needs a `FlockController` that manages two transform groups and delegates movement to both.

9. **Save system** — `localStorage` → `PlayerPrefs` for simple data, or JSON serialization to `Application.persistentDataPath` for structured saves.

10. **Performance** — The web version uses GPU instancing for bushes/grass. Unity handles this natively with GPU instancing on materials, or use `Graphics.DrawMeshInstanced`.

### What to Keep vs. Rebuild

| Keep (logic transfers directly) | Rebuild (platform-specific) |
|---|---|
| Board math (circular positioning) | 3D models → prefabs |
| Tile pattern & effect logic | DOM UI → Unity Canvas/UI Toolkit |
| Animal stat system & formulas | BabylonJS animations → DOTween/coroutines |
| Encounter decision trees | LocalStorage → PlayerPrefs/JSON |
| Dice economy & refill timer | CSS overlays → Unity overlay system |
| Upgrade shop pricing & stat math | Shadow setup → Unity light/shadow settings |

### Quick-Start Checklist for Claude Agent

When asking a Claude agent to help with the Unity port:

1. Share this README and the refactored `app.js` as context
2. Start with `GameConfig.cs` and the ScriptableObject definitions — they're pure data
3. Build `BoardBuilder.cs` next — it's self-contained math
4. Wire up `GameManager.cs` as the state singleton
5. Build the movement/camera system — core gameplay feel
6. Layer on tile effects and encounters
7. UI and polish last
