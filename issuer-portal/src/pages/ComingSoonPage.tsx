import { ComingSoon, PageHeader } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import type { AppRoute } from '../routes/app-routes.js';

/** Placeholder for a planned page: its title and the sprint it arrives in. */
export function ComingSoonPage({ route }: { route: AppRoute }) {
  const { t } = useTranslation();
  const Icon = route.icon;
  const title = t(route.labelKey);
  return (
    <>
      <PageHeader title={title} />
      <ComingSoon
        title={title}
        badge={t('comingSoon.badge')}
        description={t('comingSoon.description', { sprint: route.comingInSprint })}
        icon={<Icon className="h-10 w-10" />}
      />
    </>
  );
}
