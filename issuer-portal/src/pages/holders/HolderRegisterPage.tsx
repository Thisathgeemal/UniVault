/**
 * Register a holder (/holders/new, officer + admin). The form is generated from the credential
 * schema of the signed-in issuer's type (employer → employee / Employment credential, bank →
 * customer / KYC credential) and validated in the browser with the same schema and rules as
 * the backend (Decision 018): on blur and on submit, with an error summary that takes focus.
 * Server errors are mapped back onto the fields. Leaving a changed form asks first.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  buttonVariants,
  ConfirmDialog,
  ErrorSummary,
  FormField,
  Input,
  PageHeader,
  Select,
  useToast,
  type ErrorSummaryItem,
} from '@univault/portal-ui';
import type { CredentialTypeName } from '@univault/claims-validation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useNavigate } from 'react-router';
import { DASHBOARD_SUMMARY_QUERY_KEY } from '../../api/dashboard.js';
import { ApiError } from '../../api/errors.js';
import { createHolder, HOLDERS_QUERY_KEY, type HolderDetail } from '../../api/holders.js';
import { useAuth } from '../../auth/auth-context.js';
import { optionLabel } from '../../holders/display.js';
import {
  CREDENTIAL_TYPE_OF_ISSUER,
  enumOptions,
  EXTERNAL_REF,
  fieldId,
  initialFormState,
  inputKind,
  maxLengthOf,
  RECORD_TYPE_OF,
  toClaims,
  toExternalRef,
  visibleFields,
  type FieldUi,
  type FormState,
} from '../../holders/form-model.js';
import {
  fieldKey,
  fieldLabel,
  issueMessage,
  serverFieldIssues,
  tKey,
  validateHolderForm,
  type FieldIssue,
} from '../../holders/validation.js';
import { apiErrorMessage, type ApiErrorMessage } from '../../lib/api-errors.js';

export function HolderRegisterPage() {
  const { user } = useAuth();
  if (!user) return null;
  const type = CREDENTIAL_TYPE_OF_ISSUER[user.issuer.type];
  return <HolderForm key={type} type={type} />;
}

/** The first issue per path. */
function byPath(issues: readonly FieldIssue[]): Map<string, FieldIssue> {
  const map = new Map<string, FieldIssue>();
  for (const issue of issues) if (!map.has(issue.path)) map.set(issue.path, issue);
  return map;
}

