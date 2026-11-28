import { Redirect } from 'expo-router';
import { ROUTES } from '../src/navigation/routes';

/** `/` (app start, `univault://`) opens the Credentials tab. */
export default function Index() {
  return <Redirect href={ROUTES.credentials} />;
}
