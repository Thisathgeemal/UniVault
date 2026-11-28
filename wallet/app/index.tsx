import { Redirect } from 'expo-router';
import { AREA_ENTRY, requiredArea } from '../src/onboarding/gate';
import { useSetup } from '../src/onboarding/SetupProvider';

/**
 * `/` (app start, `univault://`): wherever the gate says (src/onboarding/gate.ts): onboarding on
 * a first start, security setup after it, otherwise the Credentials tab.
 */
export default function Index() {
  const { state } = useSetup();
  return <Redirect href={AREA_ENTRY[requiredArea(state)]} />;
}
