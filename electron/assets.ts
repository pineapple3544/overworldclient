import { mkdir, readFile, copyFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { PackFile, Activity } from '../src/shared';
import { download } from './download';
import { assetPath, readJson } from './config';
import { atomicJson, exists, safe } from './mods';
type RecordFile = { path: string; sha256: string; policy: 'managed' | 'default' };
type State = { files: RecordFile[] };
type Change = { path: string; existed: boolean; remove: boolean };
type Journal = { id: string; previous: State; next: State; changes: Change[] };
function state(value: unknown): State {
  const s = value as State;
  if (
    !s ||
    !Array.isArray(s.files) ||
    s.files.some(
      (f) =>
        !assetPath(f.path) ||
        !['managed', 'default'].includes(f.policy) ||
        !/^[a-f0-9]{64}$/.test(f.sha256),
    )
  )
    throw new Error('배포 파일 기록을 확인해 주세요.');
  return s;
}
async function hash(path: string) {
  const h = createHash('sha256');
  for await (const c of createReadStream(path)) h.update(c);
  return h.digest('hex');
}
async function paths(root: string) {
  const meta = join(root, '.overworld');
  await safe(root, meta);
  await mkdir(meta, { recursive: true });
  return { meta, stateFile: join(meta, 'assets.json'), pending: join(meta, 'assets-pending.json') };
}
export async function recoverAssets(root: string) {
  const { meta, stateFile, pending } = await paths(root);
  await safe(root, pending);
  if (!(await exists(pending))) return;
  const j = (await readJson(pending)) as Journal;
  if (
    !/^\d+-[a-f0-9-]{36}$/.test(j.id) ||
    !Array.isArray(j.changes) ||
    j.changes.some((c) => !assetPath(c.path) || typeof c.existed !== 'boolean')
  )
    throw new Error('배포 파일 복구 기록을 확인해 주세요.');
  state(j.previous);
  const backup = join(meta, 'asset-backups', j.id);
  await safe(root, join(backup, 'committed'));
  if (!(await exists(join(backup, 'committed')))) {
    for (const c of j.changes) {
      const target = join(root, c.path);
      await safe(root, target);
      if (c.existed) {
        const source = join(backup, 'previous', c.path);
        await safe(root, source);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target);
      } else await rm(target, { force: true });
    }
    await atomicJson(root, stateFile, j.previous);
  }
  await rm(pending, { force: true });
}
export async function prepareAssets(
  root: string,
  files: PackFile[],
  update: (a: Activity) => void,
  request: typeof fetch = fetch,
) {
  await recoverAssets(root);
  const { meta, stateFile, pending } = await paths(root);
  await safe(root, stateFile);
  const previous = (await exists(stateFile)) ? state(await readJson(stateFile)) : { files: [] };
  const old = new Map(previous.files.map((f) => [f.path.toLowerCase(), f]));
  // Defaults become the user's settings after first application, including intentional deletion.
  const next: State = { files: previous.files.filter((f) => f.policy === 'default') };
  const id = Date.now() + '-' + randomUUID();
  const backup = join(meta, 'asset-backups', id);
  const changes: Change[] = [];
  await safe(root, backup);
  async function plan(path: string, file?: PackFile) {
    const target = join(root, path);
    await safe(root, target);
    const existed = await exists(target);
    if (existed) {
      const dest = join(backup, 'previous', path);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(target, dest);
    }
    if (file) {
      const dest = join(backup, 'next', path);
      await mkdir(dirname(dest), { recursive: true });
      update({ phase: 'syncing', message: '파일 준비 · ' + path });
      await download(file, dest, request);
    }
    changes.push({ path, existed, remove: !file });
  }
  for (const file of files) {
    const key = file.path.toLowerCase(),
      prior = old.get(key),
      target = join(root, file.path);
    await safe(root, target);
    const present = await exists(target);
    if (file.policy === 'default') {
      if (!next.files.some((f) => f.path.toLowerCase() === key))
        next.files.push({ path: file.path, policy: 'default', sha256: file.sha256 });
      if (!prior && !present) await plan(file.path, file);
    } else {
      if (present && prior?.policy !== 'managed')
        throw new Error(`개인 파일과 겹칩니다: ${file.path}`);
      next.files = next.files.filter((f) => f.path.toLowerCase() !== key);
      next.files.push({ path: file.path, sha256: file.sha256, policy: 'managed' });
      if (!present || (await hash(target)) !== file.sha256) await plan(file.path, file);
    }
  }
  const desired = new Set(files.map((f) => f.path.toLowerCase()));
  for (const f of previous.files)
    if (f.policy === 'managed' && !desired.has(f.path.toLowerCase())) {
      const target = join(root, f.path);
      await safe(root, target);
      if (await exists(target)) await plan(f.path);
    }
  let applied = false;
  const unchanged = changes.length === 0 && JSON.stringify(previous) === JSON.stringify(next);
  return {
    async apply() {
      if (unchanged) return;
      for (const c of changes) {
        const target = join(root, c.path);
        await safe(root, target);
        if (
          (await exists(target)) !== c.existed ||
          (c.existed && (await hash(target)) !== (await hash(join(backup, 'previous', c.path))))
        )
          throw new Error('파일이 변경됐습니다. 다시 시도해 주세요: ' + c.path);
      }
      await mkdir(backup, { recursive: true });
      await atomicJson(root, pending, { id, previous, next, changes });
      applied = true;
      for (const c of changes) {
        const target = join(root, c.path);
        await safe(root, target);
        await mkdir(dirname(target), { recursive: true });
        if (c.remove) await rm(target, { force: true });
        else {
          const tmp = target + '.' + randomUUID() + '.tmp';
          await copyFile(join(backup, 'next', c.path), tmp);
          try {
            await rename(tmp, target);
          } finally {
            await rm(tmp, { force: true });
          }
        }
      }
      await atomicJson(root, stateFile, next);
    },
    async finish() {
      if (!applied) return;
      await atomicJson(root, join(backup, 'committed'), { ok: true });
      await rm(pending, { force: true });
      applied = false;
    },
    async rollback() {
      if (applied) await recoverAssets(root);
      applied = false;
    },
  };
}
