/**
 * Auto Tab Rotator - Background Service Worker (Manifest V3)
 * Handles tab rotation cycle, periodic main tab revisit via alarms,
 * manual-stop detection, and state synchronization.
 */

// In-memory runtime flags & timer references
let rotationTimeoutId = null;
let isAutoActivatingMainTab = false;
let isAutoRotating = false;
let expectingAutoFocusMainTab = false;
let autoFocusTimeoutId = null;

/**
 * Set short-lived flag when expecting Chrome to auto-focus the main tab
 * (e.g. when the last non-main tab closes)
 */
function setExpectingAutoFocus() {
  expectingAutoFocusMainTab = true;
  if (autoFocusTimeoutId !== null) {
    clearTimeout(autoFocusTimeoutId);
  }
  autoFocusTimeoutId = setTimeout(() => {
    expectingAutoFocusMainTab = false;
    autoFocusTimeoutId = null;
  }, 1000);
}

function clearExpectingAutoFocus() {
  expectingAutoFocusMainTab = false;
  if (autoFocusTimeoutId !== null) {
    clearTimeout(autoFocusTimeoutId);
    autoFocusTimeoutId = null;
  }
}

// Default configuration constants
const DEFAULT_CONFIG = {
  isRunning: false,
  mainTabId: null,
  mainTabTitle: '',
  cycleDelaySeconds: 2,       // 1–3 seconds
  revisitIntervalMinutes: 10  // 5–30 minutes
};

const ALARM_NAME_REVISIT = 'revisit_main_tab';

/**
 * Initialize storage with default values on install or startup
 */
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const initial = { ...DEFAULT_CONFIG, ...current };
  // Validate bounded values
  initial.cycleDelaySeconds = clamp(initial.cycleDelaySeconds, 1, 3, 2);
  initial.revisitIntervalMinutes = clamp(initial.revisitIntervalMinutes, 5, 30, 10);
  await chrome.storage.local.set(initial);
  
  if (initial.isRunning) {
    // If was running before reload, resume
    resumeRotation();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await chrome.storage.local.get(['isRunning']);
  if (state.isRunning) {
    resumeRotation();
  }
});

/**
 * Clamp a number to min/max with fallback
 */
function clamp(val, min, max, fallback) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

/**
 * Helper to get current state from storage
 */
async function getState() {
  const state = await chrome.storage.local.get(DEFAULT_CONFIG);
  return state;
}

/**
 * Start tab rotation
 */
async function startRotation(mainTabId, mainTabTitle, delaySeconds, revisitMinutes) {
  const delay = clamp(delaySeconds, 1, 3, 2);
  const revisit = clamp(revisitMinutes, 5, 30, 10);

  // Stop any existing cycle first
  clearRotationTimers();
  clearExpectingAutoFocus();

  await chrome.storage.local.set({
    isRunning: true,
    mainTabId: mainTabId,
    mainTabTitle: mainTabTitle || 'Main Tab',
    cycleDelaySeconds: delay,
    revisitIntervalMinutes: revisit
  });

  // Setup periodic revisit alarm
  chrome.alarms.create(ALARM_NAME_REVISIT, {
    delayInMinutes: revisit,
    periodInMinutes: revisit
  });

  // Schedule first rotation step
  scheduleNextTick(delay * 1000);
  console.log(`[AutoTabRotator] Started rotation. MainTab: ${mainTabId}, Delay: ${delay}s, Revisit: ${revisit}m`);
}

/**
 * Resume rotation from existing storage state
 */
async function resumeRotation() {
  const state = await getState();
  if (!state.isRunning || !state.mainTabId) return;

  // Verify main tab still exists
  try {
    await chrome.tabs.get(state.mainTabId);
  } catch {
    console.warn('[AutoTabRotator] Main tab no longer exists on resume. Stopping rotation.');
    await stopRotation('main_tab_missing');
    return;
  }

  clearRotationTimers();

  chrome.alarms.create(ALARM_NAME_REVISIT, {
    delayInMinutes: state.revisitIntervalMinutes,
    periodInMinutes: state.revisitIntervalMinutes
  });

  scheduleNextTick(state.cycleDelaySeconds * 1000);
}

/**
 * Stop tab rotation
 */
async function stopRotation(reason = 'user_stop') {
  clearRotationTimers();
  clearExpectingAutoFocus();
  await chrome.alarms.clear(ALARM_NAME_REVISIT);

  await chrome.storage.local.set({ isRunning: false });
  console.log(`[AutoTabRotator] Stopped rotation. Reason: ${reason}`);
}

/**
 * Clear memory timeouts
 */
