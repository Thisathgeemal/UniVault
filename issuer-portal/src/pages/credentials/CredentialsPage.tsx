/**
 * Credentials (/credentials): for now the entry to issuing – a holder search picker using the
 * existing holder list API. The list of issued credentials arrives with the next update.
 */
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import { HolderPicker } from '../../issuance/HolderPicker.js';

export function CredentialsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={t('issuance.credentialsPage.title')}
        description={t('issuance.credentialsPage.description')}
      />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t('issuance.credentialsPage.issueTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <HolderPicker />
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">{t('issuance.credentialsPage.listSoon')}</p>
    </>
  );
}
