// ============================================================
// LinkedIn Toolkit – Background Service Worker
// Handles deletion loop so it survives popup close/open
// ============================================================

// ── State ─────────────────────────────────────────────────────
let deletionState = {
  running: false,
  skills: [],       // full list being deleted
  current: 0,       // index into skills[]
  removed: 0,
  errors: 0,
  log: [],          // { type, msg } entries
  tabId: null,
};

// ── Message Router ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ type: 'pong' });
    return true;
  }

  if (message.type === 'startDeletion') {
    if (deletionState.running) {
      sendResponse({ ok: false, reason: 'already running' });
      return true;
    }
    startDeletion(message.skills, message.tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'cancelDeletion') {
    deletionState.running = false;
    broadcastProgress({ type: 'cancelled' });
    persistState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'getState') {
    sendResponse({ state: getPublicState() });
    return true;
  }
});

// ── Start Deletion Loop ───────────────────────────────────────
async function startDeletion(skills, tabId) {
  deletionState = {
    running: true,
    skills,
    current: 0,
    removed: 0,
    errors: 0,
    log: [],
    tabId,
  };
  persistState();

  for (let i = 0; i < skills.length; i++) {
    if (!deletionState.running) break;

    deletionState.current = i;
    const skill = skills[i];

    broadcastProgress({ type: 'progress', skill: skill.name, index: i });

    try {
      // Verify tab still exists
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        addLog('error', `✗ Tab closed – stopping`);
        deletionState.running = false;
        break;
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: deleteSkillByName,
        args: [skill.name],
      });

      const res = result[0]?.result;
      const success = res?.success;
      const reason = res?.reason || '';

      if (success) {
        deletionState.removed++;
        addLog('success', `✓ Removed "${skill.name}"`);
        await sleep(1800);
      } else {
        deletionState.errors++;
        addLog('error', `✗ Failed: "${skill.name}"${reason ? ' – ' + reason : ''}`);
        await sleep(600);
      }
    } catch (err) {
      deletionState.errors++;
      addLog('error', `✗ Error: "${skill.name}" – ${err.message}`);
      await sleep(600);
    }

    persistState();
    broadcastProgress({ type: 'update' });
  }

  deletionState.running = false;
  deletionState.current = deletionState.skills.length;
  persistState();
  broadcastProgress({ type: 'done' });
}

// ── Helpers ───────────────────────────────────────────────────
function addLog(type, msg) {
  deletionState.log.push({ type, msg });
  // Keep log bounded
  if (deletionState.log.length > 200) deletionState.log.shift();
}

function getPublicState() {
  return {
    running: deletionState.running,
    total: deletionState.skills.length,
    current: deletionState.current,
    removed: deletionState.removed,
    errors: deletionState.errors,
    log: deletionState.log,
    skills: deletionState.skills,
  };
}

function persistState() {
  chrome.storage.local.set({ deletionState: getPublicState() });
}

function broadcastProgress(extra) {
  chrome.runtime.sendMessage({ type: 'deletionProgress', ...extra, state: getPublicState() })
    .catch(() => {}); // popup may not be open – that's fine
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Injected into LinkedIn tab: Delete skill by name ──────────
// (Must be self-contained – no closures over background globals)
async function deleteSkillByName(skillName) {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function findEditLink() {
    const links = document.querySelectorAll('a[aria-label]');
    for (const link of links) {
      const label = link.getAttribute('aria-label') || '';
      if (label.toLowerCase() === `edit ${skillName.toLowerCase()} skill`) return link;
    }
    for (const link of links) {
      const label = link.getAttribute('aria-label') || '';
      if (
        label.toLowerCase().startsWith('edit ') &&
        label.toLowerCase().includes(skillName.toLowerCase()) &&
        label.toLowerCase().endsWith(' skill')
      ) return link;
    }
    return null;
  }

  function findDeleteButton() {
    const modal = document.querySelector(
      '[role="dialog"], [data-test-modal], .artdeco-modal, [aria-modal="true"]'
    );
    const scope = modal || document;
    for (const btn of scope.querySelectorAll('button, [role="button"]')) {
      const text = btn.textContent.trim().toLowerCase();
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text === 'delete' || text === 'delete skill' || text === 'remove' ||
          label === 'delete' || label.includes('delete skill')) return btn;
    }
    return null;
  }

  function findConfirmButton() {
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'delete' || text === 'yes, delete' || text === 'confirm') return btn;
    }
    return null;
  }

  function closeModal() {
    const closeBtn = document.querySelector(
      'button[aria-label="Dismiss"], button[aria-label="Close"], .artdeco-modal__dismiss'
    );
    if (closeBtn) closeBtn.click();
  }

  try {
    const editLink = findEditLink();
    if (!editLink) return { success: false, reason: 'edit link not found' };

    editLink.click();

    // Poll up to 4s for the delete button to appear
    let deleteBtn = null;
    for (let i = 0; i < 16; i++) {
      await delay(250);
      deleteBtn = findDeleteButton();
      if (deleteBtn) break;
    }

    if (!deleteBtn) {
      closeModal();
      return { success: false, reason: 'delete button not found in modal' };
    }

    deleteBtn.click();
    await delay(700);

    const confirmBtn = findConfirmButton();
    if (confirmBtn) {
      confirmBtn.click();
      await delay(700);
    }

    // Wait for modal to close (up to 3s)
    for (let i = 0; i < 12; i++) {
      await delay(250);
      const stillOpen = document.querySelector('[role="dialog"][open], .artdeco-modal--active');
      if (!stillOpen) break;
    }

    return { success: true };
  } catch (e) {
    closeModal();
    return { success: false, reason: e.message };
  }
}

// ── Restore state on worker restart ──────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ deletionState: null });
});
