/**
 * Luxury Haptic Engine for Kilani Diamond Ledger
 * Provides tailored sensory feedback for iOS/Android devices.
 * Gracefully no-ops on desktop or devices without vibration support.
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export const triggerHaptic = (pattern: HapticPattern = 'light') => {
  try {
    if (typeof window === 'undefined' || !window.navigator || !('vibrate' in window.navigator)) {
      return;
    }

    switch (pattern) {
      case 'selection':
      case 'light':
        // Crisp, ultra-subtle tap (like iOS UIImpactFeedbackGeneratorStyleLight)
        window.navigator.vibrate(10);
        break;
      case 'medium':
        // Distinct solid tap
        window.navigator.vibrate(22);
        break;
      case 'heavy':
        // Firm tap for primary/irreversible confirmations
        window.navigator.vibrate(40);
        break;
      case 'success':
        // Dual pulse for successful completion
        window.navigator.vibrate([12, 50, 18]);
        break;
      case 'warning':
        // Two quick pulses
        window.navigator.vibrate([20, 60, 20]);
        break;
      case 'error':
        // Triple sharp stutter
        window.navigator.vibrate([30, 40, 30, 40, 30]);
        break;
      default:
        window.navigator.vibrate(12);
    }
  } catch {
    // Silently ignore browser security policies/errors
  }
};
