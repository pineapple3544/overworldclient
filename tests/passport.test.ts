import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Passport, passportProfile } from '../electron/passport';
import { passportStatistics, passportSkin } from '../electron/passport-statistics';
import { playBlockedReason } from '../src/passport-access';
const counters = {
  playSeconds: 3660,
  blocksBroken: 10,
  blocksPlaced: 5,
  damageTakenMilli: 2000,
  deaths: 1,
  mobKills: 3,
  playerKills: 0,
  distanceCm: 500,
};
const statistics = {
  available: true,
  totals: counters,
  servers: [{ serverId: 'ssu_lobby', label: '로비', ...counters }],
  lastCollectedAt: '2026-10-04T00:00:00Z',
  presence: { online: false, lastSeenAt: null },
};
const origin = 'https://passport.example';
const now = Date.parse('2026-10-04T00:00:00Z');
const profile = {
  displayName: '테스트 사용자',
  identityProvider: 'usaint',
  universityVerifiedUntil: '2027-02-28T15:00:00Z',
  accessSuspended: false,
  minecraft: { uuid: '12345678-1234-1234-1234-123456789012', name: 'TestPlayer' },
  privacyConsent: { accepted: true },
  studentId: 'private student number',
  department: '컴퓨터학부',
  csrfToken: 'private csrf',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function fixture() {
  let authenticated = false,
    failure = '',
    logoutFailure = false;
  const calls: { path: string; init: RequestInit }[] = [];
  const csrfToken = 'A'.repeat(43);
  const passport = new Passport(
    origin,
    async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ path, init });
      assert.equal(new URL(url).origin, origin);
      assert.equal(init.credentials, 'include');
      assert.equal(init.redirect, 'error');
      assert.equal(new Headers(init.headers).get('origin'), origin);
      assert.equal(new Headers(init.headers).get('authorization'), null);
      if (failure === 'html') return new Response('Forbidden', { status: 403 });
      if (failure === 'expired' && path === '/v1/me')
        return json({ code: 'session_required' }, 401);
      if (failure === 'server' && path === '/v1/me/servers')
        return json({ code: 'temporarily_unavailable' }, 503);
      if (path === '/v1/auth/session')
        return json({ authenticated, csrfToken, authMode: 'university' });
      if (path === '/v1/me') return json(profile);
      if (path === '/v1/me/stats')
        return failure === 'stats'
          ? json({ code: 'temporarily_unavailable' }, 503)
          : json(statistics);
      if (path === '/v1/me/minecraft-skin') return json({ dataUrl: null, model: null });
      if (path === '/v1/me/servers')
        return json({
          servers: [{ id: 'ssu_lobby', label: '로비', commandName: 'lobby', sensitive: false }],
        });
      if (path === '/v1/auth/logout') {
        assert.equal(init.method, 'POST');
        assert.equal(new Headers(init.headers).get('x-csrf-token'), csrfToken);
        if (logoutFailure) return json({ code: 'csrf_invalid' }, 403);
        authenticated = false;
        return new Response(null, { status: 204 });
      }
      throw new Error('unexpected path');
    },
    () => {},
    () => now,
  );
  return {
    passport,
    calls,
    login: () => {
      authenticated = true;
    },
    fail: (value: string) => {
      failure = value;
    },
    failLogout: () => {
      logoutFailure = true;
    },
  };
}
test('Passport reads only the user session, sanitizes identity and keeps school and Minecraft states separate', async () => {
  const f = fixture();
  assert.equal((await f.passport.refresh(true)).status, 'signed-out');
  assert.equal(f.calls.length, 1);
  f.login();
  const state = await f.passport.refresh(true);
  assert.equal(state.schoolVerified, true);
  assert.equal(state.minecraftName, 'TestPlayer');
  assert.equal(state.minecraftUuid, profile.minecraft.uuid);
  assert.equal(state.schoolName, '숭실대학교');
  assert.equal(state.department, '컴퓨터학부');
  assert.equal(state.statistics?.totals.playSeconds, 3660);
  assert.deepEqual(state.allowedServers, [{ id: 'ssu_lobby', label: '로비' }]);
  assert.equal(state.permissionsAvailable, true);
  for (const secret of ['private student number', 'private csrf'])
    assert.equal(JSON.stringify(state).includes(secret), false);
  const unlinked = passportProfile({ ...profile, minecraft: null }, now);
  assert.equal(unlinked.schoolVerified, true);
  assert.equal(unlinked.minecraftLinked, false);
  assert.equal(
    passportProfile(profile, Date.parse(profile.universityVerifiedUntil)).schoolVerified,
    false,
  );
  assert.equal(
    passportProfile({ ...profile, identityProvider: 'development' }, now).schoolVerified,
    false,
  );
});
test('play requires a current school session; statistics failures do not revoke school authentication', async () => {
  const f = fixture();
  assert.match(playBlockedReason(await f.passport.refresh(true), now)!, /학교 계정 인증/);
  f.login();
  const state = await f.passport.refresh(true);
  assert.equal(playBlockedReason(state, now), null);
  assert.match(playBlockedReason(state, Date.parse(state.verifiedUntil!))!, /만료/);
  f.fail('stats');
  const failed = await f.passport.refresh(true);
  assert.equal(failed.schoolVerified, true);
  assert.equal(failed.statistics, null);
  assert.match(failed.statisticsMessage!, /불러오지/);
  assert.equal(playBlockedReason(failed, now), null);
});
test('statistics reject unsafe counts and duplicate servers; skins accept only bounded PNG pixels', () => {
  assert.equal(passportStatistics(statistics).totals.playSeconds, 3660);
  assert.throws(() =>
    passportStatistics({ ...statistics, totals: { ...counters, playSeconds: -1 } }),
  );
  assert.throws(() =>
    passportStatistics({ ...statistics, servers: [statistics.servers[0], statistics.servers[0]] }),
  );
  assert.equal(passportSkin({ dataUrl: null }), null);
  assert.throws(() => passportSkin({ dataUrl: 'https://example.com/tracker.png' }));
  assert.throws(() => passportSkin({ dataUrl: 'data:image/svg+xml;base64,AAAA' }));
});
test('a concurrent logout cannot return the old authenticated state to a play request', async () => {
  let authenticated = true,
    block = false;
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const passport = new Passport(
    origin,
    async (url) => {
      const path = new URL(url).pathname;
      if (path === '/v1/auth/session') return json({ authenticated, csrfToken: 'A'.repeat(43) });
      if (path === '/v1/me') {
        if (block) {
          entered();
          await blocked;
        }
        return json(profile);
      }
      if (path === '/v1/me/servers') return json({ servers: [] });
      if (path === '/v1/me/stats') return json(statistics);
      if (path === '/v1/me/minecraft-skin') return json({ dataUrl: null });
      if (path === '/v1/auth/logout') {
        authenticated = false;
        return new Response(null, { status: 204 });
      }
      throw new Error('unexpected path');
    },
    () => {},
    () => now,
  );
  await passport.refresh(true);
  block = true;
  const refresh = passport.refresh(true);
  await reading;
  const logout = passport.logout();
  assert.notEqual(playBlockedReason(await passport.refresh(true), now), null);
  release();
  assert.notEqual(playBlockedReason(await refresh, now), null);
  assert.equal((await logout).status, 'signed-out');
});
test('expired sessions and network errors never retain a successful authentication or stale permissions', async () => {
  const f = fixture();
  f.login();
  await f.passport.refresh(true);
  f.fail('server');
  const limited = await f.passport.refresh(true);
  assert.equal(limited.status, 'signed-in');
  assert.equal(limited.permissionsAvailable, false);
  assert.deepEqual(limited.allowedServers, []);
  f.fail('expired');
  assert.equal((await f.passport.refresh(true)).status, 'signed-out');
  f.fail('html');
  const down = await f.passport.refresh(true);
  assert.equal(down.status, 'unavailable');
  assert.equal(down.schoolVerified, false);
  assert.equal(down.displayName, null);
});
test('logout obtains the current CSRF token and reports failure without claiming logout', async () => {
  const f = fixture();
  f.login();
  await f.passport.refresh(true);
  f.failLogout();
  await assert.rejects(f.passport.logout(), /다시 시도/);
  assert.equal(f.passport.state.status, 'signed-in');
  const ok = fixture();
  ok.login();
  await ok.passport.refresh(true);
  assert.equal((await ok.passport.logout()).status, 'signed-out');
  assert.equal((await ok.passport.refresh(true)).status, 'signed-out');
});
test('Passport rejects malformed data, unsafe origins and excessive API responses', async () => {
  assert.throws(
    () =>
      new Passport(
        'http://passport.example',
        async () => json({}),
        () => {},
      ),
  );
  assert.throws(() =>
    passportProfile({ ...profile, minecraft: { name: 'spoof', uuid: 'invalid' } }, now),
  );
  const p = new Passport(
    origin,
    async () => json({ authenticated: true, extra: 'x'.repeat(65536) }),
    () => {},
    () => now,
  );
  assert.equal((await p.refresh(true)).status, 'unavailable');
});
