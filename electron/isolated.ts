import { join } from 'node:path';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { safe, exists } from './mods';
import { response } from './download';
import type { Activity } from '../src/shared';
const exec = promisify(execFile);
export function launcherPaths(root: string) {
  return {
    directory: join(root, 'official-launcher'),
    executable: join(root, 'official-launcher', 'Minecraft.exe'),
  };
}
export function isolatedArguments(directory: string) {
  return ['--workDir', directory, '--lockDir', directory, '--force-renderer-accessibility'];
}
async function verify(path: string) {
  const script =
    "$s=Get-AuthenticodeSignature -LiteralPath $env:OVERWORLD_VERIFY_FILE; if($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )O=(Microsoft Corporation|Mojang AB)(,|$)'){ 'verified' }";
  const result = await exec(
    join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      windowsHide: true,
      timeout: 30000,
      env: {
        ...process.env,
        OVERWORLD_VERIFY_FILE: path,
        PSModulePath: join(
          process.env.SystemRoot || 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'Modules',
        ),
      },
    },
  );
  if (result.stdout.trim() !== 'verified')
    throw new Error('공식 런처의 서명을 확인하지 못했습니다. 다시 시도해 주세요.');
}
export async function ensureOfficial(root: string, update: (a: Activity) => void, customPath = '') {
  const paths = launcherPaths(root);
  await safe(root, paths.executable);
  await mkdir(paths.directory, { recursive: true });
  if (customPath) {
    await verify(customPath);
    return customPath;
  }
  if (await exists(paths.executable)) {
    await verify(paths.executable);
    return paths.executable;
  }
  update({ phase: 'syncing', message: '공식 런처 준비 중' });
  const tmp = paths.executable + '.' + randomUUID() + '.exe';
  const r = await response('https://launcher.mojang.com/download/Minecraft.exe');
  if (!r.body) throw new Error('공식 런처를 다운로드하지 못했습니다.');
  const fd = await open(tmp, 'wx');
  try {
    let size = 0;
    for await (const part of r.body) {
      size += part.length;
      if (size > 128 * 1024 * 1024) throw new Error('공식 런처 다운로드 크기를 확인해 주세요.');
      await fd.writeFile(part);
    }
    await fd.close();
    await verify(tmp);
    await rename(tmp, paths.executable);
  } finally {
    await fd.close().catch(() => {});
    await rm(tmp, { force: true });
  }
  return paths.executable;
}
