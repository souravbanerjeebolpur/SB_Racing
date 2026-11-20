export type CarId =
  | 'sb-01-apex'
  | 'sb-02-vortex'
  | 'sb-03-titan'
  | 'sb-04-viper'
  | 'sb-05-phantom'
  | 'sb-06-valkyrie'
  | 'sb-07-nova'
  | 'sb-08-kraken'
  | 'sb-09-ronin'
  | 'sb-10-solaris'
  | 'sb-11-spectre'
  | 'sb-12-tempest'
  | 'sb-13-obsidian'
  | 'sb-14-zenith'
  | 'sb-15-mirage'
  | 'sb-16-cyber'
  | 'sb-17-monarch'
  | 'sb-18-emperor';

export type CarBodyStyle =
  | 'coupe'
  | 'widebody'
  | 'lemans'
  | 'hyper'
  | 'cyber'
  | 'prototype';

export type TrackId = 'apex-circuit' | 'harbor-touge' | 'palm-causeway';
export type WeatherType = 'clear' | 'rain' | 'fog';
export type GamePhase =
  | 'title'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'ceremony'
  | 'finished';
export type CameraMode = 'chase' | 'drift' | 'hood' | 'aerial';

export interface WeatherSpec {
  id: WeatherType;
  label: string;
  shortLabel: string;
  roadGripMult: number;
  drivingTip: string;
}

export const WEATHER_SPECS: Record<WeatherType, WeatherSpec> = {
  clear: {
    id: 'clear',
    label: 'CLEAR SKIES',
    shortLabel: 'CLEAR',
    roadGripMult: 1.0,
    drivingTip: 'DRY ASPHALT · FULL GRIP',
  },
  rain: {
    id: 'rain',
    label: 'LIGHT RAIN',
    shortLabel: 'RAIN',
    roadGripMult: 0.78,
    drivingTip: 'WET ROAD · BRAKE EARLY & FEATHER THROTTLE',
  },
  fog: {
    id: 'fog',
    label: 'COASTAL FOG',
    shortLabel: 'FOG',
    roadGripMult: 0.88,
    drivingTip: 'LOW VISIBILITY · WATCH MINIMAP & APEXES',
  },
};

export type UpgradeKey = 'engine' | 'nitro' | 'handling' | 'aero';

export interface CarUpgrades {
  engine: number;   // 0..5
  nitro: number;    // 0..5
  handling: number; // 0..5
  aero: number;     // 0..5
}

export const DEFAULT_UPGRADES: CarUpgrades = {
  engine: 0,
  nitro: 0,
  handling: 0,
  aero: 0,
};

export interface CarSpec {
  id: CarId;
  shortName: string;
  name: string;
  subtitle: string;
  bodyStyle: CarBodyStyle;
  unlockLevel: number;   // 1 = unlocked from start; 2..11 = unlocked by completing level (unlockLevel - 1)
  primaryColor: number;
  accentColor: number;
  hexPrimary: string;
  hexAccent: string;
  mass: number;          // kg
  engineForce: number;   // N
  topSpeedKmh: number;
  driftBalance: number;  // 0.68 - 0.90 (lower = easier snap oversteer)
  steerResponse: number;
  nitroPowerMult?: number;
  stats: {
    speed: number;       // 0-100 display
    acceleration: number;
    driftControl: number;
  };
}

export interface TrackSpec {
  id: TrackId;
  name: string;
  location: string;
  lengthLabel: string;
  totalLaps: number;
  roadHalfWidth: number;
  atmosphere: 'sunset' | 'twilight' | 'tropical';
  description: string;
}

export interface LevelSpec {
  level: number;
  name: string;
  difficultyLabel: string;
  recommendedTrack: TrackId;
  laps: number;
  racerCount: number;
  aiSkillMin: number;
  aiSkillMax: number;
  rewardCredits: number;
  unlockCarId: CarId;
  featuredAiCars: CarId[];
  description: string;
}

export interface PodiumDriverInfo {
  place: 1 | 2 | 3;
  driverName: string;
  carId: CarId;
  carName: string;
  hexPrimary: string;
  hexAccent: string;
  isPlayer: boolean;
  finishTimeMs: number;
}

export interface LeaderboardEntry {
  id: string;
  driverName: string;
  carId: CarId;
  trackId: TrackId;
  bestLapMs: number;
  totalRaceMs: number;
  driftScore: number;
  maxSpeedKmh: number;
  createdAt: string;
}

