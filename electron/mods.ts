import { lstat, mkdir, readdir, readFile, writeFile, rename, cp, rm } from 'node:fs/promises';
import { resolve, relative, join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { download } from './download';
import type { Pack, Activity } from '../src/shared';
export type InstalledState = { revision: string | null; files: { file: string; sha256: string }[] };
const empty: InstalledState = { revision: null, files: [] };
export async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
export async function safe(root: string, path: string) {
  const base = resolve(root),
    target = resolve(path),
    rel = relative(base, target);
  if (rel.startsWith('..') || resolve(base, rel) !== target)
    throw new Error('관리 폴더 밖에는 파일을 쓸 수 없습니다.');
  let current = target;
  while (true) {
    if ((await exists(current)) && (await lstat(current)).isSymbolicLink())
      throw new Error('연결된 폴더나 파일은 자동으로 변경할 수 없습니다.');
    if (current === base) break;
    current = dirname(current);
  }
}
async function safeTree(root: string, path: string): Promise<void> {
  await safe(root, path);
  if ((await lstat(path)).isDirectory())
    for (const e of await readdir(path)) await safeTree(root, join(path, e));
}
export async function atomicJson(root: string, path: string, value: unknown) {
  await safe(root, path);
  const tmp = path + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2));
  try {
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}
function checkedState(value: unknown): InstalledState {
  const s = value as InstalledState;
  if (
    !s ||
    !(s.revision === null || typeof s.revision === 'string') ||
    !Array.isArray(s.files) ||
    s.files.some(
      (f) =>
        !f ||
        typeof f.file !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}\.jar$/.test(f.file) ||
        !/^[a-f0-9]{64}$/.test(f.sha256),
    )
  )
    throw new Error('설치 기록을 읽을 수 없습니다. 백업을 확인해 주세요.');
  return s;
}
export async function installedState(root: string): Promise<InstalledState> {
  const path = join(root, '.overworld', 'state.json');
  await safe(root, path);
  if (!(await exists(path))) return structuredClone(empty);
  return checkedState(JSON.parse(await readFile(path, 'utf8')));
}
async function initialize(root: string) {
  await safe(root, join(root, '.overworld', 'transactions'));
  await safe(root, join(root, 'mods'));
  await mkdir(join(root, '.overworld', 'transactions'), { recursive: true });
  await mkdir(join(root, 'mods'), { recursive: true });
}
async function hash(path: string) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
export async function recover(root: string) {
  await initialize(root);
  const pending = join(root, '.overworld', 'pending.json');
  await safe(root, pending);
  if (!(await exists(pending))) return;
  const { id } = JSON.parse(await readFile(pending, 'utf8'));
  if (typeof id !== 'string' || !/^\d+-[a-f0-9-]{36}$/.test(id))
    throw new Error('업데이트 복구 기록이 올바르지 않습니다.');
  const tx = join(root, '.overworld', 'transactions', id);
  await safeTree(root, tx);
  if (!(await exists(join(tx, 'committed'))) && (await exists(join(tx, 'previous-mods')))) {
    const previous = checkedState(
      JSON.parse(await readFile(join(tx, 'previous-state.json'), 'utf8')),
    );
    if (await exists(join(root, 'mods'))) {
      await safeTree(root, join(root, 'mods'));
      await rename(join(root, 'mods'), join(tx, 'interrupted-mods'));
    }
    await rename(join(tx, 'previous-mods'), join(root, 'mods'));
    await atomicJson(root, join(root, '.overworld', 'state.json'), previous);
  }
  await rm(pending, { force: true });
}
async function transaction(root: string, tx: string, next: InstalledState) {
  const previous = await installedState(root);
  await atomicJson(root, join(tx, 'previous-state.json'), previous);
  await atomicJson(root, join(root, '.overworld', 'pending.json'), {
    id: relative(join(root, '.overworld', 'transactions'), tx),
  });
  try {
    await safeTree(root, join(root, 'mods'));
    await safeTree(root, join(tx, 'next-mods'));
    await rename(join(root, 'mods'), join(tx, 'previous-mods'));
    await rename(join(tx, 'next-mods'), join(root, 'mods'));
    await atomicJson(root, join(root, '.overworld', 'state.json'), next);
    await writeFile(join(tx, 'committed'), 'ok');
    await rm(join(root, '.overworld', 'pending.json'), { force: true });
  } catch (e) {
    await recover(root);
    throw e;
  }
}
export async function syncPack(
  root: string,
  pack: Pack,
  disabled: string[],
  update: (a: Activity) => void,
  request: typeof fetch = fetch,
  beforeCommit: () => Promise<void> = async () => {},
) {
  await recover(root);
  await safeTree(root, join(root, 'mods'));
  const old = await installedState(root);
  const wanted = pack.mods.filter((m) => !m.optional || !disabled.includes(m.id));
  const oldNames = new Set(old.files.map((m) => m.file.toLowerCase()));
  for (const m of wanted) {
    const p = join(root, 'mods', m.file);
    if ((await exists(p)) && !oldNames.has(m.file.toLowerCase()))
      throw new Error(
        `개인 파일 ${m.file}과 배포 파일 이름이 겹칩니다. 파일을 옮긴 후 다시 시도해 주세요.`,
      );
  }
  const changed: string[] = [];
  for (const m of wanted) {
    const p = join(root, 'mods', m.file);
    if (!(await exists(p)) || (await hash(p)) !== m.sha256) changed.push(m.file);
  }
  const wantedNames = new Set(wanted.map((m) => m.file.toLowerCase()));
  const removed = old.files.filter((m) => !wantedNames.has(m.file.toLowerCase()));
  const next: InstalledState = {
    revision: pack.revision,
    files: wanted.map((m) => ({ file: m.file, sha256: m.sha256 })),
  };
  if (!changed.length && !removed.length) {
    await beforeCommit();
    await atomicJson(root, join(root, '.overworld', 'state.json'), next);
    return;
  }
  const tx = join(root, '.overworld', 'transactions', Date.now() + '-' + randomUUID());
  await mkdir(tx);
  const staging = join(tx, 'next-mods');
  await cp(join(root, 'mods'), staging, { recursive: true, errorOnExist: true, force: false });
  for (const file of removed) await rm(join(staging, file.file), { force: true });
  for (let i = 0; i < wanted.length; i++) {
    const m = wanted[i];
    if (!changed.includes(m.file)) continue;
    update({
      phase: 'syncing',
      message: `모드 다운로드 및 검증 · ${m.name} (${i + 1}/${wanted.length})`,
    });
    const target = join(staging, m.file);
    await rm(target, { force: true });
    await download(m, target, request);
  }
  update({ phase: 'syncing', message: '검증한 모드 구성을 적용하고 이전 파일을 백업합니다.' });
  await beforeCommit();
  await transaction(root, tx, next);
}
export async function restorePack(
  root: string,
  beforeCommit: () => Promise<void> = async () => {},
) {
  await recover(root);
  const parent = join(root, '.overworld', 'transactions');
  const entries = (await readdir(parent)).sort().reverse();
  for (const id of entries) {
    if (!/^\d+-[a-f0-9-]{36}$/.test(id)) continue;
    const previous = join(parent, id);
    await safeTree(root, previous);
    if (
      !(await exists(join(previous, 'committed'))) ||
      !(await exists(join(previous, 'previous-mods')))
    )
      continue;
    const state = checkedState(
      JSON.parse(await readFile(join(previous, 'previous-state.json'), 'utf8')),
    );
    const tx = join(parent, Date.now() + '-' + randomUUID());
    await mkdir(tx);
    await safeTree(root, join(root, 'mods'));
    const current = await installedState(root);
    const currentNames = new Set(current.files.map((f) => f.file.toLowerCase()));
    for (const file of state.files) {
      if (
        (await exists(join(root, 'mods', file.file))) &&
        !currentNames.has(file.file.toLowerCase())
      )
        throw new Error(
          `개인 파일 ${file.file}과 복원할 파일이 겹칩니다. 먼저 파일을 옮겨 주세요.`,
        );
    }
    const staging = join(tx, 'next-mods');
    await cp(join(root, 'mods'), staging, { recursive: true });
    for (const file of current.files) await rm(join(staging, file.file), { force: true });
    for (const file of state.files) {
      const source = join(previous, 'previous-mods', file.file);
      if (await exists(source)) await cp(source, join(staging, file.file));
    }
    await beforeCommit();
    await transaction(root, tx, state);
    return;
  }
  throw new Error('복원할 이전 모드 구성이 없습니다.');
}
