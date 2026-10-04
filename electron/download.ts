import { open, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { httpsUrl } from './config';
export async function response(url: string, request: typeof fetch = fetch): Promise<Response> {
  for (let i = 0; i < 6; i++) {
    const r = await request(httpsUrl(url), {
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get('location');
      await r.body?.cancel();
      if (!next) throw new Error('다운로드 이동 주소가 없습니다.');
      url = new URL(next, url).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(
        `다운로드에 실패했습니다 (HTTP ${r.status}). 인터넷 연결과 배포 주소를 확인해 주세요.`,
      );
    }
    return r;
  }
  throw new Error('다운로드 주소의 이동 횟수가 너무 많습니다.');
}
export async function fetchJson(url: string, request: typeof fetch = fetch): Promise<unknown> {
  const r = await response(url, request);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!r.body) throw new Error('다운로드 응답이 비어 있습니다.');
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('배포 목록이 너무 큽니다.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function download(
  file: { url: string; size: number; sha256: string },
  destination: string,
  request: typeof fetch = fetch,
) {
  const r = await response(file.url, request);
  if (!r.body) throw new Error('모드 파일 응답이 비어 있습니다.');
  const fd = await open(destination, 'wx');
  const hash = createHash('sha256');
  let count = 0;
  try {
    for await (const chunk of r.body) {
      count += chunk.length;
      if (count > file.size) throw new Error('모드 파일 크기가 배포 목록과 다릅니다.');
      hash.update(chunk);
      await fd.writeFile(chunk);
    }
    if (count !== file.size || hash.digest('hex') !== file.sha256)
      throw new Error('모드 파일 검증에 실패했습니다. 기존 구성은 유지됩니다.');
  } catch (e) {
    await fd.close();
    await rm(destination, { force: true });
    throw e;
  }
  await fd.close();
}
