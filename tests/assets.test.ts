import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareAssets, recoverAssets } from '../electron/assets';
import { parseFiles } from '../electron/config';
import { exists } from '../electron/mods';
import type { PackFile } from '../src/shared';
async function temp(t: any) {
  const base = resolve('.test-data', 'assets');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'test-'));
  t.after(async () => {
    if (!dir.startsWith(base + sep)) throw new Error('unsafe cleanup');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
function file(path: string, data: string, policy: PackFile['policy'] = 'managed'): PackFile {
  return {
    path,
    url: 'https://example.com/' + encodeURIComponent(data),
    policy,
    size: Buffer.byteLength(data),
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
const request = (async (url: any) =>
  new Response(decodeURIComponent(new URL(String(url)).pathname.slice(1)))) as typeof fetch;
const quiet = () => {};
async function install(root: string, files: PackFile[]) {
  const tx = await prepareAssets(root, files, quiet, request);
  await tx.apply();
  await tx.finish();
}
test('operator resources update/remove while defaults and personal environment are preserved', async (t) => {
  const root = await temp(t),
    game = join(root, 'game'),
    personal = join(root, 'personal');
  await mkdir(personal);
  await writeFile(join(personal, 'options.txt'), 'personal');
  const options = file('options.txt', 'default', 'default');
  const config = file('config/example/client.json', '{}', 'default');
  await install(game, [file('resourcepacks/school.zip', 'v1'), options, config]);
  await writeFile(join(game, 'options.txt'), 'custom settings');
  await install(game, [
    file('resourcepacks/school.zip', 'v2'),
    file('options.txt', 'changed default', 'default'),
    config,
  ]);
  assert.equal(await readFile(join(game, 'resourcepacks/school.zip'), 'utf8'), 'v2');
  assert.equal(await readFile(join(game, 'options.txt'), 'utf8'), 'custom settings');
  await install(game, []);
  assert.equal(await exists(join(game, 'resourcepacks/school.zip')), false);
  assert.equal(await readFile(join(game, 'config/example/client.json'), 'utf8'), '{}');
  assert.equal(await readFile(join(personal, 'options.txt'), 'utf8'), 'personal');
});
test('asset validation, failed downloads, interrupted apply and external edits protect data', async (t) => {
  const root = await temp(t);
  for (const path of [
    '../options.txt',
    'config/../../options.txt',
    'config/CON.json',
    'config/run.exe',
    'saves/world.json',
  ])
    assert.throws(() => parseFiles([file(path, 'x')]));
  await install(root, [file('resourcepacks/school.zip', 'v1')]);
  await assert.rejects(
    prepareAssets(
      root,
      [{ ...file('resourcepacks/school.zip', 'v2'), sha256: '0'.repeat(64) }],
      quiet,
      request,
    ),
  );
  assert.equal(await readFile(join(root, 'resourcepacks/school.zip'), 'utf8'), 'v1');
  const tx = await prepareAssets(
    root,
    [file('resourcepacks/school.zip', 'v2'), file('options.txt', 'defaults', 'default')],
    quiet,
    request,
  );
  await tx.apply();
  await recoverAssets(root);
  assert.equal(await readFile(join(root, 'resourcepacks/school.zip'), 'utf8'), 'v1');
  assert.equal(await exists(join(root, 'options.txt')), false);
  const late = await prepareAssets(
    root,
    [file('options.txt', 'defaults', 'default')],
    quiet,
    request,
  );
  await writeFile(join(root, 'options.txt'), 'personal change');
  await assert.rejects(late.apply());
  await late.rollback();
  assert.equal(await readFile(join(root, 'options.txt'), 'utf8'), 'personal change');
});
