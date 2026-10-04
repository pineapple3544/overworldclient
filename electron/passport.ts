import type { PassportState } from '../src/shared';
import { passportStatistics, passportSkin } from './passport-statistics';

type Requester = (url: string, init: RequestInit) => Promise<Response>;
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function emptyPassport(
  status: PassportState['status'] = 'signed-out',
  message: string | null = null,
): PassportState {
  return {
    status,
    displayName: null,
    schoolVerified: false,
    verifiedUntil: null,
    minecraftName: null,
    minecraftUuid: null,
    minecraftSkin: null,
    schoolName: null,
    department: null,
    statistics: null,
    statisticsMessage: null,
    minecraftLinked: false,
    accessSuspended: false,
    privacyAccepted: false,
    allowedServers: [],
    permissionsAvailable: false,
    message,
    updatedAt: null,
  };
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Passport 응답을 확인할 수 없습니다.');
  return value as Record<string, any>;
}
function date(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
function text(value: unknown, max = 120): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}
export function passportProfile(value: unknown, now: number): PassportState {
  const p = object(value);
  if (!text(p.displayName) || !text(p.identityProvider))
    throw new Error('Passport 응답을 확인할 수 없습니다.');
  const verifiedUntil = date(p.universityVerifiedUntil);
  const minecraft = p.minecraft === null ? null : object(p.minecraft);
  const minecraftName = minecraft ? text(minecraft.name, 16) : null;
  if (
    minecraft &&
    (!minecraftName ||
      typeof minecraft.uuid !== 'string' ||
      !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(minecraft.uuid))
  )
    throw new Error('Passport 계정 연결 정보를 확인할 수 없습니다.');
  return {
    ...emptyPassport('signed-in'),
    displayName: p.displayName,
    schoolVerified:
      p.identityProvider === 'usaint' && verifiedUntil !== null && Date.parse(verifiedUntil) > now,
    verifiedUntil,
    minecraftName,
    minecraftUuid: minecraft?.uuid ?? null,
    schoolName: p.identityProvider === 'usaint' ? '숭실대학교' : null,
    department: text(p.department),
    minecraftLinked: minecraft !== null,
    accessSuspended: p.accessSuspended === true,
    privacyAccepted: p.privacyConsent?.accepted === true,
    updatedAt: new Date(now).toISOString(),
  };
}
export class Passport {
  state = emptyPassport('checking');
  private pending?: Promise<PassportState>;
  private lastRead = 0;
  private generation = 0;
  private loggingOut = false;
  private refreshAgain = false;
  constructor(
    readonly origin: string,
    private request: Requester,
    private changed: (state: PassportState) => void,
    private now = Date.now,
  ) {
    const u = new URL(origin);
    if (u.protocol !== 'https:' || u.username || u.password || u.origin !== origin)
      throw new Error('Passport 웹 주소는 HTTPS origin이어야 합니다.');
  }
  private publish(state: PassportState) {
    this.state = state;
    this.changed(state);
    return state;
  }
  private async call(path: string, csrf?: string, limit = 65536): Promise<any> {
    const response = await this.request(this.origin + path, {
      method: csrf ? 'POST' : 'GET',
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        Origin: this.origin,
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
    });
    if (response.status === 204 && response.ok) return null;
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new ApiError(response.status, 'Passport API에 연결하지 못했습니다.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Passport 응답을 확인할 수 없습니다.');
    let size = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > limit) throw new Error('Passport 응답이 너무 큽니다.');
        parts.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const body = object(JSON.parse(Buffer.concat(parts).toString('utf8')));
    if (!response.ok)
      throw new ApiError(
        response.status,
        body.code === 'csrf_invalid'
          ? '로그인 상태가 변경됐습니다. 다시 시도해 주세요.'
          : 'Passport 요청을 완료하지 못했습니다.',
      );
    return body;
  }
  refresh(force = false): Promise<PassportState> {
    if (this.loggingOut) return Promise.resolve(emptyPassport('checking'));
    if (this.pending) {
      if (force) this.refreshAgain = true;
      return this.pending;
    }
    if (!force && this.now() - this.lastRead < 3000) return Promise.resolve(this.state);
    this.lastRead = this.now();
    const generation = this.generation;
    const task = this.read().then((state) =>
      generation === this.generation ? this.publish(state) : emptyPassport('checking'),
    );
    this.pending = task;
    void task.finally(() => {
      if (this.pending === task) this.pending = undefined;
      if (this.refreshAgain && !this.loggingOut) {
        this.refreshAgain = false;
        void this.refresh(true);
      }
    });
    return task;
  }
  private async read(): Promise<PassportState> {
    try {
      const session = await this.call('/v1/auth/session');
      if (typeof session.authenticated !== 'boolean')
        throw new Error('Passport 응답을 확인할 수 없습니다.');
      if (!session.authenticated) return emptyPassport();
      const state = passportProfile(await this.call('/v1/me'), this.now());
      try {
        const response = await this.call('/v1/me/servers');
        if (!Array.isArray(response.servers) || response.servers.length > 64)
          throw new Error('invalid servers');
        const seen = new Set<string>();
        state.allowedServers = response.servers.map((value: unknown) => {
          const s = object(value);
          if (
            !text(s.id, 64) ||
            !/^[a-z][a-z0-9_-]{0,63}$/.test(s.id) ||
            !text(s.label) ||
            seen.has(s.id)
          )
            throw new Error('invalid server');
          seen.add(s.id);
          return { id: s.id, label: s.label };
        });
        state.permissionsAvailable = true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return emptyPassport();
        state.allowedServers = [];
        state.message = '서버 권한을 확인하지 못했습니다.';
      }
      const extras = await Promise.allSettled([
        this.call('/v1/me/stats', undefined, 524288).then(passportStatistics),
        state.minecraftLinked
          ? this.call('/v1/me/minecraft-skin', undefined, 360448).then(passportSkin)
          : Promise.resolve(null),
      ]);
      if (
        extras.some(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof ApiError &&
            result.reason.status === 401,
        )
      )
        return emptyPassport();
      if (extras[0].status === 'fulfilled') state.statistics = extras[0].value;
      else state.statisticsMessage = '플레이 기록을 불러오지 못했습니다.';
      if (extras[1].status === 'fulfilled') state.minecraftSkin = extras[1].value;
      return state;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return emptyPassport();
      return emptyPassport(
        'unavailable',
        error instanceof Error && /[가-힣]/.test(error.message)
          ? error.message
          : 'Passport에 연결하지 못했습니다.',
      );
    }
  }
  async logout(): Promise<PassportState> {
    if (this.loggingOut) throw new Error('로그아웃 처리 중입니다.');
    this.loggingOut = true;
    this.refreshAgain = false;
    this.generation++;
    try {
      await this.pending;
      const session = await this.call('/v1/auth/session');
      if (typeof session.authenticated !== 'boolean')
        throw new Error('Passport 응답을 확인할 수 없습니다.');
      if (session.authenticated) {
        if (typeof session.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.csrfToken))
          throw new Error('Passport 세션을 확인할 수 없습니다.');
        try {
          await this.call('/v1/auth/logout', session.csrfToken);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) throw error;
        }
      }
      return this.publish(emptyPassport());
    } finally {
      this.loggingOut = false;
    }
  }
}
