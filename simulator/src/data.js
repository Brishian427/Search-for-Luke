export const PALETTE = {
  chart: {
    background: 0xf6ecbe,
    ink: 0x1d2240,
    grid: 0x485074,
    star: 0x384266,
    route: 0x26365c,
    label: '#1D2240',
  },
  space: {
    background: 0x050711,
    ink: 0xd9e7ff,
    grid: 0x3e5377,
    star: 0xe9f2ff,
    route: 0x74b5ff,
    label: '#E9F2FF',
  },
};

export const LOCATIONS = {
  azure: {
    id: 'azure',
    name: 'Azure',
    position: [-13.5, 0, 1],
    radius: 2.2,
    color: 0x487db5,
    description: 'A quiet blue world of high plateaus and weathered stone.',
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    position: [13.5, 0, -7.5],
    radius: 3.2,
    color: 0xd99d42,
    description: 'A vast golden giant wrapped in slow, luminous cloud bands.',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    position: [18.5, 0, 8.5],
    radius: 1.7,
    color: 0xb94d42,
    description: 'A small red planet circled by a delicate ring of ice.',
  },
  shoal: {
    id: 'shoal',
    name: 'The Shoal',
    position: [2, 0, 11.2],
    radius: 5,
    color: 0x766d68,
    description: 'A broad crescent of ancient rock drifting through the system.',
  },
  verdant: {
    id: 'verdant',
    name: 'Verdant',
    position: [-22.5, 0, -13],
    radius: 1.6,
    color: 0x4f936b,
    description: 'A green frontier world served by a tiny orbital station.',
  },
  rime: {
    id: 'rime',
    name: 'Rime',
    position: [24, 0, -15],
    radius: 4.3,
    color: 0xaad7e8,
    description: 'A cold, luminous cloud at the edge of the mapped system.',
  },
};

export const LOCATION_LIST = Object.values(LOCATIONS);
export const LAST_CONFIRMED = [-7, 0, -1];
export const NETWORK_STATION = [-30, 0, 20];

export const ROUTE_CONTROLS = {
  azure: [[-7, 0, -1], [-9, 0.2, 0], [-12, 0.4, 1], [-13.5, 0, 1]],
  amber: [[-7, 0, -1], [-1, 0.8, -1.8], [6, 0.4, -4.6], [13.5, 0, -7.5]],
  crimson: [[-7, 0, -1], [-1, 0.8, 3], [8, 1.1, 6.5], [18.5, 0, 8.5]],
  shoal: [[-7, 0, -1], [-5, 0.8, 4], [-1, 0.9, 8.5], [2, 0, 11.2]],
  verdant: [[-7, 0, -1], [-11, 1, -4], [-17, 0.5, -9], [-22.5, 0, -13]],
  rime: [[-7, 0, -1], [1, 0.8, -2.5], [9, 0.6, -6], [14, 0.3, -7.4], [19, 0.4, -11], [24, 0, -15]],
};
