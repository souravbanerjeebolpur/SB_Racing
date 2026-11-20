import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LeaderboardRecord {
  id: string;
  driverName: string;
  carId: string;
  trackId: string;
  bestLapMs: number;
  totalRaceMs: number;
  driftScore: number;
  maxSpeedKmh: number;
  createdAt: string;
}

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'leaderboard.json');
const PORT = 3000;
const VALID_TRACKS = new Set(['apex-circuit', 'harbor-touge', 'palm-causeway']);
const VALID_CARS = new Set([
  'sb-01-apex',
  'sb-02-vortex',
  'sb-03-titan',
  'sb-04-viper',
  'sb-05-phantom',
  'sb-06-valkyrie',
  'sb-07-nova',
  'sb-08-kraken',
  'sb-09-ronin',
  'sb-10-solaris',
  'sb-11-spectre',
  'sb-12-tempest',
  'sb-13-obsidian',
  'sb-14-zenith',
  'sb-15-mirage',
  'sb-16-cyber',
  'sb-17-monarch',
  'sb-18-emperor',
]);

function readLeaderboard(): LeaderboardRecord[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LeaderboardRecord[];
  } catch {
    return [];
  }
}

function writeLeaderboard(records: LeaderboardRecord[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (req, res) => {
    const trackParam = typeof req.query.track === 'string' ? req.query.track : 'all';
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'lap';
    const all = readLeaderboard();
    const filtered =
      trackParam !== 'all' && VALID_TRACKS.has(trackParam)
        ? all.filter((r) => r.trackId === trackParam)
        : all;

    const sorted = [...filtered].sort((a, b) => {
      if (sortParam === 'drift') {
        return b.driftScore - a.driftScore || a.bestLapMs - b.bestLapMs;
      }
      if (sortParam === 'race') {
        return a.totalRaceMs - b.totalRaceMs || a.bestLapMs - b.bestLapMs;
      }
      return a.bestLapMs - b.bestLapMs || b.driftScore - a.driftScore;
    });

    res.json({
      entries: sorted.slice(0, 50),
      totalEntries: filtered.length,
    });
  });

  app.post('/api/leaderboard', (req, res) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    const rawName = typeof body.driverName === 'string' ? body.driverName.trim() : '';
    const driverName = rawName.replace(/[^a-zA-Z0-9 _\-]/g, '').slice(0, 18);
    const carId = typeof body.carId === 'string' ? body.carId : '';
    const trackId = typeof body.trackId === 'string' ? body.trackId : '';
    const bestLapMs = Number(body.bestLapMs);
    const totalRaceMs = Number(body.totalRaceMs);
    const driftScore = Math.round(Number(body.driftScore));
    const maxSpeedKmh = Math.round(Number(body.maxSpeedKmh));

    if (!driverName || driverName.length < 2) {
      res.status(400).json({ error: 'Driver name must be at least 2 characters.' });
      return;
    }
    if (!VALID_CARS.has(carId) || !VALID_TRACKS.has(trackId)) {
      res.status(400).json({ error: 'Invalid car or track selection.' });
      return;
    }
    if (
      !Number.isFinite(bestLapMs) ||
      bestLapMs < 8000 ||
      bestLapMs > 600000 ||
      !Number.isFinite(totalRaceMs) ||
      totalRaceMs < 20000 ||
      totalRaceMs > 1800000 ||
      !Number.isFinite(driftScore) ||
      driftScore < 0 ||
      driftScore > 5000000 ||
      !Number.isFinite(maxSpeedKmh) ||
      maxSpeedKmh < 20 ||
      maxSpeedKmh > 450
    ) {
      res.status(400).json({ error: 'Telemetry values out of valid range.' });
      return;
    }

    const record: LeaderboardRecord = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      driverName,
      carId,
      trackId,
      bestLapMs: Math.round(bestLapMs),
      totalRaceMs: Math.round(totalRaceMs),
      driftScore,
      maxSpeedKmh,
      createdAt: new Date().toISOString(),
    };

    const records = readLeaderboard();
    records.push(record);
    // Keep up to 500 records total so disk stays compact
    const trimmed = records
      .sort((a, b) => a.bestLapMs - b.bestLapMs)
      .slice(0, 500);
    writeLeaderboard(trimmed);

    const trackSorted = trimmed
      .filter((r) => r.trackId === trackId)
      .sort((a, b) => a.bestLapMs - b.bestLapMs);
    const rank = trackSorted.findIndex((r) => r.id === record.id) + 1;

    res.status(201).json({
      entry: record,
      rank: rank > 0 ? rank : trackSorted.length,
      totalOnTrack: trackSorted.length,
    });
  });

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SB Racing 2026 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
