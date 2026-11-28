/**
 * Issue a credential (/credentials/new?holderId=…&step=…&validUntil=…), officer and admin.
 *
 *   1 Holder and type   holder summary; the schemas GET /credential-schemas allows (one today)
 *   2 Details           the claims of POST /credentials/preview, read-only, plus "Valid until"
 *   3 Preview           a wallet-style card: always shown vs holder chooses (badges, tooltips)
 *   4 Confirm           "checked against the original documents", then POST /credentials
 *
 * Claims are NEVER assembled or edited here (Decision 019): the backend builds them from the
 * holder record with the same code for the preview and the issuance. The step and validUntil
 * live in the URL, so Back / forward and a refresh keep them.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  CredentialCardPreview,
  FormField,
  Input,
  PageHeader,
  Skeleton,
  Stepper,
  Tooltip,
  type CredentialCardItem,
} from '@univault/portal-ui';
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router';
import {
  credentialQueryKey,
  CREDENTIAL_SCHEMAS_QUERY_KEY,
  fetchCredentialSchemas,
  issueCredential,
  previewCredential,
  type CredentialPreview,
  type IssuableSchema,
} from '../../api/credentials.js';
import { DASHBOARD_SUMMARY_QUERY_KEY } from '../../api/dashboard.js';
import { fetchHolder, HOLDERS_QUERY_KEY, type HolderDetail } from '../../api/holders.js';
import { useAuth } from '../../auth/auth-context.js';
import { maskIdNumber } from '../../holders/display.js';
import { tKey } from '../../holders/validation.js';
import {
  capExplanation,
  claimLabel,
  formatClaimValue,
  groupPreviewClaims,
} from '../../issuance/claim-display.js';
import { HolderPicker } from '../../issuance/HolderPicker.js';
import { IssuanceProblemAlert } from '../../issuance/IssuanceProblemAlert.js';
import { issuanceProblem, type IssuanceProblem } from '../../issuance/problems.js';
import { formatCalendarDate, formatColomboDate } from '../../lib/format.js';

const STEP_IDS = ['holder', 'details', 'preview', 'confirm'] as const;
/** A changed "Valid until" asks for a new preview after this pause. */
const PREVIEW_DEBOUNCE_MS = 400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Problems that stop the flow until the holder record or the credential is dealt with. */
const BLOCKING: ReadonlySet<IssuanceProblem['kind']> = new Set([
  'activeExists',
  'holderInvalid',
  'keyUnavailable',
  'holderNotFound',
]);

