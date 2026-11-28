/**
 * Reissue (or renew, for an expired credential) – /credentials/:credentialId/reissue, officer
 * and admin (Decision 012). Reason (backend enum), note (required for "Other"), optional
 * "Valid until" (the issuance rules and cap explanation), then the server's reissue preview
 * (POST /credentials/:id/reissue/preview, the SAME path as the reissue, nothing written):
 * Current vs Replacement field by field with changes highlighted, "No details changed" when
 * none, and the expiry difference. The confirmation checkbox of issuance is required. On
 * success: toast, every credential query refreshed, then the replacement's wallet offer.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorFallback,
  FormField,
  Input,
  PageHeader,
  Select,
  Skeleton,
  useToast,
} from '@univault/portal-ui';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  credentialQueryKey,
  CREDENTIALS_QUERY_KEY,
  fetchCredentialDetail,
  NOTE_MAX_LENGTH,
  previewReissue,
  REISSUE_REASONS,
  reissueCredential,
  type CredentialPreview,
  type ReissuePreview,
  type ReissueReason,
} from '../../api/credentials.js';
import { ApiError } from '../../api/errors.js';
import { useAuth } from '../../auth/auth-context.js';
import { credentialActions } from '../../credentials/actions.js';
import { actionErrorMessage, isConflict } from '../../credentials/conflicts.js';
import { invalidateAfterCredentialChange } from '../../credentials/invalidate.js';
import {
  capExplanation,
  claimLabel,
  formatClaimValue,
  groupPreviewClaims,
} from '../../issuance/claim-display.js';
import { formatCalendarDate, formatColomboDate } from '../../lib/format.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 400;

/** Claim names of both sides, in the holder form's order (derived claims next to their source). */
function orderedClaimNames(preview: ReissuePreview): string[] {
  const names = [
    ...new Set([
      ...Object.keys(preview.current.claims),
      ...Object.keys(preview.replacement.claims),
    ]),
  ];
  const derived = new Set(['age_over_18']);
  return groupPreviewClaims(preview.credentialType, {
    disclosable: names.filter((n) => !derived.has(n)).map((name) => ({ name, value: null })),
    derived: names.filter((n) => derived.has(n)).map((name) => ({ name, value: null })),
  }).flatMap((group) => group.claims.map((c) => c.name));
}

/** capExplanation() reads only the cap and the ID document type. */
function capText(t: TFunction, preview: ReissuePreview): string | null {
  return capExplanation(t, {
    expiry: { cappedBy: preview.replacement.cappedBy } as CredentialPreview['expiry'],
    disclosable: [{ name: 'id_document_type', value: preview.replacement.claims.id_document_type }],
  });
}

