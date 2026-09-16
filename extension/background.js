/**
 * Ranked Life Gate.
 *
 * Polls /api/gate and, while the gate is shut, redirects the domains your app
 * has configured to a page that tells you how many points you still owe.
 *
 * Two deliberate design calls:
 *  - It fails OPEN. Any network error, bad response or missing config leaves
 *    the internet working. A blocker that jams shut when a server blinks gets
 *    uninstalled inside a day, and then it protects nothing at all.
 *  - The site list comes from the server, not from here, so the list lives with
 *    the rest of your settings instead of in two places that drift apart.
 */

const POLL_MINUTES = 1;
const RULE_ID_BASE = 1000;
const MAX_RULES = 200;

async function config() {
  const { baseUrl = '', key = '' } = await chrome.storage.sync.get(['baseUrl', 'key']);
  return { baseUrl: baseUrl.replace(/\/+$/, ''), key };
}

async function fetchGate() {
  const { baseUrl, key } = await config();
  if (!baseUrl) return null;

  const res = await fetch(`${baseUrl}/api/gate`, {
    headers: key ? { 'x-rl-key': key } : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`gate returned ${res.status}`);
  return res.json();
}

/** Turn a bare domain into a declarativeNetRequest rule covering it and its subdomains. */
function ruleFor(domain, index, blockedUrl) {
  return {
    id: RULE_ID_BASE + index,
    priority: 1,
    action: { type: 'redirect', redirect: { extensionPath: blockedUrl } },
    condition: {
      requestDomains: [domain],
      resourceTypes: ['main_frame'],
    },
  };
}

async function clearRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.map((r) => r.id).filter((id) => id >= RULE_ID_BASE);
  if (ids.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  }
}

async function sync() {
  let gate;
  try {
    gate = await fetchGate();
  } catch (err) {
    console.warn('[gate] unreachable, failing open:', err.message);
    await clearRules();
    await setBadge('?', '#8d96ad');
    return;
  }

  if (!gate || !gate.enabled) {
    await clearRules();
    await setBadge('', '#8d96ad');
    return;
  }

  if (!gate.locked) {
    await clearRules();
    await setBadge('OK', '#2ee86b');
    return;
  }

  const domains = (gate.sites || [])
    .map((s) => String(s).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_RULES);

  const blockedUrl = `/blocked.html?remaining=${encodeURIComponent(gate.remaining ?? 0)}&threshold=${encodeURIComponent(gate.threshold ?? 0)}&score=${encodeURIComponent(gate.score ?? 0)}`;

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id).filter((id) => id >= RULE_ID_BASE),
    addRules: domains.map((domain, i) => ruleFor(domain, i, blockedUrl)),
  });

  await setBadge(String(Math.ceil(gate.remaining ?? 0)), '#ff3d6e');
}

async function setBadge(text, color) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // Badge is cosmetic; never let it break the poll.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('gate-poll', { periodInMinutes: POLL_MINUTES });
  void sync();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('gate-poll', { periodInMinutes: POLL_MINUTES });
  void sync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'gate-poll') void sync();
});

// Re-check immediately when the options change, so saving feels instant.
chrome.storage.onChanged.addListener(() => void sync());

// Clicking the icon forces a refresh rather than waiting out the poll.
chrome.action.onClicked.addListener(() => void sync());
