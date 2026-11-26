/**
 * The few icons portal-ui draws itself (portal-ui has no icon library dependency; apps pass
 * their own icons in). Decorative only: always aria-hidden.
 */
import type { ComponentProps, ReactNode } from 'react';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowUp = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);
export const ArrowDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Svg>
);
export const ArrowUpDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
  </Svg>
);
export const Close = (props: IconProps) => (
  <Svg {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
