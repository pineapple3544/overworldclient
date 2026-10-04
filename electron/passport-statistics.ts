import type { PassportStatistics, PlayCounters } from '../src/shared';
const keys = [
  'playSeconds',
  'blocksBroken',
  'blocksPlaced',
  'damageTakenMilli',
  'deaths',
  'mobKills',
  'playerKills',
  'distanceCm',
] as const;
function counters(value: any): PlayCounters {
  if (!value || keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0))
    throw new Error('통계 응답을 확인할 수 없습니다.');
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as PlayCounters;
}
function date(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
export function passportStatistics(value: any): PassportStatistics {
  if (value?.available !== true || !Array.isArray(value.servers) || value.servers.length > 64)
    throw new Error('통계를 불러오지 못했습니다.');
  const seen = new Set<string>();
  return {
    totals: counters(value.totals),
    servers: value.servers.map((s: any) => {
      if (
        !s ||
        typeof s.serverId !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(s.serverId) ||
        typeof s.label !== 'string' ||
        !s.label ||
        s.label.length > 120 ||
        seen.has(s.serverId)
      )
        throw new Error('통계 응답을 확인할 수 없습니다.');
      seen.add(s.serverId);
      return { id: s.serverId, label: s.label, counters: counters(s) };
    }),
    lastCollectedAt: date(value.lastCollectedAt),
    lastSeenAt: date(value.presence?.lastSeenAt),
    online: value.presence?.online === true,
    serverLabel:
      typeof value.presence?.serverLabel === 'string' && value.presence.serverLabel.length <= 120
        ? value.presence.serverLabel
        : null,
  };
}
export function passportSkin(value: any): string | null {
  if (value?.dataUrl === null) return null;
  const data = value?.dataUrl;
  if (
    typeof data !== 'string' ||
    data.length > 350000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new Error('스킨 응답을 확인할 수 없습니다.');
  const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
  if (
    png.length < 33 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    png.toString('ascii', 12, 16) !== 'IHDR' ||
    png.readUInt32BE(16) !== 64 ||
    ![32, 64].includes(png.readUInt32BE(20))
  )
    throw new Error('스킨 응답을 확인할 수 없습니다.');
  return data;
}
