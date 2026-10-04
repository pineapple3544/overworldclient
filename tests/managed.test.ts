import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  rename,
  symlink,
  readdir,
} from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import {
  parsePack,
  parseConfig,
  migrateSettings,
  defaultSettings,
  validateSettings,
} from '../electron/config';
import { syncPack, restorePack, installedState, recover, exists } from '../electron/mods';
import { prepareProfile } from '../electron/official';
import { isolatedArguments, launcherPaths } from '../electron/isolated';
import config from '../config/launcher.json';
import type { Pack, ModFile } from '../src/shared';
const base = resolve('.test-data', 'unit');
async function temp(t: any) {
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'run-'));
  t.after(async () => {
    if (!dir.startsWith(base + sep)) throw new Error('unsafe cleanup');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
const bytes: Record<string, string> = {
  'https://cdn.example/a': 'first mod',
  'https://cdn.example/b': 'second mod',
  'https://cdn.example/v2': 'new first mod',
};
const request = (async (url: any) =>
  new Response(bytes[String(url)] ?? 'wrong content')) as typeof fetch;
function mod(id: string, url: string, optional = false): ModFile {
  return {
    id,
    name: id,
    file: id + '.jar',
    url,
    sha256: createHash('sha256').update(bytes[url]).digest('hex'),
    size: Buffer.byteLength(bytes[url]),
    optional,
  };
}
function pack(mods: ModFile[], revision = 'r1'): Pack {
  return {
    schemaVersion: 1,
    revision,
    minecraftVersion: '26.2',
    loader: { kind: 'fabric', version: '0.18.0' },
    mods,
  };
}
const noop = () => {};
test('automatic play defaults on for existing settings and retains an explicit off choice', () => {
  const { autoPlay, ...legacy } = defaultSettings;
  assert.equal(validateSettings(legacy).autoPlay, true);
  assert.equal(validateSettings({ ...legacy, autoPlay: false }).autoPlay, false);
  assert.throws(() => validateSettings({ ...legacy, autoPlay: 'true' }));
});

test('existing installations keep dark mode and only supported themes can be saved', () => {
  const { theme, ...legacy } = defaultSettings;
  assert.equal(validateSettings(legacy).theme, 'dark');
  assert.equal(validateSettings({ ...legacy, theme: 'light' }).theme, 'light');
  assert.throws(() => validateSettings({ ...legacy, theme: 'invalid' }));
});
test('dedicated official launcher owns its profile selection without changing personal installations', async (t) => {
  const root = await temp(t);
  const personal = join(root, 'personal');
  await mkdir(personal);
  const untouched = JSON.stringify({
    profiles: { personal: { name: 'My own game' } },
    selectedProfile: 'personal',
  });
  await writeFile(join(personal, 'launcher_profiles.json'), untouched);
  const managed = launcherPaths(root);
  const game = join(root, 'game');
  const p: Pack = {
    schemaVersion: 1,
    revision: 'base',
    minecraftVersion: '26.2',
    loader: { kind: 'vanilla' },
    mods: [],
  };
  await prepareProfile(
    managed.directory,
    game,
    p,
    false,
    request,
    { id: 'overworld-managed', name: 'Overworld' },
    true,
  );
  const profile = JSON.parse(
    await readFile(join(managed.directory, 'launcher_profiles.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(profile.profiles), ['overworld-managed']);
  assert.equal(profile.selectedProfile, 'overworld-managed');
  assert.equal(profile.profiles['overworld-managed'].gameDir, game);
  assert.equal(await readFile(join(personal, 'launcher_profiles.json'), 'utf8'), untouched);
  assert.deepEqual(isolatedArguments(managed.directory), [
    '--workDir',
    managed.directory,
    '--lockDir',
    managed.directory,
    '--force-renderer-accessibility',
  ]);
});
test('pack validation prevents unsafe file paths, duplicates and invalid loader combinations', () => {
  const m = mod('a', 'https://cdn.example/a');
  for (const patch of [
    { file: '../escape.jar' },
    { file: 'CON.jar' },
    { url: 'http://cdn.example/a' },
    { sha256: 'wrong' },
    { size: -1 },
  ])
    assert.throws(() => parsePack(pack([{ ...m, ...patch }]), '26.2'));
  assert.throws(() => parsePack(pack([m, { ...m, id: 'b', file: 'A.jar' }]), '26.2'));
  assert.throws(() => parsePack({ ...pack([m]), loader: { kind: 'vanilla' } }, '26.2'));
  assert.equal(parseConfig(config).velocityHost, 'overworld.flyjung.kr');
  assert.deepEqual(migrateSettings({ prismPath: 'old', minimizeOnLaunch: true }), {
    ...defaultSettings,
    minimizeOnLaunch: true,
  });
});
test('sync adds, updates, removes owned mods and restores backups while retaining personal files', async (t) => {
  const root = await temp(t);
  await mkdir(join(root, 'mods'));
  await writeFile(join(root, 'mods', 'personal.jar'), 'user file');
  const a = mod('a', 'https://cdn.example/a'),
    b = mod('b', 'https://cdn.example/b', true);
  await syncPack(root, pack([a, b]), ['b'], noop, request);
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'first mod');
  assert.equal(await exists(join(root, 'mods', 'b.jar')), false);
  await syncPack(root, pack([mod('a', 'https://cdn.example/v2'), b], 'r2'), [], noop, request);
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'new first mod');
  assert.equal((await installedState(root)).revision, 'r2');
  await syncPack(root, pack([b], 'r3'), [], noop, request);
  assert.equal(await exists(join(root, 'mods', 'a.jar')), false);
  assert.equal(await readFile(join(root, 'mods', 'personal.jar'), 'utf8'), 'user file');
  await writeFile(join(root, 'mods', 'personal.jar'), 'updated by user');
  await writeFile(join(root, 'mods', 'new-personal.jar'), 'new user file');
  await restorePack(root);
  assert.equal(await readFile(join(root, 'mods', 'personal.jar'), 'utf8'), 'updated by user');
  assert.equal(await readFile(join(root, 'mods', 'new-personal.jar'), 'utf8'), 'new user file');
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'new first mod');
  assert.equal((await installedState(root)).revision, 'r2');
});
test('corrupt downloads and a game starting during download do not change current mods', async (t) => {
  const root = await temp(t);
  const a = mod('a', 'https://cdn.example/a');
  await syncPack(root, pack([a]), [], noop, request);
  const next = pack([mod('a', 'https://cdn.example/v2')], 'r2');
  await assert.rejects(
    syncPack(root, next, [], noop, (async () => new Response('bad')) as typeof fetch),
    /검증|크기/,
  );
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'first mod');
  assert.equal((await installedState(root)).revision, 'r1');
  await assert.rejects(
    syncPack(root, next, [], noop, request, async () => {
      throw new Error('game running');
    }),
    /game running/,
  );
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'first mod');
});
test('personal filename collisions and folder junctions cannot be overwritten', async (t) => {
  const root = await temp(t);
  await mkdir(join(root, 'mods'));
  await writeFile(join(root, 'mods', 'a.jar'), 'personal');
  await assert.rejects(
    syncPack(root, pack([mod('a', 'https://cdn.example/a')]), [], noop, request),
    /개인 파일/,
  );
  const outside = await temp(t);
  await writeFile(join(outside, 'precious.txt'), 'keep');
  await symlink(outside, join(root, 'mods', 'linked'), 'junction');
  await assert.rejects(syncPack(root, pack([]), [], noop, request), /연결된/);
  assert.equal(await readFile(join(outside, 'precious.txt'), 'utf8'), 'keep');
});
test('interrupted directory swap recovers the previous mods and state', async (t) => {
  const root = await temp(t);
  await syncPack(root, pack([mod('a', 'https://cdn.example/a')]), [], noop, request);
  const id = Date.now() + '-' + randomUUID(),
    tx = join(root, '.overworld', 'transactions', id);
  await mkdir(tx);
  await writeFile(join(tx, 'previous-state.json'), JSON.stringify(await installedState(root)));
  await writeFile(join(root, '.overworld', 'pending.json'), JSON.stringify({ id }));
  await rename(join(root, 'mods'), join(tx, 'previous-mods'));
  await mkdir(join(root, 'mods'));
  await writeFile(join(root, 'mods', 'incomplete.jar'), 'new');
  await recover(root);
  assert.equal(await readFile(join(root, 'mods', 'a.jar'), 'utf8'), 'first mod');
  assert.equal(await exists(join(root, 'mods', 'incomplete.jar')), false);
  assert.equal(await exists(join(tx, 'interrupted-mods', 'incomplete.jar')), true);
});
test('official profile setup preserves existing profiles and requires launcher shutdown for changes', async (t) => {
  const root = await temp(t),
    game = join(root, 'dedicated');
  const file = join(root, 'launcher_profiles_microsoft_store.json');
  const original = {
    profiles: { personal: { name: 'My world', lastVersionId: '1.21.1' } },
    settings: { keep: true },
  };
  await writeFile(file, JSON.stringify(original));
  const vanilla: Pack = { ...pack([]), loader: { kind: 'vanilla' } };
  await assert.rejects(prepareProfile(root, game, vanilla, true), /완전히 종료/);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), original);
  await prepareProfile(root, game, vanilla, false);
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(data.profiles.personal, original.profiles.personal);
  assert.equal(data.profiles['overworld-managed'].gameDir, game);
  assert.equal(data.profiles['overworld-managed'].lastVersionId, '26.2');
  assert.ok((await readdir(root)).some((x) => x.endsWith('.bak')));
  await prepareProfile(root, game, vanilla, true);
  const fabric = pack([]);
  await prepareProfile(root, game, fabric, false, (async () =>
    Response.json({ id: 'fabric-loader-0.18.0-26.2', inheritsFrom: '26.2' })) as typeof fetch);
  assert.equal(
    await exists(
      join(root, 'versions', 'fabric-loader-0.18.0-26.2', 'fabric-loader-0.18.0-26.2.json'),
    ),
    true,
  );
});
