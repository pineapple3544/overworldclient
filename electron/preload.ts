import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi, Activity, WebsiteState } from '../src/shared';
const api: LauncherApi = {
  refreshPassport: () => ipcRenderer.invoke('launcher:passport-refresh'),
  logoutPassport: () => ipcRenderer.invoke('launcher:passport-logout'),
  onPassport: (callback) => {
    const listener = (_: unknown, state: import('../src/shared').PassportState) => callback(state);
    ipcRenderer.on('launcher:passport-state', listener);
    return () => ipcRenderer.removeListener('launcher:passport-state', listener);
  },
  websiteAction: (value) => ipcRenderer.invoke('launcher:website-action', value),
  onWebsite: (callback) => {
    const listener = (_: unknown, state: WebsiteState) => callback(state);
    ipcRenderer.on('launcher:website', listener);
    return () => ipcRenderer.removeListener('launcher:website', listener);
  },
  snapshot: () => ipcRenderer.invoke('launcher:snapshot'),
  chooseLauncher: () => ipcRenderer.invoke('launcher:choose-launcher'),
  openLauncher: () => ipcRenderer.invoke('launcher:launcher'),
  downloadLauncher: () => ipcRenderer.invoke('launcher:download-launcher'),
  openDirectory: () => ipcRenderer.invoke('launcher:directory'),
  openBackups: () => ipcRenderer.invoke('launcher:backups'),
  openPassport: () => ipcRenderer.invoke('launcher:passport'),
  openManual: () => ipcRenderer.invoke('launcher:manual'),
  copyAddress: () => ipcRenderer.invoke('launcher:copy-address'),
  saveSettings: (settings) => ipcRenderer.invoke('launcher:settings', settings),
  syncMods: () => ipcRenderer.invoke('launcher:sync'),
  restoreMods: () => ipcRenderer.invoke('launcher:restore'),
  play: () => ipcRenderer.invoke('launcher:play'),
  onActivity: (callback) => {
    const listener = (_: unknown, activity: Activity) => callback(activity);
    ipcRenderer.on('launcher:activity', listener);
    return () => ipcRenderer.removeListener('launcher:activity', listener);
  },
};
contextBridge.exposeInMainWorld('launcher', api);
