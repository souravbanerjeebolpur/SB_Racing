import { useCallback, useEffect, useState } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  released?: boolean;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const requestLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const wakeLockApi = (
          navigator as unknown as {
            wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
          }
        ).wakeLock;
        if (!wakeLockApi) return;
        sentinel = await wakeLockApi.request('screen');
      } catch {
        // Ignore wake lock errors when battery saver or frame policy denies it
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [active]);
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const isSupported =
    typeof document !== 'undefined' &&
    Boolean(document.documentElement.requestFullscreen) &&
    document.fullscreenEnabled !== false;

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial inside sandboxed iframes
    }
  }, []);

  return { isFullscreen, isSupported, toggleFullscreen };
}