function clearRotationTimers() {
  if (rotationTimeoutId !== null) {
    clearTimeout(rotationTimeoutId);
    rotationTimeoutId = null;
  }
}

/**
 * Schedule next rotation tick
 */
function scheduleNextTick(delayMs) {
  clearRotationTimers();
  rotationTimeoutId = setTimeout(handleRotationTick, Math.max(delayMs, 500));
}

/**
 * Perform one rotation cycle to the next non-main tab
 */
async function handleRotationTick() {
  const state = await getState();
  if (!state.isRunning || !state.mainTabId) {
    return;
  }

  // 1. Verify main tab
  let mainTab;
  try {
    mainTab = await chrome.tabs.get(state.mainTabId);
  } catch {
    console.warn('[AutoTabRotator] Main tab not found. Stopping.');
    await stopRotation('main_tab_closed');
    return;
  }

  // 2. Query tabs in the same window
  let windowTabs = [];
  try {
    windowTabs = await chrome.tabs.query({ windowId: mainTab.windowId });
  } catch (err) {
    console.error('[AutoTabRotator] Error querying tabs:', err);
    scheduleNextTick(state.cycleDelaySeconds * 1000);
    return;
  }

  // 3. Filter non-main tabs
  const rotatableTabs = windowTabs.filter(t => t.id !== state.mainTabId);

  // If no other tabs exist, idle safely without error
  if (rotatableTabs.length === 0) {
    console.log('[AutoTabRotator] No non-main tabs open to rotate. Idling...');
    scheduleNextTick(state.cycleDelaySeconds * 1000);
    return;
  }

  // 4. Find next tab to activate
  // Find current active non-main tab index
  const activeNonMainIndex = rotatableTabs.findIndex(t => t.active);
  let nextTargetTab;

  if (activeNonMainIndex === -1) {
    // Current active tab is main tab (e.g. after revisit) or an untracked tab -> pick first non-main tab
    nextTargetTab = rotatableTabs[0];
  } else {
    // Loop circularly through non-main tabs
    const nextIndex = (activeNonMainIndex + 1) % rotatableTabs.length;
    nextTargetTab = rotatableTabs[nextIndex];
  }

  // 5. Activate next tab
  if (nextTargetTab && nextTargetTab.id) {
    isAutoRotating = true;
    try {
      await chrome.tabs.update(nextTargetTab.id, { active: true });
    } catch (err) {
      console.warn(`[AutoTabRotator] Failed to switch to tab ${nextTargetTab.id}:`, err);
    } finally {
      // Small timeout to clear auto-rotating flag
      setTimeout(() => {
        isAutoRotating = false;
      }, 300);
    }
  }

  // 6. Schedule next cycle
  scheduleNextTick(state.cycleDelaySeconds * 1000);
}

