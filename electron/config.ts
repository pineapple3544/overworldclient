import { readFile } from 'node:fs/promises';
import { win32 } from 'node:path';
import type { PublicConfig, Settings, Pack, ModFile, PackFile } from '../src/shared';
export const defaultSettings: Settings = {
  theme: 'dark',
  autoPlay: true,
  launcherPath: '',
  minecraftDirectory: '',
  disabledMods: [],
  minimizeOnLaunch: false,
};
export function httpsUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('다운로드 주소를 확인해 주세요.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('다운로드 주소는 HTTPS여야 합니다.');
  return url.href;
}
export function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value) &&
    !value.endsWith('.')
  );
}
export function validateSettings(value: unknown): Settings {
  const s = value as Settings;
  if (
    !s ||
    (s.theme !== undefined && s.theme !== 'dark' && s.theme !== 'light') ||
    typeof s.launcherPath !== 'string' ||
    typeof s.minecraftDirectory !== 'string' ||
    typeof s.minimizeOnLaunch !== 'boolean' ||
    (s.autoPlay !== undefined && typeof s.autoPlay !== 'boolean') ||
    !Array.isArray(s.disabledMods) ||
    s.disabledMods.length > 300 ||
    s.disabledMods.some((x) => !validId(x))
  )
    throw new Error('런처 설정 값을 확인해 주세요.');
  for (const p of [s.launcherPath, s.minecraftDirectory])
    if (p && (!win32.isAbsolute(p) || p.includes('\0') || p.length > 1024))
      throw new Error('폴더와 실행 파일의 전체 경로를 선택해 주세요.');
  if (s.launcherPath && !/^Minecraft(?:Launcher)?\.exe$/i.test(win32.basename(s.launcherPath)))
    throw new Error('공식 MinecraftLauncher.exe를 선택해 주세요.');
  return {
    theme: s.theme ?? 'dark',
    autoPlay: s.autoPlay ?? true,
    launcherPath: s.launcherPath,
    minecraftDirectory: s.minecraftDirectory,
    disabledMods: [...new Set(s.disabledMods)],
    minimizeOnLaunch: s.minimizeOnLaunch,
  };
}
export function migrateSettings(value: unknown): Settings {
  const s = value as Record<string, unknown>;
  if (s && ('prismPath' in s || 'memoryGb' in s))
    return {
      ...defaultSettings,
      minimizeOnLaunch: s.minimizeOnLaunch === true || s.closeOnLaunch === true,
    };
  return validateSettings(value);
}
export function parseConfig(value: unknown): PublicConfig {
  const c = value as PublicConfig;
  if (!c || typeof c !== 'object') throw new Error('런처 설정 파일을 확인해 주세요.');
  for (const k of ['minecraftVersion', 'velocityHost', 'serverName', 'serverDescription'] as const)
    if (typeof c[k] !== 'string') throw new Error(`런처 설정 항목 오류: ${k}`);
  if (!validId(c.minecraftVersion)) throw new Error('게임 버전 형식을 확인해 주세요.');
  if (
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(c.velocityHost) ||
    c.velocityHost.length > 253
  )
    throw new Error('서버 주소를 확인해 주세요.');
  if (!Number.isInteger(c.velocityPort) || c.velocityPort < 1 || c.velocityPort > 65535)
    throw new Error('서버 포트를 확인해 주세요.');
  if (
    !Array.isArray(c.announcements) ||
    c.announcements.some(
      (a) =>
        !a ||
        ['id', 'category', 'title', 'body', 'date'].some(
          (k) => typeof (a as Record<string, unknown>)[k] !== 'string',
        ),
    )
  )
    throw new Error('공지 형식을 확인해 주세요.');
  return {
    passportOrigin: new URL(httpsUrl(c.passportOrigin ?? 'https://overworld.flyjung.kr')).origin,
    minecraftVersion: c.minecraftVersion,
    velocityHost: c.velocityHost,
    velocityPort: c.velocityPort,
    serverName: c.serverName,
    serverDescription: c.serverDescription,
    announcements: c.announcements,
    modManifestUrl: c.modManifestUrl ? httpsUrl(c.modManifestUrl) : '',
  };
}
export function parsePack(value: unknown, gameVersion: string): Pack {
  const p = value as Pack;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !validId(p.revision) ||
    !validId(p.minecraftVersion) ||
    p.minecraftVersion !== gameVersion ||
    !Array.isArray(p.mods) ||
    p.mods.length > 300
  )
    throw new Error('모드 배포 목록의 형식 또는 게임 버전을 확인해 주세요.');
  if (!p.loader || !['vanilla', 'fabric', 'installed'].includes(p.loader.kind))
    throw new Error('모드 로더 설정을 확인해 주세요.');
  if (p.loader.kind === 'fabric' && !validId(p.loader.version))
    throw new Error('Fabric 버전을 지정해 주세요.');
  if (p.loader.kind === 'installed' && !validId(p.loader.versionId))
    throw new Error('설치된 모드 로더의 버전 ID를 지정해 주세요.');
  if (p.loader.kind === 'vanilla' && p.mods.length)
    throw new Error('모드를 배포하려면 먼저 모드 로더를 지정해 주세요.');
  const files = new Set<string>();
  const ids = new Set<string>();
  const mods: ModFile[] = p.mods.map((m) => {
    if (
      !m ||
      !validId(m.id) ||
      typeof m.name !== 'string' ||
      !m.name ||
      m.name.length > 120 ||
      typeof m.file !== 'string' ||
      !validId(m.file) ||
      !m.file.endsWith('.jar') ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(m.file) ||
      !/^([a-f0-9]{64})$/i.test(m.sha256) ||
      !Number.isInteger(m.size) ||
      m.size < 1 ||
      m.size > 128 * 1024 * 1024 ||
      typeof m.optional !== 'boolean' ||
      files.has(m.file.toLowerCase()) ||
      ids.has(m.id)
    )
      throw new Error('모드 파일명·크기·해시 또는 중복 항목을 확인해 주세요.');
    files.add(m.file.toLowerCase());
    ids.add(m.id);
    return {
      id: m.id,
      name: m.name,
      file: m.file,
      url: httpsUrl(m.url),
      sha256: m.sha256.toLowerCase(),
      size: m.size,
      optional: m.optional,
    };
  });
  const content = parseFiles(p.files ?? []);
  if ([...mods, ...content].reduce((n, m) => n + m.size, 0) > 2 * 1024 * 1024 * 1024)
    throw new Error('모드팩 다운로드 크기는 2GB까지 지원합니다.');
  return {
    schemaVersion: 1,
    revision: p.revision,
    minecraftVersion: p.minecraftVersion,
    loader: p.loader,
    mods,
    files: content,
  };
}
export function assetPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 240) return false;
  if (
    value
      .split('/')
      .some(
        (p) =>
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p) ||
          p.endsWith('.') ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
      )
  )
    return false;
  return (
    value === 'options.txt' ||
    /^resourcepacks\/[a-zA-Z0-9._-]+\.zip$/.test(value) ||
    /^config\/.+\.(json|json5|toml|properties|txt|cfg|yaml|yml)$/.test(value)
  );
}
export function parseFiles(value: unknown): PackFile[] {
  if (!Array.isArray(value) || value.length > 300)
    throw new Error('배포 파일 목록을 확인해 주세요.');
  const paths = new Set<string>();
  return value.map((f) => {
    if (
      !f ||
      !assetPath(f.path) ||
      paths.has(f.path.toLowerCase()) ||
      !['managed', 'default'].includes(f.policy) ||
      !/^[a-f0-9]{64}$/i.test(f.sha256) ||
      !Number.isInteger(f.size) ||
      f.size < 1 ||
      f.size > 128 * 1024 * 1024
    )
      throw new Error('배포 파일의 경로·크기·해시를 확인해 주세요.');
    paths.add(f.path.toLowerCase());
    return {
      path: f.path,
      url: httpsUrl(f.url),
      sha256: f.sha256.toLowerCase(),
      size: f.size,
      policy: f.policy,
    };
  });
}
export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}
