import { Alert, Button } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiErrorMessage } from '../lib/api-errors.js';
import type { IssuanceProblem } from './problems.js';

const linkClass = 'font-medium underline underline-offset-2';

/** The message, and the way out, for a preview or issuance problem. */
export function IssuanceProblemAlert({
  problem,
  holderId,
  onRetry,
}: {
  problem: IssuanceProblem;
  holderId: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  let body;
  switch (problem.kind) {
    case 'activeExists':
      body = (
        <>
          <p className="font-medium">{t('issuance.errors.activeExists')}</p>
          <p>{t('issuance.errors.activeExistsAction')}</p>
          {problem.credentialId ? (
            <Link to={`/credentials/${problem.credentialId}`} className={linkClass}>
              {t('issuance.errors.openExisting')}
            </Link>
          ) : null}
        </>
      );
      break;
    case 'holderInvalid':
      body = (
        <>
          <p className="font-medium">{t('issuance.errors.holderInvalid')}</p>
          <Link to={`/holders/${holderId}`} className={linkClass}>
            {t('issuance.errors.updateHolder')}
          </Link>
        </>
      );
      break;
    case 'keyUnavailable':
      body = <p className="font-medium">{t('issuance.errors.keyUnavailable')}</p>;
      break;
    case 'holderNotFound':
      body = <p className="font-medium">{t('issuance.errors.notFound')}</p>;
      break;
    case 'validUntil':
      body = <p className="font-medium">{t('issuance.errors.failed')}</p>;
      break;
    case 'network':
      body = <p className="font-medium">{t('errors.network')}</p>;
      break;
    default: {
      const message = apiErrorMessage(problem.error, t);
      body = (
        <>
          <p className="font-medium">{t('issuance.errors.failed')}</p>
          <p>{message.message}</p>
          {message.reference ? <p className="font-mono text-xs">{message.reference}</p> : null}
        </>
      );
    }
  }
  const retry = problem.kind === 'network' || problem.kind === 'other';
  return (
    <Alert variant="destructive" role="alert" className="mb-6 flex flex-col items-start gap-1">
      {body}
      {retry && onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      ) : null}
    </Alert>
  );
}
