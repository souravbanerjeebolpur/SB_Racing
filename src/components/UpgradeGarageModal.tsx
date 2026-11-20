import React from 'react';
import { Award, Flame, Gauge, Shield, Sparkles, Wrench, X, Zap } from 'lucide-react';
import {
  applyCarUpgrades,
  CAR_SPECS,
  DEFAULT_UPGRADES,
  UPGRADE_COSTS,
  type CarId,
  type CarUpgrades,
  type UpgradeKey,
} from '../game/types';

interface UpgradeGarageModalProps {
  selectedCar: CarId;
  unlockedLevel: number;
  credits: number;
  freeTokens: number;
  upgradesByCar: Partial<Record<CarId, CarUpgrades>>;
  onSelectCar: (carId: CarId) => void;
  onUpgrade: (carId: CarId, key: UpgradeKey, useFreeToken: boolean) => void;
  onClose: () => void;
}

const UPGRADE_ITEMS: {
  key: UpgradeKey;
  label: string;
  effect: string;
  icon: React.ReactNode;
  barColor: string;
}[] = [
  {
    key: 'engine',
    label: 'ENGINE & DRIVETRAIN',
    effect: '+4.5% Force · +5 KM/H Top Speed',
    icon: <Gauge className="w-4 h-4 text-rose-400" />,
    barColor: 'bg-rose-500',
  },
  {
    key: 'nitro',
    label: 'TURBO & NITRO SYSTEM',
    effect: '+5% Boost Power · Faster Recharge',
    icon: <Zap className="w-4 h-4 text-sky-400" />,
    barColor: 'bg-sky-400',
  },
  {
    key: 'handling',
    label: 'DRIFT SUSPENSION & TIRES',
    effect: '+2.2% Steer Response · Deeper Slip',
    icon: <Flame className="w-4 h-4 text-amber-400" />,
    barColor: 'bg-amber-400',
  },
  {
    key: 'aero',
    label: 'CARBON AERO CHASSIS',
    effect: '-2.5% Weight · +2 KM/H Aero Speed',
    icon: <Shield className="w-4 h-4 text-emerald-400" />,
    barColor: 'bg-emerald-400',
  },
];

export const UpgradeGarageModal: React.FC<UpgradeGarageModalProps> = ({
  selectedCar,
  unlockedLevel,
  credits,
  freeTokens,
  upgradesByCar,
  onSelectCar,
  onUpgrade,
  onClose,
}) => {
  const baseSpec = CAR_SPECS.find((c) => c.id === selectedCar) ?? CAR_SPECS[0];
  const carUpgrades = upgradesByCar[selectedCar] ?? DEFAULT_UPGRADES;
  const tunedSpec = applyCarUpgrades(baseSpec, carUpgrades);
  const unlockedCars = CAR_SPECS.filter((c) => c.unlockLevel <= unlockedLevel);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2.5 sm:p-4">
      <div className="w-full max-w-2xl bg-[#0c1018] border border-slate-700/85 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-800 bg-[#090c12]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold tracking-[0.14em] uppercase text-white truncate">
                PERFORMANCE UPGRADE GARAGE
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Tune your car after each level to conquer Level 10
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {freeTokens > 0 && (
              <div className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] sm:text-xs font-bold font-mono-num flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {freeTokens} FREE
              </div>
            )}
            <div className="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] sm:text-xs font-bold font-mono-num">
              {credits.toLocaleString()} CR
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Upgrade Garage"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {/* Unlocked Car Quick Picker */}
          <div>
            <div className="text-[10px] tracking-[0.14em] uppercase text-slate-400 font-bold mb-1.5">
              SELECT GARAGE CAR ({unlockedCars.length}/{CAR_SPECS.length} UNLOCKED)
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CAR_SPECS.map((car) => {
                const isUnlocked = car.unlockLevel <= unlockedLevel;
                const isSelected = car.id === selectedCar;
                return (
                  <button
                    key={car.id}
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => isUnlocked && onSelectCar(car.id)}
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                      !isUnlocked
                        ? 'bg-slate-950/60 border-slate-800/60 text-slate-600 cursor-not-allowed'
                        : isSelected
                          ? 'bg-slate-800 border-amber-400 text-white cursor-pointer'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: isUnlocked ? car.hexPrimary : '#334155' }}
                      />
                      <span className="text-[10px] sm:text-xs font-bold tracking-wider">
                        {car.shortName}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5 font-mono-num">
                      {isUnlocked ? `${car.bodyStyle.toUpperCase()}` : `LVL ${car.unlockLevel - 1}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Car Spec Banner */}
          <div className="bg-[#090c12] border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-4 h-10 rounded-sm shrink-0 border border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${tunedSpec.hexPrimary} 55%, ${tunedSpec.hexAccent} 55%)`,
                }}
              />
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-bold text-white tracking-wider truncate">
                  {tunedSpec.name}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {tunedSpec.subtitle} · {tunedSpec.bodyStyle.toUpperCase()} AERO
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 font-mono-num text-xs">
              <div>
                <div className="text-[9px] text-slate-400 uppercase">TOP SPEED</div>
                <div className="font-bold text-sky-400">{tunedSpec.topSpeedKmh} KM/H</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase">WEIGHT</div>
                <div className="font-bold text-emerald-400">{tunedSpec.mass} KG</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase">DRIFT</div>
                <div className="font-bold text-amber-400">{tunedSpec.stats.driftControl}</div>
              </div>
            </div>
          </div>

          {/* 4 Upgrade Subsystems */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {UPGRADE_ITEMS.map((item) => {
              const tier = carUpgrades[item.key] ?? 0;
              const isMax = tier >= 5;
              const cost = isMax ? 0 : UPGRADE_COSTS[tier];
              const canFree = !isMax && freeTokens > 0;
              const canAfford = !isMax && credits >= cost;

              return (
                <div
                  key={item.key}
                  className="bg-[#090c12] border border-slate-800 rounded-lg p-3 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.icon}
                        <span className="text-xs font-bold tracking-wider text-white truncate">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-num font-bold text-amber-300 shrink-0">
                        LVL {tier}/5
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{item.effect}</p>

                    {/* 5-Tier Progress Bar */}
                    <div className="grid grid-cols-5 gap-1 mt-2">
                      {[0, 1, 2, 3, 4].map((stepIdx) => (
                        <div
                          key={stepIdx}
                          className={`h-1.5 rounded-sm ${
                            stepIdx < tier ? item.barColor : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {isMax ? (
                    <div className="h-8 rounded-md bg-slate-800/70 border border-slate-700 text-emerald-400 text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5">
                      <Award className="w-3.5 h-3.5" />
                      MAXED OUT
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {canFree && (
                        <button
                          type="button"
                          onClick={() => onUpgrade(selectedCar, item.key, true)}
                          className="flex-1 h-8 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] sm:text-[11px] tracking-wider uppercase cursor-pointer transition-colors"
                        >
                          FREE UPGRADE
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onUpgrade(selectedCar, item.key, false)}
                        className={`flex-1 h-8 rounded-md font-bold text-[10px] sm:text-[11px] tracking-wider uppercase font-mono-num transition-colors ${
                          canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {cost.toLocaleString()} CR
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-[#090c12] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-[0.14em] uppercase cursor-pointer"
          >
            DONE & READY
          </button>
        </div>
      </div>
    </div>
  );
};