export function ReissueCredentialPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { credentialId = '' } = useParams();
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState<ReissueReason | ''>('');
  const [note, setNote] = useState('');
  const [untilText, setUntilText] = useState('');
  const [validUntil, setValidUntil] = useState<string | undefined>(undefined);
  const [confirmed, setConfirmed] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const credentialQuery = useQuery({
    queryKey: credentialQueryKey(credentialId),
    queryFn: ({ signal }) => fetchCredentialDetail(api, credentialId, signal),
  });
  const credential = credentialQuery.data;
  const trimmedNote = note.trim();
  const previewReady = reason !== '' && (reason !== 'other' || trimmedNote !== '');

  const previewQuery = useQuery({
    queryKey: [
      ...CREDENTIALS_QUERY_KEY,
      'reissue-preview',
      credentialId,
      reason,
      validUntil ?? null,
    ],
    queryFn: ({ signal }) =>
      previewReissue(
        api,
        credentialId,
        {
          reason: reason as ReissueReason,
          ...(reason === 'other' ? { note: trimmedNote } : {}),
          ...(validUntil ? { validUntil } : {}),
        },
        signal,
      ),
    enabled: previewReady && credential !== undefined,
    placeholderData: keepPreviousData,
    gcTime: 0, // holds claims
    retry: false,
  });
  const preview = previewQuery.data;

  // "Valid until": a date in the preview's range asks for a new preview after a pause
  const range = preview?.replacement.validUntilRange;
  const untilInRange =
    untilText === '' ||
    (DATE.test(untilText) && (!range || (untilText >= range.min && untilText <= range.max)));
  useEffect(() => {
    const next = untilText === '' ? undefined : untilText;
    if (next === validUntil || !untilInRange) return;
    const timer = setTimeout(() => setValidUntil(next), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [untilText, validUntil, untilInRange]);

  const reissue = useMutation({
    mutationFn: () =>
      reissueCredential(api, credentialId, {
        reason: reason as ReissueReason,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        ...(validUntil ? { validUntil } : {}),
      }),
    onSuccess: async ({ credential: replacement }) => {
      toast.show({ message: t('credentials.reissue.success') });
      await invalidateAfterCredentialChange(queryClient);
      void navigate(`/credentials/${replacement.id}/offer`);
    },
    onError: (error) => {
      if (isConflict(error)) void invalidateAfterCredentialChange(queryClient);
    },
  });

  if (credentialQuery.isError) {
    return (
      <ErrorFallback
        title={t('issuance.result.notFound.title')}
        message={t('issuance.result.notFound.message')}
        action={
          <Link to="/credentials" className={buttonVariants({ variant: 'secondary' })}>
            {t('issuance.credentialsPage.title')}
          </Link>
        }
      />
    );
  }
  if (!credential) return <Skeleton className="h-64" />;

  const actions = credentialActions(credential, user?.role);
  const renew = actions.reissue.kind === 'renew';
  const title = renew ? t('credentials.reissue.renewTitle') : t('credentials.reissue.title');
  const backLink = (
    <Link to={`/credentials/${credentialId}`} className={buttonVariants({ variant: 'secondary' })}>
      {t('credentials.reissue.back')}
    </Link>
  );
  if (!actions.reissue.visible) {
    return (
      <>
        <PageHeader title={title} />
        <Alert role="status" className="mb-6">
          {t('credentials.reissue.notAvailable')}
        </Alert>
        {backLink}
      </>
    );
  }

  const previewError = previewQuery.isError ? previewQuery.error : null;
  const untilRefused =
    previewError instanceof ApiError &&
    previewError.status === 400 &&
    (previewError.details as { path?: string }[] | undefined)?.some((d) => d.path === 'validUntil');
  const noteError =
    reason === 'other' && trimmedNote === '' && triedSubmit
      ? t('credentials.revoke.noteRequired')
      : undefined;
  const failure = reissue.isError
    ? actionErrorMessage(t, reissue.error)
    : previewError && !untilRefused
      ? actionErrorMessage(t, previewError)
      : null;
  const exists = (key: string) => i18n.exists(key);
  const value = (name: string, v: unknown) =>
    v === undefined
      ? '—'
      : formatClaimValue(t, credential.credentialType, name, v, language, exists);
  const rangeText = range
    ? { min: formatCalendarDate(range.min, language), max: formatCalendarDate(range.max, language) }
    : null;

  const submit = () => {
    setTriedSubmit(true);
    if (!previewReady || !confirmed || !preview || reissue.isPending) return;
    reissue.mutate();
  };

  return (
    <>
      <PageHeader
        title={title}
        description={t('credentials.reissue.description', {
          type: t(`credentialTypes.${credential.credentialType}`),
          name: credential.holder.fullName,
        })}
      />
      <div className="flex max-w-5xl flex-col gap-6">
        <Alert role="note">{t('credentials.reissue.whatHappens')}</Alert>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <FormField id="reissue-reason" label={t('credentials.reissue.reasonLabel')} required>
              {(control) => (
                <Select
                  {...control}
                  className="max-w-md"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReissueReason | '')}
                  disabled={reissue.isPending}
                >
                  <option value="">{t('credentials.reissue.reasonPlaceholder')}</option>
                  {REISSUE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`credentials.reissue.reasons.${r}`)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField
              id="reissue-note"
              label={t('credentials.revoke.noteLabel')}
              required={reason === 'other'}
              hint={t('credentials.revoke.noteHint', { max: NOTE_MAX_LENGTH })}
              error={noteError}
            >
              {(control) => (
                <textarea
                  {...control}
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  rows={2}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={reissue.isPending}
                  className="w-full max-w-xl rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[invalid=true]:border-status-revoked"
                />
              )}
            </FormField>
            <FormField
              id="reissue-valid-until"
              label={t('issuance.validity.validUntil')}
              {...(rangeText ? { hint: t('issuance.validity.validUntilHint', rangeText) } : {})}
              error={
                (!untilInRange || untilRefused) && rangeText
                  ? t('issuance.validity.outOfRange', rangeText)
                  : undefined
              }
              className="max-w-xs"
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  {...(range ? { min: range.min, max: range.max } : {})}
                  value={untilText}
                  onChange={(e) => setUntilText(e.target.value)}
                  disabled={reissue.isPending}
                />
              )}
            </FormField>
          </CardContent>
        </Card>

        {!previewReady ? (
          <p className="text-body-sm text-text-muted">
            {reason === 'other'
              ? t('credentials.revoke.noteRequired')
              : t('credentials.reissue.choosePrompt')}
          </p>
        ) : !preview ? (
          previewQuery.isFetching ? (
            <>
              <p role="status" className="sr-only">
                {t('credentials.reissue.loadingPreview')}
              </p>
              <Skeleton className="h-48" />
            </>
          ) : null
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('credentials.reissue.compareTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {preview.changedFields.length === 0 ? (
                <Alert role="status">{t('credentials.reissue.noChanges')}</Alert>
              ) : (
                <p role="status" className="text-body-sm font-medium">
                  {t('credentials.reissue.changedCount', { count: preview.changedFields.length })}
                </p>
              )}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-body-sm">
                  <caption className="sr-only">{t('credentials.reissue.compareCaption')}</caption>
                  <thead className="border-b border-border bg-surface-sunken text-text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {t('credentials.reissue.field')}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {t('credentials.reissue.current')}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {t('credentials.reissue.replacement')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedClaimNames(preview).map((name) => {
                      const changed = preview.changedFields.includes(name);
                      return (
                        <tr
                          key={name}
                          data-changed={changed ? 'true' : undefined}
                          className={
                            changed
                              ? 'bg-status-expired-bg text-status-expired-text'
                              : 'border-t border-border'
                          }
                        >
                          <th scope="row" className="px-4 py-2 font-medium">
                            {claimLabel(t, name)}
                            {changed ? (
                              <span className="ml-2 rounded-full border border-current px-2 text-caption">
                                {t('credentials.reissue.changed')}
                              </span>
                            ) : null}
                          </th>
                          <td className="px-4 py-2 break-words">
                            {value(name, preview.current.claims[name])}
                          </td>
                          <td className="px-4 py-2 break-words">
                            {value(name, preview.replacement.claims[name])}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-border font-medium">
                      <th scope="row" className="px-4 py-2">
                        {t('credentials.reissue.expiry')}
                      </th>
                      <td className="px-4 py-2">
                        {formatColomboDate(preview.current.expiresAt, language)}
                      </td>
                      <td className="px-4 py-2">
                        {formatColomboDate(preview.replacement.expiresAt, language)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p aria-live="polite" className="text-body-sm">
                {preview.current.expiresAt === preview.replacement.expiresAt
                  ? t('credentials.reissue.expirySame', {
                      date: formatColomboDate(preview.replacement.expiresAt, language),
                    })
                  : t('credentials.reissue.expiryChange', {
                      from: formatColomboDate(preview.current.expiresAt, language),
                      to: formatColomboDate(preview.replacement.expiresAt, language),
                    })}
              </p>
              {capText(t, preview) ? <p className="text-body-sm">{capText(t, preview)}</p> : null}
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  aria-invalid={triedSubmit && !confirmed ? true : undefined}
                  aria-describedby={triedSubmit && !confirmed ? 'reissue-confirm-error' : undefined}
                />
                <span>{t('issuance.confirm.checkbox')}</span>
              </label>
              {triedSubmit && !confirmed ? (
                <p
                  id="reissue-confirm-error"
                  className="text-body-sm font-medium text-status-revoked"
                >
                  {t('issuance.confirm.required')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}

        {failure ? (
          <Alert variant="destructive" role="alert">
            <p>{failure.message}</p>
            {failure.reference ? (
              <p className="font-mono text-caption">{failure.reference}</p>
            ) : null}
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={submit}
            disabled={!preview || reissue.isPending}
            aria-busy={reissue.isPending || undefined}
          >
            {reissue.isPending
              ? t('credentials.reissue.submitting')
              : renew
                ? t('credentials.reissue.submitRenew')
                : t('credentials.reissue.submit')}
          </Button>
          {backLink}
        </div>
      </div>
    </>
  );
}
