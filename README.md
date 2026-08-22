# Auto Tab Rotator (Main-Tab-Controlled) Chrome Extension

A Manifest V3 Chrome Extension that automatically cycles through open tabs on a short, user-configurable delay (1–3 seconds), with a periodic revisit back to the designated main tab (5–30 minutes). Settings and controls are strictly restricted to the main tab, and manually selecting the main tab immediately halts the rotation.

---

## Features

- **Main-Tab Control**: The designated main tab acts as the master control center. Settings and toggling are only editable while active on the main tab.
- **Dynamic Tab Rotation**: Cycles through all non-main tabs in order (1, 2, 3...) and automatically loops. Updates dynamically as tabs are opened or closed.
- **Periodic Main Tab Revisit**: Automatically returns to the main tab for one cycle turn every 5–30 minutes (configured via `chrome.alarms`), then continues cycling non-main tabs.
- **Instant Manual Stop**: If the user manually clicks/switches to the main tab, rotation stops immediately and enters the "Paused" state.
- **Claude-like Pastel UI**: Warm minimalist aesthetic with pill status badges, gentle borders, and responsive state synchronization.
- **Manifest V3 Compliant**: Uses background service worker, `chrome.storage.local`, and `chrome.alarms`.

---

## Installation & Setup

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the project directory:
   ```
   /Users/ponraj/CursorPro
   ```
5. The **Auto Tab Rotator** extension is now installed and ready to use. Pin it to your toolbar for easy access.

---

## Manual Test Cases

| # | Test Scenario | Steps | Expected Result |
|---|---------------|-------|-----------------|
| **1** | **Normal Rotation** | 1. Open 3 tabs (e.g. Tab 1, Tab 2, Tab 3).<br>2. On Tab 1 (Main Tab), open popup and click **Start Rotation**.<br>3. Observe tab switching. | Rotation cycles back and forth between Tab 2 and Tab 3 every 1–3s, skipping Tab 1. |
| **2** | **Periodic Revisit** | 1. Set revisit interval to 5 min (or test with background alarm trigger).<br>2. Allow rotation to run until the interval triggers. | Rotation auto-switches to Tab 1 (Main Tab) for 1 cycle, then resumes cycling Tab 2 and Tab 3 without stopping. |
| **3** | **Manual Click Stop** | 1. While rotation is actively cycling non-main tabs, manually click on Tab 1 (Main Tab). | Rotation stops immediately. Popup status updates to **Paused**. |
| **4** | **Locked State on Non-Main Tabs** | 1. Switch to Tab 2 or Tab 3.<br>2. Open the extension popup. | Controls and toggle are disabled (grayed out). A warning banner states: *"Switch to the main tab to change settings."* Values and status remain visible. |
| **5** | **Editable State on Main Tab** | 1. Switch to Tab 1 (Main Tab).<br>2. Open the extension popup.<br>3. Change cycle delay to `2s` and revisit to `10m`. | Inputs are enabled. Changes take effect and persist. |
| **6** | **Dynamic Tab Opening / Closing & Auto-Focus Idle** | 1. With Main + 1 tab running, close the 1 tab.<br>2. Observe main tab auto-focusing.<br>3. Open a new tab. | Rotation stays "Active" (idling safely on main tab, not stopped). When the new tab is opened, rotation resumes cycling it automatically without requiring a restart. |
| **7** | **Persistence Across Restarts** | 1. Configure custom settings and restart the browser or reload the extension. | Saved delay, revisit interval, and state persist in `chrome.storage.local`. |

---

## Project Structure

```
├── manifest.json         # Manifest V3 configuration & permissions
├── background.js        # Background service worker (rotation engine & alarms)
├── popup.html           # Popup interface
├── popup.css            # Pastel Claude-inspired stylesheet
├── popup.js             # UI interaction, validation & main-tab locking logic
├── generate_icons.mjs   # PNG icon generator script
├── icons/               # Extension icons (16x16, 48x48, 128x128)
└── README.md            # Documentation and testing guide
```
