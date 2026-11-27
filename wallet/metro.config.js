// @ts-check
/**
 * Metro configuration for the UniVault wallet.
 *
 * Shared code from the monorepo:
 *   - @univault/crypto-core is a `file:` dependency, so npm puts a SYMLINK in
 *     wallet/node_modules/@univault/ that points outside this folder. Metro follows symlinks
 *     (its default) but only bundles files inside its watch folders, so crypto-core is one,
 *     and its imports resolve from wallet/node_modules first, then from crypto-core's own
 *     node_modules (@sd-jwt/core, @noble/hashes): nodeModulesPaths.
 *   - @univault/portal-ui/tokens (the design tokens) is NOT an npm dependency: a `file:` link
 *     would expose portal-ui's own dev install of React (for its web tests) to expo-doctor's
 *     duplicate-native-module check. The import is resolved here straight to the SOURCE file
 *     portal-ui/src/tokens.ts (plain TypeScript, no imports; Metro transforms it like app code),
 *     so portal-ui never has to be built first (TypeScript: tsconfig paths; Jest:
 *     moduleNameMapper; app.config.ts: relative import). portal-ui's node_modules, dist and
 *     test folders are block-listed, and the guard below refuses any other portal-ui import, so
 *     tokens.ts is the only portal-ui file that can reach the bundle.
 *
 * Guards: only crypto-core's universal entry (".") may be bundled ("./node" needs node:crypto),
 * and nothing from portal-ui except the tokens (the rest is React DOM / Tailwind).
 *
 * Paths are built with path.join/resolve and the blockList regex accepts either separator, so
 * this works on Windows as well as macOS/Linux.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const cryptoCore = path.resolve(projectRoot, '../crypto-core');
const portalUi = path.resolve(projectRoot, '../portal-ui');
const tokensFile = path.join(portalUi, 'src', 'tokens.ts');

/** A RegExp matching everything below `dir`, with either path separator. */
const below = (/** @type {string} */ dir) =>
  new RegExp(
    `^${dir
      .split(/[/\\]/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[/\\\\]')}[/\\\\].*`,
  );

const config = getDefaultConfig(projectRoot);

config.watchFolders = [cryptoCore, portalUi];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(cryptoCore, 'node_modules'),
];

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  below(path.join(portalUi, 'node_modules')),
  below(path.join(portalUi, 'dist')),
  below(path.join(portalUi, 'test')),
];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@univault/portal-ui/tokens') {
    return { type: 'sourceFile', filePath: tokensFile };
  }
  if (moduleName === '@univault/crypto-core/node') {
    throw new Error(
      '@univault/crypto-core/node is Node.js only (node:crypto). The wallet must import ' +
        '"@univault/crypto-core" (the universal entry).',
    );
  }
  if (moduleName.startsWith('@univault/portal-ui')) {
    throw new Error(
      'The wallet may import only "@univault/portal-ui/tokens" (plain data), not the web ' +
        'components.',
    );
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
