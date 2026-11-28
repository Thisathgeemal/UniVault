/**
 * Onboarding illustrations: simple, original flat drawings (react-native-svg), one per step, all
 * the same size (ILLUSTRATION_HEIGHT) on a `brand-soft` panel (OnboardingStep). No stock art, no
 * logos, no gradients, no text inside the drawings (labels are AppText, translated).
 *
 * Token colours only, chosen to read in BOTH themes on brand-soft (pairs in src/theme/contrast.ts):
 *   - line:   `text` outlines on every shape (15:1 light, 11.7:1 dark on brand-soft): in dark mode
 *             navy on brand-soft is only 1.08:1, so a shape is always drawn by its outline;
 *   - body:   `surface` fills;
 *   - navy:   `brand` for small filled details (credential cards, shields, padlocks) with
 *             `on-brand` marks on them;
 *   - accent: `accent` for the arrows and "checked" marks (4.35:1 light, 5.36:1 dark), with
 *             `on-accent` ticks inside accent circles;
 *   - muted:  `text-muted` for secondary lines.
 * Never a status colour (those mean valid, expired, revoked, pending only). The drawings are
 * decorative: the step's text says everything they show, so they are hidden from screen readers.
 * The setup (PIN) intro reuses SecurityIllustration on the same brand-soft panel.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { AppText } from '../components/AppText';
import { space } from '../theme';
import { useTheme } from '../theme/use-theme';

/** Drawing height in points, the same on every step (the panel adds space-4 around it). */
export const ILLUSTRATION_HEIGHT = space(36);
const VIEW_BOX = '0 0 320 160';
const W = 3; // outline width

/** The illustration colours (token names; see the file comment). */
export function useIllustrationColors() {
  const { colors } = useTheme();
  return {
    line: colors.text,
    body: colors.surface,
    navy: colors.brand,
    onNavy: colors.onBrand,
    accent: colors.accent,
    onAccent: colors.onAccent,
    muted: colors.textMuted,
  };
}

function Drawing({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={ILLUSTRATION_HEIGHT} viewBox={VIEW_BOX}>
        {children}
      </Svg>
    </View>
  );
}

/** A phone with a navy credential card on its screen (the holder). */
function Phone({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const c = useIllustrationColors();
  const w = 64 * scale;
  const h = 116 * scale;
  const round = { strokeWidth: W, strokeLinecap: 'round' as const };
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10 * scale}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Line
        x1={x + w * 0.38}
        y1={y + 9 * scale}
        x2={x + w * 0.62}
        y2={y + 9 * scale}
        stroke={c.muted}
        {...round}
      />
      <Rect
        x={x + 8 * scale}
        y={y + 24 * scale}
        width={w - 16 * scale}
        height={34 * scale}
        rx={5 * scale}
        fill={c.navy}
        stroke={c.line}
        strokeWidth={1.5}
      />
      <Line
        x1={x + 14 * scale}
        y1={y + 36 * scale}
        x2={x + w - 18 * scale}
        y2={y + 36 * scale}
        stroke={c.onNavy}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Line
        x1={x + 14 * scale}
        y1={y + 46 * scale}
        x2={x + w - 30 * scale}
        y2={y + 46 * scale}
        stroke={c.onNavy}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Line
        x1={x + 12 * scale}
        y1={y + 74 * scale}
        x2={x + w - 12 * scale}
        y2={y + 74 * scale}
        stroke={c.muted}
        {...round}
      />
      <Line
        x1={x + 12 * scale}
        y1={y + 86 * scale}
        x2={x + w - 24 * scale}
        y2={y + 86 * scale}
        stroke={c.muted}
        {...round}
      />
    </>
  );
}

