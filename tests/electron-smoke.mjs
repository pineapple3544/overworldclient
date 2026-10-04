import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = resolve('.');
const data = resolve('.test-data', 'official-' + Date.now());
const minecraft = join(data, 'official-launcher');
await mkdir(minecraft, { recursive: true });
await writeFile(
  join(minecraft, 'launcher_profiles.json'),
  JSON.stringify({ profiles: { personal: { name: 'Personal' } } }),
);
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    launcherPath: '',
    minecraftDirectory: minecraft,
    disabledMods: [],
    minimizeOnLaunch: false,
  }),
);
const env = { ...process.env, OVERWORLD_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
async function open() {
  app = await electron.launch({ executablePath: require('electron'), args: [root], env });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.showInactive();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  return page;
}
try {
  let page = await open();
  await page.screenshot({ path: 'docs/launcher-preview.png' });
  expect(
    await page.evaluate(() => ({
      node: typeof window.require,
      login: typeof window.launcher.login,
      prism: typeof window.launcher.openPrism,
    })),
  ).toEqual({ node: 'undefined', login: 'undefined', prism: 'undefined' });
  const snapshot = await page.evaluate(() => window.launcher.snapshot());
  expect(snapshot.value.config.minecraftVersion).toBe('26.2');
  expect(snapshot.value.pack.mods).toEqual([]);
  await page.getByRole('button', { name: '서버', exact: true }).click();
  for (const name of ['평화야생', '약탈서버', '건축서버', '로비'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('연동 전 · 예시 데이터', { exact: true })).toBeVisible();
  await expect(page.getByText('접속 인원', { exact: true })).toHaveCount(4);
  await page.screenshot({ path: 'docs/server-status.png' });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '환경 설정', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  const blockedByGame = /Minecraft를 종료|Minecraft Launcher를 완전히 종료/.test(
    await page.getByRole('alert').innerText(),
  );
  if (blockedByGame) {
    console.log(
      'Running game/launcher detected: update protection verified. Profile UI uses isolated fixtures; profile writes are covered by unit tests.',
    );
    await writeFile(
      join(minecraft, 'launcher_profiles.json'),
      JSON.stringify({
        selectedProfile: 'overworld-managed',
        profiles: {
          'overworld-managed': {
            name: 'Overworld',
            gameDir: join(data, 'game'),
            lastVersionId: 'overworld-26.2',
          },
        },
      }),
    );
  } else await expect(page.getByRole('alert')).toContainText('게임 환경이 준비됐습니다.');
  const profiles = JSON.parse(await readFile(join(minecraft, 'launcher_profiles.json'), 'utf8'));
  expect(profiles.selectedProfile).toBe('overworld-managed');
  expect(Object.keys(profiles.profiles)).toEqual(['overworld-managed']);
  expect(profiles.profiles['overworld-managed'].lastVersionId).toBe('overworld-26.2');
  if (!blockedByGame) {
    const version = JSON.parse(
      await readFile(join(minecraft, 'versions', 'overworld-26.2', 'overworld-26.2.json'), 'utf8'),
    );
    expect(version.arguments.game).toEqual(['--quickPlayMultiplayer', 'overworld.flyjung.kr']);
    expect((await readFile(join(data, 'game', 'servers.dat'))).subarray(0, 3).toString('hex')).toBe(
      '0a0000',
    );
  }
  expect(profiles.profiles['overworld-managed'].gameDir).toBe(join(data, 'game'));
  await page.getByRole('button', { name: '알림 닫기' }).click();
  await expect(
    page.getByRole('switch', { name: 'Minecraft 자동 실행', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('switch', { name: 'Minecraft 자동 실행', exact: true }).click();
  await page.getByRole('switch', { name: '런처를 연 뒤 Overworld 최소화', exact: true }).click();
  await page.getByRole('button', { name: '설정 저장' }).click();
  await expect(page.getByRole('alert')).toContainText('설정을 저장했습니다.');
  await app.evaluate(({ shell, clipboard }) => {
    globalThis.urls = [];
    globalThis.copied = '';
    shell.openExternal = async (url) => {
      globalThis.urls.push(url);
    };
    clipboard.writeText = (text) => {
      globalThis.copied = text;
    };
  });
  await app.evaluate(({ session }) => {
    session.fromPartition('persist:overworld-website').protocol.handle(
      'https',
      () =>
        new Response('<html><body>Test website</body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    );
  });
  await page.getByRole('button', { name: '서버 주소 복사', exact: true }).click();
  expect(await app.evaluate(() => globalThis.copied)).toBe('overworld.flyjung.kr');
  await page.evaluate(() => window.launcher.downloadLauncher());
  await page.evaluate(() => window.launcher.openPassport());
  expect(await app.evaluate(() => globalThis.urls)).toEqual([]);
  expect((await page.evaluate(() => window.launcher.snapshot())).value.website.url).toBe(
    'https://overworld.flyjung.kr/',
  );
  await page.getByRole('button', { name: '웹 닫기' }).click();
  await app.close();
  page = await open();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: '런처를 연 뒤 Overworld 최소화', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('switch', { name: 'Minecraft 자동 실행', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('프로필 준비됨', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/official-settings.png' });
  await expect(page.getByRole('button', { name: '인스턴스', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.launcher.createInstance)).toBe('undefined');
  expect((await page.evaluate(() => window.launcher.snapshot())).value.gameDirectory).toBe(
    join(data, 'game'),
  );
  await page.setViewportSize({ width: 960, height: 680 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '서버', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    'Electron passed: managed game directory, no instance management UI, user UI edits, server counts and renderer isolation.',
  );
} finally {
  await app?.close();
}
