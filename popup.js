// ============================================================
// LinkedIn Toolkit – Popup Script (v1.2 – background delegation)
// ============================================================

let skills = [];
let selectedSkills = new Set();
let isRemoving = false;

// ── DOM refs ──────────────────────────────────────────────────
const scanBtn          = document.getElementById('scanBtn');
const selectAllBtn     = document.getElementById('selectAllBtn');
const clearBtn         = document.getElementById('clearBtn');
const removeSelectedBtn= document.getElementById('removeSelectedBtn');
const cancelBtn        = document.getElementById('cancelBtn');
const skillsContainer  = document.getElementById('skillsContainer');
const emptyState       = document.getElementById('emptyState');
const bulkActions      = document.getElementById('bulkActions');
const statusDot        = document.getElementById('statusDot');
const statusText       = document.getElementById('statusText');
const selectedCount    = document.getElementById('selectedCount');
const progressSection  = document.getElementById('progressSection');
const progressFill     = document.getElementById('progressFill');
const progressLabel    = document.getElementById('progressLabel');
const progressCount    = document.getElementById('progressCount');
const progressLog      = document.getElementById('progressLog');
const notLinkedIn      = document.getElementById('notLinkedIn');
const mainContent      = document.getElementById('mainContent');

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkLinkedInPage();
  setupTabs();
  setupEventListeners();
  await syncWithBackground();
});

async function checkLinkedInPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !tab.url.includes('linkedin.com')) {
    notLinkedIn.classList.remove('hidden');
    mainContent.classList.add('hidden');
  }
}

// ── Sync UI with background state (popup was reopened) ────────
async function syncWithBackground() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getState' });
    const state = resp?.state;
    if (!state) return;

    if (state.running || state.total > 0) {
      // A job was / is running – restore the UI
      isRemoving = state.running;
      skills = state.skills || [];

      renderSkills();
      updateBulkActions();
      progressSection.classList.remove('hidden');

      // Replay log entries
      progressLog.innerHTML = '';
      (state.log || []).forEach(entry => addLog(entry.type, entry.msg));

      const done = state.removed + state.errors;
      progressCount.textContent = `${done} / ${state.total}`;
      progressFill.style.width = `${state.total > 0 ? (done / state.total) * 100 : 0}%`;

      if (state.running) {
        progressLabel.textContent = `Removing "${state.skills[state.current]?.name || '...'}"...`;
        setStatus('removing', `Running in background – ${state.removed} removed so far`);
        cancelBtn.style.display = 'inline-flex';
        scanBtn.disabled = true;
        removeSelectedBtn.disabled = true;
      } else {
        progressLabel.textContent = `Done! ${state.removed} removed${state.errors > 0 ? `, ${state.errors} failed` : ''}`;
        setStatus('found', `Completed: ${state.removed} removed${state.errors > 0 ? `, ${state.errors} failed` : ''}`);
        cancelBtn.style.display = 'none';
      }

      // Mark removed skills visually
      state.log
        .filter(e => e.type === 'success')
        .forEach(e => {
          const name = e.msg.replace(/^✓ Removed "(.+)"$/, '$1');
          const idx = skills.findIndex(s => s.name === name);
          const el = skillsContainer.querySelector(`[data-index="${idx}"]`);
          if (el) {
            el.querySelector('.skill-status').className = 'skill-status done';
            el.querySelector('.skill-status').textContent = 'Removed';
            el.classList.add('removed');
          }
        });
    }
  } catch (_) {}
}

// ── Tab Switching ─────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

// ── Event Listeners ───────────────────────────────────────────
function setupEventListeners() {
  scanBtn.addEventListener('click', scanSkills);
  selectAllBtn.addEventListener('click', selectAll);
  clearBtn.addEventListener('click', clearSelection);
  removeSelectedBtn.addEventListener('click', removeSelected);
  cancelBtn.addEventListener('click', cancelDeletion);

  // Listen for progress broadcasts from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'deletionProgress') {
      handleProgressUpdate(message);
    }
  });
}

