/**
 * Revoke a credential (admin only; Decision 012). Reason from the backend's enum in plain
 * words, a note (required for "Other", at most NOTE_MAX_LENGTH characters), the warning (plus
 * "The wallet offer will stop working." for a pending credential), and a confirm button named
 * after the holder, disabled until a reason is chosen and while the request runs.
 * A refused request is explained in plain words and the data is refreshed.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, FormField, Select, useToast } from '@univault/portal-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NOTE_MAX_LENGTH,
  REVOCATION_REASONS,
  revokeCredential,
  type CredentialType,
  type EffectiveStatus,
  type RevocationReason,
} from '../api/credentials.js';
import { useAuth } from '../auth/auth-context.js';
import { actionErrorMessage, isConflict } from './conflicts.js';
import { invalidateAfterCredentialChange } from './invalidate.js';

export interface RevokeTarget {
  id: string;
  credentialType: CredentialType;
  effectiveStatus: EffectiveStatus;
  holder: { fullName: string };
}

export function RevokeDialog({
  credential,
  onClose,
}: {
  /** The credential to revoke; null = closed. */
  credential: RevokeTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState<RevocationReason | ''>('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  // A new credential opens a fresh form
  if ((credential?.id ?? null) !== openFor) {
    setOpenFor(credential?.id ?? null);
    setReason('');
    setNote('');
    setSubmitted(false);
  }

  const revoke = useMutation({
    mutationFn: (input: { id: string; reason: RevocationReason; note: string }) =>
      revokeCredential(api, input.id, {
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: async () => {
      toast.show({
        message: t('credentials.revoke.success', { name: credential!.holder.fullName }),
      });
      await invalidateAfterCredentialChange(queryClient);
      onClose();
    },
    onError: (error) => {
      if (isConflict(error)) void invalidateAfterCredentialChange(queryClient);
    },
  });
  if (!credential) return null;

  const trimmed = note.trim();
  const noteError =
    reason === 'other' && trimmed === '' && submitted
      ? t('credentials.revoke.noteRequired')
      : trimmed.length > NOTE_MAX_LENGTH
        ? t('credentials.revoke.noteTooLong', { max: NOTE_MAX_LENGTH })
        : undefined;
  const failure = revoke.isError ? actionErrorMessage(t, revoke.error) : null;

  const submit = () => {
    setSubmitted(true);
    if (!reason || revoke.isPending) return;
    if ((reason === 'other' && trimmed === '') || trimmed.length > NOTE_MAX_LENGTH) return;
    revoke.mutate({ id: credential.id, reason, note: trimmed });
  };

  return (
    <Dialog
      open
      title={t('credentials.revoke.title')}
      description={t('credentials.revoke.description', {
        type: t(`credentialTypes.${credential.credentialType}`),
        name: credential.holder.fullName,
      })}
      onClose={onClose}
      busy={revoke.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={revoke.isPending}>
            {t('credentials.revoke.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!reason || revoke.isPending}
            aria-busy={revoke.isPending || undefined}
          >
            {revoke.isPending
              ? t('credentials.revoke.revoking')
              : t('credentials.revoke.confirm', { name: credential.holder.fullName })}
          </Button>
        </>
      }
    >
      <FormField id="revoke-reason" label={t('credentials.revoke.reasonLabel')} required>
        {(control) => (
          <Select
            {...control}
            value={reason}
            onChange={(e) => setReason(e.target.value as RevocationReason | '')}
            disabled={revoke.isPending}
          >
            <option value="">{t('credentials.revoke.reasonPlaceholder')}</option>
            {REVOCATION_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`credentials.revoke.reasons.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        id="revoke-note"
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
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            disabled={revoke.isPending}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[invalid=true]:border-status-revoked"
          />
        )}
      </FormField>
      <Alert variant="destructive" className="flex flex-col gap-1">
        <p className="font-medium">{t('credentials.revoke.warning')}</p>
        {credential.effectiveStatus === 'pending' ? (
          <p>{t('credentials.revoke.pendingWarning')}</p>
        ) : null}
      </Alert>
      {failure ? (
        <Alert variant="destructive" role="alert">
          <p>{failure.message}</p>
          {failure.reference ? <p className="font-mono text-caption">{failure.reference}</p> : null}
        </Alert>
      ) : null}
    </Dialog>
  );
}
