import type { PassportState } from './shared';
export function schoolAuthenticated(state: PassportState, now = Date.now()): boolean {
  return (
    state.status === 'signed-in' &&
    state.schoolVerified &&
    state.verifiedUntil !== null &&
    Date.parse(state.verifiedUntil) > now
  );
}
export function playBlockedReason(state: PassportState, now = Date.now()): string | null {
  if (state.status === 'checking') return '학교 인증 상태를 확인하고 있습니다.';
  if (state.status === 'unavailable')
    return '학교 인증 상태를 확인할 수 없습니다. 인증을 새로고침해 주세요.';
  if (!schoolAuthenticated(state, now))
    return state.status === 'signed-in'
      ? '학교 인증이 만료됐습니다. 다시 인증해 주세요.'
      : '학교 계정 인증 후 플레이할 수 있습니다.';
  return null;
}
