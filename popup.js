/**
 * Auto Tab Rotator - Popup UI Controller
 * Enforces main-tab control restrictions, provides responsive toggle,
 * input validation, and live state synchronization.
 */

// DOM Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const mainTabTitleEl = document.getElementById('mainTabTitle');
const lockedNotice = document.getElementById('lockedNotice');
const controlsArea = document.getElementById('controlsArea');
const toggleBtn = document.getElementById('toggleBtn');
const cycleDelayInput = document.getElementById('cycleDelay');
const revisitIntervalInput = document.getElementById('revisitInterval');
const footerText = document.getElementById('footerText');

let currentActiveTab = null;
let currentState = {
  isRunning: false,
  mainTabId: null,
  mainTabTitle: '',
  cycleDelaySeconds: 2,
  revisitIntervalMinutes: 10
};

/**
 * Initialize Popup
 */
async function initPopup() {
  try {
    // 1. Get currently active tab in this window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentActiveTab = tab || null;

    // 2. Fetch state from storage
    const state = await chrome.storage.local.get({
      isRunning: false,
      mainTabId: null,
      mainTabTitle: '',
      cycleDelaySeconds: 2,
      revisitIntervalMinutes: 10
    });

    currentState = state;

    // 3. Render UI based on state and active tab
    renderUI();

    // 4. Attach event listeners
    setupEventListeners();
  } catch (err) {
    console.error('[Popup] Initialization error:', err);
  }
}

/**
 * Render UI according to state and permissions
 */
function renderUI() {
  const { isRunning, mainTabId, mainTabTitle, cycleDelaySeconds, revisitIntervalMinutes } = currentState;

  // 1. Update Status Badge
  if (isRunning) {
    statusBadge.className = 'status-badge badge-active';
    statusText.textContent = 'Active';
    toggleBtn.textContent = 'Stop Rotation';
    toggleBtn.className = 'toggle-btn btn-stop';
  } else {
    statusBadge.className = 'status-badge badge-paused';
    statusText.textContent = 'Paused';
    toggleBtn.textContent = 'Start Rotation';
    toggleBtn.className = 'toggle-btn btn-start';
  }

  // 2. Update Input Values
  cycleDelayInput.value = cycleDelaySeconds || 2;
  revisitIntervalInput.value = revisitIntervalMinutes || 10;

  // 3. Determine Main Tab & Lock State
  const isMainTabDesignated = mainTabId !== null && mainTabId !== undefined;
  let isOnMainTab = false;

  if (!isMainTabDesignated) {
    // No main tab registered yet: current tab will become the main tab upon start
    isOnMainTab = true;
    mainTabTitleEl.textContent = currentActiveTab ? (currentActiveTab.title || 'Current Tab') : 'Current Tab';
    mainTabTitleEl.title = 'This tab will be designated as the Main Tab';
  } else {
    isOnMainTab = currentActiveTab && currentActiveTab.id === mainTabId;
    mainTabTitleEl.textContent = mainTabTitle || (isOnMainTab && currentActiveTab ? currentActiveTab.title : 'Main Tab');
    mainTabTitleEl.title = `ID: ${mainTabId}`;
  }

  // 4. Enforce Main-Tab Restriction
  if (isOnMainTab) {
    // Unlocked: Allow full editing
    lockedNotice.classList.add('hidden');
    controlsArea.classList.remove('is-locked');
    toggleBtn.disabled = false;
    cycleDelayInput.disabled = false;
    revisitIntervalInput.disabled = false;
    footerText.textContent = 'Clicking the main tab manually stops rotation.';
  } else {
    // Locked: Read-only view
    lockedNotice.classList.remove('hidden');
    controlsArea.classList.add('is-locked');
    toggleBtn.disabled = true;
    cycleDelayInput.disabled = true;
    revisitIntervalInput.disabled = true;
    footerText.textContent = 'Editing & control are restricted to the main tab.';
  }
}

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
  // Toggle Button Click
  toggleBtn.addEventListener('click', async () => {
    if (toggleBtn.disabled) return;

    if (!currentState.isRunning) {
      // Start Rotation: current active tab is the main tab
      const mainId = currentActiveTab ? currentActiveTab.id : currentState.mainTabId;
      const mainTitle = currentActiveTab ? (currentActiveTab.title || 'Main Tab') : (currentState.mainTabTitle || 'Main Tab');
      const delay = validateRange(cycleDelayInput.value, 1, 3, 2);
      const revisit = validateRange(revisitIntervalInput.value, 5, 30, 10);

      chrome.runtime.sendMessage({
        type: 'START_ROTATION',
        payload: {
          mainTabId: mainId,
          mainTabTitle: mainTitle,
          cycleDelaySeconds: delay,
          revisitIntervalMinutes: revisit
        }
      }, (response) => {
        if (response && response.state) {
          currentState = response.state;
          renderUI();
        }
      });
    } else {
      // Stop Rotation
      chrome.runtime.sendMessage({
        type: 'STOP_ROTATION'
      }, (response) => {
        if (response && response.state) {
          currentState = response.state;
          renderUI();
        }
      });
    }
  });

  // Cycle Delay Input Change
  cycleDelayInput.addEventListener('change', () => {
    handleSettingsChange();
  });

  // Revisit Interval Input Change
  revisitIntervalInput.addEventListener('change', () => {
    handleSettingsChange();
  });
}

/**
 * Handle settings update and boundary validation
 */
function handleSettingsChange() {
  const delay = validateRange(cycleDelayInput.value, 1, 3, 2);
  const revisit = validateRange(revisitIntervalInput.value, 5, 30, 10);

  cycleDelayInput.value = delay;
  revisitIntervalInput.value = revisit;

  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: {
      cycleDelaySeconds: delay,
      revisitIntervalMinutes: revisit
    }
  }, (response) => {
    if (response && response.state) {
      currentState = response.state;
    }
  });
}

/**
 * Clamp input integer helper
 */
function validateRange(value, min, max, fallback) {
  let num = parseInt(value, 10);
  if (isNaN(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

/**
 * Listen for live background storage changes (e.g. manual stop detected)
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  let stateChanged = false;
  for (const key of Object.keys(changes)) {
    if (key in currentState) {
      currentState[key] = changes[key].newValue;
      stateChanged = true;
    }
  }

  if (stateChanged) {
    renderUI();
  }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initPopup);
