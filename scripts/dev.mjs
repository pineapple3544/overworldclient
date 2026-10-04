import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
await import('./build-electron.mjs');
const server = await createServer();
await server.listen();
const require = createRequire(import.meta.url);
const env = { ...process.env, OVERWORLD_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env, windowsHide: true });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on('SIGINT', () => child.kill());
