import { demoServerStatus } from '../src/server-status';
import { app, BrowserWindow, ipcMain, shell, dialog, clipboard, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import type { Activity, PublicConfig, Settings, Snapshot, Pack } from '../src/shared';
import {
  parseConfig,
  readJson,
  defaultSettings,
  validateSettings,
  migrateSettings,
  parsePack,
} from './config';
import {
  inspectLauncher,
  launchOfficial,
  prepareProfile,
  assertGameClosed,
  processStatus,
} from './official';
import { syncPack, restorePack, installedState, atomicJson } from './mods';
import { fetchJson } from './download';
import { prepareAssets } from './assets';
import { launcherPaths, ensureOfficial } from './isolated';
import { safe } from './mods';
import { Website } from './website';
import { autoPlay } from './auto-play';
import { Passport } from './passport';
import { playBlockedReason } from '../src/passport-access';
import { lobbyAddress, registerLobby } from './server-connect';
app.setName('Overworld Launcher');
if (process.env.OVERWORLD_TEST_DATA && !app.isPackaged)
  app.setPath('userData', process.env.OVERWORLD_TEST_DATA);
let window: BrowserWindow | null = null;
let website: Website;
let config: PublicConfig;
let settings: Settings = defaultSettings;
let pack: Pack;
let activity: Activity = {
  phase: 'idle',
  message: '준비됨',
};
let busy = false;
const devUrl =
  !app.isPackaged && process.env.OVERWORLD_DEV_URL === 'http://127.0.0.1:5173'
    ? process.env.OVERWORLD_DEV_URL
    : undefined;
const rendererFile = join(__dirname, '..', 'dist', 'index.html');
const trustedUrl = devUrl ? devUrl + '/' : pathToFileURL(rendererFile).href;
function update(next: Activity) {
  activity = next;
  if (window && !window.isDestroyed()) window.webContents.send('launcher:activity', next);
}
function errorText(error: unknown) {
  const message = (error as Error)?.message;
  return message && /[가-힣]/.test(message)
    ? message.slice(0, 400)
    : '작업을 완료하지 못했습니다. 인터넷 연결과 파일 접근 권한을 확인해 주세요.';
}
function handle(channel: string, callback: (...args: any[]) => unknown) {
  ipcMain.handle('launcher:' + channel, async (event, ...args) => {
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== trustedUrl
    )
      return { ok: false, error: '허용되지 않은 요청입니다.' };
    try {
      return { ok: true, value: await callback(...args) };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  });
}
async function job(operation: () => Promise<void>) {
  if (busy) throw new Error('진행 중인 작업이 끝난 뒤 다시 시도해 주세요.');
  busy = true;
  try {
    await operation();
    return null;
  } catch (e) {
    update({ phase: 'error', message: errorText(e) });
    throw e;
  } finally {
    busy = false;
  }
}
async function persist(value: unknown) {
  const next = validateSettings(value);
  await atomicJson(app.getPath('userData'), join(app.getPath('userData'), 'settings.json'), next);
  settings = next;
  return settings;
}
async function boot() {
  const directory = app.getPath('userData');
  const gameDirectory = join(directory, 'game');
  await mkdir(directory, { recursive: true });
  const configDirectory = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'config');
  config = parseConfig(await readJson(join(configDirectory, 'launcher.json')));
  if (!app.isPackaged)
    try {
      config = parseConfig(await readJson(join(configDirectory, 'launcher.local.json')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  pack = parsePack(await readJson(join(configDirectory, 'modpack.json')), config.minecraftVersion);
  try {
    settings = migrateSettings(await readJson(join(directory, 'settings.json')));
    await persist(settings);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      update({
        phase: 'error',
        message: '저장된 설정을 읽지 못했습니다. 설정을 다시 확인해 주세요.',
      });
  }
  for (const file of ['session.bin', 'session.bin.tmp'])
    await rm(join(directory, file), { force: true }).catch(() => {});
  const profile = { id: 'overworld-managed', name: 'Overworld' };
  const official = launcherPaths(directory);
  const passportSession = session.fromPartition('persist:overworld-website');
  const passport = new Passport(
    config.passportOrigin,
    (url, init) => passportSession.fetch(url, init),
    (state) => {
      if (window && !window.isDestroyed())
        window.webContents.send('launcher:passport-state', state);
    },
  );
  const inspect = () =>
    inspectLauncher(
      {
        ...settings,
        launcherPath: settings.launcherPath || official.executable,
        minecraftDirectory: official.directory,
      },
      app.getPath('appData'),
      pack,
      gameDirectory,
      profile,
      true,
    );
  handle('snapshot', async (): Promise<Snapshot> => ({
    passport: passport.state,
    website: website.state,
    serverStatus: demoServerStatus(),
    config,
    settings,
    launcher: await inspect(),
    pack,
    installedRevision: (await installedState(gameDirectory)).revision,
    activity,
    gameDirectory,
    appVersion: app.getVersion(),
    preview: false,
  }));
  for (const [name, url, title] of [
    ['passport', config.passportOrigin + '/', '학교 인증'],
    ['manual', 'https://overworld.flyjung.kr/manual', '이용 가이드'],
    ['download-launcher', 'https://www.minecraft.net/download', 'Minecraft'],
  ])
    handle(name, async () => {
      website.open(url, title);
      return null;
    });
  handle('passport-refresh', () => passport.refresh(true));
  handle('passport-logout', async () => {
    website.close();
    return passport.logout();
  });
  handle('website-action', (value) => {
    website.action(value);
    if (value === 'close') void passport.refresh();
    return null;
  });
  handle('copy-address', () => {
    clipboard.writeText(
      config.velocityHost + (config.velocityPort === 25565 ? '' : ':' + config.velocityPort),
    );
    return null;
  });
  for (const name of ['directory', 'backups'])
    handle(name, async () => {
      const path =
        name === 'directory' ? gameDirectory : join(gameDirectory, '.overworld', 'transactions');
      await safe(directory, path);
      await mkdir(path, { recursive: true });
      if (await shell.openPath(path)) throw new Error('폴더를 열지 못했습니다.');
      return null;
    });
  handle('settings', async (value) => {
    await job(async () => {
      await jobSettings(value);
    });
    return settings;
  });
  async function jobSettings(value: unknown) {
    const next = validateSettings(value);
    return persist(next);
  }
  handle('choose-launcher', async () => {
    if (busy) throw new Error('작업이 끝난 뒤 다시 시도해 주세요.');
    const result = await dialog.showOpenDialog(window!, {
      title: '공식 MinecraftLauncher.exe 선택',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft Launcher', extensions: ['exe'] }],
    });
    return result.canceled ? null : persist({ ...settings, launcherPath: result.filePaths[0] });
  });
  handle('launcher', () =>
    job(async () => {
      await prepare();
      await ensureOfficial(directory, update, settings.launcherPath);
      await launchOfficial(await inspect(), official.directory);
      update({
        phase: 'idle',
        message: '공식 런처에서 Microsoft 로그인과 Java Edition 초기 설정을 진행하세요.',
      });
    }),
  );
  async function prepare() {
    await assertGameClosed();
    await safe(directory, gameDirectory);
    update({ phase: 'syncing', message: '서버의 모드 배포 목록을 확인하고 있습니다.' });
    const source = config.modManifestUrl
      ? await fetchJson(config.modManifestUrl)
      : await readJson(join(configDirectory, 'modpack.json'));
    const next = parsePack(source, (source as Pack)?.minecraftVersion);
    if (!next.minecraftVersion || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(next.minecraftVersion))
      throw new Error('게임 버전을 확인해 주세요.');
    const status = await inspect();
    const assets = await prepareAssets(gameDirectory, next.files ?? [], update);
    let rollbackProfile: (() => Promise<void>) | undefined;
    let rollbackServer: (() => Promise<void>) | undefined;
    try {
      await syncPack(gameDirectory, next, settings.disabledMods, update, fetch, async () => {
        const processes = await processStatus(official.directory);
        if (processes.gameRunning)
          throw new Error('Minecraft가 실행 중입니다. 게임을 종료한 뒤 다시 시도해 주세요.');
        rollbackProfile = await prepareProfile(
          status.minecraftDirectory,
          gameDirectory,
          next,
          processes.launcherRunning,
          fetch,
          profile,
          true,
          { address: lobbyAddress(config) },
        );
        await assets.apply();
        rollbackServer = await registerLobby(
          gameDirectory,
          config.serverName,
          lobbyAddress(config),
          assertGameClosed,
        );
      });
      await assets.finish();
    } catch (error) {
      await assets.rollback();
      await rollbackServer?.();
      await rollbackProfile?.();
      throw error;
    }
    pack = next;
    update({
      phase: 'idle',
      message: profile.name + ' · 준비됨',
    });
  }
  handle('sync', () => job(prepare));
  handle('restore', () =>
    job(async () => {
      await assertGameClosed();
      await safe(directory, gameDirectory);
      await restorePack(gameDirectory, assertGameClosed);
      update({
        phase: 'idle',
        message:
          '이전 모드 파일을 복원했습니다. 다음 동기화에서는 운영진의 최신 목록이 다시 적용됩니다.',
      });
    }),
  );
  handle('play', async () => {
    const reason = playBlockedReason(await passport.refresh(true));
    if (reason) throw new Error(reason);
    return job(async () => {
      await prepare();
      await ensureOfficial(directory, update, settings.launcherPath);
      update({ phase: 'launching', message: '공식 Minecraft Launcher를 여는 중입니다.' });
      await launchOfficial(await inspect(), official.directory);
      const outcome = settings.autoPlay
        ? await autoPlay(official.directory, gameDirectory, update)
        : 'manual';
      update({
        phase: 'idle',
        message:
          outcome === 'started'
            ? 'Minecraft 실행됨'
            : outcome === 'invoked'
              ? '플레이를 눌렀습니다. 실행을 확인해 주세요.'
              : profile.name + '에서 플레이를 눌러 주세요.',
      });
      if (settings.minimizeOnLaunch) window?.minimize();
    });
  });
  window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    icon: join(__dirname, 'icon.png'),
    show: !(process.env.OVERWORLD_TEST_DATA && !app.isPackaged),
    backgroundColor: settings.theme === 'light' ? '#ffffff' : '#141715',
    title: 'Overworld Launcher',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  website = new Website(window);
  passportSession.cookies.on('changed', (_event, cookie) => {
    if (
      /^(?:__Host-)?passport_portal_session$/.test(cookie.name) &&
      cookie.domain?.replace(/^\./, '') === new URL(config.passportOrigin).hostname
    )
      void passport.refresh(true);
  });
  window.webContents.on('did-finish-load', () => void passport.refresh());
  const passportTimer = setInterval(() => void passport.refresh(), 30000);
  passportTimer.unref();
  window.on('focus', () => void passport.refresh());
  window.once('closed', () => clearInterval(passportTimer));
  await (devUrl ? window.loadURL(trustedUrl) : window.loadFile(rendererFile));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app
    .whenReady()
    .then(boot)
    .catch((e) => {
      dialog.showErrorBox('Overworld 시작 오류', errorText(e));
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
}