export interface RaceTelemetry {
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  nitro: number;           // 0..100
  isBoosting: boolean;
  isDrifting: boolean;
  slipAngleDeg: number;
  activeDriftPoints: number;
  driftMultiplier: number;
  totalDriftScore: number;
  lap: number;
  totalLaps: number;
  position: number;        // 1..8
  totalRacers: number;
  level: number;
  currentLapMs: number;
  bestLapMs: number | null;
  totalRaceMs: number;
  lastLapMs: number | null;
  wrongWay: boolean;
  countdownValue: number;  // 3, 2, 1, 0 (GO)
  maxSpeedKmh: number;
  cameraMode: CameraMode;
  minimapNorm: { x: number; y: number; heading: number }[];
  playerProgress: number;
  bannerMessage: string | null;
  weather: WeatherType;
  weatherTarget: WeatherType;
  rainIntensity: number;   // 0..1
  fogIntensity: number;    // 0..1
  roadGripPct: number;     // 78..100
  podiumTop3?: PodiumDriverInfo[];
  ceremonyStep?: number;   // 1 (3rd), 2 (2nd), 3 (1st), 4 (celebrate)
  ceremonyHeadline?: string;
  ceremonySubtext?: string;
}

export const CAR_SPECS: CarSpec[] = [
  // --- 8 Base Starter Cars (Unlocked Immediately) ---
  {
    id: 'sb-01-apex',
    shortName: 'APEX',
    name: 'SB-01 APEX GT',
    subtitle: 'Balanced Track Coupe',
    bodyStyle: 'coupe',
    unlockLevel: 1,
    primaryColor: 0xd91c2b,
    accentColor: 0xf4f4f5,
    hexPrimary: '#d91c2b',
    hexAccent: '#f4f4f5',
    mass: 1280,
    engineForce: 13800,
    topSpeedKmh: 278,
    driftBalance: 0.80,
    steerResponse: 1.0,
    stats: { speed: 84, acceleration: 85, driftControl: 90 },
  },
  {
    id: 'sb-02-vortex',
    shortName: 'VORTEX',
    name: 'SB-02 VORTEX RS',
    subtitle: 'High-Angle Drift Spec',
    bodyStyle: 'widebody',
    unlockLevel: 1,
    primaryColor: 0x0ea5e9,
    accentColor: 0xfacc15,
    hexPrimary: '#0ea5e9',
    hexAccent: '#facc15',
    mass: 1190,
    engineForce: 13400,
    topSpeedKmh: 268,
    driftBalance: 0.72,
    steerResponse: 1.14,
    stats: { speed: 80, acceleration: 87, driftControl: 96 },
  },
  {
    id: 'sb-03-titan',
    shortName: 'TITAN',
    name: 'SB-03 TITAN V10',
    subtitle: 'Twin-Turbo Interceptor',
    bodyStyle: 'hyper',
    unlockLevel: 1,
    primaryColor: 0xf59e0b,
    accentColor: 0x18181b,
    hexPrimary: '#f59e0b',
    hexAccent: '#18181b',
    mass: 1380,
    engineForce: 15500,
    topSpeedKmh: 294,
    driftBalance: 0.84,
    steerResponse: 0.94,
    stats: { speed: 92, acceleration: 90, driftControl: 83 },
  },
  {
    id: 'sb-04-viper',
    shortName: 'VIPER',
    name: 'SB-04 VIPER R',
    subtitle: 'Lightweight Touge Spec',
    bodyStyle: 'widebody',
    unlockLevel: 1,
    primaryColor: 0x10b981,
    accentColor: 0xe2e8f0,
    hexPrimary: '#10b981',
    hexAccent: '#e2e8f0',
    mass: 1155,
    engineForce: 13100,
    topSpeedKmh: 274,
    driftBalance: 0.75,
    steerResponse: 1.10,
    stats: { speed: 82, acceleration: 88, driftControl: 94 },
  },
  {
    id: 'sb-05-phantom',
    shortName: 'PHANTOM',
    name: 'SB-05 PHANTOM S',
    subtitle: 'AWD Drift Prototype',
    bodyStyle: 'cyber',
    unlockLevel: 1,
    primaryColor: 0x8b5cf6,
    accentColor: 0x38bdf8,
    hexPrimary: '#8b5cf6',
    hexAccent: '#38bdf8',
    mass: 1260,
    engineForce: 14300,
    topSpeedKmh: 284,
    driftBalance: 0.78,
    steerResponse: 1.04,
    stats: { speed: 87, acceleration: 89, driftControl: 89 },
  },
  {
    id: 'sb-06-valkyrie',
    shortName: 'VALKYRIE',
    name: 'SB-06 VALKYRIE',
    subtitle: 'Aero Endurance GT',
    bodyStyle: 'lemans',
    unlockLevel: 1,
    primaryColor: 0xf4f4f5,
    accentColor: 0xe11d48,
    hexPrimary: '#f4f4f5',
    hexAccent: '#e11d48',
    mass: 1305,
    engineForce: 14800,
    topSpeedKmh: 290,
    driftBalance: 0.83,
    steerResponse: 0.98,
    stats: { speed: 90, acceleration: 89, driftControl: 86 },
  },
  {
    id: 'sb-07-nova',
    shortName: 'NOVA',
    name: 'SB-07 NOVA DRIFT',
    subtitle: 'Pro D1 Slide Machine',
    bodyStyle: 'widebody',
    unlockLevel: 1,
    primaryColor: 0xec4899,
    accentColor: 0xf8fafc,
    hexPrimary: '#ec4899',
    hexAccent: '#f8fafc',
    mass: 1175,
    engineForce: 13500,
    topSpeedKmh: 271,
    driftBalance: 0.70,
    steerResponse: 1.15,
    stats: { speed: 81, acceleration: 87, driftControl: 98 },
  },
  {
    id: 'sb-08-kraken',
    shortName: 'KRAKEN',
    name: 'SB-08 KRAKEN GT',
    subtitle: 'Coastal Nitro Hypercar',
    bodyStyle: 'hyper',
    unlockLevel: 1,
    primaryColor: 0x06b6d4,
    accentColor: 0x84cc16,
    hexPrimary: '#06b6d4',
    hexAccent: '#84cc16',
    mass: 1350,
    engineForce: 15800,
    topSpeedKmh: 298,
    driftBalance: 0.82,
    steerResponse: 0.97,
    stats: { speed: 94, acceleration: 92, driftControl: 85 },
  },

  // --- 10 Cool Stylish Career-Level Reward Cars (Unlocked after completing Levels 1..10) ---
  {
    id: 'sb-09-ronin',
    shortName: 'RONIN',
    name: 'SB-09 RONIN GT-R',
    subtitle: 'Lvl 1 Reward · Street Drift Coupe',
    bodyStyle: 'widebody',
    unlockLevel: 2,
    primaryColor: 0x2563eb,
    accentColor: 0xf97316,
    hexPrimary: '#2563eb',
    hexAccent: '#f97316',
    mass: 1185,
    engineForce: 14700,
    topSpeedKmh: 288,
    driftBalance: 0.73,
    steerResponse: 1.12,
    stats: { speed: 89, acceleration: 91, driftControl: 96 },
  },
  {
    id: 'sb-10-solaris',
    shortName: 'SOLARIS',
    name: 'SB-10 SOLARIS GT',
    subtitle: 'Lvl 2 Reward · Sunburst Aero',
    bodyStyle: 'hyper',
    unlockLevel: 3,
    primaryColor: 0xf97316,
    accentColor: 0xfef08a,
    hexPrimary: '#f97316',
    hexAccent: '#fef08a',
    mass: 1245,
    engineForce: 15400,
    topSpeedKmh: 296,
    driftBalance: 0.77,
    steerResponse: 1.05,
    stats: { speed: 92, acceleration: 92, driftControl: 91 },
  },
  {
    id: 'sb-11-spectre',
    shortName: 'SPECTRE',
    name: 'SB-11 SPECTRE LM',
    subtitle: 'Lvl 3 Reward · Le Mans Shark-Fin',
    bodyStyle: 'lemans',
    unlockLevel: 4,
    primaryColor: 0x1e293b,
    accentColor: 0x38bdf8,
    hexPrimary: '#334155',
    hexAccent: '#38bdf8',
    mass: 1210,
    engineForce: 15900,
    topSpeedKmh: 302,
    driftBalance: 0.80,
    steerResponse: 1.03,
    stats: { speed: 94, acceleration: 93, driftControl: 89 },
  },
  {
    id: 'sb-12-tempest',
    shortName: 'TEMPEST',
    name: 'SB-12 TEMPEST RS',
    subtitle: 'Lvl 4 Reward · Neon Touge Weapon',
    bodyStyle: 'cyber',
    unlockLevel: 5,
    primaryColor: 0x84cc16,
    accentColor: 0x0f172a,
    hexPrimary: '#84cc16',
    hexAccent: '#0f172a',
    mass: 1140,
    engineForce: 15200,
    topSpeedKmh: 295,
    driftBalance: 0.71,
    steerResponse: 1.16,
    stats: { speed: 91, acceleration: 94, driftControl: 98 },
  },
  {
    id: 'sb-13-obsidian',
    shortName: 'OBSIDIAN',
    name: 'SB-13 OBSIDIAN V12',
    subtitle: 'Lvl 5 Reward · Stealth Carbon GT',
    bodyStyle: 'hyper',
    unlockLevel: 6,
    primaryColor: 0x18181b,
    accentColor: 0xf43f5e,
    hexPrimary: '#27272a',
    hexAccent: '#f43f5e',
    mass: 1265,
    engineForce: 16500,
    topSpeedKmh: 310,
    driftBalance: 0.79,
    steerResponse: 1.04,
    stats: { speed: 96, acceleration: 95, driftControl: 90 },
  },
  {
    id: 'sb-14-zenith',
    shortName: 'ZENITH',
    name: 'SB-14 ZENITH AERO',
    subtitle: 'Lvl 6 Reward · Swan-Neck Prototype',
    bodyStyle: 'prototype',
    unlockLevel: 7,
    primaryColor: 0xf43f5e,
    accentColor: 0xfbbf24,
    hexPrimary: '#f43f5e',
    hexAccent: '#fbbf24',
    mass: 1180,
    engineForce: 16800,
    topSpeedKmh: 314,
    driftBalance: 0.75,
    steerResponse: 1.09,
    stats: { speed: 97, acceleration: 96, driftControl: 94 },
  },
  {
    id: 'sb-15-mirage',
    shortName: 'MIRAGE',
    name: 'SB-15 MIRAGE PRO',
    subtitle: 'Lvl 7 Reward · Pearlescent Drift Spec',
    bodyStyle: 'lemans',
    unlockLevel: 8,
    primaryColor: 0x14b8a6,
    accentColor: 0xfef08a,
    hexPrimary: '#14b8a6',
    hexAccent: '#fef08a',
    mass: 1150,
    engineForce: 16900,
    topSpeedKmh: 316,
    driftBalance: 0.72,
    steerResponse: 1.15,
    stats: { speed: 97, acceleration: 96, driftControl: 97 },
  },
  {
    id: 'sb-16-cyber',
    shortName: 'CYBERION',
    name: 'SB-16 CYBERION',
    subtitle: 'Lvl 8 Reward · Twin-Blade Futuristic',
    bodyStyle: 'cyber',
    unlockLevel: 9,
    primaryColor: 0x6366f1,
    accentColor: 0x22d3ee,
    hexPrimary: '#6366f1',
    hexAccent: '#22d3ee',
    mass: 1170,
    engineForce: 17500,
    topSpeedKmh: 322,
    driftBalance: 0.74,
    steerResponse: 1.13,
    stats: { speed: 98, acceleration: 97, driftControl: 96 },
  },
  {
    id: 'sb-17-monarch',
    shortName: 'MONARCH',
    name: 'SB-17 MONARCH GT',
    subtitle: 'Lvl 9 Reward · Royal Gold Prototype',
    bodyStyle: 'prototype',
    unlockLevel: 10,
    primaryColor: 0xd97706,
    accentColor: 0xf8fafc,
    hexPrimary: '#d97706',
    hexAccent: '#f8fafc',
    mass: 1160,
    engineForce: 18100,
    topSpeedKmh: 328,
    driftBalance: 0.75,
    steerResponse: 1.12,
    stats: { speed: 99, acceleration: 98, driftControl: 96 },
  },
  {
    id: 'sb-18-emperor',
    shortName: 'EMPEROR',
    name: 'SB-18 EMPEROR X26',
    subtitle: 'Lvl 10 Champion · Apex Hypercar',
    bodyStyle: 'prototype',
    unlockLevel: 11,
    primaryColor: 0xbe123c,
    accentColor: 0xfacc15,
    hexPrimary: '#be123c',
    hexAccent: '#facc15',
    mass: 1120,
    engineForce: 18800,
    topSpeedKmh: 336,
    driftBalance: 0.73,
    steerResponse: 1.16,
    stats: { speed: 100, acceleration: 100, driftControl: 98 },
  },
];

