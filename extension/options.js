const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(['baseUrl', 'key']).then(({ baseUrl = '', key = '' }) => {
  $('baseUrl').value = baseUrl;
  $('key').value = key;
});

$('save').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim().replace(/\/+$/, '');
  const key = $('key').value.trim();
  await chrome.storage.sync.set({ baseUrl, key });

  const status = $('status');
  status.textContent = 'Testing…';
  status.style.color = '#8d96ad';

  try {
    const res = await fetch(`${baseUrl}/api/gate`, {
      headers: key ? { 'x-rl-key': key } : undefined,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`server returned ${res.status}`);

    const gate = await res.json();
    if (!gate.enabled) {
      status.textContent = 'Connected. The gate is currently disarmed in your app settings.';
      status.style.color = '#ffd23f';
    } else {
      status.textContent = gate.locked
        ? `Connected. Gate is shut — ${gate.remaining} points to go.`
        : 'Connected. Gate is open.';
      status.style.color = gate.locked ? '#ff3d6e' : '#2ee86b';
    }
  } catch (err) {
    status.textContent = `Could not reach it: ${err.message}`;
    status.style.color = '#ff3d6e';
  }
});
