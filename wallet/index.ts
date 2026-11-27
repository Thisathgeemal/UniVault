/**
 * App entry point (package.json "main").
 *
 * The crypto setup MUST run before anything imports @univault/crypto-core, @sd-jwt/core or
 * @noble/*: Hermes has no crypto.getRandomValues, and those libraries capture globals when
 * they load. ES imports run in order, so this file imports the setup first and only then
 * hands over to Expo Router (which loads the screens).
 */
import './src/lib/crypto-setup';
import 'expo-router/entry';