// ── Handle Progress Updates from Background ───────────────────
function handleProgressUpdate(message) {
  const state = message.state;
  if (!state) return;

  const done = state.removed + state.errors;
  progressCount.textContent = `${done} / ${state.total}`;
  progressFill.style.width = `${state.total > 0 ? (done / state.total) * 100 : 0}%`;

  // Replay only the latest log entry
  if (state.log && state.log.length > 0) {
    const latest = state.log[state.log.length - 1];
    // Only add if not already shown
    const existing = progressLog.querySelectorAll('.log-entry');
    if (existing.length < state.log.length) {
      addLog(latest.type, latest.msg);
    }
  }

  if (message.type === 'deletionProgress' && state.running && state.skills[state.current]) {
    progressLabel.textContent = `Removing "${state.skills[state.current].name}"...`;

    // Mark currently removing skill
    const idx = state.current;
    const el = skillsContainer.querySelector(`[data-index="${idx}"]`);
    if (el) {
      el.querySelector('.skill-status').className = 'skill-status removing';
      el.querySelector('.skill-status').textContent = '...';
    }
  }

  // Mark the just-processed skill
  if (state.log.length > 0) {
    const latest = state.log[state.log.length - 1];
    const name = latest.msg.match(/"(.+)"/)?.[1];
    if (name) {
      const idx = skills.findIndex(s => s.name === name);
      const el = skillsContainer.querySelector(`[data-index="${idx}"]`);
      if (el) {
        if (latest.type === 'success') {
          el.querySelector('.skill-status').className = 'skill-status done';
          el.querySelector('.skill-status').textContent = 'Removed';
          el.classList.add('removed');
        } else {
          el.querySelector('.skill-status').className = 'skill-status ok';
          el.querySelector('.skill-status').textContent = 'Active';
        }
      }
    }
  }

  if (message.type === 'done' || message.type === 'cancelled' || !state.running) {
    isRemoving = false;
    cancelBtn.style.display = 'none';
    scanBtn.disabled = false;
    removeSelectedBtn.disabled = selectedSkills.size === 0;
    const label = message.type === 'cancelled'
      ? `Cancelled – ${state.removed} removed`
      : `Done! ${state.removed} removed${state.errors > 0 ? `, ${state.errors} failed` : ''}`;
    progressLabel.textContent = label;
    setStatus('found', label);
    selectedSkills.clear();
    updateBulkActions();
  }
}

// ── Scan Skills (with auto-scroll) ───────────────────────────
async function scanSkills() {
  if (isRemoving) return;

  setStatus('scanning', 'Scrolling page to load all skills...');
  scanBtn.disabled = true;
  scanBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="animation:spin 1s linear infinite"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg> Loading...`;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: autoScrollPage });
    setStatus('scanning', 'Scanning for skills...');

    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanLinkedInSkills });
    const found = results[0]?.result || [];

    skills = found;
    selectedSkills.clear();
    renderSkills();
    updateBulkActions();

    if (found.length === 0) {
      setStatus('error', 'No skills found. Navigate to your LinkedIn skills page.');
    } else {
      setStatus('found', `Found ${found.length} skill${found.length !== 1 ? 's' : ''}`);
    }
  } catch (err) {
    setStatus('error', 'Error: ' + (err.message || 'Could not access page'));
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Scan Skills`;
  }
}

// ── Auto-scroll (injected into LinkedIn tab) ──────────────────
async function autoScrollPage() {
  return new Promise((resolve) => {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    let lastCount = 0;
    let stableRounds = 0;

    async function scrollLoop() {
      const scrollHeight = document.body.scrollHeight;
      const step = Math.floor(window.innerHeight * 0.8);
      for (let pos = 0; pos < scrollHeight; pos += step) {
        window.scrollTo({ top: pos, behavior: 'smooth' });
        await delay(400);
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await delay(1000);

      const currentCount = document.querySelectorAll('a[aria-label^="Edit "][aria-label$=" skill"]').length;
      if (currentCount === lastCount) stableRounds++;
      else { stableRounds = 0; lastCount = currentCount; }

      if (stableRounds >= 2) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await delay(400);
        resolve(currentCount);
      } else {
        await scrollLoop();
      }
    }
    scrollLoop();
  });
}