export const LEVEL_SPECS: LevelSpec[] = [
  {
    level: 1,
    name: 'COASTAL QUALIFIER',
    difficultyLabel: 'ROOKIE · EASIEST',
    recommendedTrack: 'apex-circuit',
    laps: 2,
    racerCount: 8,
    aiSkillMin: 0.62,
    aiSkillMax: 0.73,
    rewardCredits: 1200,
    unlockCarId: 'sb-09-ronin',
    featuredAiCars: ['sb-02-vortex', 'sb-04-viper', 'sb-01-apex', 'sb-09-ronin'],
    description: 'Warm-up grid on Pacific cliffs. Finish Top 4 to advance and unlock SB-09 Ronin GT-R.',
  },
  {
    level: 2,
    name: 'LAGOON BREEZE CUP',
    difficultyLabel: 'NOVICE',
    recommendedTrack: 'palm-causeway',
    laps: 2,
    racerCount: 8,
    aiSkillMin: 0.67,
    aiSkillMax: 0.78,
    rewardCredits: 1500,
    unlockCarId: 'sb-10-solaris',
    featuredAiCars: ['sb-09-ronin', 'sb-10-solaris', 'sb-05-phantom', 'sb-08-kraken'],
    description: 'Twin-ocean causeway sprint. Finish Top 4 to unlock SB-10 Solaris GT.',
  },
  {
    level: 3,
    name: 'BAYFRONT NIGHTS',
    difficultyLabel: 'AMATEUR',
    recommendedTrack: 'harbor-touge',
    laps: 2,
    racerCount: 8,
    aiSkillMin: 0.72,
    aiSkillMax: 0.83,
    rewardCredits: 1850,
    unlockCarId: 'sb-11-spectre',
    featuredAiCars: ['sb-10-solaris', 'sb-11-spectre', 'sb-06-valkyrie', 'sb-07-nova'],
    description: 'Floodlit harbor switchbacks. Finish Top 4 to unlock SB-11 Spectre LM.',
  },
  {
    level: 4,
    name: 'PACIFIC DRIFT OPEN',
    difficultyLabel: 'CLUBMAN',
    recommendedTrack: 'apex-circuit',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.77,
    aiSkillMax: 0.88,
    rewardCredits: 2200,
    unlockCarId: 'sb-12-tempest',
    featuredAiCars: ['sb-11-spectre', 'sb-12-tempest', 'sb-03-titan', 'sb-09-ronin'],
    description: '3-lap championship pace. Finish Top 4 to unlock SB-12 Tempest RS.',
  },
  {
    level: 5,
    name: 'TROPICAL MASTERS',
    difficultyLabel: 'PRO-AM',
    recommendedTrack: 'palm-causeway',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.82,
    aiSkillMax: 0.92,
    rewardCredits: 2600,
    unlockCarId: 'sb-13-obsidian',
    featuredAiCars: ['sb-12-tempest', 'sb-13-obsidian', 'sb-10-solaris', 'sb-11-spectre'],
    description: 'Fast palm-lined straights with sharper AI braking. Finish Top 4 for SB-13 Obsidian V12.',
  },
  {
    level: 6,
    name: 'MIDNIGHT TOUGE PRO',
    difficultyLabel: 'PROFESSIONAL',
    recommendedTrack: 'harbor-touge',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.86,
    aiSkillMax: 0.96,
    rewardCredits: 3100,
    unlockCarId: 'sb-14-zenith',
    featuredAiCars: ['sb-13-obsidian', 'sb-14-zenith', 'sb-12-tempest', 'sb-11-spectre'],
    description: 'High-commitment chicanes against pro rivals. Finish Top 4 for SB-14 Zenith Aero.',
  },
  {
    level: 7,
    name: 'SUNSET GT INVITATIONAL',
    difficultyLabel: 'EXPERT',
    recommendedTrack: 'apex-circuit',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.91,
    aiSkillMax: 1.00,
    rewardCredits: 3600,
    unlockCarId: 'sb-15-mirage',
    featuredAiCars: ['sb-14-zenith', 'sb-15-mirage', 'sb-13-obsidian', 'sb-12-tempest'],
    description: 'Upgrade your machine to keep pace. Finish Top 4 to unlock SB-15 Mirage Pro.',
  },
  {
    level: 8,
    name: 'CORAL HYPERCAR SERIES',
    difficultyLabel: 'ELITE',
    recommendedTrack: 'palm-causeway',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.95,
    aiSkillMax: 1.04,
    rewardCredits: 4200,
    unlockCarId: 'sb-16-cyber',
    featuredAiCars: ['sb-15-mirage', 'sb-16-cyber', 'sb-14-zenith', 'sb-13-obsidian'],
    description: 'Blistering causeway speeds with nitro-assisted rivals. Top 4 unlocks SB-16 Cyberion.',
  },
  {
    level: 9,
    name: 'HARBOR GRAND PRIX',
    difficultyLabel: 'MASTER',
    recommendedTrack: 'harbor-touge',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 0.99,
    aiSkillMax: 1.08,
    rewardCredits: 5000,
    unlockCarId: 'sb-17-monarch',
    featuredAiCars: ['sb-16-cyber', 'sb-17-monarch', 'sb-15-mirage', 'sb-14-zenith'],
    description: 'Relentless apex precision required. Finish Top 4 to unlock SB-17 Monarch GT.',
  },
  {
    level: 10,
    name: 'WORLD APEX FINALE',
    difficultyLabel: 'LEGEND · HARDEST',
    recommendedTrack: 'palm-causeway',
    laps: 3,
    racerCount: 8,
    aiSkillMin: 1.04,
    aiSkillMax: 1.13,
    rewardCredits: 7500,
    unlockCarId: 'sb-18-emperor',
    featuredAiCars: ['sb-17-monarch', 'sb-18-emperor', 'sb-16-cyber', 'sb-15-mirage'],
    description: 'Ultimate Level 10 showdown against hypercar legends. Top 4 crowns you & unlocks SB-18 Emperor X26.',
  },
];

