/**
 * Instant Route Navigation Helper
 * Navigates immediately between routes without full-page fade/flash.
 */
export function transitionNavigate(navigate: (to: string) => void, to: string) {
  navigate(to);
}

