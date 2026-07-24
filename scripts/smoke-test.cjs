const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-smoke-'));
process.env.ALLOW_SQLITE_FALLBACK = 'true';
process.env.SQLITE_PATH = path.join(tempDir, 'paper.sqlite');

const app = require('../server');

const routes = [
  { path: '/health', status: 200, includes: '"status":"ok"' },
  { path: '/', status: 200, includes: 'paper' },
  { path: '/pages/dashboard', status: 200, includes: 'dashboard' },
  { path: '/pages/demo-trading', status: 200, includes: 'demo-board' },
  { path: '/pages/demo-trading-terminal', status: 200, includes: 'term-' },
  { path: '/pages/paper-ai', status: 200, includes: 'paper AI' },
  { path: '/pages/leaderboard', status: 200, includes: 'leaderboard' },
  { path: '/pages/user-stats', status: 200, includes: 'ustat' },
  { path: '/api/paper-secrets', status: 200, json: true },
  { path: '/api/config-status', status: 200, json: true },
  { path: '/api/dashboard/stats', status: 200, json: true },
  { path: '/api/leaderboard?limit=5', status: 200, json: true },
];
const TEST_WALLET = '11111111111111111111111111111111';

function listen(appToServe) {
  return new Promise((resolve, reject) => {
    const server = appToServe.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main() {
  const server = await listen(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const failures = [];

  try {
    for (const route of routes) {
      const response = await fetch(baseUrl + route.path, {
        headers: { accept: route.json ? 'application/json' : '*/*' },
      });
      const body = await response.text();

      if (response.status !== route.status) {
        failures.push(`${route.path}: expected ${route.status}, got ${response.status}`);
        continue;
      }

      if (route.json) {
        try {
          JSON.parse(body);
        } catch (error) {
          failures.push(`${route.path}: expected JSON response`);
        }
      }

      if (route.includes && !body.includes(route.includes)) {
        failures.push(`${route.path}: response did not include "${route.includes}"`);
      }

      if (route.path === '/api/config-status') {
        try {
          const status = JSON.parse(body);
          if (status.database !== 'sqlite-fallback' || status.mongoConfigured !== false) {
            failures.push('/api/config-status: expected explicit sqlite-fallback test database status');
          }
        } catch {
          failures.push('/api/config-status: could not inspect database status');
        }
      }
    }

    const profileResponse = await fetch(baseUrl + '/api/data/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        userId: TEST_WALLET,
        profile: { username: 'smoketest', walletName: 'Smoke Wallet' },
      }),
    });
    if (profileResponse.status !== 200) {
      failures.push(`/api/data/profile: expected 200, got ${profileResponse.status}`);
    }
    await profileResponse.text();

    const lessonResponse = await fetch(baseUrl + '/api/data/lessons/lesson-1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        userId: TEST_WALLET,
        progress: { completed: true, completedAt: new Date().toISOString() },
      }),
    });
    if (lessonResponse.status !== 200) {
      failures.push(`/api/data/lessons/lesson-1: expected 200, got ${lessonResponse.status}`);
    }
    await lessonResponse.text();

    const chatSaveResponse = await fetch(baseUrl + '/api/data/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ userId: TEST_WALLET, message: 'hello', isUser: true }),
    });
    if (chatSaveResponse.status !== 201) {
      failures.push(`/api/data/chat: expected 201, got ${chatSaveResponse.status}`);
    }
    await chatSaveResponse.text();

    const chatResponse = await fetch(baseUrl + '/api/openai-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    });
    if (![200, 500].includes(chatResponse.status)) {
      failures.push(`/api/openai-chat: expected 200 or 500, got ${chatResponse.status}`);
    }
    await chatResponse.text();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Temporary smoke-test cleanup is best effort on Windows.
    }
  }

  if (failures.length) {
    console.error('Smoke test failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
