import { _electron as electron, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const env = { ...process.env, OVERWORLD_TEST_DATA: resolve('.test-data', 'ui-' + Date.now()) };
delete env.ELECTRON_RUN_AS_NODE;
let app = await electron.launch({
  executablePath: require('electron'),
  args: [resolve('.')],
  env,
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  // Keep this visual test deterministic and independent of the production Passport service.
  await app.evaluate(({ session }) => {
    session.fromPartition('persist:overworld-website').protocol.handle(
      'https',
      () =>
        new Response(JSON.stringify({ authenticated: false, csrfToken: 'x'.repeat(43) }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
  });
  await page.evaluate(() => window.launcher.refreshPassport());
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('radio', { name: theme === 'light' ? '라이트 모드' : '다크 모드', exact: true })
      .check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const themeSave = page.getByRole('button', { name: '설정 저장' });
    if (await themeSave.isEnabled()) {
      await themeSave.click();
      await expect(page.getByRole('alert')).toContainText('설정을 저장했습니다.');
      await page.getByRole('button', { name: '알림 닫기' }).click();
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const size of [
      { width: 1280, height: 860 },
      { width: 960, height: 680 },
    ]) {
      await page.setViewportSize(size);
      for (const [name, slug] of [
        ['홈', 'home'],
        ['서버', 'servers'],
        ['소식', 'news'],
        ['계정', 'account'],
        ['설정', 'settings'],
      ]) {
        await page.getByRole('button', { name, exact: true }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const controls = await page.evaluate(() => {
          const play = document.querySelector('.play-button').getBoundingClientRect();
          const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
          const bar = document.querySelector('.playbar').getBoundingClientRect();
          const nav = document.querySelector('[aria-label="계정"]');
          const n = nav.getBoundingClientRect();
          return {
            playVisible:
              play.right <= innerWidth &&
              play.bottom <= innerHeight &&
              play.width >= 140 &&
              play.height >= 48,
            separated: bar.left >= sidebar.right,
            accountReachable: nav.contains(
              document.elementFromPoint(n.x + n.width / 2, n.y + n.height / 2),
            ),
          };
        });
        expect(controls).toEqual({ playVisible: true, separated: true, accountReachable: true });
        if (name === '설정') {
          const save = page.getByRole('button', { name: '설정 저장' });
          await expect(save).toBeDisabled();
          await page.getByRole('switch', { name: 'Minecraft 자동 실행', exact: true }).focus();
          await page.keyboard.press('Space');
          await expect(save).toBeEnabled();
          const saveBox = await save.boundingBox();
          const footerBox = await page.locator('.playbar').boundingBox();
          expect(saveBox.y + saveBox.height).toBeLessThan(footerBox.y);
          await save.click();
          await expect(page.getByRole('alert')).toContainText('설정을 저장했습니다.');
          await expect(save).toBeDisabled();
          await page.getByRole('button', { name: '알림 닫기' }).click();
          await page.getByText('경로 설정', { exact: true }).click();
          await expect(page.getByLabel('런처 실행 파일', { exact: true })).toBeVisible();
          await page.getByText('경로 설정', { exact: true }).click();
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.mouse.move(1, 1);
        await page.screenshot({
          path: `docs/${theme}-${slug}-${size.width}.png`,
          animations: 'disabled',
        });
      }
      await page.locator('.play-control').focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page.locator('.play-button')).toBeDisabled();
    }
  }
  // The unsaved preview must not replace the saved theme on reload.
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('radio', { name: '다크 모드', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await app.close();
  app = await electron.launch({ executablePath: require('electron'), args: [resolve('.')], env });
  const reopened = await app.firstWindow();
  await expect(reopened.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light');
  expect((await reopened.evaluate(() => window.launcher.snapshot())).value.settings.theme).toBe(
    'light',
  );
  expect(errors).toEqual([]);
  console.log(
    'UI layout passed: five pages at desktop/minimum size, reachable controls, keyboard settings save, expandable paths, and disabled-play tooltip.',
  );
} finally {
  await app.close();
}