export function IssueCredentialPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const holderId = params.get('holderId') ?? '';
  if (!holderId) {
    return (
      <>
        <PageHeader title={t('issuance.title')} description={t('issuance.picker.description')} />
        <Card>
          <CardHeader>
            <CardTitle>{t('issuance.picker.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <HolderPicker />
          </CardContent>
        </Card>
      </>
    );
  }
  return <IssueWizard key={holderId} holderId={holderId} />;
}

function IssueWizard({ holderId }: { holderId: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { api } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number.parseInt(params.get('step') ?? '1', 10) || 1, 1), 4);
  const urlValidUntil = params.get('validUntil') ?? '';
  const validUntil = DATE.test(urlValidUntil) ? urlValidUntil : undefined;
  const leaving = useRef(false);

  const update = (changes: { step?: number; validUntil?: string | null }, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (changes.step !== undefined) next.set('step', String(changes.step));
        if (changes.validUntil !== undefined) next.delete('validUntilRejected');
        if (changes.validUntil === null) next.delete('validUntil');
        else if (changes.validUntil !== undefined) next.set('validUntil', changes.validUntil);
        return next;
      },
      { replace },
    );
  /** The server refused the date (e.g. the allowed range changed): fall back to the default. */
  const validUntilRejected = params.get('validUntilRejected') === '1';

  const holder = useQuery({
    queryKey: [...HOLDERS_QUERY_KEY, 'detail', holderId],
    queryFn: ({ signal }) => fetchHolder(api, holderId, signal),
  });
  const schemas = useQuery({
    queryKey: CREDENTIAL_SCHEMAS_QUERY_KEY,
    queryFn: ({ signal }) => fetchCredentialSchemas(api, signal),
    staleTime: 5 * 60_000,
  });
  const schema: IssuableSchema | undefined = schemas.data?.[0];
  const preview = useQuery({
    queryKey: [
      'credentials',
      'preview',
      holderId,
      schema?.credentialType ?? null,
      validUntil ?? null,
    ],
    queryFn: ({ signal }) =>
      previewCredential(
        api,
        {
          holderId,
          credentialType: schema!.credentialType,
          ...(validUntil ? { validUntil } : {}),
        },
        signal,
      ),
    enabled: schema !== undefined,
    placeholderData: keepPreviousData,
    gcTime: 0, // holds the holder's claims: keep it only while the page uses it
  });

  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [issueProblem, setIssueProblem] = useState<IssuanceProblem | null>(null);

  const issue = useMutation({
    mutationFn: () =>
      issueCredential(api, {
        holderId,
        credentialType: schema!.credentialType,
        ...(validUntil ? { validUntil } : {}),
      }),
    onSuccess: (credential) => {
      leaving.current = true;
      queryClient.setQueryData(credentialQueryKey(credential.id), credential);
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_SUMMARY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: HOLDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['credentials', 'holder', holderId] });
      void navigate(`/credentials/${credential.id}?issued=1`, { replace: true });
    },
    onError: (error) => setIssueProblem(issuanceProblem(error)),
  });

  // Leaving after the first step asks first (the credential is not issued yet)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && step > 1 && currentLocation.pathname !== nextLocation.pathname,
  );

  const previewProblem = preview.isError ? issuanceProblem(preview.error) : null;
  const dateRefused = previewProblem?.kind === 'validUntil' && validUntil !== undefined;
  useEffect(() => {
    if (!dateRefused) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('validUntil');
        next.set('validUntilRejected', '1');
        return next;
      },
      { replace: true },
    );
  }, [dateRefused, setParams]);
  const blocked = previewProblem !== null && BLOCKING.has(previewProblem.kind);
  const data = preview.data;
  const canContinue =
    holder.data !== undefined &&
    schema !== undefined &&
    !blocked &&
    (step === 1 || (data !== undefined && !preview.isError));

  const onIssue = () => {
    if (issue.isPending) return; // no double submit
    if (!confirmed) {
      setConfirmError(true);
      return;
    }
    setIssueProblem(null);
    issue.mutate();
  };

  const steps = STEP_IDS.map((id) => ({ id, label: tKey(t, `issuance.steps.${id}`) }));
  const problem = issueProblem ?? (previewProblem?.kind === 'validUntil' ? null : previewProblem);

  return (
    <>
      <PageHeader title={t('issuance.title')} />
      <Stepper
        label={t('issuance.steps.label')}
        steps={steps}
        current={step - 1}
        statusLabels={{
          complete: t('issuance.stepStatus.complete'),
          current: t('issuance.stepStatus.current'),
          upcoming: t('issuance.stepStatus.upcoming'),
        }}
        onSelect={(index) => update({ step: index + 1 })}
      />

      {problem ? (
        <IssuanceProblemAlert
          problem={problem}
          holderId={holderId}
          onRetry={() => void (issueProblem ? onIssue() : preview.refetch())}
        />
      ) : null}

      <div className="flex max-w-4xl flex-col gap-6">
        {step === 1 ? (
          <HolderAndSchemaStep
            holder={holder}
            schemas={schemas.data}
            schemasFailed={schemas.isError}
          />
        ) : !data ? (
          <div aria-busy="true">
            {preview.isFetching ? (
              <p role="status" className="sr-only">
                {t('issuance.details.loading')}
              </p>
            ) : null}
            <Skeleton className="h-48" />
          </div>
        ) : step === 2 ? (
          <DetailsStep
            preview={data}
            holderId={holderId}
            validUntil={validUntil ?? ''}
            validUntilRejected={validUntilRejected}
            onValidUntil={(value) => update({ validUntil: value || null }, true)}
          />
        ) : step === 3 ? (
          <PreviewCard preview={data} schema={schema!} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('issuance.confirm.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p>
                {t('issuance.confirm.summary', {
                  type: t(`credentialTypes.${data.credentialType}`),
                  name: data.holder.fullName,
                  date: formatColomboDate(data.expiry.expiresAt, language),
                })}
              </p>
              <div className="flex flex-col gap-1">
                <label className="flex items-start gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-accent"
                    checked={confirmed}
                    aria-invalid={confirmError && !confirmed ? true : undefined}
                    aria-describedby={confirmError && !confirmed ? 'confirm-error' : undefined}
                    onChange={(e) => {
                      setConfirmed(e.target.checked);
                      if (e.target.checked) setConfirmError(false);
                    }}
                  />
                  {t('issuance.confirm.checkbox')}
                </label>
                {confirmError && !confirmed ? (
                  <p id="confirm-error" className="text-body-sm font-medium text-status-revoked">
                    {t('issuance.confirm.required')}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => update({ step: step - 1 })}>
              {t('issuance.back')}
            </Button>
          ) : null}
          {step < 4 ? (
            <Button disabled={!canContinue} onClick={() => update({ step: step + 1 })}>
              {t('issuance.next')}
            </Button>
          ) : (
            <Button disabled={issue.isPending || !canContinue} onClick={onIssue}>
              {issue.isPending ? t('issuance.confirm.issuing') : t('issuance.confirm.issue')}
            </Button>
          )}
          <Link to={`/holders/${holderId}`} className={buttonVariants({ variant: 'text' })}>
            {t('issuance.cancel')}
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('issuance.leave.title')}
        message={t('issuance.leave.message')}
        confirmLabel={t('issuance.leave.confirm')}
        cancelLabel={t('issuance.leave.stay')}
        tone="destructive"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function HolderAndSchemaStep({
  holder,
  schemas,
  schemasFailed,
}: {
  holder: { data?: HolderDetail | undefined; isError: boolean };
  schemas: IssuableSchema[] | undefined;
  schemasFailed: boolean;
}) {
  const { t } = useTranslation();
  const idNumber = holder.data
    ? [holder.data.claims.id_document_number, holder.data.claims.nic_number].find(
        (v): v is string => typeof v === 'string',
      )
    : undefined;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('issuance.holder.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {holder.isError ? (
            <p role="alert">{t('issuance.holder.loadFailed')}</p>
          ) : !holder.data ? (
            <Skeleton className="h-16" />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-h3 font-semibold">{holder.data.fullName}</p>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="text-body-sm text-text-muted">{t('issuance.holder.reference')}</dt>
                  <dd className="font-mono">{holder.data.externalRef}</dd>
                </div>
                <div>
                  <dt className="text-body-sm text-text-muted">{t('issuance.holder.idNumber')}</dt>
                  <dd className="font-mono">
                    {idNumber ? (
                      <>
                        <span aria-hidden="true">{maskIdNumber(idNumber.slice(-4))}</span>
                        <span className="sr-only">
                          {t('holders.list.idEnding', { last4: idNumber.slice(-4) })}
                        </span>
                      </>
                    ) : (
                      t('holders.list.noIdNumber')
                    )}
                  </dd>
                </div>
              </dl>
              <Link
                to="/credentials/new"
                className="text-body-sm font-medium text-accent-text hover:underline"
              >
                {t('issuance.holder.change')}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
      <fieldset className="rounded-md border border-border bg-surface p-5">
        <legend className="px-1 font-semibold">{t('issuance.schema.legend')}</legend>
        {schemasFailed ? (
          <p role="alert">{t('issuance.schema.loadFailed')}</p>
        ) : !schemas ? (
          <Skeleton className="h-10" />
        ) : (
          schemas.map((s, index) => (
            <div key={s.credentialType} className="flex flex-col gap-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="credential-type"
                  value={s.credentialType}
                  defaultChecked={index === 0}
                  className="h-4 w-4 accent-accent"
                />
                <span className="font-medium">{t(`credentialTypes.${s.credentialType}`)}</span>
              </label>
              <p className="pl-6 text-body-sm text-text-muted">
                {t(`issuance.schema.notes.${s.credentialType}`)}
              </p>
            </div>
          ))
        )}
      </fieldset>
    </>
  );
}

function DetailsStep({
  preview,
  holderId,
  validUntil,
  validUntilRejected,
  onValidUntil,
}: {
  preview: CredentialPreview;
  holderId: string;
  validUntil: string;
  validUntilRejected: boolean;
  onValidUntil: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const exists = (key: string) => i18n.exists(key);
  const { min, max } = preview.expiry.validUntilRange;
  const [text, setText] = useState(validUntil);
  const [lastValue, setLastValue] = useState(validUntil);
  if (validUntil !== lastValue) {
    setLastValue(validUntil);
    setText(validUntil);
  }
  const inRange = text === '' || (DATE.test(text) && text >= min && text <= max);

  const onValidUntilRef = useRef(onValidUntil);
  useEffect(() => {
    onValidUntilRef.current = onValidUntil;
  }, [onValidUntil]);
  useEffect(() => {
    if (text === validUntil || !inRange) return;
    const timer = setTimeout(() => onValidUntilRef.current(text), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, validUntil, inRange]);

  const range = { min: formatCalendarDate(min, language), max: formatCalendarDate(max, language) };
  const cap = capExplanation(t, preview);
  const groups = groupPreviewClaims(preview.credentialType, preview);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('issuance.details.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-body-sm text-text-muted">{t('issuance.details.description')}</p>
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`details-${group.id}`}>
              <h3 id={`details-${group.id}`} className="mb-2 font-semibold">
                {group.id === 'other'
                  ? t('issuance.details.otherGroup')
                  : tKey(t, `holders.register.groups.${group.id}`)}
              </h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {group.claims.map((claim) => (
                  <div key={claim.name} className="flex flex-col gap-0.5">
                    <dt className="text-body-sm text-text-muted">{claimLabel(t, claim.name)}</dt>
                    <dd className="font-medium break-words">
                      {formatClaimValue(
                        t,
                        preview.credentialType,
                        claim.name,
                        claim.value,
                        language,
                        exists,
                      )}
                      {claim.derived ? (
                        <span className="block text-caption font-normal text-text-muted">
                          {t('issuance.preview.derived')}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <Link
            to={`/holders/${holderId}`}
            className="text-body-sm font-medium text-accent-text hover:underline"
          >
            {t('issuance.details.wrongDetails')}
          </Link>
        </CardContent>
      </Card>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5">
        <legend className="px-1 font-semibold">{t('issuance.validity.legend')}</legend>
        <p aria-live="polite" className="font-medium">
          {t('issuance.validity.expiresOn', {
            date: formatColomboDate(preview.expiry.expiresAt, language),
          })}
        </p>
        <p className="text-body-sm text-text-muted">
          {t('issuance.validity.defaultExpiry', {
            date: formatColomboDate(preview.expiry.defaultExpiresAt, language),
          })}
        </p>
        {cap ? <p className="text-body-sm">{cap}</p> : null}
        <FormField
          id="valid-until"
          label={t('issuance.validity.validUntil')}
          hint={t('issuance.validity.validUntilHint', range)}
          error={
            !inRange || validUntilRejected ? t('issuance.validity.outOfRange', range) : undefined
          }
          className="max-w-xs"
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              min={min}
              max={max}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </FormField>
        {validUntil ? (
          <Button
            variant="text"
            size="sm"
            className="self-start"
            onClick={() => {
              setText('');
              onValidUntil('');
            }}
          >
            {t('issuance.validity.useDefault')}
          </Button>
        ) : null}
      </fieldset>
    </>
  );
}

function DisclosableBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      <Badge>{t('issuance.preview.disclosable')}</Badge>
      <Tooltip content={t('issuance.preview.disclosableExplained')}>
        {(trigger) => (
          <button
            type="button"
            {...trigger}
            aria-label={t('issuance.preview.disclosableInfo')}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Info aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </Tooltip>
    </span>
  );
}

/** Step 3: the credential as the wallet will show it; badges follow GET /credential-schemas. */
function PreviewCard({ preview, schema }: { preview: CredentialPreview; schema: IssuableSchema }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const exists = (key: string) => i18n.exists(key);
  const envelope = preview.alwaysVisible;
  const shown = new Set(schema.alwaysVisible);
  const envelopeItems: [string, CredentialCardItem][] = [
    [
      'issuer_name',
      {
        id: 'issuer',
        label: t('issuance.preview.issuer'),
        value: String(envelope.issuer_name ?? ''),
      },
    ],
    [
      'vct',
      {
        id: 'type',
        label: t('issuance.preview.type'),
        value: t(`credentialTypes.${preview.credentialType}`),
      },
    ],
    [
      'iat',
      {
        id: 'iat',
        label: t('issuance.preview.issuedOn'),
        value: formatColomboDate(String(envelope.iat), language) ?? '',
        note: t('issuance.preview.issuedOnNote'),
      },
    ],
    [
      'exp',
      {
        id: 'exp',
        label: t('issuance.preview.expiresOn'),
        value: formatColomboDate(preview.expiry.expiresAt, language) ?? '',
      },
    ],
    [
      'jti',
      {
        id: 'jti',
        label: t('issuance.preview.credentialId'),
        value: t('issuance.preview.assignedOnIssue'),
      },
    ],
  ];
  const disclosableField = new Map(schema.fields.map((f) => [f.name, f.selectivelyDisclosable]));
  const claimItems: CredentialCardItem[] = groupPreviewClaims(preview.credentialType, preview)
    .flatMap((g) => g.claims)
    .map((claim) => ({
      id: claim.name,
      label: claimLabel(t, claim.name),
      value: formatClaimValue(t, preview.credentialType, claim.name, claim.value, language, exists),
      ...(disclosableField.get(claim.name) ? { badge: <DisclosableBadge /> } : {}),
      ...(claim.derived ? { note: t('issuance.preview.derived') } : {}),
    }));

  return (
    <CredentialCardPreview
      title={t(`credentialTypes.${preview.credentialType}`)}
      subtitle={preview.issuer.name}
      sections={[
        {
          id: 'always',
          title: t('issuance.preview.alwaysShown'),
          description: t('issuance.preview.alwaysShownDescription'),
          tone: 'muted',
          items: envelopeItems.filter(([name]) => shown.has(name)).map(([, item]) => item),
        },
        {
          id: 'holder',
          title: t('issuance.preview.holderChooses'),
          description: t('issuance.preview.holderChoosesDescription'),
          items: claimItems,
        },
      ]}
      footer={t('issuance.preview.boundToWallet')}
    />
  );
}
