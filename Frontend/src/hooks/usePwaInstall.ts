import { useEffect, useState } from 'react';

// Not in the standard DOM lib — Chrome/Edge/Android-only, no TS definition
// ships with the toolchain.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  // display-mode: standalone covers desktop/Android installs; iOS Safari's
  // "Add to Home Screen" instead sets navigator.standalone (no
  // beforeinstallprompt support there at all, so canInstall is just always
  // false on iOS — nothing to detect, the OS handles that flow itself).
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Chrome only fires beforeinstallprompt once per page load and stops
// showing its own mini-infobar the moment preventDefault() is called on it —
// so the deferred event has to be captured and held here for whenever the
// user actually taps the app's own Install button, which can be much later.
export function usePwaInstall() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setDeferredEvent(null);
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    // The prompt can only ever be shown once per captured event regardless
    // of outcome — a "dismissed" choice needs a fresh beforeinstallprompt
    // (the browser fires one again on a later visit) before it can be
    // retried, so there's nothing this hook can do but drop it either way.
    setDeferredEvent(null);
    return outcome;
  }

  return { canInstall: !isInstalled && !!deferredEvent, promptInstall };
}
