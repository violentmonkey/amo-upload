const path = require('path');
const {
  defaultOptions,
  getRollupExternal,
  getRollupPlugins,
} = require('@gera2ld/plaid');
const pkg = require('./package.json');

const DIST = defaultOptions.distDir;
const BANNER = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License */`;

const external = [
  'commander',
  'node-fetch',
  'jsonwebtoken',
];
const bundleOptions = {
  extend: true,
  esModule: false,
};
const rollupConfig = [
  {
    input: {
      input: 'src/bin.ts',
      plugins: getRollupPlugins({
        esm: true,
        extensions: defaultOptions.extensions,
        minimize: false,
        aliases: {
          entries: {
            '.': './index.mjs',
          },
        },
      }),
      external: getRollupExternal([
        ...external,
        (id) => {
          if (id === './index.mjs') return true;
          return false;
        },
      ]),
    },
    output: {
      format: 'esm',
      file: `${DIST}/bin.mjs`,
      banner: '#!/usr/bin/env node'
    },
  },
  {
    input: {
      input: 'src/index.ts',
      plugins: getRollupPlugins({
        esm: true,
        extensions: defaultOptions.extensions,
        minimize: false,
      }),
      external: getRollupExternal(external),
    },
    output: {
      format: 'esm',
      file: `${DIST}/index.mjs`,
      banner: BANNER,
    },
  },
];

rollupConfig.forEach((item) => {
  item.output = {
    indent: false,
    // If set to false, circular dependencies and live bindings for external imports won't work
    externalLiveBindings: false,
    ...item.output,
  };
});

module.exports = rollupConfig.map(({ input, output }) => ({
  ...input,
  output,
}));
