/**
 * Modern Web Guidance: View Transitions API Helper
 * Smoothly morphs view state between pages if supported by browser,
 * falling back gracefully to instant route change.
 */
export function transitionNavigate(navigate: (to: string) => void, to: string) {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as any).startViewTransition(() => {
      navigate(to);
    });
  } else {
    navigate(to);
  }
}
