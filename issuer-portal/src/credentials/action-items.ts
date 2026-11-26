/**
 * The credential actions as labelled items, from credentialActions() (the ONE rule). The table
 * shows them in an ActionMenu, the credential page as buttons: same items, same order.
 */
import type { ActionMenuItem } from '@univault/portal-ui';
import type { TFunction } from 'i18next';
import type { Role } from '../api/auth.js';
import type { EffectiveStatus } from '../api/credentials.js';
import { credentialActions } from './actions.js';

export interface ActionHandlers {
  /** Opens the revoke dialog. */
  onRevoke: () => void;
  /** Goes to a page (reissue, offer, detail). */
  navigate: (path: string) => void;
}

export function credentialActionItems(
  t: TFunction,
  credential: { id: string; effectiveStatus: EffectiveStatus; hasActiveOffer?: boolean },
  role: Role | undefined,
  handlers: ActionHandlers,
  { includeView = false }: { includeView?: boolean } = {},
): ActionMenuItem[] {
  const actions = credentialActions(credential, role);
  const items: ActionMenuItem[] = [];
  if (includeView) {
    items.push({
      id: 'view',
      label: t('credentials.actions.view'),
      onSelect: () => handlers.navigate(`/credentials/${credential.id}`),
    });
  }
  if (actions.offer.visible) {
    items.push({
      id: 'offer',
      label:
        actions.offer.kind === 'show'
          ? t('credentials.actions.showOffer')
          : t('credentials.actions.createOffer'),
      onSelect: () => handlers.navigate(`/credentials/${credential.id}/offer`),
    });
  }
  if (actions.reissue.visible) {
    items.push({
      id: 'reissue',
      label:
        actions.reissue.kind === 'renew'
          ? t('credentials.actions.renew')
          : t('credentials.actions.reissue'),
      onSelect: () => handlers.navigate(`/credentials/${credential.id}/reissue`),
    });
  }
  if (actions.revoke.visible) {
    items.push({
      id: 'revoke',
      label: t('credentials.actions.revoke'),
      tone: 'destructive',
      onSelect: handlers.onRevoke,
      ...(actions.revoke.enabled
        ? {}
        : { disabled: true, disabledReason: t('credentials.actions.adminOnly') }),
    });
  }
  return items;
}