export const TRACK_SPECS: TrackSpec[] = [
  {
    id: 'apex-circuit',
    name: 'APEX COASTAL GP',
    location: 'Pacific Cliffside',
    lengthLabel: '2.0 KM',
    totalLaps: 3,
    roadHalfWidth: 11.5,
    atmosphere: 'sunset',
    description: 'Long coastal straights and four wide, sweeping sunset corners built for effortless high-speed racing.',
  },
  {
    id: 'harbor-touge',
    name: 'HARBOR TOUGE',
    location: 'Bayfront Expressway',
    lengthLabel: '2.8 KM',
    totalLaps: 3,
    roadHalfWidth: 10.2,
    atmosphere: 'twilight',
    description: 'Technical twilight switchbacks, elevated harbor bends, and high-speed chicanes under stadium floodlights.',
  },
  {
    id: 'palm-causeway',
    name: 'PALM OCEANWAY',
    location: 'Twin-Ocean Causeway',
    lengthLabel: '2.7 KM',
    totalLaps: 3,
    roadHalfWidth: 11.2,
    atmosphere: 'tropical',
    description: 'Elevated tropical ocean causeway flanked by open turquoise waters on both sides and lined with swaying coconut palms.',
  },
];

export const DRIVER_ROSTER_NAMES: string[] = [
  'K. TAKAHASHI',
  'M. ROSSI',
  'A. VANCE',
  'S. NAKAMURA',
  'L. MERCER',
  'R. KOVALENKO',
  'D. SILVA',
  'E. LAURENT',
];

