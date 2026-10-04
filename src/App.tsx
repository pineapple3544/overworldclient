import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  Home,
  Server,
  Bell,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Play,
  BookOpen,
  ShieldCheck,
  UserRound,
  ChevronRight,
  Check,
  FolderOpen,
  ExternalLink,
  LoaderCircle,
  X,
  AlertCircle,
  Download,
  Monitor,
  RotateCcw,
  Sun,
  Moon,
} from 'lucide-react';
import { previewApi } from './preview';
import type { Snapshot, Settings, Result } from './shared';
import { Landscape } from './Landscape';
import { PlayerSkin } from './PlayerSkin';
import { playBlockedReason, schoolAuthenticated } from './passport-access';
import officialLogo from '../docs/overworld.png';
import whiteLogo from '../docs/overworld_logo.png';
const api = window.launcher ?? previewApi;
type Page = 'home' | 'servers' | 'news' | 'account' | 'settings';
const navigation = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'servers', label: '서버', icon: Server },
  { id: 'news', label: '소식', icon: Bell },
] as const;
function playTime(seconds: number) {
  return `${Math.floor(seconds / 3600).toLocaleString()}시간 ${Math.floor((seconds % 3600) / 60)}분`;
}
function recordTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
function Logo() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <img src={officialLogo} alt="" />
    </span>
  );
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export default function App() {
  const [data, setData] = useState<Snapshot>();
  const [page, setPage] = useState<Page>('home');
  const [toast, setToast] = useState<{ text: string; error: boolean }>();
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Settings>();
  useLayoutEffect(() => {
    if (draft) document.documentElement.dataset.theme = draft.theme;
  }, [draft?.theme]);
  useEffect(() => {
    if (!data) return;
    // Only cache the saved preference; settings.json remains authoritative.
    try {
      localStorage.setItem('overworld-theme', data.settings.theme);
    } catch {
      /* Cache is optional. */
    }
  }, [data?.settings.theme]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = window.setTimeout(() => setToast(undefined), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  async function refresh() {
    const result = await api.snapshot();
    if (result.ok) {
      setData(result.value);
      setDraft((previous) => previous ?? result.value.settings);
    } else setToast({ text: result.error, error: true });
  }
  useEffect(() => {
    void refresh().then(() => api.refreshPassport());
    return api.onActivity((activity) =>
      setData((previous) => (previous ? { ...previous, activity } : previous)),
    );
  }, []);
  useEffect(
    () =>
      api.onWebsite((website) =>
        setData((previous) => (previous ? { ...previous, website } : previous)),
      ),
    [],
  );
  useEffect(
    () =>
      api.onPassport((passport) =>
        setData((previous) => (previous ? { ...previous, passport } : previous)),
      ),
    [],
  );
  async function action<T>(operation: () => Promise<Result<T>>, success?: string) {
    setPending(true);
    setToast(undefined);
    try {
      const result = await operation();
      if (!result.ok) setToast({ text: result.error, error: true });
      else if (success) setToast({ text: success, error: false });
      await refresh();
      return result;
    } catch {
      setToast({ text: '런처와 연결하지 못했습니다. 앱을 다시 실행해 주세요.', error: true });
    } finally {
      setPending(false);
    }
  }
  if (!data || !draft)
    return (
      <div className="loading">
        <Logo />
        <p>{toast?.text ?? 'Overworld를 준비하고 있어요.'}</p>
        {toast && <button onClick={() => void refresh()}>다시 시도</button>}
      </div>
    );
  const { config, launcher, activity, pack } = data;
  const passport = data.passport;
  const linkedAccount = passport.status === 'signed-in' && passport.minecraftLinked;
  const passportLabel =
    passport.status === 'checking'
      ? '인증 확인 중'
      : passport.status === 'unavailable'
        ? '인증 확인 불가'
        : passport.status === 'signed-out'
          ? '학교 인증 필요'
          : passport.schoolVerified
            ? '학교 인증 완료'
            : '학교 재인증 필요';
  const passportUntil = passport.verifiedUntil
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(Date.parse(passport.verifiedUntil) - 1))
    : null;
  const connected = Boolean(launcher.executable || launcher.appId);
  async function choose() {
    const result = await action(() => api.chooseLauncher());
    if (result?.ok && result.value) setDraft(result.value);
  }
  const busy = pending || activity.phase === 'launching' || activity.phase === 'syncing';
  const settingsChanged = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const authenticated = schoolAuthenticated(passport);
  const blockedReason =
    playBlockedReason(passport) ?? (busy ? '게임 실행을 준비하고 있습니다.' : null);
  const titles: Record<Page, [string, string]> = {
    home: ['메인 화면', ''],
    servers: ['서버 현황', ''],
    news: ['소식/공지', ''],
    account: ['계정', ''],
    settings: ['설정', ''],
  };
  function start() {
    if (blockedReason) return;
    void action(() => api.play());
  }
  const playText = busy ? '준비 중' : '플레이';
  async function navigate(next: Page) {
    if (data?.website.open) await action(() => api.websiteAction('close'));
    setPage(next);
  }
  return (
    <div className="app-shell">
      {data.website.open && (
        <section className="website-panel" aria-label="클라이언트 브라우저">
          <div className="website-toolbar">
            <button
              aria-label="웹 뒤로 가기"
              disabled={!data.website.canGoBack}
              onClick={() => void action(() => api.websiteAction('back'))}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              aria-label="웹 새로고침"
              onClick={() => void action(() => api.websiteAction('reload'))}
            >
              <RotateCcw size={17} />
            </button>
            <strong>{data.website.title}</strong>
            <span>{data.website.url}</span>
            {data.website.loading && <LoaderCircle className="spin" size={17} />}
            <button
              aria-label="웹 닫기"
              onClick={() => void action(() => api.websiteAction('close'))}
            >
              <X size={20} />
            </button>
          </div>
          {data.website.error && (
            <div className="website-error">
              <AlertCircle size={28} />
              <p>{data.website.error}</p>
              <button
                className="secondary-button"
                onClick={() => void action(() => api.websiteAction('reload'))}
              >
                다시 시도
              </button>
            </div>
          )}
        </section>
      )}
      <aside className="sidebar">
        <button className="brand" onClick={() => void navigate('home')} aria-label="Overworld 홈">
          <Logo />
          <span>
            OVERWORLD<small>Launcher</small>
          </span>
        </button>
        <nav aria-label="주 메뉴">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => void navigate(id)}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-label={label}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={19} />
              {label}
              {id === 'news' && config.announcements.length > 0 && (
                <span className="count">{config.announcements.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            aria-label="설정"
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => void navigate('settings')}
          >
            <Settings2 size={19} />
            설정
          </button>
          <button
            className="nav-item"
            aria-label="이용 가이드"
            onClick={() => void action(() => api.openManual())}
          >
            <BookOpen size={19} />
            이용 가이드
            <ArrowUpRight className="push" size={15} />
          </button>
          <button
            className={`sidebar-profile ${page === 'account' ? 'selected' : ''}`}
            aria-label="계정"
            aria-current={page === 'account' ? 'page' : undefined}
            onClick={() => void navigate('account')}
          >
            <span className="avatar">
              {linkedAccount ? (
                <PlayerSkin skin={passport.minecraftSkin} name={passport.minecraftName} headOnly />
              ) : (
                <UserRound size={20} />
              )}
            </span>
            <span>
              <strong title={linkedAccount ? (passport.minecraftName ?? undefined) : undefined}>
                {linkedAccount ? passport.minecraftName : '계정'}
              </strong>
              <small title={linkedAccount ? (passport.department ?? undefined) : undefined}>
                {linkedAccount ? (passport.department ?? '학과 정보 없음') : passportLabel}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            OVERWORLD <b>/</b> {page === 'home' ? '런처' : titles[page][0]}
          </span>
          <div>
            <span className="edition">
              <span /> JAVA EDITION
            </span>
            <span className="version">v{data.appVersion}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <h1>{titles[page][0]}</h1>
            </div>
            {data.preview && <span className="build-tag">브라우저 미리보기</span>}
          </div>
          {page === 'home' && (
            <>
              <section className="hero">
                <Landscape />
                <div className="hero-shade" />
                <div className="hero-content">
                  <span className="hero-label">MINECRAFT {pack.minecraftVersion}</span>
                  <h2>오버월드 런처</h2>
                  <button className="light-button" onClick={() => setPage('servers')}>
                    서버 상태 확인하기
                    <ArrowRight size={17} />
                  </button>
                </div>
                <span className="hero-caption">OVERWORLD</span>
              </section>
              <div className="home-grid">
                <Card className="start-card">
                  <div className="section-title">
                    <h2>{authenticated ? '통계' : '인증'}</h2>
                    {authenticated ? (
                      <button
                        className="text-button"
                        disabled={pending}
                        onClick={() => void action(() => api.refreshPassport())}
                      >
                        <RotateCcw size={13} /> 새로고침
                      </button>
                    ) : null}
                  </div>
                  {authenticated ? (
                    <div className="player-statistics">
                      <div className="statistics-person">
                        <strong>{passport.displayName}</strong>
                        <small>{passport.minecraftName ?? 'Minecraft 연결 필요'}</small>
                      </div>
                      {passport.statistics ? (
                        <>
                          <div className="statistics-summary">
                            <div>
                              <small>플레이 시간</small>
                              <strong>{playTime(passport.statistics.totals.playSeconds)}</strong>
                            </div>
                            <div>
                              <small>블록 설치 / 파괴</small>
                              <strong>
                                {passport.statistics.totals.blocksPlaced.toLocaleString()} /{' '}
                                {passport.statistics.totals.blocksBroken.toLocaleString()}
                              </strong>
                            </div>
                          </div>
                          <div className="play-records" aria-label="서버별 플레이 기록">
                            {passport.statistics.servers.map((server) => (
                              <div key={server.id}>
                                <span>{server.label}</span>
                                <strong>{playTime(server.counters.playSeconds)}</strong>
                              </div>
                            ))}
                          </div>
                          <small className="last-play">
                            {passport.statistics.online
                              ? `${passport.statistics.serverLabel ?? '서버'} · 접속 중`
                              : passport.statistics.lastSeenAt
                                ? `최근 접속 · ${recordTime(passport.statistics.lastSeenAt)}`
                                : passport.statistics.lastCollectedAt
                                  ? `최근 기록 · ${recordTime(passport.statistics.lastCollectedAt)}`
                                  : '아직 수집된 플레이 기록이 없어요.'}
                          </small>
                        </>
                      ) : (
                        <p className="passport-message">
                          {passport.statisticsMessage ?? '플레이 기록을 불러오지 못했습니다.'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button className="step" onClick={() => void action(() => api.openPassport())}>
                      <span className="step-icon">
                        <ShieldCheck size={21} />
                      </span>
                      <span>
                        <strong>
                          {passport.schoolVerified ? '학교 인증 완료' : '학교 인증하기'}
                        </strong>
                        <small>
                          {passport.status === 'signed-in'
                            ? passport.displayName
                            : passport.status === 'unavailable'
                              ? '인증 상태 확인 불가'
                              : 'usaint를 통해 인증'}
                        </small>
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  )}
                </Card>
                <Card className="news-card">
                  <div className="section-title">
                    <h2>소식/공지</h2>
                    <button className="text-button" onClick={() => setPage('news')}>
                      전체 보기
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  {config.announcements.length ? (
                    config.announcements.slice(0, 2).map((item) => (
                      <button className="news-row" key={item.id} onClick={() => setPage('news')}>
                        <span className="tag">{item.category}</span>
                        <strong>{item.title}</strong>
                        <small>{item.date}</small>
                      </button>
                    ))
                  ) : (
                    <div className="empty-news">
                      <Bell size={25} />
                      <strong>아직 소식/공지가 없어요 :(</strong>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
          {page === 'servers' && (
            <div className="server-status-page">
              <div className="notice neutral">
                <AlertCircle size={18} />
                <span>
                  <strong>
                    {data.serverStatus.source === 'demo'
                      ? '연동 전 · 예시 데이터'
                      : data.serverStatus.source === 'unavailable'
                        ? '서버 상태를 불러오지 못했어요'
                        : '서버 실시간 상태'}
                  </strong>
                  {data.serverStatus.source !== 'demo' && (
                    <span>
                      {data.serverStatus.updatedAt
                        ? '마지막 확인: ' +
                          new Date(data.serverStatus.updatedAt).toLocaleTimeString()
                        : '접속 인원을 확인할 수 없습니다.'}
                    </span>
                  )}
                </span>
              </div>
              <div className="network-summary">
                <div>
                  <h2>Overworld Network</h2>
                  <p>{config.velocityHost}</p>
                </div>
                <div className="network-count">
                  <strong>
                    {data.serverStatus.servers.some((s) => s.players === null)
                      ? '—'
                      : data.serverStatus.servers.reduce((sum, s) => sum + (s.players ?? 0), 0)}
                  </strong>
                  <span>
                    {data.serverStatus.source === 'demo'
                      ? '명 · 예시 합계'
                      : '명 · 서버별 인원 합계'}
                  </span>
                </div>
              </div>
              <div className="server-grid">
                {data.serverStatus.servers.map((server, index) => (
                  <section className={'card network-card server-' + server.id} key={server.id}>
                    <div className="section-title">
                      <span className="server-number">0{index + 1}</span>
                      <span className={'status-pill status-' + server.status}>
                        <span />
                        {
                          {
                            online: '온라인',
                            offline: '오프라인',
                            maintenance: '점검 중',
                            unknown: '확인 불가',
                          }[server.status]
                        }
                      </span>
                    </div>
                    <div className="network-title">
                      <Server size={28} />
                      <h2>{server.name}</h2>
                    </div>
                    <p>{server.description}</p>
                    <div className="population">
                      <div>
                        <span>접속 인원</span>
                        <strong>
                          {server.players ?? '—'}
                          <small> / {server.maxPlayers ?? '—'}명</small>
                        </strong>
                      </div>
                      <span className="tag">
                        {data.serverStatus.source === 'demo' ? '예시' : 'JAVA'}
                      </span>
                    </div>
                    <div className="population-track" aria-hidden="true">
                      <i
                        style={{
                          width:
                            server.players !== null && server.maxPlayers
                              ? Math.min(100, (server.players / server.maxPlayers) * 100) + '%'
                              : '0%',
                        }}
                      />
                    </div>
                  </section>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => void action(() => api.copyAddress(), '서버 주소를 복사했습니다.')}
                >
                  접속 주소 복사
                </button>
                <span className="fine-print">로비에 접속한 뒤 원하는 서버로 이동하세요.</span>
              </div>
            </div>
          )}
          {page === 'news' && (
            <div className="announcements">
              {config.announcements.length ? (
                config.announcements.map((item) => (
                  <Card key={item.id}>
                    <div className="section-title">
                      <span className="tag">{item.category}</span>
                      <time>{item.date}</time>
                    </div>
                    <h2>{item.title}</h2>
                    <p className="announcement-body">{item.body}</p>
                  </Card>
                ))
              ) : (
                <Card className="empty-page">
                  <Bell size={37} />
                  <h2>아직 소식/공지가 없어요 :( </h2>
                </Card>
              )}
            </div>
          )}
          {page === 'account' && (
            <div className="account-grid">
              <Card>
                <div className="account-title">
                  <span className="account-symbol">
                    <UserRound size={26} />
                  </span>
                  <div>
                    <h2>Minecraft 계정</h2>
                  </div>
                </div>
                <div className="minecraft-identity">
                  <PlayerSkin skin={passport.minecraftSkin} name={passport.minecraftName} />
                  <div className="account-details">
                    <strong>{passport.minecraftName ?? '연결된 계정 없음'}</strong>
                    {passport.minecraftUuid ? (
                      <>
                        <small>UUID</small>
                        <span className="minecraft-uuid">{passport.minecraftUuid}</span>
                      </>
                    ) : (
                      <span>
                        {authenticated
                          ? 'Passport에서 계정을 연결해 주세요.'
                          : '학교 인증 후 연결을 확인하세요.'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => void action(() => api.openPassport())}
                  >
                    <ExternalLink size={16} />
                    Passport에서 연결 확인
                  </button>
                </div>
              </Card>
              <Card>
                <div className="account-title">
                  <span className="account-symbol passport">
                    <ShieldCheck size={27} />
                  </span>
                  <div>
                    <h2>{passport.schoolName ?? '학교 인증'}</h2>
                  </div>
                </div>
                <p>{passportLabel}</p>
                <div className="passport-visual">
                  <img
                    className="passport-official-logo"
                    src={whiteLogo}
                    alt="Overworld 공식 로고"
                  />
                  <strong>
                    Overworld
                    <br />
                    Passport
                  </strong>
                  <span>OVERWORLD / SCHOOL VERIFICATION</span>
                </div>
                <div className="school-identity">
                  <span className="eyebrow">학과</span>
                  <strong>{passport.department ?? '학과 정보 없음'}</strong>
                  {passport.displayName && <span>{passport.displayName}</span>}
                </div>
                {passport.status === 'signed-in' && (
                  <div className="passport-details">
                    {passportUntil && <span>학교 인증 · {passportUntil}까지</span>}
                    {passport.accessSuspended ? (
                      <span>접속 정지</span>
                    ) : (
                      passport.permissionsAvailable && (
                        <span>
                          접속 가능 ·{' '}
                          {passport.allowedServers.map((server) => server.label).join(', ') ||
                            '없음'}
                        </span>
                      )
                    )}
                    {!passport.privacyAccepted && <span>개인정보 동의 갱신 필요</span>}
                  </div>
                )}
                {passport.message && <p className="passport-message">{passport.message}</p>}
                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => void action(() => api.openPassport())}
                  >
                    {passport.status === 'signed-in' ? 'Passport 열기' : 'Passport로 인증하기'}
                    <ExternalLink size={16} />
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => void action(() => api.refreshPassport())}
                  >
                    인증 새로고침
                  </button>
                  {passport.status === 'signed-in' && (
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={() =>
                        void action(() => api.logoutPassport(), 'Passport에서 로그아웃했습니다.')
                      }
                    >
                      로그아웃
                    </button>
                  )}
                </div>
              </Card>
            </div>
          )}
          {page === 'settings' && (
            <div className="settings-stack">
              <Card className="launch-settings">
                <div className="section-title">
                  <h2>기본 설정</h2>
                  <button
                    className="secondary-button"
                    disabled={busy || !settingsChanged}
                    onClick={() =>
                      void action(() => api.saveSettings(draft), '설정을 저장했습니다.')
                    }
                  >
                    <Check size={16} /> 설정 저장
                  </button>
                </div>
                <div className="setting-row theme-setting">
                  <strong>화면 모드</strong>
                  <fieldset className="theme-options">
                    <legend className="sr-only">화면 모드</legend>
                    {(['dark', 'light'] as const).map((theme) => (
                      <label key={theme}>
                        <input
                          type="radio"
                          name="theme"
                          value={theme}
                          checked={draft.theme === theme}
                          onChange={() => setDraft({ ...draft, theme })}
                        />
                        <span>
                          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                          {theme === 'dark' ? '다크 모드' : '라이트 모드'}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </div>
                <div className="setting-row divider">
                  <strong>Minecraft 자동 실행</strong>
                  <button
                    role="switch"
                    aria-label="Minecraft 자동 실행"
                    aria-checked={draft.autoPlay}
                    className={'switch ' + (draft.autoPlay ? 'on' : '')}
                    onClick={() => setDraft({ ...draft, autoPlay: !draft.autoPlay })}
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row divider">
                  <strong>런처를 연 뒤 Overworld 최소화</strong>
                  <button
                    role="switch"
                    aria-label="런처를 연 뒤 Overworld 최소화"
                    aria-checked={draft.minimizeOnLaunch}
                    className={'switch ' + (draft.minimizeOnLaunch ? 'on' : '')}
                    onClick={() =>
                      setDraft({ ...draft, minimizeOnLaunch: !draft.minimizeOnLaunch })
                    }
                  >
                    <span />
                  </button>
                </div>
              </Card>

              <Card>
                <div className="section-title">
                  <h2>
                    <Monitor size={18} />
                    전용 공식 런처
                  </h2>
                  <span>{connected ? '프로그램 연결됨' : '자동 준비'}</span>
                </div>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void action(() => api.openLauncher())}
                  >
                    <ExternalLink size={16} />
                    Minecraft 연결
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void action(() => api.snapshot())}
                  >
                    <RotateCcw size={14} />
                    연결 새로고침
                  </button>
                </div>
                <details className="advanced-settings">
                  <summary>경로 설정</summary>
                  <label className="field-label spaced" htmlFor="launcher-path">
                    런처 실행 파일
                  </label>
                  <div className="path-input">
                    <input
                      id="launcher-path"
                      value={
                        launcher.executable || (launcher.appId ? 'Minecraft' : draft.launcherPath)
                      }
                      readOnly
                      placeholder="첫 실행 시 자동 다운로드"
                    />
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void choose()}
                    >
                      실행 파일 선택
                    </button>
                  </div>
                  <label className="field-label spaced" htmlFor="minecraft-data">
                    Minecraft 경로
                  </label>
                  <div className="path-input">
                    <input id="minecraft-data" value={launcher.minecraftDirectory} readOnly />
                  </div>
                </details>
                {launcher.issue && (
                  <div className="notice">
                    <AlertCircle size={17} />
                    <span>{launcher.issue}</span>
                  </div>
                )}
              </Card>
              <Card>
                <div className="section-title">
                  <h2>
                    <FolderOpen size={18} />
                    게임 폴더
                  </h2>
                  <span>{launcher.profileReady ? '프로필 준비됨' : '프로필 준비 필요'}</span>
                </div>
                <p className="setup-copy">Minecraft {pack.minecraftVersion}</p>
                <div className="path-input">
                  <input aria-label="Overworld 게임 폴더" value={data.gameDirectory} readOnly />
                  <button
                    className="secondary-button"
                    onClick={() => void action(() => api.openDirectory())}
                  >
                    폴더 열기
                  </button>
                </div>
                <p className="fine-print">
                  {launcher.versionInstalled
                    ? '런처에서 이 버전의 설치 정보를 찾았습니다.'
                    : '게임과 Java 파일은 공식 런처의 첫 플레이 때 다운로드됩니다.'}{' '}
                </p>
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const result = await api.saveSettings(draft);
                        if (!result.ok) return result;
                        return api.syncMods();
                      }, '게임 환경이 준비됐습니다.')
                    }
                  >
                    <Download size={16} />
                    환경 설정
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void action(() => api.copyAddress(), '서버 주소를 복사했습니다.')
                    }
                  >
                    서버 주소 복사
                  </button>
                </div>
              </Card>
            </div>
          )}
        </main>
        <footer className="playbar">
          <div className="selected-server">
            <span className="server-symbol">
              <Logo />
            </span>
            <div>
              <strong>
                {config.serverName}
                <span>JAVA</span>
              </strong>
              <small>
                {pack.minecraftVersion
                  ? `Minecraft ${pack.minecraftVersion}`
                  : '게임 버전 설정 대기'}{' '}
              </small>
            </div>
          </div>
          <div className="play-status" role="status">
            <span
              className={
                activity.phase === 'error' ? 'error-dot' : blockedReason ? 'pending-dot' : ''
              }
            />
            <p>
              {activity.phase === 'error' || busy
                ? activity.message
                : blockedReason
                  ? passportLabel
                  : activity.message}
            </p>
          </div>
          {!authenticated && !busy && (
            <button
              className="text-button play-auth"
              onClick={() => void action(() => api.openPassport())}
            >
              <ShieldCheck size={16} /> 학교 인증
            </button>
          )}
          <div
            className="play-control"
            tabIndex={blockedReason ? 0 : undefined}
            aria-describedby={blockedReason ? 'play-blocked-reason' : undefined}
          >
            <button
              className="play-button"
              disabled={!!blockedReason}
              aria-describedby={blockedReason ? 'play-blocked-reason' : undefined}
              onClick={start}
            >
              {busy ? (
                <LoaderCircle className="spin" size={20} />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              {playText}
            </button>
            {blockedReason && (
              <span className="play-tooltip" id="play-blocked-reason" role="tooltip">
                {blockedReason}
              </span>
            )}
          </div>
        </footer>
      </div>
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="alert">
          {toast.error ? <AlertCircle size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
