import type { SidebarLinkProps } from '@univault/portal-ui';
import { Link } from 'react-router';

/** Adapts portal-ui's router-agnostic sidebar links to React Router. */
export function RouterLink({ href, children, ...props }: SidebarLinkProps) {
  return (
    <Link to={href} {...props}>
      {children}
    </Link>
  );
}
