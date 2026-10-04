import { copyFile, mkdir, readFile, rename, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';
import { safe, exists } from './mods';
import type { PublicConfig } from '../src/shared';

export function lobbyAddress(config: Pick<PublicConfig, 'velocityHost' | 'velocityPort'>) {
  if (
    !/^[A-Za-z0-9.-]+$/.test(config.velocityHost) ||
    !Number.isInteger(config.velocityPort) ||
    config.velocityPort < 1 ||
    config.velocityPort > 65535
  )
    throw new Error('로비 주소를 확인해 주세요.');
  return config.velocityHost + (config.velocityPort === 25565 ? '' : ':' + config.velocityPort);
}
function normalized(address: string) {
  return address
    .trim()
    .toLowerCase()
    .replace(/:25565$/, '');
}

export function registeredServers(original: Buffer | null, name: string, address: string): Buffer {
  if (!name || name.length > 120 || !address || address.length > 255)
    throw new Error('서버 정보를 확인해 주세요.');
  const compressed = original?.[0] === 0x1f && original?.[1] === 0x8b;
  const bytes = compressed
    ? gunzipSync(original!, { maxOutputLength: 16 * 1024 * 1024 })
    : original;
  if (bytes && bytes.length > 16 * 1024 * 1024) throw new Error('서버 목록이 너무 큽니다.');
  let root: nbt.NBT;
  try {
    root = bytes ? nbt.parseUncompressed(bytes, 'big') : { type: 'compound', name: '', value: {} };
  } catch {
    throw new Error('기존 서버 목록을 읽지 못했습니다. servers.dat를 확인해 주세요.');
  }
  if (root.type !== 'compound' || !root.value)
    throw new Error('기존 서버 목록 형식을 확인해 주세요.');
  const tag = root.value.servers;
  if (
    tag &&
    (tag.type !== 'list' ||
      !['compound', 'end'].includes(tag.value.type) ||
      !Array.isArray(tag.value.value) ||
      tag.value.value.length > 1024)
  )
    throw new Error('기존 서버 목록 형식을 확인해 주세요.');
  const entries = tag ? (tag.value.value as nbt.Compound['value'][]) : [];
  if (
    entries.some((entry) => !entry || entry.ip?.type !== 'string' || entry.name?.type !== 'string')
  )
    throw new Error('기존 서버 목록 형식을 확인해 주세요.');
  const found = entries.find(
    (entry) => normalized(entry.ip!.value as string) === normalized(address),
  );
  if (found) {
    if (found.name!.value === name && found.ip!.value === address) return original!;
    found.name = nbt.string(name);
    found.ip = nbt.string(address);
  } else entries.unshift({ name: nbt.string(name), ip: nbt.string(address) });
  root.value.servers = { type: 'list', value: { type: 'compound', value: entries } };
  const output = nbt.writeUncompressed(root, 'big');
  return compressed ? gzipSync(output) : output;
}

export async function registerLobby(
  gameDirectory: string,
  name: string,
  address: string,
  assertClosed: () => Promise<void>,
) {
  const file = join(gameDirectory, 'servers.dat');
  await safe(gameDirectory, file);
  await mkdir(gameDirectory, { recursive: true });
  if ((await exists(file)) && (await stat(file)).size > 16 * 1024 * 1024)
    throw new Error('서버 목록이 너무 큽니다.');
  const original = (await exists(file)) ? await readFile(file) : null;
  const output = registeredServers(original, name, address);
  if (original?.equals(output)) return async () => {};
  await assertClosed();
  const current = (await exists(file)) ? await readFile(file) : null;
  if (original ? !current?.equals(original) : current !== null)
    throw new Error('서버 목록이 변경됐습니다. Minecraft를 종료하고 다시 시도해 주세요.');
  const backup = join(
    gameDirectory,
    '.overworld',
    'server-backups',
    Date.now() + '-' + randomUUID() + '.dat',
  );
  if (original) {
    await safe(gameDirectory, backup);
    await mkdir(join(gameDirectory, '.overworld', 'server-backups'), { recursive: true });
    await copyFile(file, backup, 1);
  }
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, output, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
  return async () => {
    await safe(gameDirectory, file);
    await assertClosed();
    if (!(await readFile(file)).equals(output))
      throw new Error(
        '서버 목록이 외부에서 변경되어 복구하지 못했습니다. .overworld/server-backups를 확인해 주세요.',
      );
    if (original) {
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, original, { flag: 'wx' });
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
    } else await rm(file);
  };
}
