export type ServerRecord = {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'maintenance' | 'unknown';
  players: number | null;
  maxPlayers: number | null;
};
export type ServerOverview = {
  source: 'demo' | 'live' | 'unavailable';
  updatedAt: string | null;
  servers: ServerRecord[];
};
export type Announcement = {
  id: string;
  category: string;
  title: string;
  body: string;
  date: string;
};
export type PublicConfig = {
  passportOrigin: string;
  minecraftVersion: string;
  velocityHost: string;
  velocityPort: number;
  serverName: string;
  serverDescription: string;
  modManifestUrl: string;
  announcements: Announcement[];
};
export type Settings = {
  theme: 'dark' | 'light';
  autoPlay: boolean;
  launcherPath: string;
  minecraftDirectory: string;
  disabledMods: string[];
  minimizeOnLaunch: boolean;
};
export type ModFile = {
  id: string;
  name: string;
  file: string;
  url: string;
  sha256: string;
  size: number;
  optional: boolean;
};
export type Pack = {
  files?: PackFile[];
  schemaVersion: 1;
  revision: string;
  minecraftVersion: string;
  loader:
    | { kind: 'vanilla' }
    | { kind: 'fabric'; version: string }
    | { kind: 'installed'; versionId: string };
  mods: ModFile[];
};
export type PackFile = {
  path: string;
  url: string;
  sha256: string;
  size: number;
  policy: 'managed' | 'default';
};
export type LauncherStatus = {
  executable: string | null;
  appId: string | null;
  minecraftDirectory: string;
  profileReady: boolean;
  versionInstalled: boolean;
  issue?: string;
};
export type Activity = { phase: 'idle' | 'syncing' | 'launching' | 'error'; message: string };
export type Snapshot = {
  passport: PassportState;
  website: WebsiteState;
  serverStatus: ServerOverview;
  config: PublicConfig;
  settings: Settings;
  launcher: LauncherStatus;
  pack: Pack;
  installedRevision: string | null;
  activity: Activity;
  gameDirectory: string;
  appVersion: string;
  preview: boolean;
};
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface LauncherApi {
  refreshPassport(): Promise<Result<PassportState>>;
  logoutPassport(): Promise<Result<PassportState>>;
  onPassport(callback: (state: PassportState) => void): () => void;
  websiteAction(action: 'back' | 'reload' | 'close'): Promise<Result<null>>;
  onWebsite(callback: (state: WebsiteState) => void): () => void;
  snapshot(): Promise<Result<Snapshot>>;
  chooseLauncher(): Promise<Result<Settings | null>>;
  openLauncher(): Promise<Result<null>>;
  downloadLauncher(): Promise<Result<null>>;
  openDirectory(): Promise<Result<null>>;
  openBackups(): Promise<Result<null>>;
  openPassport(): Promise<Result<null>>;
  openManual(): Promise<Result<null>>;
  copyAddress(): Promise<Result<null>>;
  saveSettings(settings: Settings): Promise<Result<Settings>>;
  syncMods(): Promise<Result<null>>;
  restoreMods(): Promise<Result<null>>;
  play(): Promise<Result<null>>;
  onActivity(callback: (activity: Activity) => void): () => void;
}
export type WebsiteState = {
  open: boolean;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  error: string | null;
};
export type PassportState = {
  status: 'checking' | 'signed-out' | 'signed-in' | 'unavailable';
  displayName: string | null;
  schoolVerified: boolean;
  verifiedUntil: string | null;
  minecraftName: string | null;
  minecraftUuid: string | null;
  minecraftSkin: string | null;
  schoolName: string | null;
  department: string | null;
  statistics: PassportStatistics | null;
  statisticsMessage: string | null;
  minecraftLinked: boolean;
  accessSuspended: boolean;
  privacyAccepted: boolean;
  allowedServers: { id: string; label: string }[];
  permissionsAvailable: boolean;
  message: string | null;
  updatedAt: string | null;
};
export type PlayCounters = {
  playSeconds: number;
  blocksBroken: number;
  blocksPlaced: number;
  damageTakenMilli: number;
  deaths: number;
  mobKills: number;
  playerKills: number;
  distanceCm: number;
};
export type PassportStatistics = {
  totals: PlayCounters;
  servers: { id: string; label: string; counters: PlayCounters }[];
  lastCollectedAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  serverLabel: string | null;
};
declare global {
  interface Window {
    launcher?: LauncherApi;
  }
}
