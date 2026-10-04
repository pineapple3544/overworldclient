import { _electron as electron, expect } from '@playwright/test';
import { resolve } from 'node:path';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: resolve('release/win-unpacked/Overworld Launcher.exe'),
  args: ['--user-data-dir=' + resolve('.test-data', 'packaged-' + Date.now())],
  env,
});
try {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  const snapshot = await page.evaluate(() => window.launcher.snapshot());
  expect(snapshot.value.appVersion).toBe('0.5.2');
  expect(snapshot.value.config.passportOrigin).toBe('https://overworld.flyjung.kr');
  expect(typeof snapshot.value.passport.schoolVerified).toBe('boolean');
  expect(snapshot.value.passport.csrfToken).toBeUndefined();
  await expect(page.locator('.play-button')).toBeDisabled();
  await page.locator('.play-control').hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await page.evaluate(() => typeof window.launcher.logoutPassport)).toBe('function');
  expect(
    await app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const helperPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'dist-electron/auto-play.ps1',
      );
      // PowerShell must receive a physical file; Electron's virtual asar filesystem is insufficient.
      const helper = fs.readFileSync(helperPath, 'utf8');
      const accessible = fs.readFileSync(
        path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist-electron/auto-play-accessible.cs',
        ),
        'utf8',
      );
      return (
        helper.startsWith('\ufeff') &&
        helper.includes('InvokePattern') &&
        accessible.includes('accDoDefaultAction')
      );
    }),
  ).toBe(true);
  expect(typeof snapshot.value.settings.autoPlay).toBe('boolean');
  expect(snapshot.value.instances).toBeUndefined();
  expect(await page.evaluate(() => typeof window.launcher.createInstance)).toBe('undefined');
  expect(snapshot.value.config.velocityHost).toBe('overworld.flyjung.kr');
  expect(snapshot.value.pack.mods).toEqual([]);
  expect(snapshot.value.serverStatus.servers).toHaveLength(4);
  await page.getByRole('button', { name: '서버', exact: true }).click();
  await expect(page.getByRole('heading', { name: '평화야생' })).toBeVisible();
  console.log(
    'Packaged Windows app passed: startup, bundled mod manifest, native IPC and server overview.',
  );
} finally {
  await app.close();
}
