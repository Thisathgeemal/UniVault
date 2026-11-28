/**
 * Swipe-to-dismiss toasts (src/components/Toast.tsx): past 35 % of the width or a fast flick the
 * same way dismisses (slide out), a short drag springs back; the auto-dismiss timer pauses while
 * the finger is down and resumes with the time left; the close button and the screen-reader
 * "dismiss" action; reduce motion (no slide, no spring); each toast is dismissed once only (the
 * next one in the queue survives). Gestures are driven with gesture-handler's fireGestureHandler,
 * animations with the reanimated mock (test/mocks/reanimated.ts).
 */
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, Pressable, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import {
  shouldDismissSwipe,
  SWIPE_DISMISS_FRACTION,
  SWIPE_FLICK_VELOCITY,
  SWIPE_OUT_MS,
  TOAST_DURATION_MS,
  useToast,
} from '../src/components';
import { en } from '../src/i18n/locales/en';
import { space } from '../src/theme';
import { mockAnimations } from './mocks/reanimated';
import { renderWithProviders } from './render';

// the toast's width before it is measured: the window minus the side margins (space-4 each)
const WIDTH = Dimensions.get('window').width - 2 * space(4);
const FAR = Math.ceil(SWIPE_DISMISS_FRACTION * WIDTH) + 1;

function Shower() {
  const toast = useToast();
  return (
    <>
      <Pressable testID="show-one" onPress={() => toast.show({ message: 'First' })}>
        <Text>one</Text>
      </Pressable>
      <Pressable
        testID="show-two"
        onPress={() => {
          toast.show({ message: 'First' });
          toast.show({ message: 'Second' });
        }}
      >
        <Text>two</Text>
      </Pressable>
    </>
  );
}

const u = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

async function showToast(id: 'show-one' | 'show-two' = 'show-one') {
  await renderWithProviders(<Shower />);
  await u().press(screen.getByTestId(id));
  expect(await screen.findByTestId('toast')).toBeOnTheScreen();
}

/** Finger down, drag to `translationX`, release with `velocityX`. */
async function swipe(translationX: number, velocityX = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('toast-swipe'), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: translationX / 2 },
      { state: State.ACTIVE, translationX },
      { state: State.END, translationX, velocityX },
    ]);
  });
}

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockAnimations.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the swipe rule', () => {
  it('dismisses past 35 % of the width, or on a fast flick the same way', () => {
    expect(SWIPE_DISMISS_FRACTION).toBe(0.35);
    expect(shouldDismissSwipe(35, 0, 100)).toBe(true);
    expect(shouldDismissSwipe(-35, 0, 100)).toBe(true);
    expect(shouldDismissSwipe(34, 0, 100)).toBe(false);
    expect(shouldDismissSwipe(10, SWIPE_FLICK_VELOCITY, 100)).toBe(true);
    expect(shouldDismissSwipe(-10, -SWIPE_FLICK_VELOCITY, 100)).toBe(true);
    expect(shouldDismissSwipe(0, SWIPE_FLICK_VELOCITY, 100)).toBe(true);
    expect(shouldDismissSwipe(10, -SWIPE_FLICK_VELOCITY, 100)).toBe(false); // flicked back
    expect(shouldDismissSwipe(10, SWIPE_FLICK_VELOCITY - 1, 100)).toBe(false);
  });
});

describe('swiping a toast', () => {
  it('right, past the threshold: slides out to the right and is dismissed', async () => {
    await showToast();
    await swipe(FAR);
    expect(mockAnimations).toContainEqual({ kind: 'timing', toValue: WIDTH + space(4) });
    await advance(SWIPE_OUT_MS);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('left, past the threshold: slides out to the left and is dismissed', async () => {
    await showToast();
    await swipe(-FAR);
    expect(mockAnimations).toContainEqual({ kind: 'timing', toValue: -(WIDTH + space(4)) });
    await advance(SWIPE_OUT_MS);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a short drag springs back and the toast stays', async () => {
    await showToast();
    await swipe(40);
    expect(mockAnimations).toEqual([{ kind: 'spring', toValue: 0 }]);
    await advance(SWIPE_OUT_MS * 2);
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
  });

  it('measures its real width: the threshold is 35 % of what was laid out', async () => {
    await showToast();
    await act(async () => {
      fireEvent(screen.getByTestId('toast'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 48 } },
      });
    });
    await swipe(60); // under 70 (35 % of 200): springs back
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
    await swipe(71);
    expect(mockAnimations).toContainEqual({ kind: 'timing', toValue: 200 + space(4) });
    await advance(SWIPE_OUT_MS);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a fast flick dismisses even a short drag', async () => {
    await showToast();
    await swipe(-30, -(SWIPE_FLICK_VELOCITY + 400));
    await advance(SWIPE_OUT_MS);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('the timer pauses while the finger is down and resumes with the time left', async () => {
    await showToast();
    await advance(TOAST_DURATION_MS - 500);
    // a controller keeps the finger down between steps (fireGestureHandler always ends)
    const finger = createGestureController('toast-swipe');
    await act(async () => {
      finger.begin({ translationX: 0 });
      finger.activate({ translationX: 20 });
      finger.update({ translationX: 30 });
    });
    await advance(10_000); // held: never dismissed
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
    await act(async () => {
      finger.end({ translationX: 30, velocityX: 0 });
    });
    await advance(400);
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
    await advance(200);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('dismisses each toast once only: the next one in the queue stays', async () => {
    await showToast('show-two');
    expect(screen.getByText('First')).toBeOnTheScreen();
    await swipe(FAR);
    await advance(SWIPE_OUT_MS);
    expect(await screen.findByText('Second')).toBeOnTheScreen();
    await advance(SWIPE_OUT_MS * 2);
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });
});

describe('without swiping', () => {
  it('the close button dismisses', async () => {
    await showToast();
    expect(screen.getByRole('button', { name: en.toast.dismiss })).toBeOnTheScreen();
    await u().press(screen.getByTestId('toast-dismiss'));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('screen readers get a "dismiss" action on the message', async () => {
    await showToast();
    const message = screen.getByTestId('toast-message');
    expect(message.props.accessibilityActions).toEqual([
      { name: 'dismiss', label: en.toast.dismiss },
    ]);
    await act(async () => {
      fireEvent(message, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(screen.getByTestId('toast')).toBeOnTheScreen(); // other actions do nothing
    await act(async () => {
      fireEvent(message, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('still dismisses itself after the duration', async () => {
    await showToast();
    await advance(TOAST_DURATION_MS);
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('reduce motion', () => {
  // the RN mock's jest.fn (never spyOn + restore it: that keeps the new implementation)
  const reduce = () => AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
  beforeEach(() => {
    reduce().mockResolvedValue(true);
  });
  afterEach(() => {
    reduce().mockResolvedValue(false);
  });

  it('a swipe past the threshold dismisses at once, without the slide', async () => {
    await showToast();
    await swipe(FAR);
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(mockAnimations).toEqual([]);
  });

  it('a short drag goes back without the spring', async () => {
    await showToast();
    await swipe(40);
    expect(mockAnimations).toEqual([]);
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
  });
});
