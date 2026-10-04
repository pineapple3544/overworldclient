import { demoServerStatus } from './server-status';
import config from '../config/launcher.json';
import pack from '../config/modpack.json';
import type { LauncherApi, Snapshot, Pack } from './shared';
import { emptyPassport } from '../electron/passport';
const state: Snapshot = {
  passport: emptyPassport(),
  website: { open: false, title: '', url: '', loading: false, canGoBack: false, error: null },
  serverStatus: demoServerStatus(),
  config,
  settings: {
    theme: 'dark',
    autoPlay: true,
    launcherPath: '',
    minecraftDirectory: '',
    disabledMods: [],
    minimizeOnLaunch: false,
  },
  launcher: {
    executable: null,
    appId: null,
    minecraftDirectory: '',
    profileReady: false,
    versionInstalled: false,
  },
  pack: pack as Pack,
  installedRevision: null,
  activity: {
    phase: 'idle',
    message: '브라우저 미리보기',
  },
  gameDirectory: '',
  appVersion: '0.5.2',
  preview: true,
};
const unavailable = async () => ({
  ok: false as const,
  error: '데스크톱 런처에서 사용할 수 있는 기능입니다.',
});
const open = async (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true as const, value: null };
};
export const previewApi: LauncherApi = {
  refreshPassport: async () => ({ ok: true, value: state.passport }),
  logoutPassport: unavailable,
  onPassport: () => () => {},
  websiteAction: unavailable,
  onWebsite: () => () => {},
  snapshot: async () => ({ ok: true, value: state }),
  chooseLauncher: unavailable,
  openLauncher: unavailable,
  downloadLauncher: () => open('https://www.minecraft.net/download'),
  openDirectory: unavailable,
  openBackups: unavailable,
  copyAddress: unavailable,
  syncMods: unavailable,
  restoreMods: unavailable,
  play: unavailable,
  openPassport: () => open('https://overworld.flyjung.kr/'),
  openManual: () => open('https://overworld.flyjung.kr/manual'),
  saveSettings: async (settings) => {
    state.settings = settings;
    return { ok: true, value: settings };
  },
  onActivity: () => () => {},
};
