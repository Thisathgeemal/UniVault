/**
 * UniVault SD-JWT spike – React Native (Expo Go) compatibility test.
 *
 * Runs the wallet-side SD-JWT code (holder.js) on the phone's Hermes engine:
 *   1. environment checks (TextEncoder/TextDecoder, BigInt, random bytes)
 *   2. ES256 holder key generation
 *   3. decode an RS256 credential issued by Node (fixture.json)
 *   4. build a selective-disclosure presentation with a key-binding JWT
 * The presentation is printed in the Metro terminal so Node can verify it
 * (verify-presentation.mjs) – a full cross-platform round trip.
 */
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// noble uses crypto.getRandomValues – provide it from expo-crypto (Hermes has none)
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = (arr) => Crypto.getRandomValues(arr);
}

import fixture from './fixture.json';

export default function App() {
  const [rows, setRows] = useState([]);
  const add = (name, pass, detail = '') => setRows((r) => [...r, { name, pass, detail }]);

  useEffect(() => {
    (async () => {
      // 1. Environment
      add('TextEncoder available', typeof TextEncoder !== 'undefined');
      add(
        'TextDecoder available',
        typeof TextDecoder !== 'undefined',
        'needed by @owf/identity-common',
      );
      add('BigInt available', typeof BigInt !== 'undefined', 'needed by @noble/curves');
      add('Hermes engine', !!global.HermesInternal);

      let holder;
      try {
        // Imported here so a missing global shows up as a failed row, not a crash
        holder = await import('./holder');
        add('Libraries load (@sd-jwt/core, @noble/*)', true);
      } catch (e) {
        add('Libraries load (@sd-jwt/core, @noble/*)', false, e.message);
        return;
      }

      try {
        // SHA-256: pure-JS noble result must equal native expo-crypto digest
        const input = new TextEncoder().encode('univault');
        const noble = holder.hasher('univault', 'sha-256');
        const native = new Uint8Array(
          await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, input),
        );
        add(
          'SHA-256 (noble) matches expo-crypto',
          noble.every((b, i) => b === native[i]),
        );

        // 2. Holder key generation (ES256)
        let t = Date.now();
        const key = holder.createHolderKey((n) => Crypto.getRandomBytes(n));
        add('ES256 holder key generated', !!key.jwk.x, `${Date.now() - t} ms`);

        // 3. Decode the RS256 credential issued by Node
        const fixtureKey = holder.base64UrlToUint8Array(fixture.holderSecretKey);
        const wallet = holder.createWalletSdJwt(fixtureKey);
        t = Date.now();
        const claims = await wallet.getClaims(fixture.credential);
        add(
          'Decode RS256 credential, all claims readable',
          claims.full_name === 'Lahiru Silva',
          `${Date.now() - t} ms`,
        );

        // 4. Selective disclosure + key binding
        t = Date.now();
        const presentation = await holder.buildPresentation(
          wallet,
          fixture.credential,
          fixture.revealClaims,
          {
            nonce: fixture.nonce,
            aud: fixture.aud,
          },
        );
        const parts = presentation.split('~');
        add(
          'Presentation built (3 of 7 claims + KB-JWT)',
          parts.length === fixture.revealClaims.length + 2,
          `${Date.now() - t} ms`,
        );

        console.log('----- PRESENTATION START -----');
        console.log(presentation);
        console.log('----- PRESENTATION END -----');
        add(
          'Presentation printed in Metro terminal',
          true,
          'copy it to presentation.txt and run verify-presentation.mjs',
        );
      } catch (e) {
        add('Unexpected error', false, `${e.name}: ${e.message}`);
      }
    })();
  }, []);

  const passed = rows.filter((r) => r.pass).length;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>UniVault SD-JWT spike</Text>
      <Text style={styles.summary}>
        {passed}/{rows.length} checks passed
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.badge, { color: r.pass ? '#1a7f37' : '#cf222e' }]}>
            {r.pass ? 'PASS' : 'FAIL'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{r.name}</Text>
            {r.detail ? <Text style={styles.detail}>{r.detail}</Text> : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700' },
  summary: { fontSize: 16, marginVertical: 12 },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  badge: { fontWeight: '700', width: 44 },
  name: { fontSize: 15 },
  detail: { fontSize: 12, color: '#666', marginTop: 2 },
});
