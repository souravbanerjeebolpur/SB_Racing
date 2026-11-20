import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudFog,
  CloudRain,
  FastForward,
  Flag,
  Home,
  Lock,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { LeaderboardModal } from './components/LeaderboardModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { RaceHud } from './components/RaceHud';
import { UpgradeGarageModal } from './components/UpgradeGarageModal';
import { RacingEngine } from './game/engine';
import { useFullscreen, useWakeLock } from './hooks/useAndroidFeatures';
import type { ControlInput } from './game/physics';
import {
  applyCarUpgrades,
  CAR_SPECS,
  DEFAULT_UPGRADES,
  LEVEL_SPECS,
  TRACK_SPECS,
  UPGRADE_COSTS,
  WEATHER_SPECS,
  type CarId,
  type CarUpgrades,
  type GamePhase,
  type RaceTelemetry,
  type TrackId,
  type UpgradeKey,
} from './game/types';
import { formatLapTime, formatOrdinal } from './utils/format';

interface CareerState {
  unlockedLevel: number;
  selectedLevel: number;
  credits: number;
  freeTokens: number;
  upgradesByCar: Partial<Record<CarId, CarUpgrades>>;
}

interface LastRaceOutcome {
  level: number;
  qualified: boolean;
  creditsEarned: number;
  tokenEarned: boolean;
  unlockedNewCarId: CarId | null;
  unlockedNewLevel: number | null;
}

const CAREER_STORAGE_KEY = 'sb_racing_career_v1';

