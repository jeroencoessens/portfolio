# FarmMap - Local Development Setup

This guide explains how to run the FarmMap application on a local web server.

## Why Do I Need a Local Server?

The browser blocks loading JSON files via `fetch()` when opening HTML files directly (using `file://` protocol) due to CORS security restrictions. Running a local server solves this issue.

---

## Quick Start (Choose One Method)

### Option 1: Python (Recommended - Simplest)

If you have Python installed (most Macs come with it pre-installed):

1. Open Terminal
2. Navigate to this folder:
   ```bash
   cd /Users/jcoessens/REPOS/FarmMap/FarmMapGame
   ```
3. Run one of these commands:
   
   **For Python 3.x:**
   ```bash
   python3 -m http.server 8000
   ```
   
   **For Python 2.x:**
   ```bash
   python -m SimpleHTTPServer 8000
   ```

4. Open your browser and go to:
   ```
   http://localhost:8000
   ```

5. To stop the server, press `Ctrl+C` in the terminal

---

### Option 2: Node.js (If you have npm installed)

1. Install a simple HTTP server globally:
   ```bash
   npm install -g http-server
   ```

2. Navigate to this folder:
   ```bash
   cd /Users/jcoessens/REPOS/FarmMap/FarmMapGame
   ```

3. Run the server:
   ```bash
   http-server -p 8000
   ```

4. Open your browser and go to:
   ```
   http://localhost:8000
   ```

---

### Option 3: VS Code Live Server Extension

If you're using VS Code:

1. Install the "Live Server" extension by Ritwick Dey
   - Open VS Code
   - Go to Extensions (⌘+Shift+X on Mac)
   - Search for "Live Server"
   - Click Install

2. Open the FarmMapGame folder in VS Code

3. Right-click on `index.html` and select "Open with Live Server"

4. The page will automatically open in your default browser

---

## Project Structure

```
FarmMapGame/
├── index.html              # Homepage (links to all prototypes)
├── farm-map/              # Original full map explorer
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── vietnam_json.json  # Farm data
├── farm-map-tinder/       # Zone Tinder (rapid voting)
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── farm-map-zones/        # Zone Quest (gamified prototype)
    ├── index.html
    ├── app.js
    └── styles.css
```

---

## Accessing Different Prototypes

Once your server is running on `http://localhost:8000`:

- **Homepage**: http://localhost:8000/
- **Full Map Explorer**: http://localhost:8000/farm-map/
- **Zone Tinder**: http://localhost:8000/farm-map-tinder/
- **Zone Quest** (New Game Mode): http://localhost:8000/farm-map-zones/

---

## Troubleshooting

### "Command not found: python3"
- Try `python` instead of `python3`
- Or install Python from https://www.python.org/downloads/

### Port already in use
If port 8000 is already being used, try a different port:
```bash
python3 -m http.server 8080
```
Then visit `http://localhost:8080`

### Changes not showing up
- Hard refresh your browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Clear browser cache
- Make sure you saved your files

---

## About the Project

FarmMap helps improve AI algorithms that identify factory farms from satellite imagery by crowdsourcing human verification.

- **Full Map Explorer**: Browse all farms, filter by probability, explore zones
- **Zone Tinder**: Rapid swipe-style voting within specific zones  
- **Zone Quest**: Gamified version with points, unlockable zones, badges, and leaderboard

Your votes help train the AI to better identify undocumented factory farms worldwide! 🌾
