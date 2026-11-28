/**
 * Minimal Jest mock of react-native-reanimated (what the wallet uses: the swipeable Toast).
 * Reanimated 4.7's own `react-native-reanimated/mock` imports the real module, whose native
 * initialiser throws under jest-expo ("setCSSEventHandler is not available in JSReanimated").
 * Same behaviour as the official mock: animations finish at once (withTiming / withSpring return
 * the target value and call their callback), useAnimatedStyle runs its worklet on every render,
 * Animated.View is a plain View; react-native-worklets is made unavailable (test/setup.ts), so
 * gesture-handler uses its plain JS path. `mockAnimations` records every animation started, so a test can
 * tell a slide or spring from an instant change (reduce motion).
 */
import { useState } from 'react';
import { View } from 'react-native';

export interface MockAnimation {
  kind: 'timing' | 'spring';
  toValue: number;
}

export const mockAnimations: MockAnimation[] = [];

type Callback = ((finished: boolean) => void) | undefined;

export function withTiming(toValue: number, _config?: unknown, callback?: Callback): number {
  mockAnimations.push({ kind: 'timing', toValue });
  callback?.(true);
  return toValue;
}

export function withSpring(toValue: number, _config?: unknown, callback?: Callback): number {
  mockAnimations.push({ kind: 'spring', toValue });
  callback?.(true);
  return toValue;
}

export interface MockSharedValue<T> {
  value: T;
  get: () => T;
  set: (next: T) => void;
}

export function useSharedValue<T>(initial: T): MockSharedValue<T> {
  const [shared] = useState(() => {
    const holder: MockSharedValue<T> = {
      value: initial,
      get: () => holder.value,
      set: (next: T) => {
        holder.value = next;
      },
    };
    return holder;
  });
  return shared;
}

export function useAnimatedStyle<T>(worklet: () => T): T {
  return worklet();
}

// what react-native-gesture-handler looks for when reanimated is installed (its JS path is used:
// the Toast's gesture runs its callbacks on the JS thread, runOnJS: true)
export const isSharedValue = (): boolean => false;
export const useEvent = () => () => undefined;
export const useHandler = () => ({ doDependenciesDiffer: false, context: {} });
export const useComposedEventHandler = () => () => undefined;
export const setGestureState = (): void => undefined;

const Animated = {
  View,
  createAnimatedComponent: <C>(component: C): C => component,
};
export default Animated;
