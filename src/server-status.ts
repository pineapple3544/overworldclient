import type { ServerOverview } from './shared';
// Replace the provider with the server API later; these are explicitly demo values.
export function demoServerStatus(): ServerOverview {
  return {
    source: 'demo',
    updatedAt: null,
    servers: [
      {
        id: 'peaceful',
        name: '평화야생',
        description: '약탈과 PVP가 허용되지 않는 야생 서버',
        status: 'online',
        players: 0,
        maxPlayers: 40,
      },
      {
        id: 'raid',
        name: '약탈서버',
        description: '약탈과 PVP가 허용되는 야생 서버',
        status: 'online',
        players: 0,
        maxPlayers: 40,
      },
      {
        id: 'build',
        name: '건축서버',
        description: '개발 예정',
        status: 'maintenance',
        players: 0,
        maxPlayers: 40,
      },
      {
        id: 'lobby',
        name: '로비',
        description: '로비 서버',
        status: 'online',
        players: 0,
        maxPlayers: 40,
      },
    ],
  };
}
