import { _electron as electron, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const env = { ...process.env, OVERWORLD_TEST_DATA: resolve('.test-data', 'website-' + Date.now()) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: require('electron'),
  args: [resolve('.')],
  env,
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow, session, shell }) => {
    BrowserWindow.getAllWindows()[0].showInactive();
    globalThis.externalCalls = [];
    shell.openExternal = async (url) => {
      globalThis.externalCalls.push(url);
    };
    globalThis.failWebsite = false;
    session.fromPartition('persist:overworld-website').protocol.handle('https', (req) => {
      if (globalThis.failWebsite) return Response.error();
      const u = new URL(req.url);
      return new Response(
        `<html><head><title>Overworld test</title></head><body style="font-family:sans-serif;padding:40px"><h1>${u.pathname === '/manual' ? 'Guide fixture' : 'Passport fixture'}</h1><a href="/manual">Guide</a><a href="file:///C:/Windows/win.ini" id="blocked">Blocked</a><button onclick="window.open('https://overworld.flyjung.kr/popup')">Popup</button></body></html>`,
        { headers: { 'content-type': 'text/html' } },
      );
    });
  });
  await expect(page.getByRole('heading', { name: '메인 화면' })).toBeVisible();
  await page.getByRole('button', { name: '학교 인증하기' }).click();
  await expect(page.getByRole('region', { name: '클라이언트 브라우저' })).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => window.launcher.snapshot())).value.website.loading)
    .toBe(false);
  const remote = await app.evaluate(({ webContents }) => {
    const wc = webContents
      .getAllWebContents()
      .find((w) => w.getURL() === 'https://overworld.flyjung.kr/');
    return { id: wc.id, prefs: wc.getLastWebPreferences(), text: null };
  });
  expect(remote.prefs.nodeIntegration).toBe(false);
  expect(remote.prefs.sandbox).toBe(true);
  expect(remote.prefs.preload).toBeUndefined();
  expect(
    await app.evaluate(
      ({ webContents }, id) =>
        webContents
          .fromId(id)
          .executeJavaScript('typeof window.launcher + ":" + typeof window.require'),
      remote.id,
    ),
  ).toBe('undefined:undefined');
  await page.waitForTimeout(500);
  const capture = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].capturePage();
    return image.toPNG().toString('base64');
  });
  await writeFile('docs/in-client-website.png', Buffer.from(capture, 'base64'));
  const remoteCapture = await app.evaluate(async ({ webContents }, id) => {
    return (await webContents.fromId(id).capturePage()).toPNG().toString('base64');
  }, remote.id);
  await writeFile('docs/in-client-web-content.png', Buffer.from(remoteCapture, 'base64'));
  await app.evaluate(
    ({ webContents }, id) =>
      webContents.fromId(id).executeJavaScript('document.querySelector("a").click()', true),
    remote.id,
  );
  await expect
    .poll(
      async () => (await page.evaluate(() => window.launcher.snapshot())).value.website.canGoBack,
    )
    .toBe(true);
  await page.getByRole('button', { name: '웹 뒤로 가기' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.launcher.snapshot())).value.website.url)
    .toBe('https://overworld.flyjung.kr/');
  await app.evaluate(
    ({ webContents }, id) =>
      webContents.fromId(id).executeJavaScript('document.querySelector("#blocked").click()'),
    remote.id,
  );
  expect(
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).getURL(), remote.id),
  ).toBe('https://overworld.flyjung.kr/');
  await app.evaluate(
    ({ webContents }, id) =>
      webContents.fromId(id).executeJavaScript('document.querySelector("button").click()'),
    remote.id,
  );
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(2);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('file:'))
      .setContentSize(960, 680);
  });
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('file:'),
        );
        return w.contentView.children[0].getBounds().x;
      }),
    )
    .toBe(190);
  const layout = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'));
    return { size: w.getContentSize(), bounds: w.contentView.children[0].getBounds() };
  });
  expect(layout.bounds.x).toBe(190);
  expect(layout.bounds.width).toBe(layout.size[0] - 190);
  expect(layout.bounds.y).toBe(56);
  await page.getByRole('button', { name: '웹 닫기' }).click();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  expect(
    await app.evaluate(({ webContents }, id) => Boolean(webContents.fromId(id)), remote.id),
  ).toBe(false);
  expect(await app.evaluate(() => globalThis.externalCalls)).toEqual([]);
  await page.getByRole('button', { name: '학교 인증하기' }).click();
  await page.getByRole('button', { name: '서버', exact: true }).click();
  await expect(page.getByRole('heading', { name: '서버 현황', level: 1 })).toBeVisible();
  expect((await page.evaluate(() => window.launcher.snapshot())).value.website.open).toBe(false);
  await page.getByRole('button', { name: '이용 가이드' }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.launcher.snapshot())).value.website.open).toBe(false);
  await page.getByRole('button', { name: '이용 가이드' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.launcher.snapshot())).value.website.url)
    .toBe('https://overworld.flyjung.kr/manual');
  await app.evaluate(() => {
    globalThis.failWebsite = true;
  });
  await page.getByRole('button', { name: '웹 새로고침' }).click();
  await expect(page.getByText('페이지를 불러오지 못했습니다. 다시 시도해 주세요.')).toBeVisible();
  await app.evaluate(() => {
    globalThis.failWebsite = false;
  });
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.launcher.snapshot())).value.website.error)
    .toBe(null);
  await page.getByRole('button', { name: '웹 닫기' }).click();
  console.log(
    'Embedded website passed: internal rendering, navigation, resize, popup cleanup, errors and isolated remote context.',
  );
} finally {
  await app.close();
}
