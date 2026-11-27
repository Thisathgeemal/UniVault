import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../src/components';

/** Unknown route (e.g. an old or mistyped univault:// link). */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen testID="not-found-screen">
      <EmptyState
        icon="compass-outline"
        title={t('notFound.title')}
        message={t('notFound.message')}
        action={{ label: t('notFound.goHome'), onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
