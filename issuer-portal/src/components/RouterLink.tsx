import type { ComponentProps } from 'react';
import { Link } from 'react-router';

/**
 * Adapts portal-ui's router-agnostic links (Sidebar's and StatCard's linkComponent) to React
 * Router: `href` becomes `to`, every other anchor attribute is passed through.
 */
export function RouterLink({ href, children, ...props }: ComponentProps<'a'> & { href: string }) {
  return (
    <Link to={href} {...props}>
      {children}
    </Link>
  );
}
