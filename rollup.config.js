import { defineConfig } from 'rollup';
import { definePlugins, defineExternal } from '@gera2ld/plaid-rollup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  input: {
    bin: 'src/bin.ts',
    index: 'src/index.ts',
  },
  plugins: definePlugins({
    esm: true,
    minimize: false,
  }),
  external: defineExternal(Object.keys(pkg.dependencies)),
  output: {
    dir: 'dist',
  },
});
