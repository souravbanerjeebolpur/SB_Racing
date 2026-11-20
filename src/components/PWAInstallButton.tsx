import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState<'ios' | 'android' | null>(null);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install SB Racing 2026 App"
        className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-[10px] sm:text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
      >
        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span>INSTALL</span>
      </button>
    );
  }

  if (isAndroid || isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(isIOS ? 'ios' : 'android')}
          title={isIOS ? 'Install on iPhone / iPad' : 'Install on Android'}
          className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg bg-[#090b10]/88 hover:bg-slate-800 border border-sky-500/60 text-sky-300 font-bold text-[10px] sm:text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>GET APP</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
            <div className="w-full max-w-sm rounded-xl bg-[#0c1018] border border-slate-700 p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-white">
                    {showGuide === 'ios' ? 'INSTALL ON IPHONE / IPAD' : 'INSTALL ON ANDROID'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(null)}
                  className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {showGuide === 'android' ? (
                <div className="mt-3 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <p>Play <strong className="text-white">SB Racing 2026</strong> fullscreen like a native Android game with offline support:</p>
                  <p>1. Open this game directly in <strong className="text-sky-300">Google Chrome</strong> on Android.</p>
                  <p>2. Tap the <strong className="text-white">Menu (⋮)</strong> button in the top-right corner.</p>
                  <p>3. Select <strong className="text-amber-300">Add to Home screen</strong> or <strong className="text-amber-300">Install app</strong>.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <p>Install <strong className="text-white">SB Racing 2026</strong> to your Home Screen:</p>
                  <p>1. Tap the <strong className="text-sky-300">Share</strong> button in Safari toolbar.</p>
                  <p>2. Scroll down and tap <strong className="text-amber-300">Add to Home Screen</strong>.</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(null)}
                className="mt-4 w-full h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold tracking-wider uppercase cursor-pointer"
              >
                GOT IT
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-3 z-50 pointer-events-none flex items-center gap-2 rounded-lg bg-amber-600/95 border border-amber-300/80 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase text-slate-950 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode · Local Career Ready</span>
    </div>
  );
};