function loadInitialCareer(): CareerState {
  try {
    const raw = localStorage.getItem(CAREER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CareerState>;
      return {
        unlockedLevel: Math.min(10, Math.max(1, Number(parsed.unlockedLevel) || 1)),
        selectedLevel: Math.min(10, Math.max(1, Number(parsed.selectedLevel) || 1)),
        credits: Math.max(0, Number(parsed.credits) || 600),
        freeTokens: Math.max(0, Number(parsed.freeTokens) || 0),
        upgradesByCar: parsed.upgradesByCar ?? {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    unlockedLevel: 1,
    selectedLevel: 1,
    credits: 600,
    freeTokens: 0,
    upgradesByCar: {},
  };
}

const INITIAL_TELEMETRY: RaceTelemetry = {
  speedKmh: 0,
  rpm: 950,
  maxRpm: 8200,
  gear: 1,
  nitro: 100,
  isBoosting: false,
  isDrifting: false,
  slipAngleDeg: 0,
  activeDriftPoints: 0,
  driftMultiplier: 1,
  totalDriftScore: 0,
  lap: 1,
  totalLaps: 2,
  position: 8,
  totalRacers: 8,
  level: 1,
  currentLapMs: 0,
  bestLapMs: null,
  totalRaceMs: 0,
  lastLapMs: null,
  wrongWay: false,
  countdownValue: 3,
  maxSpeedKmh: 0,
  cameraMode: 'chase',
  minimapNorm: [],
  playerProgress: 0,
  bannerMessage: null,
  weather: 'clear',
  weatherTarget: 'clear',
  rainIntensity: 0,
  fogIntensity: 0,
  roadGripPct: 100,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);
  const rewardClaimedRef = useRef<boolean>(false);

  const [career, setCareer] = useState<CareerState>(loadInitialCareer);
  const [phase, setPhase] = useState<GamePhase>('title');
  const [selectedTrack, setSelectedTrack] = useState<TrackId>(
    () => LEVEL_SPECS[Math.min(9, Math.max(0, career.selectedLevel - 1))].recommendedTrack
  );
  const [selectedCar, setSelectedCar] = useState<CarId>('sb-01-apex');
  const [racerCount, setRacerCount] = useState<number>(8);
  const [driverName, setDriverName] = useState<string>(() => {
    try {
      return localStorage.getItem('sb_racing_driver') || 'DRIVER 01';
    } catch {
      return 'DRIVER 01';
    }
  });
  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [minimapPoints, setMinimapPoints] = useState<{ x: number; y: number }[]>([]);
  const [muted, setMuted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showUpgradeGarage, setShowUpgradeGarage] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<LastRaceOutcome | null>(null);

  useWakeLock(phase === 'countdown' || phase === 'racing');
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  // Leaderboard submission state on race finish
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    savedId?: string;
    rank?: number;
    totalOnTrack?: number;
    error?: string;
  } | null>(null);

  // Persist career state
  useEffect(() => {
    try {
      localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(career));
    } catch {
      // ignore storage errors
    }
  }, [career]);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new RacingEngine(mountEl, {
      onTelemetry: (t) => setTelemetry(t),
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
        if (nextPhase === 'finished') {
          setSubmitStatus(null);
        }
      },
    });
    engineRef.current = engine;
    setMinimapPoints(engine.getTrackMinimapPoints());

    const fadeTimer = window.setTimeout(() => setIntroFading(true), 2600);
    const doneTimer = window.setTimeout(() => setShowIntro(false), 3000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Play looping intro/home music during launch splash and whenever on Home screen
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (phase !== 'title' || muted) {
      engine.audio.stopIntroMusic();
      return;
    }

    let cancelled = false;
    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
    };

    const startHomeMusic = async () => {
      if (cancelled) return;
      const started = await engine.audio.tryPlayIntroMusic();
      if (started) {
        removeGestureListeners();
      }
    };

    const onFirstGesture = () => {
      void startHomeMusic();
    };

    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture, { passive: true });
    window.addEventListener('touchstart', onFirstGesture, { passive: true });
    void startHomeMusic();

    return () => {
      cancelled = true;
      removeGestureListeners();
    };
  }, [phase, muted]);

  // Process Level Progression & Rewards when reaching 'ceremony' or 'finished'
  useEffect(() => {
    if ((phase === 'ceremony' || phase === 'finished') && !rewardClaimedRef.current) {
      rewardClaimedRef.current = true;
      const lvl = telemetry.level || career.selectedLevel;
      const levelSpec = LEVEL_SPECS.find((l) => l.level === lvl) ?? LEVEL_SPECS[0];
      const pos = telemetry.position;
      const qualified = pos <= 4;

      if (qualified) {
        const podiumBonus = pos === 1 ? 650 : pos === 2 ? 400 : pos === 3 ? 250 : 100;
        const creditsEarned = levelSpec.rewardCredits + podiumBonus;
        const nextLevelTarget = Math.min(10, lvl + 1);
        const unlocksNextLevel = nextLevelTarget > career.unlockedLevel ? nextLevelTarget : null;
        const rewardCarSpec = CAR_SPECS.find((c) => c.id === levelSpec.unlockCarId);
        const unlockedNewCarId =
          rewardCarSpec && rewardCarSpec.unlockLevel > career.unlockedLevel
            ? rewardCarSpec.id
            : null;

        setCareer((prev) => ({
          ...prev,
          unlockedLevel: Math.max(prev.unlockedLevel, Math.min(10, lvl + 1)),
          credits: prev.credits + creditsEarned,
          freeTokens: prev.freeTokens + 1,
        }));

        setLastOutcome({
          level: lvl,
          qualified: true,
          creditsEarned,
          tokenEarned: true,
          unlockedNewCarId,
          unlockedNewLevel: unlocksNextLevel,
        });
      } else {
        const consolation = 250;
        setCareer((prev) => ({
          ...prev,
          credits: prev.credits + consolation,
        }));
        setLastOutcome({
          level: lvl,
          qualified: false,
          creditsEarned: consolation,
          tokenEarned: false,
          unlockedNewCarId: null,
          unlockedNewLevel: null,
        });
      }
    }
  }, [phase, telemetry.level, telemetry.position, career.selectedLevel, career.unlockedLevel]);

  // Sync car / track / level / upgrades to live 3D grid
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const carUpgrades = career.upgradesByCar[selectedCar] ?? DEFAULT_UPGRADES;
    engine.selectSetup(
      selectedTrack,
      selectedCar,
      racerCount,
      career.selectedLevel,
      carUpgrades,
      driverName
    );
    setMinimapPoints(engine.getTrackMinimapPoints());
  }, [
    selectedTrack,
    selectedCar,
    racerCount,
    career.selectedLevel,
    career.upgradesByCar,
    driverName,
  ]);

  const handleSelectLevel = (lvl: number) => {
    if (lvl > career.unlockedLevel) return;
    const spec = LEVEL_SPECS.find((l) => l.level === lvl) ?? LEVEL_SPECS[0];
    setCareer((prev) => ({ ...prev, selectedLevel: lvl }));
    setSelectedTrack(spec.recommendedTrack);
  };

  const handleDriverChange = (val: string) => {
    const sanitized = val.toUpperCase().slice(0, 18);
    setDriverName(sanitized);
    try {
      localStorage.setItem('sb_racing_driver', sanitized);
    } catch {
      // ignore storage failure
    }
  };

  const handleStartRace = useCallback(() => {
    rewardClaimedRef.current = false;
    setLastOutcome(null);
    setSubmitStatus(null);
    setShowLeaderboard(false);
    setShowUpgradeGarage(false);
    const carUpgrades = career.upgradesByCar[selectedCar] ?? DEFAULT_UPGRADES;
    engineRef.current?.startRaceWithSetup(
      selectedTrack,
      selectedCar,
      racerCount,
      career.selectedLevel,
      carUpgrades,
      driverName
    );
    setMinimapPoints(engineRef.current?.getTrackMinimapPoints() ?? []);
  }, [selectedTrack, selectedCar, racerCount, career.selectedLevel, career.upgradesByCar, driverName]);

  const handleStartNextLevel = useCallback(() => {
    const nextLvl = Math.min(10, career.selectedLevel + 1);
    if (nextLvl > career.unlockedLevel) return;
    const nextSpec = LEVEL_SPECS.find((l) => l.level === nextLvl) ?? LEVEL_SPECS[0];
    setCareer((prev) => ({ ...prev, selectedLevel: nextLvl }));
    setSelectedTrack(nextSpec.recommendedTrack);
    rewardClaimedRef.current = false;
    setLastOutcome(null);
    setSubmitStatus(null);
    setShowLeaderboard(false);
    setShowUpgradeGarage(false);
    const carUpgrades = career.upgradesByCar[selectedCar] ?? DEFAULT_UPGRADES;
    engineRef.current?.startRaceWithSetup(
      nextSpec.recommendedTrack,
      selectedCar,
      racerCount,
      nextLvl,
      carUpgrades,
      driverName
    );
    setMinimapPoints(engineRef.current?.getTrackMinimapPoints() ?? []);
  }, [career.selectedLevel, career.unlockedLevel, career.upgradesByCar, selectedCar, racerCount, driverName]);

  const handleUpgradeCar = useCallback(
    (carId: CarId, key: UpgradeKey, useFreeToken: boolean) => {
      setCareer((prev) => {
        const current = prev.upgradesByCar[carId] ?? { ...DEFAULT_UPGRADES };
        const tier = current[key] ?? 0;
        if (tier >= 5) return prev;
        const cost = UPGRADE_COSTS[tier];
        if (useFreeToken) {
          if (prev.freeTokens < 1) return prev;
        } else if (prev.credits < cost) {
          return prev;
        }
        return {
          ...prev,
          credits: useFreeToken ? prev.credits : prev.credits - cost,
          freeTokens: useFreeToken ? prev.freeTokens - 1 : prev.freeTokens,
          upgradesByCar: {
            ...prev.upgradesByCar,
            [carId]: {
              ...current,
              [key]: tier + 1,
            },
          },
        };
      });
    },
    []
  );

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.audio.setMuted(next);
  }, [muted]);

  const handleTouchInput = useCallback((partial: Partial<ControlInput>) => {
    engineRef.current?.setTouchInput(partial);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }
      if (phase === 'title' && !showIntro && !showLeaderboard && !showUpgradeGarage) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartRace();
        } else if (e.code === 'KeyH') {
          setDockCollapsed((c) => !c);
        }
      } else if (phase === 'ceremony') {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          engineRef.current?.finishCeremony();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, showIntro, showLeaderboard, showUpgradeGarage, handleStartRace]);

  const handleSubmitLeaderboard = async () => {
    if (submittingScore || submitStatus?.savedId) return;
    const cleanName = driverName.trim().length >= 2 ? driverName.trim() : 'DRIVER 01';
    setSubmittingScore(true);
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName: cleanName,
          carId: selectedCar,
          trackId: selectedTrack,
          bestLapMs: telemetry.bestLapMs ?? telemetry.totalRaceMs,
          totalRaceMs: telemetry.totalRaceMs,
          driftScore: telemetry.totalDriftScore,
          maxSpeedKmh: telemetry.maxSpeedKmh,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json()) as { error?: string };
        throw new Error(errBody.error || 'Submission rejected');
      }
      const data = (await res.json()) as {
        entry: { id: string };
        rank: number;
        totalOnTrack: number;
      };
      setSubmitStatus({
        savedId: data.entry.id,
        rank: data.rank,
        totalOnTrack: data.totalOnTrack,
      });
    } catch (err) {
      setSubmitStatus({
        error: err instanceof Error ? err.message : 'Unable to save score',
      });
    } finally {
      setSubmittingScore(false);
    }
  };

  const baseCarSpec = CAR_SPECS.find((c) => c.id === selectedCar) ?? CAR_SPECS[0];
  const activeCarUpgrades = career.upgradesByCar[selectedCar] ?? DEFAULT_UPGRADES;
  const activeCarSpec = applyCarUpgrades(baseCarSpec, activeCarUpgrades);
  const activeTrackSpec = TRACK_SPECS.find((t) => t.id === selectedTrack) ?? TRACK_SPECS[0];
  const activeLevelSpec =
    LEVEL_SPECS.find((l) => l.level === career.selectedLevel) ?? LEVEL_SPECS[0];
  const unlockedCarsCount = CAR_SPECS.filter((c) => c.unlockLevel <= career.unlockedLevel).length;
  const rewardUnlockedCar = lastOutcome?.unlockedNewCarId
    ? CAR_SPECS.find((c) => c.id === lastOutcome.unlockedNewCarId) ?? null
    : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090b10] text-slate-100">
      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {/* INITIAL 3-SECOND LAUNCH SPLASH (Title + Creator Credit Before Menu) */}
      {showIntro && (
        <div
          onClick={() => {
            if (!muted) {
              void engineRef.current?.audio.tryPlayIntroMusic();
            }
          }}
          className={`fixed inset-0 z-40 bg-[#07090e]/78 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-400 ${
            introFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <svg
            viewBox="0 0 420 112"
            className="w-64 sm:w-[440px] max-w-[88vw] h-auto drop-shadow-[0_8px_28px_rgba(0,0,0,0.9)]"
            aria-label="SB Racing 2026"
          >
            <polygon points="8,14 48,14 30,92 0,92" fill="#e11d48" />
            <polygon points="56,14 78,14 60,92 38,92" fill="#f59e0b" />
            <text
              x="92"
              y="54"
              fill="#f8fafc"
              fontFamily="Rajdhani, sans-serif"
              fontWeight="700"
              fontSize="44"
              letterSpacing="3"
            >
              SB RACING
            </text>
            <rect x="92" y="66" width="212" height="3" fill="#e11d48" />
            <text
              x="94"
              y="94"
              fill="#fbbf24"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="800"
              fontSize="24"
              letterSpacing="7"
            >
              2026 EDITION
            </text>
          </svg>

          <p className="mt-4 text-xs sm:text-base tracking-[0.24em] uppercase text-amber-300 font-bold drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            Created by Sourav Banerjee
          </p>

          <div className="mt-6 w-40 sm:w-56 h-1 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full w-full bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400" />
          </div>
        </div>
      )}

      {/* TITLE SCREEN OVERLAY */}
      {phase === 'title' && !showIntro && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between">
          {/* Responsive Top Header */}
          <div className="flex items-start justify-between gap-2 px-3 pt-3 sm:px-8 sm:pt-7">
            <div className="min-w-0">
              <svg
                viewBox="0 0 420 112"
                className="w-36 sm:w-80 md:w-96 h-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.75)]"
                aria-label="SB Racing 2026"
              >
                <polygon points="8,14 48,14 30,92 0,92" fill="#e11d48" />
                <polygon points="56,14 78,14 60,92 38,92" fill="#f59e0b" />
                <text
                  x="92"
                  y="54"
                  fill="#f8fafc"
                  fontFamily="Rajdhani, sans-serif"
                  fontWeight="700"
                  fontSize="44"
                  letterSpacing="3"
                >
                  SB RACING
                </text>
                <rect x="92" y="66" width="212" height="3" fill="#e11d48" />
                <text
                  x="94"
                  y="94"
                  fill="#fbbf24"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="800"
                  fontSize="24"
                  letterSpacing="7"
                >
                  2026 EDITION
                </text>
              </svg>
              <p className="mt-1 text-[10px] sm:text-xs tracking-[0.15em] uppercase text-amber-300 font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
                Created by Sourav Banerjee
              </p>
              <p className="hidden sm:block mt-1 text-xs sm:text-sm tracking-[0.16em] uppercase text-slate-200/90 font-semibold drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                10-Level Drift Career · Podium Trophy Ceremony · Global Ranks
              </p>
            </div>

            {/* Top-Right Utility Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
              <div className="h-9 sm:h-10 px-2 sm:px-3 rounded-lg bg-[#090b10]/88 border border-slate-700/80 text-amber-300 font-mono-num font-bold text-[10px] sm:text-xs flex items-center gap-1 shadow-lg">
                <span>{career.credits.toLocaleString()}</span>
                <span className="text-slate-400">CR</span>
              </div>
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => setShowUpgradeGarage(true)}
                className="relative h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-lg bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/80 text-emerald-400 font-bold text-[10px] sm:text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
              >
                <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">UPGRADE</span>
                {career.freeTokens > 0 && (
                  <span className="px-1 py-0.2 rounded bg-emerald-500 text-slate-950 text-[9px] font-mono-num font-extrabold">
                    +{career.freeTokens}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowLeaderboard(true)}
                className="h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/80 text-amber-400 font-bold text-[10px] sm:text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
              >
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="sm:hidden">RANKS</span>
                <span className="hidden sm:inline">LEADERBOARD</span>
              </button>
              {fullscreenSupported && (
                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  title="Toggle Fullscreen"
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-200 flex items-center justify-center cursor-pointer shadow-lg transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleMute}
                title="Toggle Sound"
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-200 flex items-center justify-center cursor-pointer shadow-lg transition-colors"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
            </div>
          </div>

          {/* Collapsible Bottom Control Dock (Fits Portrait & Landscape Phones) */}
          <div
            className="fixed left-1/2 bottom-2.5 sm:bottom-5 pointer-events-auto transition-transform duration-300 ease-out"
            style={{
              width: 'min(1000px, 95vw)',
              transform: dockCollapsed
                ? 'translate(-50%, calc(100% - 30px))'
                : 'translate(-50%, 0)',
            }}
          >
            {/* Collapse Toggle Handle */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                className="px-3.5 py-0.5 sm:px-4 sm:py-1 rounded-t-lg bg-[#090b10]/92 border border-b-0 border-slate-700/80 text-[10px] sm:text-[11px] font-bold tracking-[0.14em] uppercase text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                    SHOW SETUP
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    HIDE CONTROLS
                  </>
                )}
              </button>
            </div>

            {/* Dock Body */}
            <div className="bg-[#090b10]/92 border border-slate-700/85 rounded-xl p-2.5 sm:p-4 shadow-2xl max-h-[68dvh] overflow-y-auto space-y-2.5">
              {/* Career Level 1..10 Strip */}
              <div className="flex flex-col gap-1.5 border-b border-slate-800/80 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] tracking-[0.12em] uppercase text-slate-300 font-bold truncate">
                    LEVEL {activeLevelSpec.level}/10 ·{' '}
                    <span className="text-sky-400">{activeLevelSpec.name}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-[9px] font-mono-num font-bold text-slate-200">
                      {telemetry.weather === 'rain' ? (
                        <CloudRain className="w-3 h-3 text-sky-400" />
                      ) : telemetry.weather === 'fog' ? (
                        <CloudFog className="w-3 h-3 text-slate-300" />
                      ) : (
                        <Sun className="w-3 h-3 text-amber-400" />
                      )}
                      <span>{WEATHER_SPECS[telemetry.weather].shortLabel}</span>
                      <span className="text-slate-400">{telemetry.roadGripPct}%</span>
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-mono-num font-bold text-amber-300">
                      {activeLevelSpec.difficultyLabel} · TOP 4 ADVANCES
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {LEVEL_SPECS.map((lvl) => {
                    const unlocked = lvl.level <= career.unlockedLevel;
                    const active = lvl.level === career.selectedLevel;
                    return (
                      <button
                        key={lvl.level}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => handleSelectLevel(lvl.level)}
                        title={
                          unlocked
                            ? `Level ${lvl.level}: ${lvl.name} (${lvl.difficultyLabel})`
                            : `Finish Level ${lvl.level - 1} in Top 4 to unlock`
                        }
                        className={`shrink-0 h-7 px-2 sm:px-2.5 rounded-md border text-[10px] font-mono-num font-bold flex items-center gap-1 transition-colors ${
                          !unlocked
                            ? 'bg-slate-950/70 border-slate-800/70 text-slate-600 cursor-not-allowed'
                            : active
                              ? 'bg-sky-500 border-sky-300 text-slate-950 cursor-pointer'
                              : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-500 cursor-pointer'
                        }`}
                      >
                        {!unlocked && <Lock className="w-2.5 h-2.5" />}
                        <span>L{lvl.level}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3.5 items-center">
                {/* Vehicle Selection (All 8 Base + Stylish Level Reward Cars) */}
                <div className="md:col-span-5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] tracking-[0.12em] uppercase text-slate-300 font-bold truncate">
                      GARAGE ({unlockedCarsCount}/{CAR_SPECS.length}) ·{' '}
                      <span className="text-amber-400">{activeCarSpec.name}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono-num text-slate-400 font-semibold">
                        {activeCarSpec.topSpeedKmh} KM/H
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowUpgradeGarage(true)}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 text-[9px] font-bold tracking-wider uppercase cursor-pointer"
                      >
                        TUNE
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-rows-2 grid-flow-col auto-cols-[76px] sm:auto-cols-[84px] gap-1 sm:gap-1.5 overflow-x-auto pb-1">
                    {CAR_SPECS.map((car) => {
                      const unlocked = car.unlockLevel <= career.unlockedLevel;
                      const active = car.id === selectedCar;
                      const tuned = applyCarUpgrades(car, career.upgradesByCar[car.id]);
                      return (
                        <button
                          key={car.id}
                          type="button"
                          disabled={!unlocked}
                          onClick={() => unlocked && setSelectedCar(car.id)}
                          title={
                            unlocked
                              ? `${tuned.name} — ${tuned.subtitle}`
                              : `${car.name} — Clear Level ${car.unlockLevel - 1} in Top 4 to unlock`
                          }
                          className={`min-w-0 px-1.5 py-1 rounded-lg border text-left transition-colors ${
                            !unlocked
                              ? 'bg-slate-950/65 border-slate-800/60 text-slate-600 cursor-not-allowed'
                              : active
                                ? 'bg-slate-800 border-amber-400 text-white cursor-pointer'
                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-600 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            {unlocked ? (
                              <span
                                className="w-2 h-2 rounded-sm shrink-0"
                                style={{ backgroundColor: car.hexPrimary }}
                              />
                            ) : (
                              <Lock className="w-2.5 h-2.5 shrink-0 text-slate-600" />
                            )}
                            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate">
                              {car.shortName}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-[8px] sm:text-[9px] text-slate-400 font-mono-num">
                            <span>{unlocked ? 'SPD' : `LVL${car.unlockLevel - 1}`}</span>
                            <span className={active ? 'text-amber-300' : ''}>
                              {unlocked ? tuned.topSpeedKmh : ''}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 w-full bg-slate-950 rounded overflow-hidden">
                            <div
                              className={`h-full ${unlocked ? 'bg-amber-400' : 'bg-slate-800'}`}
                              style={{ width: `${unlocked ? tuned.stats.speed : 30}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Circuit & Grid Size Selection */}
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] tracking-[0.12em] uppercase text-slate-400 font-bold truncate">
                      CIRCUIT · {activeLevelSpec.laps} LAPS
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {[4, 6, 8].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setRacerCount(count)}
                          className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold font-mono-num cursor-pointer transition-colors ${
                            racerCount === count
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {count} CARS
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                    {TRACK_SPECS.map((trk) => {
                      const active = trk.id === selectedTrack;
                      return (
                        <button
                          key={trk.id}
                          type="button"
                          onClick={() => setSelectedTrack(trk.id)}
                          title={`${trk.name} — ${trk.location}`}
                          className={`min-w-0 px-1.5 py-1.5 sm:px-2 sm:py-2 rounded-lg border text-left cursor-pointer transition-colors ${
                            active
                              ? 'bg-slate-800 border-sky-400 text-white'
                              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <div className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate">
                            {trk.name}
                          </div>
                          <div className="text-[8px] sm:text-[9px] text-slate-400 truncate mt-0.5">
                            {trk.location}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Callsign + Primary Start CTA */}
                <div className="md:col-span-3 flex flex-row md:flex-col gap-2">
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => handleDriverChange(e.target.value)}
                    placeholder="DRIVER"
                    maxLength={18}
                    aria-label="Driver Callsign"
                    className="flex-1 min-w-0 md:w-full h-10 md:h-8 px-2.5 rounded-lg md:rounded-md bg-slate-950 border border-slate-700 focus:border-amber-400 outline-none text-xs font-mono-num font-bold tracking-wider text-white uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleStartRace}
                    className="px-4 md:w-full h-10 md:h-11 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs sm:text-sm tracking-[0.14em] uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-colors shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    RACE LVL {career.selectedLevel}
                  </button>
                </div>
              </div>

              {/* Single Flat Control-Hint Line */}
              <div className="hidden sm:block pt-2 border-t border-slate-800/90 text-center text-[11px] tracking-[0.14em] text-slate-400 uppercase font-medium">
                WASD / Arrows Drive · Space Handbrake Drift · Shift Nitro · C Camera · R Reset · Esc Pause
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE RACE / COUNTDOWN HUD */}
      {(phase === 'countdown' || phase === 'racing') && (
        <RaceHud
          telemetry={telemetry}
          minimapTrackPoints={minimapPoints}
          isCountdown={phase === 'countdown'}
          muted={muted}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleMute={handleToggleMute}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onPause={() => engineRef.current?.togglePause()}
          onRespawn={() => engineRef.current?.respawnOnTrack()}
          onTouchInput={handleTouchInput}
        />
      )}

      {/* PODIUM TROPHY PRESENTATION CEREMONY OVERLAY (Unobstructed 3D Center) */}
      {phase === 'ceremony' && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6">
          {/* Top Ceremony Banner */}
          <div className="flex flex-col items-center text-center">
            <div className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-[#090b10]/90 border border-amber-400/70 shadow-2xl max-w-[92vw]">
              <div className="text-[10px] sm:text-xs tracking-[0.22em] text-amber-400 font-bold uppercase">
                TROPHY PRESENTATION CEREMONY · LEVEL {telemetry.level}
              </div>
              <div className="text-base sm:text-2xl font-extrabold tracking-[0.14em] text-white uppercase mt-0.5 truncate">
                {telemetry.ceremonyHeadline || 'PODIUM CEREMONY'}
              </div>
              <div className="text-[11px] sm:text-sm font-semibold text-sky-300 tracking-wider uppercase truncate">
                {telemetry.ceremonySubtext || 'TOP 3 FINISHERS'}
              </div>
            </div>
          </div>

          {/* Bottom Top-3 Cards + Continue Button */}
          <div className="flex flex-col items-center gap-2.5 pointer-events-auto">
            {telemetry.podiumTop3 && (
              <div className="grid grid-cols-3 gap-1.5 sm:gap-3 w-full max-w-2xl">
                {telemetry.podiumTop3.map((drv) => {
                  const isActiveStep =
                    (telemetry.ceremonyStep === 1 && drv.place === 3) ||
                    (telemetry.ceremonyStep === 2 && drv.place === 2) ||
                    (telemetry.ceremonyStep === 3 && drv.place === 1) ||
                    telemetry.ceremonyStep === 4;
                  const placeBorder =
                    drv.place === 1
                      ? 'border-amber-400'
                      : drv.place === 2
                        ? 'border-slate-300'
                        : 'border-amber-700';
                  return (
                    <div
                      key={drv.place}
                      className={`rounded-lg bg-[#090b10]/92 border px-2 py-1.5 sm:px-3 sm:py-2 transition-all ${
                        isActiveStep ? `${placeBorder} shadow-lg` : 'border-slate-800 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[10px] sm:text-xs font-extrabold font-mono-num ${
                            drv.place === 1
                              ? 'text-amber-400'
                              : drv.place === 2
                                ? 'text-slate-200'
                                : 'text-amber-600'
                          }`}
                        >
                          {formatOrdinal(drv.place)}
                        </span>
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: drv.hexPrimary }}
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs font-bold text-white truncate mt-0.5">
                        {drv.driverName} {drv.isPlayer ? '(YOU)' : ''}
                      </div>
                      <div className="text-[8px] sm:text-[10px] text-slate-400 truncate">
                        {drv.carName}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => engineRef.current?.finishCeremony()}
              className="h-10 px-6 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm tracking-[0.16em] uppercase flex items-center gap-2 cursor-pointer shadow-xl transition-colors"
            >
              <span>
                {telemetry.ceremonyStep === 4 ? 'CONTINUE TO RESULTS' : 'SKIP TO RESULTS'}
              </span>
              <FastForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {phase === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-3 sm:p-4">
          <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-[#0c1018] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-2xl text-center">
            <h2 className="text-xl sm:text-2xl font-bold tracking-[0.2em] uppercase text-white">
              RACE PAUSED
            </h2>
            <p className="text-xs text-slate-400 tracking-wider uppercase mt-1">
              LEVEL {telemetry.level} · {activeTrackSpec.name} · LAP {telemetry.lap}/{telemetry.totalLaps}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                className="w-full h-11 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-[0.16em] uppercase text-sm cursor-pointer transition-colors"
              >
                RESUME RACE
              </button>
              <button
                type="button"
                onClick={handleStartRace}
                className="w-full h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold tracking-[0.14em] uppercase text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RESTART LEVEL
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="w-full h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold tracking-[0.14em] uppercase text-xs cursor-pointer transition-colors"
              >
                AUDIO: {muted ? 'MUTED' : 'ON'}
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="w-full h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold tracking-[0.14em] uppercase text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                HOME SCREEN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RACE FINISH & LEVEL PROGRESSION MODAL */}
      {phase === 'finished' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0c1018] border border-slate-700 rounded-xl p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 sm:pb-4">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Flag className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold tracking-[0.16em] uppercase text-white truncate">
                    CHECKERED FLAG
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-400 tracking-wider uppercase truncate">
                    LVL {telemetry.level} · {activeTrackSpec.name} · {activeCarSpec.name}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] tracking-[0.2em] text-slate-400 uppercase block">
                  FINISH ({telemetry.totalRacers} CARS)
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono-num">
                  {formatOrdinal(telemetry.position)}
                </span>
              </div>
            </div>

            {/* Level Qualification & Rewards Banner */}
            {lastOutcome && (
              <div
                className={`mt-3 rounded-lg border p-3 ${
                  lastOutcome.qualified
                    ? 'bg-emerald-950/40 border-emerald-500/60'
                    : 'bg-rose-950/40 border-rose-500/60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div
                      className={`text-xs sm:text-sm font-extrabold tracking-wider uppercase ${
                        lastOutcome.qualified ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {lastOutcome.qualified
                        ? `LEVEL ${lastOutcome.level} CLEARED · TOP 4 QUALIFIED!`
                        : `FINISHED ${formatOrdinal(telemetry.position)} · TOP 4 REQUIRED`}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      {lastOutcome.qualified
                        ? `Earned +${lastOutcome.creditsEarned.toLocaleString()} CR & +1 Free Car Upgrade!`
                        : `Finish 4th or better to unlock Level ${Math.min(10, lastOutcome.level + 1)} (+${lastOutcome.creditsEarned} CR).`}
                    </div>
                  </div>
                </div>

                {rewardUnlockedCar && (
                  <div className="mt-2 pt-2 border-t border-emerald-500/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold text-amber-200 truncate">
                        NEW CAR UNLOCKED: {rewardUnlockedCar.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCar(rewardUnlockedCar.id)}
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] tracking-wider uppercase cursor-pointer shrink-0"
                    >
                      EQUIP
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Telemetry Summary Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 my-3.5 sm:my-4">
              <div className="bg-[#090c12] border border-slate-800 rounded-lg p-2.5 sm:p-3">
                <div className="text-[10px] tracking-[0.16em] text-slate-400 uppercase">TOTAL TIME</div>
                <div className="text-base sm:text-xl font-bold text-white font-mono-num mt-0.5">
                  {formatLapTime(telemetry.totalRaceMs)}
                </div>
              </div>
              <div className="bg-[#090c12] border border-slate-800 rounded-lg p-2.5 sm:p-3">
                <div className="text-[10px] tracking-[0.16em] text-emerald-400 uppercase">BEST LAP</div>
                <div className="text-base sm:text-xl font-bold text-emerald-300 font-mono-num mt-0.5">
                  {formatLapTime(telemetry.bestLapMs)}
                </div>
              </div>
              <div className="bg-[#090c12] border border-slate-800 rounded-lg p-2.5 sm:p-3">
                <div className="text-[10px] tracking-[0.16em] text-rose-400 uppercase">DRIFT SCORE</div>
                <div className="text-base sm:text-xl font-bold text-rose-300 font-mono-num mt-0.5">
                  {telemetry.totalDriftScore.toLocaleString()} PTS
                </div>
              </div>
              <div className="bg-[#090c12] border border-slate-800 rounded-lg p-2.5 sm:p-3">
                <div className="text-[10px] tracking-[0.16em] text-sky-400 uppercase">TOP SPEED</div>
                <div className="text-base sm:text-xl font-bold text-sky-300 font-mono-num mt-0.5">
                  {telemetry.maxSpeedKmh} KM/H
                </div>
              </div>
            </div>

            {/* Global Leaderboard Submission */}
            <div className="bg-[#090c12] border border-slate-800 rounded-lg p-3 mb-4">
              {submitStatus?.savedId ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold tracking-wider uppercase text-emerald-400">
                      RECORD POSTED TO GLOBAL LEADERBOARD
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Global Rank #{submitStatus.rank} of {submitStatus.totalOnTrack} on {activeTrackSpec.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLeaderboard(true)}
                    className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wider uppercase cursor-pointer"
                  >
                    VIEW STANDINGS
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => handleDriverChange(e.target.value)}
                    placeholder="DRIVER CALLSIGN"
                    maxLength={18}
                    className="flex-1 h-9 px-3 rounded-md bg-slate-950 border border-slate-700 focus:border-amber-400 outline-none text-xs font-mono-num font-bold tracking-wider text-white uppercase"
                  />
                  <button
                    type="button"
                    disabled={submittingScore}
                    onClick={() => void handleSubmitLeaderboard()}
                    className="h-9 px-4 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs tracking-wider uppercase cursor-pointer whitespace-nowrap"
                  >
                    {submittingScore ? 'POSTING...' : 'SUBMIT SCORE'}
                  </button>
                </div>
              )}
              {submitStatus?.error && (
                <p className="text-xs text-rose-400 mt-2">{submitStatus.error}</p>
              )}
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {career.selectedLevel < 10 && career.unlockedLevel > career.selectedLevel ? (
                <button
                  type="button"
                  onClick={handleStartNextLevel}
                  className="h-10 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] sm:text-xs tracking-[0.12em] uppercase cursor-pointer"
                >
                  NEXT: LVL {career.selectedLevel + 1}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartRace}
                  className="h-10 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] sm:text-xs tracking-[0.12em] uppercase cursor-pointer"
                >
                  RACE AGAIN
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowUpgradeGarage(true)}
                className="h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] sm:text-xs tracking-[0.12em] uppercase flex items-center justify-center gap-1 cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5" />
                UPGRADE
              </button>
              <button
                type="button"
                onClick={() => setShowLeaderboard(true)}
                className="h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] sm:text-xs tracking-[0.12em] uppercase cursor-pointer"
              >
                STANDINGS
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-[11px] sm:text-xs tracking-[0.12em] uppercase flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                HOME
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAR UPGRADE GARAGE MODAL */}
      {showUpgradeGarage && (
        <UpgradeGarageModal
          selectedCar={selectedCar}
          unlockedLevel={career.unlockedLevel}
          credits={career.credits}
          freeTokens={career.freeTokens}
          upgradesByCar={career.upgradesByCar}
          onSelectCar={(id) => setSelectedCar(id)}
          onUpgrade={handleUpgradeCar}
          onClose={() => setShowUpgradeGarage(false)}
        />
      )}

      {/* GLOBAL LEADERBOARD MODAL */}
      {showLeaderboard && (
        <LeaderboardModal
          initialTrack={selectedTrack}
          highlightId={submitStatus?.savedId}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {/* OFFLINE CONNECTIVITY INDICATOR */}
      <OfflineIndicator />
    </div>
  );
}
