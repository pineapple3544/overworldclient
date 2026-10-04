import { build } from 'esbuild';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
await import('./create-icon.mjs');
await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
});
await build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
});
await copyFile('build/icon.png', 'dist-electron/icon.png');
await copyFile('electron/auto-play-accessible.cs', 'dist-electron/auto-play-accessible.cs');
await writeFile(
  'dist-electron/auto-play.ps1',
  '\ufeff' + (await readFile('electron/auto-play.ps1', 'utf8')).replace(/^\ufeff/, ''),
);