export const UPGRADE_COSTS: number[] = [500, 900, 1400, 2100, 3000];

export function applyCarUpgrades(
  base: CarSpec,
  upgrades?: CarUpgrades
): CarSpec {
  if (!upgrades) return base;
  const eng = Math.max(0, Math.min(5, upgrades.engine));
  const nit = Math.max(0, Math.min(5, upgrades.nitro));
  const hnd = Math.max(0, Math.min(5, upgrades.handling));
  const aer = Math.max(0, Math.min(5, upgrades.aero));

  return {
    ...base,
    mass: Math.round(base.mass * (1 - aer * 0.025)),
    engineForce: Math.round(base.engineForce * (1 + eng * 0.045)),
    topSpeedKmh: Math.round(base.topSpeedKmh + eng * 5 + aer * 2),
    driftBalance: Math.max(0.66, base.driftBalance - hnd * 0.008),
    steerResponse: Number((base.steerResponse + hnd * 0.022).toFixed(3)),
    nitroPowerMult: 1 + nit * 0.05,
    stats: {
      speed: Math.min(100, base.stats.speed + eng * 2 + aer),
      acceleration: Math.min(100, base.stats.acceleration + eng * 2 + nit),
      driftControl: Math.min(100, base.stats.driftControl + hnd * 2),
    },
  };
}
