/**
 * Staff sign-in. The password lives only in this component's state while typing: it is never
 * logged, stored or kept in the query cache (the mutation has gcTime 0).
 */
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FullPageSpinner,
  Input,
  Label,
} from '@univault/portal-ui';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { login, loginSchema, type LoginInput } from '../api/auth.js';
import { useAuth } from '../auth/auth-context.js';
import { safeReturnTo } from '../auth/return-to.js';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import { loginErrorMessage } from '../lib/login-errors.js';

type FieldErrorKey = 'emailRequired' | 'emailInvalid' | 'passwordRequired' | 'passwordTooLong';
type FieldErrors = { email?: FieldErrorKey; password?: FieldErrorKey };

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId() };

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => login(auth.api, input),
    gcTime: 0,
    onSuccess: (result) => auth.startSession(result.accessToken, result.staff),
  });

  // Signed in (now or already): go to the requested page, or the dashboard
  if (auth.status === 'signedIn') return <Navigate to={returnTo} replace />;
  if (auth.status === 'restoring') return <FullPageSpinner label={t('common.loading')} />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === 'email' || field === 'password') && !errors[field]) {
          errors[field] = issue.message as FieldErrorKey;
        }
      }
      setFieldErrors(errors);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setFieldErrors({});
    mutation.mutate(parsed.data);
  };

  const error = mutation.isError ? loginErrorMessage(mutation.error, t, i18n.language) : null;
  const pending = mutation.isPending;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-accent-text">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              <span className="font-semibold">{t('app.name')}</span>
            </div>
            <CardTitle>
              <span className="text-h1">{t('login.title')}</span>
            </CardTitle>
            <CardDescription>{t('login.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {auth.notice === 'sessionExpired' && !error ? (
              <Alert role="status" className="mb-4">
                {t('session.expired')}
              </Alert>
            ) : null}
            {error ? (
              <Alert role="alert" variant="destructive" className="mb-4">
                <p>{error.message}</p>
                {error.reference ? (
                  <p className="mt-1 font-mono text-caption">{error.reference}</p>
                ) : null}
              </Alert>
            ) : null}
            <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.email}>{t('login.email')}</Label>
                <Input
                  ref={emailRef}
                  id={ids.email}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? ids.emailError : undefined}
                />
                {fieldErrors.email ? (
                  <p id={ids.emailError} className="text-body-sm text-status-revoked">
                    {t(`login.fieldErrors.${fieldErrors.email}`)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.password}>{t('login.password')}</Label>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id={ids.password}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    className="pr-11"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={fieldErrors.password ? ids.passwordError : undefined}
                  />
                  <Button
                    variant="text"
                    size="icon"
                    className="absolute right-0 top-0"
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    aria-pressed={showPassword}
                    aria-controls={ids.password}
                    onClick={() => setShowPassword((shown) => !shown)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {fieldErrors.password ? (
                  <p id={ids.passwordError} className="text-body-sm text-status-revoked">
                    {t(`login.fieldErrors.${fieldErrors.password}`)}
                  </p>
                ) : null}
              </div>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
