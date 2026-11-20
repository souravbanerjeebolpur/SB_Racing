import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CloudFog,
  CloudRain,
  Maximize2,
  Minimize2,
  Pause,
  RotateCcw,
  Smartphone,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ControlInput } from '../game/physics';
import { WEATHER_SPECS, type RaceTelemetry } from '../game/types';
import { formatLapTime, formatOrdinal } from '../utils/format';
import { triggerHaptic } from '../utils/haptics';

interface RaceHudProps {
  telemetry: RaceTelemetry;
  minimapTrackPoints: { x: number; y: number }[];
  isCountdown: boolean;
  muted: boolean;
  isFullscreen?: boolean;
  fullscreenSupported?: boolean;
  onToggleFullscreen?: () => void;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  onPause: () => void;
  onRespawn: () => void;
  onTouchInput: (partial: Partial<ControlInput>) => void;
}

const STEER_MODE_KEY = 'sb_racing_steer_mode';

function useIsTouchViewport(): boolean {
  const [isTouch, setIsTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 768
    );
  });

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      setIsTouch(coarse || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isTouch;
}

export const RaceHud: React.FC<RaceHudProps> = ({
  telemetry,
  minimapTrackPoints,
  isCountdown,
  muted,
  isFullscreen = false,
  fullscreenSupported = false,
  onToggleFullscreen,
  onToggleMute,
  onCycleCamera,
  onPause,
  onRespawn,
  onTouchInput,
}) => {
  const isTouch = useIsTouchViewport();
  const steerStateRef = useRef({ left: false, right: false });
  const [steerMode, setSteerMode] = useState<'buttons' | 'tilt'>(() => {
    try {
      return localStorage.getItem(STEER_MODE_KEY) === 'tilt' ? 'tilt' : 'buttons';
    } catch {
      return 'buttons';
    }
  });
  const [tiltSteerVal, setTiltSteerVal] = useState(0);

  const updateSteer = (side: 'left' | 'right', down: boolean) => {
    steerStateRef.current[side] = down;
    const steer =
      (steerStateRef.current.left ? 1 : 0) - (steerStateRef.current.right ? 1 : 0);
    onTouchInput({ steer });
  };

  const toggleSteerMode = useCallback(async () => {
    if (steerMode === 'tilt') {
      setSteerMode('buttons');
      setTiltSteerVal(0);
      onTouchInput({ steer: 0 });
      try {
        localStorage.setItem(STEER_MODE_KEY, 'buttons');
      } catch {
        // ignore storage error
      }
      return;
    }

    // Request gyroscope permission on iOS 13+ if required
    try {
      const DevOrient = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DevOrient && typeof DevOrient.requestPermission === 'function') {
        const permission = await DevOrient.requestPermission();
        if (permission !== 'granted') return;
      }
    } catch {
      return;
    }

    triggerHaptic(18);
    setSteerMode('tilt');
    try {
      localStorage.setItem(STEER_MODE_KEY, 'tilt');
    } catch {
      // ignore storage error
    }
  }, [steerMode, onTouchInput]);

  // Android / Mobile Gyroscope Tilt-to-Steer listener
  useEffect(() => {
    if (!isTouch || steerMode !== 'tilt') return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return;

      const angle =
        window.screen?.orientation?.angle ??
        (window.innerWidth > window.innerHeight ? 90 : 0);

      let tiltDeg = 0;
      if (angle === 90) {
        tiltDeg = e.beta ?? 0;
      } else if (angle === 270 || angle === -90) {
        tiltDeg = -(e.beta ?? 0);
      } else if (angle === 180) {
        tiltDeg = -(e.gamma ?? 0);
      } else {
        tiltDeg = e.gamma ?? 0;
      }

      const deadzone = 3.5;
      const maxTilt = 30;
      let normalized = 0;
      if (Math.abs(tiltDeg) > deadzone) {
        const mag = Math.min(1, (Math.abs(tiltDeg) - deadzone) / (maxTilt - deadzone));
        // Positive steer turns left in engine physics; negative tilt (left) -> +steer
        normalized = -Math.sign(tiltDeg) * mag;
      }
      setTiltSteerVal(normalized);
      onTouchInput({ steer: normalized });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      onTouchInput({ steer: 0 });
    };
  }, [isTouch, steerMode, onTouchInput]);

  const rpmRatio = Math.min(1, telemetry.rpm / telemetry.maxRpm);
  const speedDisplay = String(telemetry.speedKmh).padStart(3, '0');
  const gearLabel = telemetry.gear === 0 ? 'R' : String(telemetry.gear);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.68;
  const arcLength = circumference * arcFraction;
  const activeLength = arcLength * rpmRatio;

  const minimapPath = React.useMemo(() => {
    if (minimapTrackPoints.length === 0) return '';
    return (
      minimapTrackPoints
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${(pt.x * 100).toFixed(1)} ${(pt.y * 100).toFixed(1)}`)
        .join(' ') + ' Z'
    );
  }, [minimapTrackPoints]);

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between safe-hud-padding sm:p-5">
      {/* TOP BAR */}
      <div className="flex items-start justify-between gap-2 w-full">
        {/* Top-Left: Position, Lap, Timers & Live Weather/Grip */}
        <div className="flex flex-col items-start gap-1.5 max-w-[60vw] sm:max-w-none">
          <div className="flex items-stretch gap-2 sm:gap-2.5 bg-[#090b10]/88 border border-slate-700/70 rounded-lg px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 shadow-lg">
            <div className="flex flex-col justify-center pr-2 sm:pr-3 border-r border-slate-700/70">
              <span className="text-[9px] sm:text-[10px] tracking-[0.16em] text-slate-400 uppercase font-semibold">
                POS
              </span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg sm:text-3xl font-bold tracking-tight text-amber-400 font-mono-num leading-none">
                  {formatOrdinal(telemetry.position)}
                </span>
                <span className="text-[10px] sm:text-xs text-slate-400 font-mono-num">
                  /{telemetry.totalRacers}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-center pr-2 sm:px-2 sm:pr-3 border-r border-slate-700/70">
              <span className="text-[9px] sm:text-[10px] tracking-[0.16em] text-slate-400 uppercase font-semibold">
                LAP
              </span>
              <div className="text-base sm:text-2xl font-bold text-slate-100 font-mono-num leading-none">
                {telemetry.lap}
                <span className="text-[11px] sm:text-sm text-slate-400">
                  /{telemetry.totalLaps}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-center min-w-[82px] sm:min-w-[126px]">
              <div className="flex items-center justify-between gap-1.5 sm:gap-3">
                <span className="hidden sm:inline text-[10px] tracking-[0.16em] text-slate-400 uppercase">
                  TIME
                </span>
                <span className="text-xs sm:text-base font-bold text-white font-mono-num leading-tight">
                  {formatLapTime(telemetry.currentLapMs)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1.5 sm:gap-3">
                <span className="text-[9px] sm:text-[10px] tracking-[0.12em] text-emerald-400 uppercase">
                  BST
                </span>
                <span className="text-[10px] sm:text-sm font-semibold text-emerald-300 font-mono-num leading-tight">
                  {formatLapTime(telemetry.bestLapMs)}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Weather & Road Grip Strip */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#090b10]/88 border border-slate-700/70 rounded-md px-2 py-1 sm:px-3 sm:py-1 shadow-md">
            {telemetry.weather === 'rain' ? (
              <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            ) : telemetry.weather === 'fog' ? (
              <CloudFog className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="text-[9px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-slate-200">
              {WEATHER_SPECS[telemetry.weather].label}
            </span>
            <span className="text-slate-600">·</span>
            <span
              className={`text-[9px] sm:text-[11px] font-mono-num font-bold ${
                telemetry.roadGripPct <= 82
                  ? 'text-sky-300'
                  : telemetry.roadGripPct <= 92
                    ? 'text-amber-300'
                    : 'text-emerald-400'
              }`}
            >
              GRIP {telemetry.roadGripPct}%
            </span>
          </div>
        </div>

        {/* Top-Right: Action Controls & Drift Score */}
        <div className="flex flex-col items-end gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto">
            {isTouch && (
              <button
                type="button"
                onClick={() => void toggleSteerMode()}
                title="Switch Touch Buttons / Phone Tilt Steering"
                className={`h-8 px-2 rounded-md border text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 cursor-pointer transition-colors ${
                  steerMode === 'tilt'
                    ? 'bg-sky-500 border-sky-300 text-slate-950'
                    : 'bg-[#090b10]/88 border-slate-700/70 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{steerMode === 'tilt' ? 'TILT' : 'PAD'}</span>
              </button>
            )}
            {fullscreenSupported && onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                title="Toggle Fullscreen"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/70 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onRespawn}
              title="Reset to Track (R)"
              className="h-8 w-8 sm:h-9 sm:w-auto sm:px-2.5 rounded-md bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/70 text-slate-200 flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wider cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">RESET</span>
            </button>
            <button
              type="button"
              onClick={onCycleCamera}
              title="Switch Camera (C)"
              className="h-8 w-8 sm:h-9 sm:w-auto sm:px-2.5 rounded-md bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/70 text-slate-200 flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden md:inline">{telemetry.cameraMode}</span>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title="Mute / Unmute Audio"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/70 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              )}
            </button>
            <button
              type="button"
              onClick={onPause}
              title="Pause (Esc)"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#090b10]/88 hover:bg-slate-800 border border-slate-700/70 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Drift Score Box */}
          <div className="bg-[#090b10]/88 border border-slate-700/70 rounded-lg px-2.5 py-1 sm:px-3.5 sm:py-2 text-right shadow-lg min-w-[106px] sm:min-w-[168px]">
            <div className="text-[9px] sm:text-[10px] tracking-[0.18em] text-slate-400 uppercase font-semibold">
              DRIFT
            </div>
            <div className="text-sm sm:text-2xl font-bold text-slate-100 font-mono-num leading-tight">
              {telemetry.totalDriftScore.toLocaleString()}
            </div>
            {(telemetry.isDrifting || telemetry.activeDriftPoints > 0) && (
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] sm:text-xs font-bold font-mono-num">
                <span className="text-amber-400">
                  +{telemetry.activeDriftPoints.toLocaleString()}
                </span>
                <span className="px-1 py-0.5 rounded bg-rose-600 text-white text-[9px] sm:text-[10px]">
                  {telemetry.driftMultiplier}X
                </span>
                <span className="hidden sm:inline text-sky-300 text-[10px]">
                  {Math.abs(telemetry.slipAngleDeg)}°
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CENTER TRANSIENT BANNERS / COUNTDOWN / WRONG WAY */}
      <div className="flex flex-col items-center justify-center gap-2 my-auto">
        {isCountdown && telemetry.countdownValue > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-[11px] sm:text-xs tracking-[0.35em] text-slate-200 uppercase font-bold mb-1">
              GRID READY
            </span>
            <div className="text-6xl sm:text-8xl font-extrabold text-amber-400 font-mono-num drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)]">
              {telemetry.countdownValue}
            </div>
            {telemetry.weather !== 'clear' && (
              <div className="mt-2 px-3 py-1 rounded bg-[#090b10]/90 border border-sky-400/60 text-[10px] sm:text-xs font-bold tracking-[0.14em] text-sky-200 uppercase shadow-lg">
                {WEATHER_SPECS[telemetry.weather].drivingTip}
              </div>
            )}
          </div>
        )}

        {telemetry.wrongWay && (
          <div className="px-4 py-1.5 rounded-md bg-rose-600/95 border border-rose-300 text-white font-bold tracking-[0.2em] text-xs sm:text-sm uppercase shadow-lg">
            WRONG WAY · TURN AROUND
          </div>
        )}

        {telemetry.bannerMessage && (
          <div className="px-4 py-1 rounded-md bg-[#090b10]/90 border border-amber-400/70 text-amber-300 font-bold tracking-[0.16em] text-xs sm:text-base uppercase shadow-lg">
            {telemetry.bannerMessage}
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div className="flex items-end justify-between gap-2 w-full">
        {/* Desktop Minimap */}
        {!isTouch && (
          <div className="bg-[#090b10]/85 border border-slate-700/70 rounded-lg p-2.5 shadow-lg hidden md:block">
            <svg viewBox="-8 -8 116 116" className="w-28 h-28 overflow-visible">
              <path
                d={minimapPath}
                fill="none"
                stroke="#334155"
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <path
                d={minimapPath}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {telemetry.minimapNorm.slice(1).map((pos, idx) => (
                <circle
                  key={idx}
                  cx={pos.x * 100}
                  cy={pos.y * 100}
                  r="3.2"
                  fill="#38bdf8"
                  stroke="#090b10"
                  strokeWidth="1"
                />
              ))}
              {telemetry.minimapNorm[0] && (
                <circle
                  cx={telemetry.minimapNorm[0].x * 100}
                  cy={telemetry.minimapNorm[0].y * 100}
                  r="4.5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
            </svg>
          </div>
        )}

        {/* Touch / Android Phone Controls (Fits 320px+ portrait & landscape) */}
        {isTouch && (
          <div className="flex items-end justify-between w-full pointer-events-auto gap-2">
            {/* Left Steering Pad OR Tilt Indicator */}
            {steerMode === 'buttons' ? (
              <div className="flex gap-1.5 sm:gap-2">
                <button
                  type="button"
                  aria-label="Steer Left"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateSteer('left', true);
                  }}
                  onPointerUp={() => updateSteer('left', false)}
                  onPointerCancel={() => updateSteer('left', false)}
                  className="touch-control w-13 h-13 sm:w-15 sm:h-15 rounded-xl bg-[#090b10]/88 border border-slate-600 text-white font-bold text-lg active:bg-slate-700 flex items-center justify-center"
                >
                  ◀
                </button>
                <button
                  type="button"
                  aria-label="Steer Right"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateSteer('right', true);
                  }}
                  onPointerUp={() => updateSteer('right', false)}
                  onPointerCancel={() => updateSteer('right', false)}
                  className="touch-control w-13 h-13 sm:w-15 sm:h-15 rounded-xl bg-[#090b10]/88 border border-slate-600 text-white font-bold text-lg active:bg-slate-700 flex items-center justify-center"
                >
                  ▶
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void toggleSteerMode()}
                className="touch-control w-28 sm:w-32 rounded-xl bg-[#090b10]/88 border border-sky-500/70 px-2.5 py-2 flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-sky-300">
                  <Smartphone className="w-3 h-3" />
                  <span>TILT STEER</span>
                </div>
                <div className="relative w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 w-3 rounded-full bg-amber-400 transition-transform duration-75"
                    style={{
                      left: 'calc(50% - 6px)',
                      transform: `translateX(${(-tiltSteerVal * 36).toFixed(1)}px)`,
                    }}
                  />
                </div>
                <span className="text-[8px] text-slate-400 uppercase tracking-wider">
                  TAP FOR BUTTONS
                </span>
              </button>
            )}

            {/* Compact Center Speed/Gear/Nitro Strip on Mobile */}
            <div className="flex flex-col items-center justify-center bg-[#090b10]/88 border border-slate-700/80 rounded-lg px-2.5 py-1.5 min-w-[78px] pointer-events-none">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-extrabold text-white font-mono-num leading-none">
                  {speedDisplay}
                </span>
                <span className="text-[9px] text-slate-400 font-semibold">KM/H</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 w-full">
                <span className="text-[10px] font-bold text-amber-400 font-mono-num">
                  G{gearLabel}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-400"
                    style={{ width: `${telemetry.nitro}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right 2x2 Ergonomic Pedal & Drift Cluster */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  triggerHaptic(14);
                  onTouchInput({ handbrake: true });
                }}
                onPointerUp={() => onTouchInput({ handbrake: false })}
                onPointerCancel={() => onTouchInput({ handbrake: false })}
                className="touch-control w-13 h-10 sm:w-15 sm:h-11 rounded-lg bg-rose-700/90 border border-rose-400 text-white font-bold text-[10px] tracking-wider active:bg-rose-600 flex items-center justify-center"
              >
                DRIFT
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onTouchInput({ nitro: true, throttle: 1 });
                }}
                onPointerUp={() => onTouchInput({ nitro: false, throttle: 0 })}
                onPointerCancel={() => onTouchInput({ nitro: false, throttle: 0 })}
                className="touch-control w-13 h-10 sm:w-15 sm:h-11 rounded-lg bg-sky-600/90 border border-sky-300 text-white font-bold text-[10px] tracking-wider active:bg-sky-500 flex items-center justify-center"
              >
                NITRO
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onTouchInput({ brake: 1 });
                }}
                onPointerUp={() => onTouchInput({ brake: 0 })}
                onPointerCancel={() => onTouchInput({ brake: 0 })}
                className="touch-control w-13 h-12 sm:w-15 sm:h-13 rounded-lg bg-[#090b10]/90 border border-slate-600 text-rose-300 font-bold text-[11px] active:bg-slate-800 flex items-center justify-center"
              >
                BRK
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onTouchInput({ throttle: 1 });
                }}
                onPointerUp={() => onTouchInput({ throttle: 0 })}
                onPointerCancel={() => onTouchInput({ throttle: 0 })}
                className="touch-control w-13 h-12 sm:w-15 sm:h-13 rounded-lg bg-emerald-600/92 border border-emerald-300 text-white font-bold text-[11px] active:bg-emerald-500 flex items-center justify-center"
              >
                GAS
              </button>
            </div>
          </div>
        )}

        {/* Desktop SVG Tachometer + Speedometer + Nitro */}
        {!isTouch && (
          <div className="hidden md:flex items-center gap-3 bg-[#090b10]/88 border border-slate-700/70 rounded-xl px-4 py-3 shadow-lg">
            <div className="flex flex-col items-center gap-1 pr-2 border-r border-slate-700/70">
              <span className="text-[9px] tracking-[0.18em] text-sky-400 font-bold">NOS</span>
              <div className="w-2.5 h-20 rounded-full bg-slate-800 overflow-hidden flex flex-col justify-end border border-slate-700">
                <div
                  className="w-full transition-all duration-75"
                  style={{
                    height: `${telemetry.nitro}%`,
                    backgroundColor: telemetry.isBoosting ? '#38bdf8' : '#0284c7',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono-num text-slate-300">{telemetry.nitro}%</span>
            </div>

            <div className="relative w-32 h-28 flex items-center justify-center">
              <svg viewBox="0 0 130 120" className="w-full h-full">
                <circle
                  cx="65"
                  cy="62"
                  r={radius}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="9"
                  strokeDasharray={`${arcLength} ${circumference}`}
                  strokeLinecap="round"
                  transform="rotate(147 65 62)"
                />
                <circle
                  cx="65"
                  cy="62"
                  r={radius}
                  fill="none"
                  stroke={rpmRatio > 0.85 ? '#ef4444' : rpmRatio > 0.65 ? '#f59e0b' : '#38bdf8'}
                  strokeWidth="9"
                  strokeDasharray={`${activeLength} ${circumference}`}
                  strokeLinecap="round"
                  transform="rotate(147 65 62)"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                <div className="text-3xl font-extrabold text-white leading-none font-mono-num">
                  {speedDisplay}
                </div>
                <div className="text-[10px] tracking-[0.22em] text-slate-400 font-semibold mt-0.5">
                  KM/H
                </div>
                <div className="mt-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-[11px] font-bold text-amber-400 font-mono-num">
                  GEAR {gearLabel}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
