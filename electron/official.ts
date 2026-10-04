import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir, copyFile, rename, lstat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Settings, LauncherStatus, Pack } from '../src/shared';
import { exists, safe } from './mods';
import { fetchJson } from './download';
import { isolatedArguments } from './isolated';
const exec = promisify(execFile);
const PROFILE = 'overworld-managed';
export function versionId(pack: Pack, quickPlay = false): string {
  const id =
    pack.loader.kind === 'vanilla'
      ? pack.minecraftVersion
      : pack.loader.kind === 'fabric'
        ? `fabric-loader-${pack.loader.version}-${pack.minecraftVersion}`
        : pack.loader.versionId;
  return quickPlay ? 'overworld-' + id : id;
}
async function powershell(script: string) {
  return (
    await exec(
      join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
    )
  ).stdout.trim();
}
export async function processStatus(
  scope?: string,
): Promise<{ gameRunning: boolean; launcherRunning: boolean }> {
  try {
    const result = JSON.parse(
      await powershell(
        `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='javaw.exe' OR Name='MinecraftLauncher.exe' OR Name='Minecraft.exe'"; $g=@($p | Where-Object { $_.Name -match '^javaw?\\.exe$' -and (!$_.CommandLine -or $_.CommandLine -match 'minecraft|fabricmc|neoforged|modlauncher') }); $l=@($p | Where-Object { $_.Name -match '^Minecraft(Launcher)?\\.exe$' }); @{gameRunning=($g.Count -gt 0);launcherRunning=($l.Count -gt 0)} | ConvertTo-Json -Compress`,
      ),
    );
    if (scope && result.launcherRunning) {
      const encoded = Buffer.from(scope, 'utf8').toString('base64');
      result.launcherRunning =
        (await powershell(
          `$scope=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $p=Get-CimInstance Win32_Process -Filter "Name='MinecraftLauncher.exe' OR Name='Minecraft.exe'"; @($p | Where-Object { !$_.CommandLine -or $_.CommandLine.IndexOf($scope,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0`,
        )) === 'True';
    }
    return result;
  } catch {
    throw new Error(
      '게임 실행 상태를 확인하지 못했습니다. Windows 관리 서비스와 접근 권한을 확인한 뒤 다시 시도해 주세요.',
    );
  }
}
export async function assertGameClosed() {
  if ((await processStatus()).gameRunning)
    throw new Error('Minecraft를 종료한 뒤 모드를 업데이트해 주세요.');
}
async function storeApp() {
  try {
    const id = await powershell(
      "Get-StartApps | Where-Object { $_.AppID -match '^Microsoft\\.(4297127D64EC6|MinecraftLauncher)_[a-zA-Z0-9]+![a-zA-Z0-9.]+$' } | Select-Object -First 1 -ExpandProperty AppID",
    );
    return /^Microsoft\.(4297127D64EC6|MinecraftLauncher)_[a-zA-Z0-9]+![a-zA-Z0-9.]+$/.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
async function profileFiles(directory: string) {
  const files = [];
  for (const name of ['launcher_profiles_microsoft_store.json', 'launcher_profiles.json']) {
    const path = join(directory, name);
    await safe(directory, path);
    if (await exists(path)) files.push(path);
  }
  return files;
}
export async function inspectLauncher(
  settings: Settings,
  appData: string,
  pack: Pack,
  gameDirectory: string,
  profile = { id: PROFILE, name: 'Overworld · ' + pack.minecraftVersion },
  quickPlay = false,
): Promise<LauncherStatus> {
  let executable: string | null = null;
  let appId: string | null = null;
  const paths = settings.launcherPath
    ? [settings.launcherPath]
    : [
        join(
          process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
          'Minecraft Launcher',
          'MinecraftLauncher.exe',
        ),
        join(
          process.env.ProgramFiles || 'C:\\Program Files',
          'Minecraft Launcher',
          'MinecraftLauncher.exe',
        ),
        join(
          process.env.LOCALAPPDATA || appData,
          'Programs',
          'Minecraft Launcher',
          'MinecraftLauncher.exe',
        ),
      ];
  for (const path of paths)
    if ((await exists(path)) && (await lstat(path)).isFile()) {
      executable = path;
      break;
    }
  if (!executable && !settings.launcherPath) appId = await storeApp();
  const minecraftDirectory = settings.minecraftDirectory || join(appData, '.minecraft');
  let profileReady = false;
  let issue: string | undefined;
  try {
    for (const file of await profileFiles(minecraftDirectory)) {
      const data = JSON.parse(await readFile(file, 'utf8'));
      const p = data.profiles?.[profile.id];
      if (p?.gameDir === gameDirectory && p?.lastVersionId === versionId(pack, quickPlay))
        profileReady = true;
    }
  } catch {
    issue = '공식 런처의 설치 설정을 읽지 못했습니다. 데이터 폴더를 확인해 주세요.';
  }
  const versionInstalled = await exists(
    join(minecraftDirectory, 'versions', pack.minecraftVersion, pack.minecraftVersion + '.json'),
  );
  return { executable, appId, minecraftDirectory, profileReady, versionInstalled, issue };
}
export async function prepareProfile(
  directory: string,
  gameDirectory: string,
  pack: Pack,
  launcherRunning: boolean,
  request: typeof fetch = fetch,
  profile = { id: PROFILE, name: 'Overworld · ' + pack.minecraftVersion },
  dedicated = false,
  connection?: { address: string },
) {
  if (dedicated) {
    await mkdir(directory, { recursive: true });
    const initial = join(directory, 'launcher_profiles.json');
    await safe(directory, initial);
    if (!(await exists(initial)))
      await writeFile(
        initial,
        JSON.stringify({ profiles: {}, launcherVersion: { name: 'Overworld', format: 21 } }),
        { flag: 'wx' },
      );
  }
  const files = await profileFiles(directory);
  if (!files.length)
    throw new Error(
      '공식 Minecraft Launcher를 한 번 열어 Java Edition 초기 설정을 마친 뒤 완전히 종료해 주세요. 설치 설정 파일이 필요합니다.',
    );
  const updates: { file: string; original: string | null; data: any }[] = [];
  for (const file of files) {
    const original = await readFile(file, 'utf8');
    const data = JSON.parse(original);
    if (!data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles))
      throw new Error('공식 런처의 설치 설정 형식을 확인할 수 없습니다.');
    const previous = data.profiles[profile.id];
    if (previous && previous.gameDir !== gameDirectory)
      throw new Error(
        '같은 이름의 기존 프로필이 다른 게임 폴더를 사용합니다. 설치 설정을 확인해 주세요.',
      );
    if (
      previous?.gameDir === gameDirectory &&
      previous?.lastVersionId === versionId(pack, !!connection) &&
      previous?.name === profile.name &&
      (!dedicated || data.selectedProfile === profile.id)
    )
      continue;
    if (launcherRunning)
      throw new Error(
        'Overworld 프로필을 등록하려면 공식 Minecraft Launcher를 완전히 종료한 뒤 다시 눌러 주세요.',
      );
    data.profiles[profile.id] = {
      ...previous,
      name: profile.name,
      type: 'custom',
      created: previous?.created || new Date().toISOString(),
      lastVersionId: versionId(pack, !!connection),
      gameDir: gameDirectory,
      icon: 'Grass',
    };
    if (dedicated) {
      data.profiles = {
        [profile.id]: { ...data.profiles[profile.id], lastUsed: new Date().toISOString() },
      };
      data.selectedProfile = profile.id;
    }
    updates.push({ file, original, data });
  }
  const id = versionId(pack),
    versionFile = join(directory, 'versions', id, id + '.json');
  if (pack.loader.kind === 'fabric') {
    if (!(await exists(versionFile))) {
      if (launcherRunning) throw new Error('Fabric을 준비하려면 공식 런처를 종료해 주세요.');
      const profile = (await fetchJson(
        `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(pack.minecraftVersion)}/${encodeURIComponent(pack.loader.version)}/profile/json`,
        request,
      )) as { id?: string; inheritsFrom?: string };
      if (profile.id !== id || profile.inheritsFrom !== pack.minecraftVersion)
        throw new Error('Fabric 응답의 게임 버전이 배포 설정과 다릅니다.');
      await safe(directory, versionFile);
      await mkdir(dirname(versionFile), { recursive: true });
      await writeFile(versionFile, JSON.stringify(profile, null, 2), { flag: 'wx' });
    } else {
      await safe(directory, versionFile);
      const profile = JSON.parse(await readFile(versionFile, 'utf8'));
      if (profile.id !== id || profile.inheritsFrom !== pack.minecraftVersion)
        throw new Error('설치된 Fabric 프로필을 확인해 주세요.');
    }
  } else if (pack.loader.kind === 'installed') {
    await safe(directory, versionFile);
    if (!(await exists(versionFile)))
      throw new Error(`공식 런처에 모드 로더 ${id}를 먼저 설치해 주세요.`);
    const profile = JSON.parse(await readFile(versionFile, 'utf8'));
    if (profile.id !== id || profile.inheritsFrom !== pack.minecraftVersion)
      throw new Error('설치된 모드 로더의 게임 버전이 일치하지 않습니다.');
  }
  if (connection) {
    if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(connection.address))
      throw new Error('자동 접속 주소를 확인해 주세요.');
    const customId = versionId(pack, true);
    const customFile = join(directory, 'versions', customId, customId + '.json');
    await safe(directory, customFile);
    const base =
      pack.loader.kind === 'vanilla'
        ? { inheritsFrom: pack.minecraftVersion }
        : JSON.parse(await readFile(versionFile, 'utf8'));
    if (
      base.arguments &&
      (!Array.isArray(base.arguments.game ?? []) || typeof base.arguments !== 'object')
    )
      throw new Error('모드 로더의 실행 옵션을 확인해 주세요.');
    const original = (await exists(customFile)) ? await readFile(customFile, 'utf8') : null;
    const saved = original ? JSON.parse(original) : null;
    const createdAt =
      typeof saved?.time === 'string' && Number.isFinite(Date.parse(saved.time))
        ? saved.time
        : new Date().toISOString();
    const custom = {
      ...base,
      id: customId,
      jar: pack.minecraftVersion,
      type: 'release',
      time: base.time ?? createdAt,
      releaseTime: base.releaseTime ?? createdAt,
      minimumLauncherVersion: 21,
      arguments: {
        ...base.arguments,
        game: [...(base.arguments?.game ?? []), '--quickPlayMultiplayer', connection.address],
      },
    };
    if (original !== JSON.stringify(custom, null, 2)) {
      if (launcherRunning)
        throw new Error(
          '자동 접속 설정을 적용하려면 공식 Minecraft Launcher를 완전히 종료해 주세요.',
        );
      await mkdir(dirname(customFile), { recursive: true });
      updates.unshift({ file: customFile, original, data: custom });
    }
  }
  const applied: { file: string; original: string | null; written: string }[] = [];
  const rollback = async () => {
    for (const item of [...applied].reverse()) {
      if ((await readFile(item.file, 'utf8')) !== item.written)
        throw new Error(
          '프로필이 외부에서 변경되어 자동 복구하지 못했습니다. 프로필 옆의 백업 파일을 확인해 주세요.',
        );
      if (item.original === null) await rm(item.file);
      else {
        const tmp = item.file + '.' + randomUUID() + '.tmp';
        await writeFile(tmp, item.original);
        await rename(tmp, item.file);
      }
    }
  };
  try {
    for (const { file, original, data } of updates) {
      if (((await exists(file)) ? await readFile(file, 'utf8') : null) !== original)
        throw new Error('공식 런처가 설정을 변경했습니다. 런처를 종료하고 다시 시도해 주세요.');
      if (original !== null) {
        const backup = file + '.overworld-' + Date.now() + '.bak';
        await copyFile(file, backup, 1);
      }
      const tmp = file + '.' + randomUUID() + '.tmp';
      await writeFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, file);
      applied.push({ file, original, written: JSON.stringify(data, null, 2) });
    }
  } catch (error) {
    await rollback();
    throw error;
  }
  return rollback;
}
export async function launchOfficial(status: LauncherStatus, dedicatedDirectory?: string) {
  if (!status.executable && !status.appId)
    throw new Error('공식 Minecraft Launcher를 설치하거나 설정에서 실행 파일을 선택해 주세요.');
  const exe = status.executable || join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
  if (dedicatedDirectory && !status.executable)
    throw new Error('전용 공식 런처를 먼저 준비해 주세요.');
  const args = status.executable
    ? dedicatedDirectory
      ? isolatedArguments(dedicatedDirectory)
      : []
    : ['shell:AppsFolder\\' + status.appId];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(exe, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.once('error', () =>
      reject(new Error('공식 런처를 열지 못했습니다. 설치 경로를 확인해 주세요.')),
    );
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
