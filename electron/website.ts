import { BrowserWindow, WebContentsView, session, type WebContents } from 'electron';
import type { WebsiteState } from '../src/shared';

export function allowedWebsite(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export class Website {
  state: WebsiteState = {
    open: false,
    title: '',
    url: '',
    loading: false,
    canGoBack: false,
    error: null,
  };
  private view: WebContentsView | undefined;
  private popups = new Set<BrowserWindow>();
  private readonly browserSession = session.fromPartition('persist:overworld-website');
  constructor(private owner: BrowserWindow) {
    this.browserSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
    this.browserSession.setPermissionCheckHandler(() => false);
    owner.on('resize', () => this.resize());
    owner.on('closed', () => this.close());
  }
  private emit() {
    if (!this.owner.isDestroyed()) this.owner.webContents.send('launcher:website', this.state);
  }
  private resize() {
    if (!this.view || this.owner.isDestroyed()) return;
    const [width, height] = this.owner.getContentSize();
    const sidebar = width <= 760 ? 72 : width <= 1100 ? 190 : 222;
    this.view.setBounds({
      x: sidebar,
      y: 56,
      width: Math.max(1, width - sidebar),
      height: Math.max(1, height - 56),
    });
  }
  private protect(contents: WebContents) {
    contents.on('will-frame-navigate', (details) => {
      if (!allowedWebsite(details.url)) details.preventDefault();
    });
    contents.on('will-navigate', (event, url) => {
      if (!allowedWebsite(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!allowedWebsite(url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (!allowedWebsite(url) && url !== 'about:blank') return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: this.owner,
          width: 900,
          height: 740,
          autoHideMenuBar: true,
          backgroundColor: '#101713',
          webPreferences: {
            session: this.browserSession,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
            preload: undefined,
          },
        },
      };
    });
    contents.on('did-create-window', (popup) => {
      this.popups.add(popup);
      this.protect(popup.webContents);
      popup.on('closed', () => this.popups.delete(popup));
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  }
  open(url: string, title: string) {
    if (!allowedWebsite(url)) throw new Error('웹사이트 주소를 확인해 주세요.');
    if (!this.view) {
      this.view = new WebContentsView({
        webPreferences: {
          session: this.browserSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          webviewTag: false,
        },
      });
      this.owner.contentView.addChildView(this.view);
      this.protect(this.view.webContents);
      const contents = this.view.webContents;
      const update = () => {
        if (!this.state.open || contents.isDestroyed()) return;
        const actual = contents.getURL();
        // Display the page location without authentication codes or URL fragments.
        if (allowedWebsite(actual)) {
          const u = new URL(actual);
          this.state.url =
            u.origin + u.pathname.replace(/(\/v1\/auth\/university\/callback\/)[^/]+/, '$1…');
        }
        this.state.loading = contents.isLoading();
        this.state.canGoBack = contents.navigationHistory.canGoBack();
        this.emit();
      };
      contents.on('did-start-loading', () => {
        this.state.error = null;
        this.view?.setVisible(true);
        update();
      });
      contents.on('did-stop-loading', update);
      contents.on('did-navigate', update);
      contents.on('did-navigate-in-page', update);
      contents.on('did-fail-load', (_e, code, _description, _url, mainFrame) => {
        if (!mainFrame || code === -3 || !this.state.open) return;
        this.state.error = '페이지를 불러오지 못했습니다. 다시 시도해 주세요.';
        this.state.loading = false;
        this.view?.setVisible(false);
        this.emit();
      });
    }
    this.state = { open: true, title, url, loading: true, canGoBack: false, error: null };
    this.resize();
    this.view.setVisible(true);
    this.emit();
    void this.view.webContents.loadURL(url).catch(() => {});
  }
  action(value: unknown) {
    if (!['back', 'reload', 'close'].includes(String(value)))
      throw new Error('허용되지 않은 웹 요청입니다.');
    if (value === 'close') return this.close();
    if (!this.view || this.view.webContents.isDestroyed()) return;
    if (value === 'back' && this.view.webContents.navigationHistory.canGoBack())
      this.view.webContents.navigationHistory.goBack();
    if (value === 'reload') {
      this.state.error = null;
      this.view.setVisible(true);
      if (this.view.webContents.getURL()) this.view.webContents.reload();
      else void this.view.webContents.loadURL(this.state.url).catch(() => {});
    }
  }
  close() {
    for (const popup of this.popups) if (!popup.isDestroyed()) popup.destroy();
    this.popups.clear();
    if (this.view) {
      if (!this.owner.isDestroyed()) this.owner.contentView.removeChildView(this.view);
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
      this.view = undefined;
    }
    this.state = { open: false, title: '', url: '', loading: false, canGoBack: false, error: null };
    this.emit();
  }
}
