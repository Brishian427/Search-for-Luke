const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const adminKey = process.env.TEST_ADMIN_KEY || 'classroom';

async function createSession() {
  const response = await fetch(`${baseUrl}/api/admin/new?key=${encodeURIComponent(adminKey)}`, { method: 'POST' });
  assert.equal(response.status, 200);
  return (await response.json()).room_code;
}

(async () => {
  const firstRoom = await createSession();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/?room=${firstRoom}`);
    await page.locator('[data-name="Ben Knell"]').click();
    await page.locator('#game-view:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('luke-room-code')), firstRoom);
    assert.ok(await page.evaluate(() => localStorage.getItem('luke-player-id')));

    const secondRoom = await createSession();
    await page.waitForFunction(
      room => !localStorage.getItem('luke-player-id') &&
        !document.querySelector('#join-view').hidden &&
        document.querySelector('#room-input').value === room,
      secondRoom,
      { timeout: 10000 },
    );

    assert.equal(await page.evaluate(() => localStorage.getItem('luke-room-code')), null);
    assert.equal(new URL(page.url()).search, '');
    assert.equal(await page.locator('[data-name="Ben Knell"] small').textContent(), 'AVAILABLE');

    const oldLobby = await fetch(`${baseUrl}/api/lobby?room=${firstRoom}`);
    assert.equal(oldLobby.status, 409);
    const oldJoin = await fetch(`${baseUrl}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_code: firstRoom, name: 'Isabella Cooper', spectator: false }),
    });
    assert.equal(oldJoin.status, 409);

    console.log(JSON.stringify({
      passed: true,
      firstRoom,
      secondRoom,
      playerIdentityCleared: true,
      currentLobbyLoaded: true,
      staleLobbyRejected: true,
      staleJoinRejected: true,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