/** A navy shield with a tick: "protected". */
function Shield({ cx, cy }: { cx: number; cy: number }) {
  const c = useIllustrationColors();
  return (
    <>
      <Path
        d={`M${cx} ${cy - 30} l26 10 v20 c0 20 -12 32 -26 38 c-14 -6 -26 -18 -26 -38 v-20 z`}
        fill={c.navy}
        stroke={c.line}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Path
        d={`M${cx - 11} ${cy + 3} l8 8 l15 -16`}
        fill="none"
        stroke={c.onNavy}
        strokeWidth={W}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** An accent arrow pointing right. */
function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const c = useIllustrationColors();
  return (
    <>
      <Line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={c.accent}
        strokeWidth={W + 1}
        strokeLinecap="round"
      />
      <Path
        d={`M${x2 - 9} ${y - 8} L${x2 + 1} ${y} L${x2 - 9} ${y + 8}`}
        fill="none"
        stroke={c.accent}
        strokeWidth={W + 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** An organisation's building with a navy roof (the issuer). */
function Building({ x, y }: { x: number; y: number }) {
  const c = useIllustrationColors();
  return (
    <>
      <Path
        d={`M${x} ${y + 22} L${x + 34} ${y} L${x + 68} ${y + 22} Z`}
        fill={c.navy}
        stroke={c.line}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Rect
        x={x + 6}
        y={y + 22}
        width={56}
        height={56}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      {[18, 34, 50].map((dx) => (
        <Line
          key={dx}
          x1={x + dx}
          y1={y + 32}
          x2={x + dx}
          y2={y + 66}
          stroke={c.muted}
          strokeWidth={W}
          strokeLinecap="round"
        />
      ))}
      <Line
        x1={x}
        y1={y + 80}
        x2={x + 68}
        y2={y + 80}
        stroke={c.line}
        strokeWidth={W}
        strokeLinecap="round"
      />
    </>
  );
}

/** A person behind a counter with an accent tick: someone checking a credential (the verifier). */
function Checker({ x, y }: { x: number; y: number }) {
  const c = useIllustrationColors();
  return (
    <>
      <Circle cx={x + 32} cy={y + 14} r={12} fill={c.body} stroke={c.line} strokeWidth={W} />
      <Path
        d={`M${x + 12} ${y + 52} a20 20 0 0 1 40 0`}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Rect
        x={x}
        y={y + 52}
        width={64}
        height={28}
        rx={4}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Line
        x1={x + 10}
        y1={y + 66}
        x2={x + 40}
        y2={y + 66}
        stroke={c.muted}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Circle cx={x + 58} cy={y + 6} r={11} fill={c.accent} />
      <Path
        d={`M${x + 52} ${y + 6} l4 4 l8 -8`}
        fill="none"
        stroke={c.onAccent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** Two speech bubbles: choosing a language. */
export function LanguageIllustration() {
  const c = useIllustrationColors();
  return (
    <Drawing testID="illustration-language">
      <Rect
        x={70}
        y={28}
        width={110}
        height={64}
        rx={14}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Path
        d="M96 92 l-6 20 l22 -20"
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Line
        x1={88}
        y1={52}
        x2={160}
        y2={52}
        stroke={c.muted}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Line
        x1={88}
        y1={68}
        x2={140}
        y2={68}
        stroke={c.muted}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Rect
        x={150}
        y={64}
        width={104}
        height={60}
        rx={14}
        fill={c.navy}
        stroke={c.line}
        strokeWidth={W}
      />
      <Path
        d="M228 124 l6 18 l-22 -18"
        fill={c.navy}
        stroke={c.line}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Line
        x1={168}
        y1={86}
        x2={236}
        y2={86}
        stroke={c.onNavy}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Line
        x1={168}
        y1={102}
        x2={214}
        y2={102}
        stroke={c.onNavy}
        strokeWidth={W}
        strokeLinecap="round"
      />
    </Drawing>
  );
}

/** A phone holding a credential, with a shield: your identity on your phone. */
export function WelcomeIllustration() {
  return (
    <Drawing testID="illustration-welcome">
      <Phone x={128} y={22} />
      <Shield cx={224} cy={66} />
    </Drawing>
  );
}

/**
 * Issuer → holder → verifier: an organisation's building, a phone with a credential card, a
 * person at a counter with a tick, joined by accent arrows; the three role names under the
 * drawing (translated, centred under each figure).
 */
export function HowItWorksIllustration({
  labels,
}: {
  labels: readonly [issuer: string, holder: string, verifier: string];
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(2) }}>
      <Drawing testID="illustration-how-it-works">
        <Building x={14} y={42} />
        <Arrow x1={92} x2={122} y={84} />
        <Phone x={133} y={30} scale={0.84} />
        <Arrow x1={198} x2={228} y={84} />
        <Checker x={240} y={42} />
      </Drawing>
      <View style={styles.labels}>
        {labels.map((label) => (
          <AppText key={label} testID="illustration-label" variant="bodySm" style={styles.label}>
            {label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/**
 * A credential card where only one line is shared (outlined in accent, with a tick) and the
 * other lines stay hidden (dashed), passing to a checker: share only what is needed.
 */
export function SelectiveDisclosureIllustration() {
  const c = useIllustrationColors();
  const hidden = {
    stroke: c.muted,
    strokeWidth: W,
    strokeLinecap: 'round' as const,
    strokeDasharray: '4 8',
  };
  return (
    <Drawing testID="illustration-selective-disclosure">
      <Rect
        x={20}
        y={24}
        width={150}
        height={112}
        rx={14}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Line x1={38} y1={48} x2={140} y2={48} {...hidden} />
      <Line x1={38} y1={68} x2={120} y2={68} {...hidden} />
      <Rect
        x={32}
        y={80}
        width={126}
        height={24}
        rx={6}
        fill={c.body}
        stroke={c.accent}
        strokeWidth={W}
      />
      <Line
        x1={42}
        y1={92}
        x2={110}
        y2={92}
        stroke={c.line}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Path
        d="M126 92 l6 6 l12 -12"
        fill="none"
        stroke={c.accent}
        strokeWidth={W}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={38} y1={120} x2={130} y2={120} {...hidden} />
      <Arrow x1={178} x2={214} y={92} />
      <Checker x={236} y={52} />
    </Drawing>
  );
}

/** A padlock on the phone and a fingerprint: confirm before every share, encrypted. */
export function SecurityIllustration() {
  const c = useIllustrationColors();
  return (
    <Drawing testID="illustration-security">
      <Rect
        x={70}
        y={22}
        width={64}
        height={116}
        rx={10}
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
      />
      <Path
        d="M90 76 v-12 a12 12 0 0 1 24 0 v12"
        fill="none"
        stroke={c.line}
        strokeWidth={W}
        strokeLinecap="round"
      />
      <Rect
        x={84}
        y={76}
        width={36}
        height={30}
        rx={6}
        fill={c.navy}
        stroke={c.line}
        strokeWidth={W}
      />
      <Circle cx={102} cy={90} r={4} fill={c.onNavy} />
      {[12, 22, 32, 42].map((r, i) => (
        <Path
          key={r}
          d={`M${222 - r} ${92} a${r} ${r} 0 0 1 ${r * 2} 0 v${10 + i * 4}`}
          fill="none"
          stroke={i % 2 === 0 ? c.line : c.accent}
          strokeWidth={W}
          strokeLinecap="round"
        />
      ))}
      <Line
        x1={222}
        y1={92}
        x2={222}
        y2={112}
        stroke={c.line}
        strokeWidth={W}
        strokeLinecap="round"
      />
    </Drawing>
  );
}

/** The phone keeps your data; a crossed-out cloud: nothing goes to UniVault when you share. */
export function PrivacyIllustration() {
  const c = useIllustrationColors();
  return (
    <Drawing testID="illustration-privacy">
      <Phone x={62} y={22} />
      <Shield cx={94} cy={116} />
      <Path
        d="M196 92 a18 18 0 0 1 4 -35 a24 24 0 0 1 46 6 a16 16 0 0 1 10 29 z"
        fill={c.body}
        stroke={c.line}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Line
        x1={190}
        y1={46}
        x2={266}
        y2={110}
        stroke={c.line}
        strokeWidth={W + 1}
        strokeLinecap="round"
      />
    </Drawing>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { flex: 1, flexShrink: 1, textAlign: 'center' },
});
