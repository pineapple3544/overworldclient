# Overworld Launcher 0.5.2

Overworld가 공지·학교 인증과 전용 모드 구성을 관리하고, 공식 Minecraft Launcher가 Microsoft 로그인·게임 설치·실행을 담당합니다. Prism이나 Microsoft 앱 등록은 필요하지 않습니다.

## 설치와 사용

배포 설치파일은 [GitHub Releases](https://github.com/pineapple3544/overworldclient/releases/latest)에서 받을 수 있습니다. 비공개 저장소이므로 접근 권한이 있는 GitHub 계정으로 로그인해야 합니다. 파일당 50MB 미만이 필요하면 분할 압축 파일 3개를 모두 같은 폴더에 받은 뒤 `.7z.001`을 7-Zip으로 열어 압축을 풀면 됩니다.

**설정 → 화면 모드**에서 다크·라이트 모드를 선택하고 **설정 저장**을 누르면 다음 실행에도 유지됩니다. 기본값은 다크 모드입니다.

1. `release/Overworld Launcher Setup 0.5.2.exe`를 실행해 설치합니다.
2. 홈의 **학교 인증하기**에서 학교 인증을 진행합니다. 인증 전·만료·확인 실패 시 플레이 버튼은 잠기며 마우스를 올리면 이유가 표시됩니다.
3. 처음 **플레이**를 누르면 서명된 공식 런처를 내려받고 Overworld 전용 환경을 준비합니다. 열린 공식 런처에서 Microsoft 로그인과 Java Edition 초기 설정을 마칩니다.
4. 이후 **플레이**를 누를 때 운영진의 모드·리소스팩·설정 파일을 확인하고 전용 환경을 갱신합니다.
5. **플레이**를 누르면 공식 런처의 Overworld 프로필과 활성화된 플레이 버튼을 확인한 뒤 자동으로 누릅니다. 게임이 시작되면 `overworld.flyjung.kr` 로비로 자동 접속합니다. 감지하지 못하면 공식 런처에서 직접 플레이하세요. 필요한 게임·Java 파일은 공식 런처가 준비합니다.
6. 연결을 끊은 뒤에는 **멀티플레이 → Overworld**를 선택하면 다시 접속할 수 있습니다. 서버 목록은 전용 게임 폴더에 자동 등록됩니다.

Overworld 버튼은 학교 인증을 확인하고 모드를 준비한 뒤 공식 런처를 여는 기능입니다. 자동 플레이는 기본 켜짐이며 **설정 → Minecraft 자동 실행**에서 끌 수 있습니다. 최초 Microsoft 로그인과 서버 입장은 공식 런처와 게임에서 진행합니다. Microsoft 로그인 상태나 게임 이용 권한은 공식 런처가 확인합니다. 학교 인증 후 홈에는 본인 통계가 표시되고, 계정 화면에는 연결된 Minecraft의 스킨·닉네임·UUID와 학교·학과가 표시됩니다.

공식 런처 실행 파일과 설치 설정은 `%APPDATA%\Overworld Launcher\official-launcher`에 준비합니다. 공식 배포 서버의 Minecraft.exe를 HTTPS로 다운로드하고 Mojang/Microsoft의 유효한 Authenticode 서명을 검사합니다. 실행 시 `--workDir`과 `--lockDir`에 전용 폴더를 전달합니다. Store 런처의 개인 데이터 폴더를 재사용하지 않습니다. 최초 로그인은 공식 런처에서 진행하며 기존 로그인 파일은 복사하지 않습니다.

전용 폴더의 설치 설정에 Overworld 프로필을 등록하고 선택 상태를 기록합니다. 공식 런처가 기본 항목을 재생성할 수 있습니다. 프로필을 갱신해야 할 때 전용 공식 런처가 열려 있으면 닫은 뒤 다시 실행하세요. 개인용 런처의 설치 설정과 기존 CurseForge 데이터는 수정하지 않습니다.

## 내장 웹 화면

학교 인증·이용 가이드·다운로드 웹페이지는 앱 안에서 엽니다. 사이드바는 계속 사용할 수 있으며 메뉴를 누르면 웹 화면을 닫고 선택한 화면으로 이동합니다. 뒤로 가기·새로고침·닫기를 지원합니다. 로그인 쿠키는 별도 앱 세션에 보관되며 외부 브라우저와 공유하지 않습니다. 인증 팝업도 앱에 연결된 창으로 열립니다. Passport 인증 상태·학교 인증 만료일·Minecraft 연결·허용 서버·로그아웃을 계정 화면에 연결했습니다. 실제 학교 계정 로그인은 추가 확인이 필요합니다. 자세한 내용은 [Passport 연동](docs/passport-integration.md)을 참고하세요.

## 게임 폴더와 모드 관리

- 전용 게임 폴더: `%APPDATA%\Overworld Launcher\game` (기존 데이터 유지)
- 관리 기록: 전용 폴더의 `.overworld/state.json`
- 백업: 전용 폴더의 `.overworld/transactions`
- 현재 기본 구성: Minecraft **26.2 바닐라**, 배포 모드 없음

앱이 배포한 모드만 추가·교체·제거합니다. 개인 모드와 파일명이 겹치면 덮어쓰지 않고 작업을 중단합니다. SHA-256과 파일 크기를 확인한 뒤 적용하며, 다운로드 실패 시 기존 모드 구성을 유지합니다. 필수 모드는 항상 적용하고 선택 모드는 저장된 disabledMods 설정을 따릅니다. 현재 UI에는 선택 모드 토글을 제공하지 않습니다.

모드 폴더를 교체하기 전에 이전 구성을 백업하고 복구 기록을 남깁니다. 앱이 중단되면 다음 준비 작업에서 파일 교체를 복구합니다. **이전 모드 구성 복원**은 관리 대상 모드를 되돌리고 개인 파일을 유지합니다. 다음 동기화에서는 운영진의 최신 배포 목록이 다시 적용됩니다. 백업은 자동 삭제하지 않으므로 오래된 백업은 백업 폴더에서 정리할 수 있습니다.

Minecraft 실행 중에는 동기화와 복원을 차단합니다. 다운로드 직후에도 실행 상태를 다시 확인합니다. 업데이트 중에 다른 앱에서 게임을 실행하지 마세요. 연결된 폴더(심볼릭 링크·정션)는 자동 변경 대상에서 제외합니다.

공식 런처의 `overworld-managed` 프로필을 전용 게임 폴더에 연결합니다. 전용 폴더 안의 설치 설정만 관리하며 개인 런처 설정은 유지합니다. 사용자는 인스턴스를 생성하거나 선택하지 않습니다. 0.4.0에서 생성한 추가 인스턴스 폴더는 삭제하지 않으며 이후 실행 대상으로 사용하지 않습니다.

모드·리소스팩·설정·월드는 전용 폴더에 저장됩니다. 공식 런처의 게임 바이너리·라이브러리·로그인 설정도 전용 런처 폴더를 사용합니다. 자동 플레이는 전용 폴더로 실행된 공식 런처만 대상으로 Windows 접근성 버튼을 호출합니다. 공식 런처의 설치 설정 메뉴 항목을 지원하며, 매크로 스크립트는 app.asar.unpacked에 실제 파일로 배치합니다. 최대 25초 동안 확인하며 로그인·체험판 화면, 다른 프로필, 버튼 감지 실패 시 직접 플레이하도록 안내합니다. 클릭 성공과 실제 게임 실행은 구분해 표시합니다.

## 리소스팩과 기본 설정 배포

모드 배포 목록의 선택 항목 `files`로 함께 배포합니다. 파일 URL·SHA-256·바이트 크기를 지정합니다.

```json
"files": [
  { "path": "resourcepacks/school.zip", "url": "https://your-domain.example/school.zip", "sha256": "실제-SHA256-64자리", "size": 12345, "policy": "managed" },
  { "path": "options.txt", "url": "https://your-domain.example/options.txt", "sha256": "실제-SHA256-64자리", "size": 1234, "policy": "default" },
  { "path": "config/example/client.json", "url": "https://your-domain.example/client.json", "sha256": "실제-SHA256-64자리", "size": 123, "policy": "default" }
]
```

- `managed`: 운영진 파일을 갱신하고 목록에서 제외되면 제거합니다. 같은 경로의 개인 파일은 덮어쓰지 않습니다.
- `default`: 파일이 없을 때 처음 한 번만 배치합니다. 이후 사용자 설정과 의도적인 파일 삭제를 유지합니다.
- 경로는 `resourcepacks/*.zip`, `config/` 아래 설정 파일, `options.txt`를 지원합니다. ZIP은 압축을 풀지 않습니다.
- 리소스팩 ZIP 배치만으로 활성화되지는 않습니다. 새 환경의 기본 활성화가 필요하면 호환되는 `options.txt`에 리소스팩 선택을 포함해 배포하세요. 기존 사용자 설정은 유지합니다.
- 파일 검증 후 적용하며 실패·중단 시 복구합니다. 백업은 전용 폴더의 `.overworld/asset-backups`에 보관합니다. 기존 모드 복원 기능은 모드에만 적용됩니다.

## 모드 배포 설정

`config/launcher.json`의 `modManifestUrl`이 빈 문자열이면 함께 배포된 `config/modpack.json`을 사용합니다. HTTPS URL을 지정하면 매 준비·플레이 시 해당 주소의 최신 목록을 읽습니다. 원격 목록을 가져오지 못하면 실행 준비를 중단합니다. 모드 배포 웹 서버 자체는 이 앱에 포함되지 않습니다.

배포 목록 예시(아래 주소와 해시는 실제 값으로 교체):

```json
{
  "schemaVersion": 1,
  "revision": "school-pack-1",
  "minecraftVersion": "26.2",
  "loader": { "kind": "fabric", "version": "호환되는-Fabric-로더-버전" },
  "mods": [
    {
      "id": "example-mod",
      "name": "모드 표시 이름",
      "file": "example-mod.jar",
      "url": "https://your-domain.example/mods/example-mod.jar",
      "sha256": "실제-파일의-SHA256-64자리-소문자",
      "size": 123456,
      "optional": false
    }
  ]
}
```

- 모드 추가: 목록에 항목 추가
- 버전 변경: 파일 URL·SHA-256·크기를 새 파일에 맞게 수정하고 revision 변경
- 모드 제외: 목록에서 삭제. 기존 관리 기록에 있던 모드만 제거됨
- 선택 모드: `optional: true`로 지정. 기본값은 활성화
- 필수 의존 모드도 모두 목록에 포함해야 함. 자동 의존성 해결은 지원하지 않음
- 파일당 최대 128MB, 전체 2GB, 최대 300개
- 서버가 배포하는 JAR 파일이므로 신뢰할 수 있는 배포 위치와 정확한 해시를 사용

Windows 파일 정보 확인:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\example-mod.jar'
(Get-Item -LiteralPath '.\example-mod.jar').Length
```

로더 종류:

- `{"kind":"vanilla"}`: 모드 없는 구성
- `{"kind":"fabric","version":"정확한 버전"}`: Fabric 공식 메타데이터로 런처 버전을 등록. 게임과 라이브러리 다운로드는 공식 런처 담당
- `{"kind":"installed","versionId":"설치된 로더 ID"}`: 공식 런처에 이미 설치된 NeoForge·Forge 등의 버전 사용. 설치된 버전이 26.2를 상속하는지 검사

현재 26.2용 Fabric·NeoForge와 실제 모드의 호환성은 검증하지 않았습니다. 모드가 정해지면 로더와 의존성을 함께 검증해야 합니다. Fabric API가 필요한 모드는 Fabric API도 목록에 포함하세요.

## 서버 상태 및 접속 인원

서버 화면에 **평화야생·약탈서버·건축서버·로비**를 표시합니다. 상태는 온라인·오프라인·점검 중·확인 불가, 인원은 현재/최대 인원을 지원합니다. **현재 상태와 인원은 명시적으로 표시된 예시 데이터입니다.** 실제 서버를 조회하지 않습니다.

예시 제공 함수: `src/server-status.ts`의 `demoServerStatus`. 추후 서버 소스를 받으면 Electron의 snapshot 공급부를 실제 API로 교체합니다. 응답 구조는 `src/shared.ts`의 `ServerOverview`:

```json
{
  "source": "live",
  "updatedAt": "2026-10-04T00:00:00Z",
  "servers": [
    {
      "id": "peaceful",
      "name": "평화야생",
      "description": "평화로운 생존 공간",
      "status": "online",
      "players": 12,
      "maxPlayers": 100
    }
  ]
}
```

실제 구현에서 각 서버의 데이터를 네 항목으로 반환하고, 조회 실패 시 `source: unavailable`, 해당 서버의 `status: unknown`, 인원은 `null`로 표시해야 합니다. 합계는 서버별 접속 인원의 단순 합계입니다.

## 개발 및 검증

```powershell
npm ci
npm run dev
npm test
npm run test:electron
npm run package:win
node tests/packaged-smoke.mjs
```

`npm run build` 후 `npm start`로 빌드된 앱을 실행할 수 있습니다. `npm run preview`는 UI 미리보기입니다. 개발 중에는 `config/launcher.local.json`으로 설정을 덮어쓸 수 있습니다. 배포 시에는 `launcher.json`과 `modpack.json`을 수정하고 다시 빌드하세요.

단위 검증은 모드 변경·검증 실패·백업 복원·중단 복구·개인 파일 보호·경로 검증과 공식 프로필 보존을 검사합니다. Electron 검증은 임시 게임 폴더에서 프로필 생성, 설정 저장, 네 서버 상태 화면과 접속 인원, 내장 웹 화면, 렌더러 격리를 확인합니다. 최초 Microsoft 로그인과 실제 서버 입장은 추가 확인이 필요합니다. 자동 클릭은 UI Automation과 CEF의 MSAA 접근성 정보를 지원합니다. 이 PC의 공식 런처에서 자동 클릭 후 Minecraft 26.2 게임 창과 전용 Java 프로세스 생성을 확인했습니다. 다른 런처 버전과 언어에서 버튼을 감지하지 못하면 직접 플레이하도록 안내합니다. 실패 기록은 전용 런처 폴더의 auto-play-status.json에 결과 코드와 시간만 저장하며 계정·토큰은 기록하지 않습니다.

원격 공지 API, 실제 서버 상태·인원 API와 런처 자동 업데이트는 후속 연동 대상입니다. Passport API의 허용 서버 목록은 접속 인원과 별개이며 관리자 API는 런처에서 사용하지 않습니다. 기존 Prism 데이터와 기존 Overworld 게임 데이터는 이전하거나 삭제하지 않습니다. 이전 버전의 Overworld Microsoft 로그인 캐시는 앱 시작 시 정리합니다.

