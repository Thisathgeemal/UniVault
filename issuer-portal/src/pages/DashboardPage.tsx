import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth-context.js';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null; // the protected layout only renders pages for a signed-in user
  return (
    <>
      <PageHeader
        title={t('dashboard.welcome', { name: user.displayName })}
        description={t('dashboard.description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.organisation')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="font-medium" data-testid="dashboard-org">
              {user.issuer.name}
            </p>
            <Badge variant="outline" className="self-start">
              {t(`issuerTypes.${user.issuer.type}`)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.role')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Badge variant="accent" className="self-start" data-testid="dashboard-role">
              {t(`roles.${user.role}`)}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.signedInAs', { email: user.email })}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
