import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';
import { lobbyAddress, registeredServers, registerLobby } from '../electron/server-connect';
import { prepareProfile, versionId } from '../electron/official';
import { exists } from '../electron/mods';
import type { Pack } from '../src/shared';
const address = 'overworld.flyjung.kr';
const pack: Pack = {
  schemaVersion: 1,
  revision: 'test',
  minecraftVersion: '26.2',
  loader: { kind: 'vanilla' },
  mods: [],
};
async function temp(t: any) {
  const base = resolve('.test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'connection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function servers(data: Buffer) {
  return nbt.simplify(nbt.parseUncompressed(data)).servers;
}
test('the lobby is registered without duplicating its address or losing other server settings', () => {
  const original = nbt.writeUncompressed({
    type: 'compound',
    name: '',
    value: {
      extra: nbt.string('keep root'),
      servers: {
        type: 'list',
        value: {
          type: 'compound',
          value: [
            {
              name: nbt.string('개인 서버'),
              ip: nbt.string('personal.example'),
              icon: nbt.string('keep icon'),
              acceptTextures: nbt.byte(0),
            },
            {
              name: nbt.string('old label'),
              ip: nbt.string('OVERWORLD.FLYJUNG.KR:25565'),
              acceptTextures: nbt.byte(1),
            },
          ],
        },
      },
    },
  });
  const updated = registeredServers(original, 'Overworld', address);
  assert.deepEqual(servers(updated), [
    { name: '개인 서버', ip: 'personal.example', icon: 'keep icon', acceptTextures: 0 },
    { name: 'Overworld', ip: address, acceptTextures: 1 },
  ]);
  assert.equal(nbt.simplify(nbt.parseUncompressed(updated)).extra, 'keep root');
  assert.deepEqual(registeredServers(updated, 'Overworld', address), updated);
  assert.deepEqual(servers(registeredServers(null, 'Overworld', address)), [
    { name: 'Overworld', ip: address },
  ]);
  assert.equal(registeredServers(gzipSync(updated), 'Overworld', address)[0], 0x1f);
  assert.throws(() => registeredServers(Buffer.from('damaged'), 'Overworld', address), /읽지 못/);
  assert.equal(lobbyAddress({ velocityHost: address, velocityPort: 25566 }), address + ':25566');
  assert.throws(() => lobbyAddress({ velocityHost: '../unsafe', velocityPort: 25565 }));
});
test('server list updates back up and roll back, reject active games, damaged data and linked files', async (t) => {
  const root = await temp(t),
    file = join(root, 'servers.dat');
  const original = registeredServers(null, '개인 서버', 'personal.example');
  await writeFile(file, original);
  const rollback = await registerLobby(root, 'Overworld', address, async () => {});
  assert.equal(servers(await readFile(file)).length, 2);
  assert.equal((await readdir(join(root, '.overworld', 'server-backups'))).length, 1);
  await rollback();
  assert.deepEqual(await readFile(file), original);
  await assert.rejects(
    registerLobby(root, 'Overworld', address, async () => {
      throw new Error('game running');
    }),
    /game running/,
  );
  assert.deepEqual(await readFile(file), original);
  await writeFile(file, 'damaged');
  await assert.rejects(
    registerLobby(root, 'Overworld', address, async () => {}),
    /읽지 못/,
  );
  assert.equal(await readFile(file, 'utf8'), 'damaged');
  await rm(file);
  const outside = await temp(t);
  await writeFile(join(outside, 'servers.dat'), original);
  const linked = join(root, 'linked');
  await symlink(outside, linked, 'junction');
  await assert.rejects(
    registerLobby(linked, 'Overworld', address, async () => {}),
    /연결된/,
  );
  assert.deepEqual(await readFile(join(outside, 'servers.dat')), original);
});
test('Quick Play uses a dedicated version and preserves official and loader metadata', async (t) => {
  const root = await temp(t),
    game = join(root, 'game');
  const baseDir = join(root, 'versions', '26.2');
  await mkdir(baseDir, { recursive: true });
  const official = JSON.stringify({
    id: '26.2',
    arguments: { game: ['--username', '${auth_player_name}'] },
  });
  await writeFile(join(baseDir, '26.2.json'), official);
  const profile = { id: 'overworld-managed', name: 'Overworld' };
  const rollback = await prepareProfile(root, game, pack, false, fetch, profile, true, { address });
  const customId = versionId(pack, true),
    customFile = join(root, 'versions', customId, customId + '.json');
  const custom = JSON.parse(await readFile(customFile, 'utf8'));
  assert.equal(custom.inheritsFrom, '26.2');
  assert.equal(custom.jar, '26.2');
  assert.deepEqual(custom.arguments.game, ['--quickPlayMultiplayer', address]);
  assert.equal(
    JSON.parse(await readFile(join(root, 'launcher_profiles.json'), 'utf8')).profiles[profile.id]
      .lastVersionId,
    customId,
  );
  assert.equal(await readFile(join(baseDir, '26.2.json'), 'utf8'), official);
  await prepareProfile(root, game, pack, true, fetch, profile, true, { address });
  await assert.rejects(
    prepareProfile(root, game, pack, true, fetch, profile, true, { address: address + ':25566' }),
    /완전히 종료/,
  );
  await rollback();
  assert.equal(await exists(customFile), false);
  const fabric: Pack = { ...pack, loader: { kind: 'fabric', version: '0.18.0' } };
  await prepareProfile(
    root,
    game,
    fabric,
    false,
    (async () =>
      Response.json({
        id: versionId(fabric),
        inheritsFrom: '26.2',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
        libraries: [{ name: 'fabric-library' }],
        arguments: { game: ['--fabric-example', 'keep'], jvm: ['-Dfabric.example=true'] },
      })) as typeof fetch,
    profile,
    true,
    { address },
  );
  const loader = JSON.parse(
    await readFile(
      join(root, 'versions', versionId(fabric, true), versionId(fabric, true) + '.json'),
      'utf8',
    ),
  );
  assert.equal(loader.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient');
  assert.deepEqual(loader.arguments.game, [
    '--fabric-example',
    'keep',
    '--quickPlayMultiplayer',
    address,
  ]);
  assert.deepEqual(loader.arguments.jvm, ['-Dfabric.example=true']);
});
