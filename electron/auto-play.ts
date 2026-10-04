import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { processStatus } from './official';
import { app } from 'electron';
import type { Activity } from '../src/shared';
const exec = promisify(execFile);
export type AutoPlayOutcome = 'started' | 'invoked' | 'manual';
export async function autoPlay(
  directory: string,
  gameDirectory: string,
  update: (activity: Activity) => void,
  helper = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'auto-play.ps1')
    : join(__dirname, 'auto-play.ps1'),
): Promise<AutoPlayOutcome> {
  update({ phase: 'launching', message: '플레이 버튼 확인 중' });
  try {
    const ps = join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
    );
    const result = await exec(
      join(ps, 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-File', helper],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4096,
        env: {
          ...process.env,
          PSModulePath: join(ps, 'Modules'),
          OVERWORLD_LAUNCHER_DIRECTORY: directory,
          OVERWORLD_GAME_DIRECTORY: gameDirectory,
        },
      },
    );
    await writeFile(
      join(directory, 'auto-play-status.json'),
      JSON.stringify({ outcome: result.stdout.trim(), time: new Date().toISOString() }),
    ).catch(() => {});
    if (result.stdout.trim() !== 'invoked') return 'manual';
    // An accepted click is not proof that the game launched.
    for (let i = 0; i < 4; i++) {
      if ((await processStatus()).gameRunning) return 'started';
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    return 'invoked';
  } catch (error) {
    const failure = error as { code?: string; killed?: boolean };
    await writeFile(
      join(directory, 'auto-play-status.json'),
      JSON.stringify({
        outcome: 'error',
        code: failure.code,
        timeout: failure.killed === true,
        time: new Date().toISOString(),
      }),
    ).catch(() => {});
    return 'manual';
  }
}