function HolderForm({ type }: { type: CredentialTypeName }) {
  const { t, i18n } = useTranslation();
  const exists = (key: string) => i18n.exists(key);
  const { api } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recordType = RECORD_TYPE_OF[type];

  const [initial] = useState(() => initialFormState(type));
  const [state, setState] = useState<FormState>(initial);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [serverIssues, setServerIssues] = useState<FieldIssue[]>([]);
  /** 409: undefined = none; null = conflict without a link. */
  const [conflictId, setConflictId] = useState<string | null | undefined>(undefined);
  const [failure, setFailure] = useState<ApiErrorMessage | null>(null);
  const leaving = useRef(false);

  const claims = toClaims(type, state);
  const externalRef = toExternalRef(state);
  const localIssues = validateHolderForm(type, claims, externalRef);
  const local = byPath(localIssues);
  const server = byPath(serverIssues);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  const groups = visibleFields(type, state, recordType);
  const visiblePaths = new Set(
    groups.filter((g) => !g.hidden).flatMap((g) => g.fields.map((f) => f.field.path)),
  );

  const mutation = useMutation({
    mutationFn: () =>
      createHolder(api, {
        claims,
        ...(recordType === 'customer' && externalRef ? { externalRef } : {}),
      }),
    onSuccess: (holder: HolderDetail) => {
      leaving.current = true;
      queryClient.setQueryData([...HOLDERS_QUERY_KEY, 'detail', holder.id], holder);
      void queryClient.invalidateQueries({ queryKey: [...HOLDERS_QUERY_KEY, 'list'] });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_SUMMARY_QUERY_KEY });
      toast.show({ message: t('holders.register.success', { name: holder.fullName }) });
      void navigate(`/holders/${holder.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const issues = serverFieldIssues(error.details);
        if (issues.length > 0) {
          setServerIssues(issues);
          setFocusKey((k) => k + 1);
          return;
        }
      }
      if (error instanceof ApiError && error.code === 'HOLDER_ALREADY_EXISTS') {
        const id = (error.details as { holderId?: unknown } | undefined)?.holderId;
        setConflictId(typeof id === 'string' ? id : null);
        return;
      }
      setFailure(apiErrorMessage(error, t));
    },
  });

  // Unsaved changes: ask before leaving the page (in-app navigation and closing the tab)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setValue = (path: string, value: string) => {
    setState((current) => ({ ...current, values: { ...current.values, [path]: value } }));
    setServerIssues((current) => current.filter((i) => i.path !== path));
  };
  const setObject = (name: string, on: boolean) =>
    setState((current) => ({ ...current, objects: { ...current.objects, [name]: on } }));
  const touch = (path: string) =>
    setTouched((current) => (current.has(path) ? current : new Set([...current, path])));

  /** The error shown under a field: the server's first, else the browser's once relevant. */
  const errorFor = (path: string): string | undefined => {
    const issue =
      server.get(path) ?? (submitted || touched.has(path) ? local.get(path) : undefined);
    return issue ? issueMessage(t, issue, claims, exists) : undefined;
  };

  const summaryIssues = [...serverIssues, ...(submitted ? localIssues : [])];
  const summary: ErrorSummaryItem[] = [...byPath(summaryIssues).values()].map((issue) => {
    const message = issueMessage(t, issue, claims, exists);
    const known = exists(`holders.fields.${fieldKey(issue.path)}.label`);
    const label = known ? fieldLabel(t, issue.path) : issue.path;
    return visiblePaths.has(issue.path)
      ? { fieldId: fieldId(issue.path), message: `${label}: ${message}` }
      : { message: `${label}: ${message}` };
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return; // no double submit
    setSubmitted(true);
    setServerIssues([]);
    setConflictId(undefined);
    setFailure(null);
    if (localIssues.length > 0) {
      setFocusKey((k) => k + 1);
      return;
    }
    mutation.mutate();
  };

  const hintFor = (field: FieldUi): string | undefined => {
    if (field.path === 'id_document_number' && typeof claims.id_document_type === 'string') {
      const key = `holders.fields.id_document_number.hints.${claims.id_document_type}`;
      if (exists(key)) return tKey(t, key);
    }
    const key = `holders.fields.${fieldKey(field.path)}.hint`;
    return exists(key) ? tKey(t, key) : undefined;
  };

  const renderField = (field: FieldUi, required: boolean) => {
    const kind = inputKind(type, field);
    const value = state.values[field.path] ?? '';
    const common = {
      value,
      onBlur: () => touch(field.path),
    };
    return (
      <FormField
        key={field.path}
        id={fieldId(field.path)}
        label={fieldLabel(t, field.path)}
        required={required}
        hint={hintFor(field)}
        error={errorFor(field.path)}
      >
        {(control) =>
          kind === 'select' ? (
            <Select
              {...control}
              {...common}
              onChange={(e) => {
                setValue(field.path, e.target.value);
                touch(field.path);
              }}
            >
              <option value="">{t('holders.register.selectPlaceholder')}</option>
              {enumOptions(type, field.path).map((option) => (
                <option key={option} value={option}>
                  {optionLabel(t, field.path, option, exists)}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              {...control}
              {...common}
              type={kind}
              maxLength={field.path === EXTERNAL_REF ? 30 : maxLengthOf(type, field.path)}
              autoComplete={field.autoComplete}
              spellCheck={false}
              onChange={(e) => setValue(field.path, e.target.value)}
            />
          )
        }
      </FormField>
    );
  };

  return (
    <>
      <PageHeader
        title={
          recordType === 'employee'
            ? t('holders.register.titleEmployee')
            : t('holders.register.titleCustomer')
        }
        description={t('holders.register.description', {
          credential: t(`credentialTypes.${type}`),
        })}
      />

      <ErrorSummary
        title={t('holders.register.errorSummary')}
        errors={summary}
        focusKey={focusKey}
      />

      {conflictId !== undefined ? (
        <Alert variant="destructive" role="alert" className="mb-6 flex flex-col gap-1">
          <p className="font-medium">{t('holders.register.conflict')}</p>
          {conflictId ? (
            <Link
              to={`/holders/${conflictId}`}
              className="font-medium underline underline-offset-2"
            >
              {t('holders.register.conflictLink')}
            </Link>
          ) : null}
        </Alert>
      ) : null}
      {failure ? (
        <Alert variant="destructive" role="alert" className="mb-6 flex flex-col gap-1">
          <p className="font-medium">{t('holders.register.failed')}</p>
          <p>{failure.message}</p>
          {failure.reference ? <p className="font-mono text-xs">{failure.reference}</p> : null}
        </Alert>
      ) : null}

      <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
        <p className="text-sm text-muted-foreground">{t('holders.register.requiredNote')}</p>
        {groups.map(({ group, hidden, fields }) => (
          <fieldset
            key={group.id}
            className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
          >
            <legend className="px-1 text-base font-semibold">
              {tKey(t, `holders.register.groups.${group.id}`)}
            </legend>
            {group.id === 'permanentAddress' ? (
              <p className="text-sm text-muted-foreground">{t('holders.register.countryNote')}</p>
            ) : null}
            {group.optionalObject ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={Boolean(state.objects[group.optionalObject])}
                  onChange={(e) => setObject(group.optionalObject!, e.target.checked)}
                />
                {t('holders.register.residentialToggle')}
              </label>
            ) : null}
            {hidden ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(({ field, required }) => renderField(field, required))}
              </div>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('holders.register.submitting') : t('holders.register.submit')}
          </Button>
          <Link to="/holders" className={buttonVariants({ variant: 'outline' })}>
            {t('holders.register.cancel')}
          </Link>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('holders.register.leave.title')}
        message={t('holders.register.leave.message')}
        confirmLabel={t('holders.register.leave.confirm')}
        cancelLabel={t('holders.register.leave.stay')}
        tone="destructive"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  );
}
