import { _electron as electron, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const certDir = await mkdtemp(resolve('.test-data') + '/passport-tls-');
const openssl = process.env.PASSPORT_TEST_OPENSSL ?? 'C:/Program Files/Git/usr/bin/openssl.exe';
const certResult = spawnSync(
  openssl,
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    resolve(certDir, 'key.pem'),
    '-out',
    resolve(certDir, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ],
  { windowsHide: true },
);
if (certResult.status !== 0)
  throw new Error('Test TLS certificate generation failed. Set PASSPORT_TEST_OPENSSL to openssl.');
const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  OVERWORLD_TEST_DATA: resolve('.test-data', 'passport-' + Date.now()),
};
delete env.ELECTRON_RUN_AS_NODE;
const testTheme = process.env.OVERWORLD_TEST_THEME === 'light' ? 'light' : 'dark';
await mkdir(env.OVERWORLD_TEST_DATA, { recursive: true });
await writeFile(
  resolve(env.OVERWORLD_TEST_DATA, 'settings.json'),
  JSON.stringify({
    theme: testTheme,
    autoPlay: true,
    launcherPath: '',
    minecraftDirectory: '',
    disabledMods: [],
    minimizeOnLaunch: false,
  }),
);
const app = await electron.launch({
  executablePath: require('electron'),
  args: [resolve('.')],
  env,
});
try {
  const page = await app.firstWindow();
  const transport = await app.evaluate(
    async ({ session }, tls) => {
      const https = process.getBuiltinModule('https');
      const server = https.createServer(tls, (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/login')
          res.setHeader(
            'set-cookie',
            '__Host-test_session=transport-fixture; Path=/; Secure; HttpOnly; SameSite=Lax',
          );
        res.end(
          JSON.stringify({
            authenticated: (req.headers.cookie ?? '').includes(
              '__Host-test_session=transport-fixture',
            ),
          }),
        );
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const s = session.fromPartition('persist:overworld-website');
      s.setCertificateVerifyProc((request, callback) =>
        callback(request.hostname === '127.0.0.1' ? 0 : -3),
      );
      try {
        const url = 'https://127.0.0.1:' + server.address().port;
        await s.fetch(url + '/login', { credentials: 'include' });
        const result = await (
          await s.fetch(url + '/me', { credentials: 'include', headers: { Origin: url } })
        ).json();
        const cookies = await s.cookies.get({ url });
        return { authenticated: result.authenticated, httpOnly: cookies[0]?.httpOnly };
      } finally {
        s.setCertificateVerifyProc(null);
        await new Promise((resolve) => server.close(resolve));
      }
    },
    {
      key: await readFile(resolve(certDir, 'key.pem'), 'utf8'),
      cert: await readFile(resolve(certDir, 'cert.pem'), 'utf8'),
    },
  );
  expect(transport).toEqual({ authenticated: true, httpOnly: true });
  const skin = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#b8dd89';
    context.fillRect(0, 0, 64, 64);
    context.clearRect(32, 0, 32, 16);
    return canvas.toDataURL('image/png');
  });
  await app.evaluate(({ session, BrowserWindow }, skin) => {
    BrowserWindow.getAllWindows()[0].showInactive();
    const s = session.fromPartition('persist:overworld-website');
    globalThis.passportRequests = [];
    globalThis.fixtureSkin = skin;
    globalThis.failStats = false;
    globalThis.expiredSchool = false;
    s.protocol.handle('https', async (req) => {
      const path = new URL(req.url).pathname;
      // Protocol interception bypasses Chromium's HTTP cookie attachment; transport is tested above over real TLS.
      const loggedIn = (await s.cookies.get({ url: req.url })).some(
        (c) => c.name === '__Host-passport_portal_session' && c.value === 'fixture-session',
      );
      globalThis.passportRequests.push({
        path,
        loggedIn,
        method: req.method,
        origin: req.headers.get('origin'),
      });
      const json = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/v1/auth/session')
        return json({ authenticated: loggedIn, csrfToken: 'x'.repeat(43) });
      if (path === '/v1/me')
        return loggedIn
          ? json({
              displayName: '테스트 학생',
              identityProvider: 'usaint',
              universityVerifiedUntil: globalThis.expiredSchool
                ? '2020-03-01T00:00:00+09:00'
                : '2030-03-01T00:00:00+09:00',
              department: '컴퓨터학부',
              minecraft: { name: 'OverworldTest', uuid: '12345678-1234-1234-1234-123456789abc' },
              accessSuspended: false,
              privacyConsent: { accepted: true },
              studentId: 'private-student-id',
            })
          : json({ code: 'unauthorized' }, 401);
      if (path === '/v1/me/servers')
        return json({
          servers: [{ id: 'lobby', label: '로비', commandName: 'lobby', sensitive: false }],
        });
      if (path === '/v1/me/minecraft-skin')
        return json({ dataUrl: globalThis.fixtureSkin, model: 'classic' });
      if (path === '/v1/me/stats') {
        if (globalThis.failStats) return json({ code: 'temporarily_unavailable' }, 503);
        const counters = {
          playSeconds: 7380,
          blocksBroken: 45,
          blocksPlaced: 20,
          damageTakenMilli: 2000,
          deaths: 1,
          mobKills: 12,
          playerKills: 0,
          distanceCm: 30000,
        };
        return json({
          available: true,
          totals: counters,
          servers: [{ serverId: 'peace', label: '평화야생', ...counters }],
          lastCollectedAt: '2026-10-04T01:00:00Z',
          presence: { online: false, lastSeenAt: '2026-10-04T01:00:00Z' },
        });
      }
      if (path === '/v1/auth/logout') {
        if (
          !loggedIn ||
          req.method !== 'POST' ||
          req.headers.get('origin') !== 'https://overworld.flyjung.kr' ||
          req.headers.get('x-csrf-token') !== 'x'.repeat(43)
        )
          return json({ code: 'csrf_invalid' }, 403);
        await s.cookies.remove('https://overworld.flyjung.kr/', '__Host-passport_portal_session');
        return new Response(null, { status: 204 });
      }
      return new Response('<h1>Passport fixture</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    });
  }, skin);
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  await page.evaluate(() => window.launcher.refreshPassport());
  await expect
    .poll(
      async () => (await page.evaluate(() => window.launcher.snapshot())).value.passport.status,
      { timeout: 20000 },
    )
    .toBe('signed-out');
  await expect(page.locator('.play-button')).toBeDisabled();
  await page.locator('.play-control').hover();
  await expect(page.getByRole('tooltip')).toHaveText('학교 계정 인증 후 플레이할 수 있습니다.');
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect((await page.evaluate(() => window.launcher.play())).ok).toBe(false);
  await page.getByRole('button', { name: '학교 인증하기' }).click();
  await app.evaluate(async ({ session }) => {
    await session.fromPartition('persist:overworld-website').cookies.set({
      url: 'https://overworld.flyjung.kr/',
      name: '__Host-passport_portal_session',
      value: 'fixture-session',
      secure: true,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      expirationDate: Date.now() / 1000 + 3600,
    });
  });
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.launcher.snapshot())).value.passport.schoolVerified,
      { timeout: 20000 },
    )
    .toBe(true);
  const state = (await page.evaluate(() => window.launcher.snapshot())).value.passport;
  expect(state.minecraftName).toBe('OverworldTest');
  expect(state.allowedServers).toEqual([{ id: 'lobby', label: '로비' }]);
  expect(JSON.stringify(state)).not.toMatch(/private-student-id|fixture-session|csrfToken/);
  const remote = await app.evaluate(async ({ webContents }) => {
    const wc = webContents
      .getAllWebContents()
      .find((w) => w.getURL() === 'https://overworld.flyjung.kr/');
    return await wc.executeJavaScript('({cookies:document.cookie, bridge:typeof window.launcher})');
  });
  expect(remote).toEqual({ cookies: '', bridge: 'undefined' });
  await page.getByRole('button', { name: '웹 닫기' }).click();
  await expect(page.locator('.sidebar-profile strong')).toHaveText('OverworldTest');
  await expect(page.locator('.sidebar-profile small')).toHaveText('컴퓨터학부');
  await expect(
    page.locator('.sidebar-profile').getByRole('img', { name: 'OverworldTest 플레이어 머리' }),
  ).toBeVisible();
  await expect(page.locator('.play-button')).toBeEnabled();
  await expect(page.getByRole('heading', { name: '통계', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '인증', exact: true })).toHaveCount(0);
  await expect(page.getByText('2시간 3분', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: `docs/${testTheme}-passport-statistics.png` });
  await app.evaluate(() => {
    globalThis.failStats = true;
  });
  await page.evaluate(() => window.launcher.refreshPassport());
  await expect(page.getByText('플레이 기록을 불러오지 못했습니다.', { exact: true })).toBeVisible();
  await expect(page.locator('.play-button')).toBeEnabled();
  await app.evaluate(() => {
    globalThis.failStats = false;
  });
  await page.evaluate(() => window.launcher.refreshPassport());
  await page.getByRole('button', { name: /^계정/ }).click();
  await expect(page.getByText('테스트 학생', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '숭실대학교', exact: true })).toBeVisible();
  await expect(
    page.locator('.passport-visual').getByRole('img', { name: 'Overworld 공식 로고' }),
  ).toBeVisible();
  await expect(page.getByRole('main').getByText('컴퓨터학부', { exact: true })).toBeVisible();
  await expect(
    page.getByText('12345678-1234-1234-1234-123456789abc', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'OverworldTest 플레이어 스킨' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Minecraft Launcher 열기' })).toHaveCount(0);
  await page.screenshot({ path: `docs/${testTheme}-passport-account.png` });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(960, 680),
  );
  await expect(page.getByRole('heading', { name: '숭실대학교', exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/${testTheme}-passport-account-compact.png` });
  const bounds = await page
    .locator('.account-grid .button-row')
    .evaluateAll((rows) =>
      rows.map((row) => ({ width: row.clientWidth, scroll: row.scrollWidth })),
    );
  expect(bounds.every((row) => row.scroll <= row.width)).toBe(true);
  await app.evaluate(() => {
    globalThis.expiredSchool = true;
  });
  await page.evaluate(() => window.launcher.refreshPassport());
  await expect(page.locator('.play-button')).toBeDisabled();
  await page.locator('.play-control').hover();
  await expect(page.getByRole('tooltip')).toHaveText(
    '학교 인증이 만료됐습니다. 다시 인증해 주세요.',
  );
  expect((await page.evaluate(() => window.launcher.play())).ok).toBe(false);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Passport에서 로그아웃했습니다.');
  expect((await page.evaluate(() => window.launcher.snapshot())).value.passport.status).toBe(
    'signed-out',
  );
  await expect(page.locator('.sidebar-profile strong')).toHaveText('계정');
  await expect(page.locator('.sidebar-profile .player-head')).toHaveCount(0);
  const requests = await app.evaluate(() => globalThis.passportRequests);
  expect(requests.some((r) => r.path === '/v1/me' && r.loggedIn)).toBe(true);
  expect(requests.some((r) => r.path === '/v1/auth/logout' && r.method === 'POST')).toBe(true);
  expect(requests.some((r) => r.path.includes('/admin/'))).toBe(false);
  console.log(
    'Passport Electron passed: shared HttpOnly cookies, authentication gate and tooltip, owner statistics, Minecraft skin/name/UUID, school/department, expiry, logout and remote isolation.',
  );
} catch (error) {
  console.log(await app.evaluate(() => globalThis.passportRequests));
  console.log((await pageSnapshot(app)).passport);
  throw error;
} finally {
  await app.close();
}
async function pageSnapshot(app) {
  return (await (await app.firstWindow()).evaluate(() => window.launcher.snapshot())).value;
}