// ── Scan DOM for skills (injected) ───────────────────────────
function scanLinkedInSkills() {
  const found = [];
  document.querySelectorAll('a[aria-label]').forEach(link => {
    const label = link.getAttribute('aria-label') || '';
    const match = label.match(/^Edit (.+?) skill$/i);
    if (match) {
      const name = match[1].trim();
      if (!found.find(s => s.name === name)) found.push({ name });
    }
  });
  if (found.length === 0) {
    document.querySelectorAll('[componentkey*="profile.skill"]').forEach(el => {
      const textEl = el.querySelector('p span');
      if (textEl) {
        const text = textEl.textContent.trim();
        if (text && !found.find(s => s.name === text)) found.push({ name: text });
      }
    });
  }
  return found;
}

// ── Render Skills ─────────────────────────────────────────────
function renderSkills() {
  skillsContainer.querySelectorAll('.skill-item').forEach(el => el.remove());
  if (skills.length === 0) { emptyState.style.display = 'flex'; return; }
  emptyState.style.display = 'none';
  bulkActions.style.display = 'flex';

  skills.forEach((skill, index) => {
    const item = document.createElement('div');
    item.className = 'skill-item';
    item.dataset.index = index;
    item.style.animationDelay = `${Math.min(index * 25, 400)}ms`;
    item.innerHTML = `
      <div class="skill-checkbox"></div>
      <span class="skill-name">${escapeHtml(skill.name)}</span>
      <span class="skill-status ok">Active</span>
    `;
    item.addEventListener('click', () => toggleSkill(index, item));
    skillsContainer.appendChild(item);
  });
}

// ── Selection ─────────────────────────────────────────────────
function toggleSkill(index, item) {
  if (selectedSkills.has(index)) { selectedSkills.delete(index); item.classList.remove('selected'); }
  else { selectedSkills.add(index); item.classList.add('selected'); }
  updateBulkActions();
}
function selectAll() {
  skills.forEach((_, i) => selectedSkills.add(i));
  skillsContainer.querySelectorAll('.skill-item').forEach(el => el.classList.add('selected'));
  updateBulkActions();
}
function clearSelection() {
  selectedSkills.clear();
  skillsContainer.querySelectorAll('.skill-item').forEach(el => el.classList.remove('selected'));
  updateBulkActions();
}
function updateBulkActions() {
  selectedCount.textContent = selectedSkills.size;
  removeSelectedBtn.disabled = selectedSkills.size === 0;
}

// ── Start Removal (delegate to background) ────────────────────
async function removeSelected() {
  if (selectedSkills.size === 0 || isRemoving) return;

  const toRemove = [...selectedSkills].map(i => skills[i]);
  isRemoving = true;

  progressSection.classList.remove('hidden');
  progressLog.innerHTML = '';
  progressFill.style.width = '0%';
  progressCount.textContent = `0 / ${toRemove.length}`;
  progressLabel.textContent = 'Starting – runs in background even if you close this popup';
  cancelBtn.style.display = 'inline-flex';
  scanBtn.disabled = true;
  removeSelectedBtn.disabled = true;
  setStatus('removing', `Removing ${toRemove.length} skill${toRemove.length !== 1 ? 's' : ''}...`);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send to background service worker
  await chrome.runtime.sendMessage({
    type: 'startDeletion',
    skills: toRemove,
    tabId: tab.id,
  });
}

// ── Cancel Deletion ───────────────────────────────────────────
async function cancelDeletion() {
  await chrome.runtime.sendMessage({ type: 'cancelDeletion' });
  cancelBtn.style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────
function setStatus(type, text) {
  statusDot.className = 'status-dot ' + type;
  statusText.textContent = text;
}
function addLog(type, msg) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = msg;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
