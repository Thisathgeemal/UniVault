/**
 * Onboarding illustrations: simple, original line drawings (react-native-svg), one per step.
 * No stock art, no logos, no text inside the drawings (labels are AppText, translated).
 *
 * They sit on a `brand` (navy) panel (OnboardingStep), so they use only the colours made for
 * navy, in both themes: `on-brand` lines, `on-brand-muted` details, `brand-hover` and
 * `role-tag-bg` fills (pairs checked in src/theme/contrast.ts). Never azure on navy (light 3:1)
 * and never a status colour (those mean valid, expired, revoked, pending only).
 * The drawings are decorative: the step's text says everything they show, so they are hidden
 * from screen readers.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { AppText } from '../components/AppText';
import { space } from '../theme';
import { useTheme } from '../theme/use-theme';

/** Drawing height in points (the panel grows around it; text is outside the drawing). */
export const ILLUSTRATION_HEIGHT = space(36);
const VIEW_BOX = '0 0 320 160';

/** The illustration colours (token names; see the file comment). */
export function useIllustrationColors() {
  const { colors } = useTheme();
  return {
    line: colors.onBrand,
    detail: colors.onBrandMuted,
    fill: colors.brandHover,
    soft: colors.roleTagBg,
    panel: colors.brand,
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

/** A phone outline with a small credential card on it (shared by several drawings). */
function Phone({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const c = useIllustrationColors();
  const w = 64 * scale;
  const h = 116 * scale;
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10 * scale}
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
      />
      <Line
        x1={x + w * 0.38}
        y1={y + 9 * scale}
        x2={x + w * 0.62}
        y2={y + 9 * scale}
        stroke={c.detail}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Rect
        x={x + 9 * scale}
        y={y + 26 * scale}
        width={w - 18 * scale}
        height={30 * scale}
        rx={5 * scale}
        fill={c.soft}
        stroke={c.line}
        strokeWidth={2}
      />
      <Line
        x1={x + 15 * scale}
        y1={y + 37 * scale}
        x2={x + w - 18 * scale}
        y2={y + 37 * scale}
        stroke={c.line}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Line
        x1={x + 15 * scale}
        y1={y + 46 * scale}
        x2={x + w - 30 * scale}
        y2={y + 46 * scale}
        stroke={c.detail}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </>
  );
}

/** A shield with a tick: "protected". */
function Shield({ cx, cy }: { cx: number; cy: number }) {
  const c = useIllustrationColors();
  return (
    <>
      <Path
        d={`M${cx} ${cy - 30} l26 10 v20 c0 20 -12 32 -26 38 c-14 -6 -26 -18 -26 -38 v-20 z`}
        fill={c.panel}
        stroke={c.line}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d={`M${cx - 11} ${cy + 3} l8 8 l15 -16`}
        fill="none"
        stroke={c.line}
        strokeWidth={3}
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
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
      />
      <Path
        d="M96 92 l-6 20 l22 -20"
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Line
        x1={88}
        y1={52}
        x2={160}
        y2={52}
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1={88}
        y1={68}
        x2={140}
        y2={68}
        stroke={c.detail}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Rect
        x={150}
        y={64}
        width={104}
        height={60}
        rx={14}
        fill={c.soft}
        stroke={c.line}
        strokeWidth={3}
      />
      <Path
        d="M228 124 l6 18 l-22 -18"
        fill={c.soft}
        stroke={c.line}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Line
        x1={168}
        y1={86}
        x2={236}
        y2={86}
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1={168}
        y1={102}
        x2={214}
        y2={102}
        stroke={c.detail}
        strokeWidth={3}
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
      <Shield cx={222} cy={62} />
    </Drawing>
  );
}

/**
 * Issuer → holder → verifier: an organisation's building, your phone, a magnifier with a tick;
 * arrows between them, and the three role names under the drawing (translated).
 */
export function HowItWorksIllustration({
  labels,
}: {
  labels: readonly [issuer: string, holder: string, verifier: string];
}) {
  const c = useIllustrationColors();
  return (
    <View style={{ gap: space(2) }}>
      <Drawing testID="illustration-how-it-works">
        {/* issuer: a building */}
        <Path
          d="M20 62 L54 40 L88 62 Z"
          fill={c.soft}
          stroke={c.line}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Rect x={26} y={62} width={56} height={52} fill={c.fill} stroke={c.line} strokeWidth={3} />
        {[38, 54, 70].map((x) => (
          <Line
            key={x}
            x1={x}
            y1={72}
            x2={x}
            y2={104}
            stroke={c.detail}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        <Line
          x1={20}
          y1={118}
          x2={88}
          y2={118}
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* arrow */}
        <Line
          x1={98}
          y1={80}
          x2={128}
          y2={80}
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Path
          d="M120 72 L130 80 L120 88"
          fill="none"
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* holder: the phone */}
        <Phone x={136} y={30} scale={0.82} />
        {/* arrow */}
        <Line
          x1={196}
          y1={80}
          x2={226}
          y2={80}
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Path
          d="M218 72 L228 80 L218 88"
          fill="none"
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* verifier: a magnifier with a tick */}
        <Circle cx={262} cy={74} r={24} fill={c.fill} stroke={c.line} strokeWidth={3} />
        <Path
          d="M251 74 l8 8 l14 -15"
          fill="none"
          stroke={c.line}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1={280}
          y1={92}
          x2={298}
          y2={112}
          stroke={c.line}
          strokeWidth={5}
          strokeLinecap="round"
        />
      </Drawing>
      <View style={styles.labels}>
        {labels.map((label) => (
          <AppText key={label} variant="caption" tone="onBrand" style={styles.label}>
            {label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/**
 * A credential card where only one line is shared (solid, with a tick) and the other lines stay
 * hidden (dashed), passing to a checker: share only what is needed.
 */
export function SelectiveDisclosureIllustration() {
  const c = useIllustrationColors();
  const hidden = {
    stroke: c.detail,
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeDasharray: '4 8',
  };
  return (
    <Drawing testID="illustration-selective-disclosure">
      <Rect
        x={40}
        y={24}
        width={150}
        height={112}
        rx={14}
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
      />
      <Line x1={58} y1={48} x2={160} y2={48} {...hidden} />
      <Line x1={58} y1={68} x2={140} y2={68} {...hidden} />
      <Rect
        x={52}
        y={80}
        width={126}
        height={24}
        rx={6}
        fill={c.soft}
        stroke={c.line}
        strokeWidth={2}
      />
      <Line
        x1={62}
        y1={92}
        x2={130}
        y2={92}
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M146 92 l6 6 l12 -12"
        fill="none"
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={58} y1={120} x2={150} y2={120} {...hidden} />
      {/* only the shared line travels to the checker */}
      <Line
        x1={192}
        y1={92}
        x2={226}
        y2={92}
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M218 84 L228 92 L218 100"
        fill="none"
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={262} cy={92} r={24} fill={c.fill} stroke={c.line} strokeWidth={3} />
      <Path
        d="M251 92 l8 8 l14 -15"
        fill="none"
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
      />
      <Path
        d="M90 76 v-12 a12 12 0 0 1 24 0 v12"
        fill="none"
        stroke={c.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Rect
        x={84}
        y={76}
        width={36}
        height={30}
        rx={6}
        fill={c.soft}
        stroke={c.line}
        strokeWidth={3}
      />
      <Circle cx={102} cy={90} r={4} fill={c.line} />
      {/* fingerprint: nested arcs */}
      {[12, 22, 32, 42].map((r, i) => (
        <Path
          key={r}
          d={`M${222 - r} ${92} a${r} ${r} 0 0 1 ${r * 2} 0 v${10 + i * 4}`}
          fill="none"
          stroke={i % 2 === 0 ? c.line : c.detail}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      <Line
        x1={222}
        y1={92}
        x2={222}
        y2={112}
        stroke={c.line}
        strokeWidth={3}
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
        fill={c.fill}
        stroke={c.line}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Line
        x1={190}
        y1={46}
        x2={266}
        y2={110}
        stroke={c.line}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </Drawing>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { flex: 1, flexShrink: 1, textAlign: 'center' },
});
