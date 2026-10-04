# Passport 연동

운영 주소: `https://overworld.flyjung.kr`. `config/launcher.json`의 `passportOrigin`으로 지정하며 HTTPS origin만 사용합니다.

참고: [passport-api 실행 API](https://github.com/underconnor/passport-api/blob/4234fc13422fd5392662d5a09766e3ceac6b591b/docs/runtime-api.md), 학교 인증 및 서버 레지스트리 문서와 같은 커밋의 구현 코드.

## 사용자 흐름

1. 학교 인증 버튼으로 앱 내부의 기존 Passport 웹사이트를 엽니다.
2. 웹사이트에서 개인정보 동의와 학교 로그인을 진행합니다. 런처는 학교 비밀번호를 받지 않습니다.
3. 세션 쿠키 변경, 앱 시작, 창 활성화, 30초 주기 및 수동 새로고침 시 인증을 조회합니다.
4. 인증 후 홈의 인증 카드가 이름·누적 플레이 시간·서버별 플레이 기록을 표시하는 통계 카드로 바뀝니다. 계정 화면은 연결된 Minecraft의 스킨·닉네임·UUID와 학교·학과·인증 만료일을 표시합니다.
5. 로그아웃은 서버 세션을 회수합니다. 실패하면 로그아웃됐다고 표시하지 않습니다.

Microsoft 로그인은 공식 Minecraft Launcher에서 처리합니다. Passport의 Minecraft 계정 연결은 별도이며 서버가 발급한 `/link/:id#token=...` 링크와 게임 내 확인을 거쳐야 합니다. 런처는 학교 동의를 자동 승인하거나 계정 연결을 대신 증명하지 않습니다. 유효한 학교 인증이 없거나 인증 확인에 실패하면 플레이 버튼을 비활성화하며 마우스 호버와 키보드 포커스로 원인을 확인할 수 있습니다. 실행 요청 시 메인 프로세스에서도 인증을 재검증합니다. 최종 입장 권한은 서버가 판단합니다.

## 통신과 보관

- 웹 화면과 API 요청은 `persist:overworld-website` Electron 세션을 공유합니다. 외부 브라우저 로그인은 공유하지 않습니다.
- `GET /v1/auth/session`, `GET /v1/me`, `GET /v1/me/servers`, 본인 통계 `/v1/me/stats`, 본인 스킨 `/v1/me/minecraft-skin`을 조회합니다.
- `POST /v1/auth/logout`은 같은 세션의 최신 CSRF 값과 운영 origin을 사용합니다. 리디렉션은 허용하지 않습니다.
- HttpOnly 쿠키와 CSRF 값은 앱 메인 프로세스에서만 다룹니다. 화면에는 연결된 Minecraft UUID를 전달하며 학번, 쿠키, 인증 토큰은 전달하지 않습니다. 스킨은 Passport가 제공하는 검증된 PNG 데이터로만 표시합니다.
- 세션 만료 시 미인증으로 돌아가고, 통신 실패 시 인증 확인 불가로 표시합니다. 이전 권한을 성공 상태로 재사용하지 않습니다.
- 서버용 `API_SERVICE_TOKEN`과 관리자 인증 정보는 앱에 넣지 않습니다.

학교 이름은 현재 API가 연동한 숭실대학교 u-SAINT를 기준으로 표시합니다. 학과는 `/v1/me.department`를 사용하며 누락 시 추정하지 않습니다. 통계는 본인 API의 누적값과 서버별 플레이 시간입니다. 최근 접속·최근 수집 시각을 구분하며 개별 접속 세션 기록을 만들어내지 않습니다. 통계/스킨 조회 실패는 학교 인증을 취소하지 않으며 통계 실패는 0 대신 오류로 표시합니다.

## 서버 현황의 범위

`GET /v1/me/servers`는 해당 사용자의 허용 서버 목록이며 서버 상태나 접속 인원이 아닙니다. 저장소의 상태 조회는 관리자 전용 API이며 접속 인원을 포함하는 공개 API가 없습니다. 런처의 네 서버 상태와 인원은 예시 데이터를 유지합니다. 운영진이 별도 공개 조회 API를 제공하면 README의 서버 현황 응답 구조로 연결할 수 있습니다.

## 검증

단위 테스트는 만료·미연결·접속 권한 실패·응답 검증·CSRF 로그아웃을 확인합니다. `npm run build` 후 `node tests/passport-electron.mjs`는 로컬 HTTPS 서버에서 실제 HttpOnly 쿠키 송수신을 확인하고, API fixture로 웹 화면과 메인 프로세스의 세션 공유, 자동 갱신, 계정 화면과 로그아웃을 검증합니다. TLS 인증서 생성에는 Git에 포함된 OpenSSL 또는 `PASSPORT_TEST_OPENSSL` 경로를 사용합니다. 테스트 인증서 허용은 테스트 프로세스의 로컬 호스트에만 적용합니다.

운영 API는 Electron 세션의 `GET /v1/auth/session` 요청에 HTTP 200 JSON으로 응답했습니다. 일반 개발 환경 요청에서 발생했던 HTTP 403은 Electron에서는 재현되지 않았습니다. 실제 학교 계정으로 로그인한 뒤의 운영 응답은 아직 검증하지 못했습니다. 사이트 접속은 되지만 인증 확인 불가가 계속되면 `/v1` 프록시 배포와 Cloudflare 정책을 운영진과 확인해야 합니다.