/**
 * Handle Revisit Main Tab Alarm
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME_REVISIT) return;

  const state = await getState();
  if (!state.isRunning || !state.mainTabId) return;

  console.log('[AutoTabRotator] Periodic revisit interval triggered. Auto-activating main tab for 1 cycle.');

  // Validate main tab existence
  try {
    await chrome.tabs.get(state.mainTabId);
  } catch {
    await stopRotation('main_tab_missing');
    return;
  }

  // Set programmatic flag BEFORE activating main tab
  isAutoActivatingMainTab = true;
  clearRotationTimers();

  try {
    await chrome.tabs.update(state.mainTabId, { active: true });
  } catch (err) {
    console.error('[AutoTabRotator] Error auto-activating main tab:', err);
    isAutoActivatingMainTab = false;
    scheduleNextTick(state.cycleDelaySeconds * 1000);
    return;
  }

  // Clear programmatic flag after activation settles
  setTimeout(() => {
    isAutoActivatingMainTab = false;
  }, 600);

  // Stay on main tab for one cycle turn, then continue normal rotation
  scheduleNextTick(state.cycleDelaySeconds * 1000);
});

/**
 * Detect Manual User Selection of the Main Tab
 * If user activates main tab themselves without programmatic or auto-focus flags, immediately STOP rotation.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const state = await getState();
  if (!state.isRunning) return;

  // Check if activated tab is the main tab
  if (activeInfo.tabId === state.mainTabId) {
    if (isAutoActivatingMainTab) {
      // Programmatic revisit switch -> allowed, do not stop
      console.log('[AutoTabRotator] Programmatic visit to main tab confirmed.');
      return;
    }

    if (expectingAutoFocusMainTab) {
      // Auto-focused main tab because the last non-main tab closed -> allowed, do not stop
      console.log('[AutoTabRotator] Auto-focus to main tab after closing last non-main tab confirmed. Staying in idle rotation.');
      clearExpectingAutoFocus();
      return;
    }

    // Secondary check: query remaining non-main tabs in the window.
    // If there are zero other tabs in the window, Chrome auto-focused the main tab because no other tabs exist.
    try {
      const windowTabs = await chrome.tabs.query({ windowId: activeInfo.windowId });
      const nonMainTabs = windowTabs.filter(t => t.id !== state.mainTabId);
      if (nonMainTabs.length === 0) {
        console.log('[AutoTabRotator] Main tab activated but zero non-main tabs exist in window. Keeping rotation active (idling).');
        return;
      }
    } catch (err) {
      console.warn('[AutoTabRotator] Error verifying tab count on onActivated:', err);
    }

    // Manual click by user on main tab while other tabs exist -> immediate stop condition!
    console.log('[AutoTabRotator] Manual tab switch to main tab detected while other tabs exist. Pausing rotation immediately.');
    await stopRotation('manual_main_tab_click');
  }
});

/**
 * Tab Removed: If main tab is closed, stop rotation.
 * If the last non-main tab is closed, flag expected auto-focus so rotation idles without stopping.
 */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const state = await getState();
  
  if (state.mainTabId === tabId) {
    console.log('[AutoTabRotator] Main tab closed by user. Stopping rotation.');
    await chrome.storage.local.set({
      isRunning: false,
      mainTabId: null,
      mainTabTitle: ''
    });
    clearRotationTimers();
    clearExpectingAutoFocus();
    await chrome.alarms.clear(ALARM_NAME_REVISIT);
    return;
  }

  // If rotation is running and a non-main tab was closed in the main tab's window
  if (state.isRunning && state.mainTabId) {
    try {
      const mainTab = await chrome.tabs.get(state.mainTabId);
      if (!removeInfo || removeInfo.windowId === mainTab.windowId) {
        const windowTabs = await chrome.tabs.query({ windowId: mainTab.windowId });
        const nonMainTabs = windowTabs.filter(t => t.id !== state.mainTabId);

        // If zero non-main tabs remain, Chrome will auto-focus the main tab
        if (nonMainTabs.length === 0) {
          console.log('[AutoTabRotator] Last non-main tab closed. Expecting auto-focus on main tab.');
          setExpectingAutoFocus();
        }
      }
    } catch (err) {
      console.warn('[AutoTabRotator] Error checking remaining tabs on onRemoved:', err);
    }
  }
});

/**
 * Tab Updated: Keep main tab title up to date
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const state = await getState();
  if (state.mainTabId === tabId && (changeInfo.title || tab.title)) {
    const updatedTitle = changeInfo.title || tab.title || 'Main Tab';
    if (updatedTitle !== state.mainTabTitle) {
      await chrome.storage.local.set({ mainTabTitle: updatedTitle });
    }
  }
});

/**
 * Message Dispatcher for UI communication
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'START_ROTATION': {
          const { mainTabId, mainTabTitle, cycleDelaySeconds, revisitIntervalMinutes } = message.payload;
          await startRotation(mainTabId, mainTabTitle, cycleDelaySeconds, revisitIntervalMinutes);
          sendResponse({ success: true, state: await getState() });
          break;
        }

        case 'STOP_ROTATION': {
          await stopRotation('popup_toggle');
          sendResponse({ success: true, state: await getState() });
          break;
        }

        case 'UPDATE_SETTINGS': {
          const { cycleDelaySeconds, revisitIntervalMinutes } = message.payload;
          const delay = clamp(cycleDelaySeconds, 1, 3, 2);
          const revisit = clamp(revisitIntervalMinutes, 5, 30, 10);

          await chrome.storage.local.set({
            cycleDelaySeconds: delay,
            revisitIntervalMinutes: revisit
          });

          const state = await getState();
          if (state.isRunning) {
            // Re-arm alarm with new revisit interval
            chrome.alarms.create(ALARM_NAME_REVISIT, {
              delayInMinutes: revisit,
              periodInMinutes: revisit
            });
          }

          sendResponse({ success: true, state });
          break;
        }

        case 'GET_STATUS': {
          const state = await getState();
          sendResponse({ success: true, state });
          break;
        }

        case 'SET_MAIN_TAB': {
          const { mainTabId, mainTabTitle } = message.payload;
          await chrome.storage.local.set({
            mainTabId,
            mainTabTitle: mainTabTitle || 'Main Tab'
          });
          sendResponse({ success: true, state: await getState() });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('[AutoTabRotator] Message error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
