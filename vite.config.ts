import {defineConfig} from 'vite';
import pkg from './package.json' with {type: 'json'};

export default defineConfig({
  build: {
    lib: {
      entry: {
        bin: 'src/bin.ts',
        index: 'src/index.ts',
      },
      formats: ['es']
    },
    outDir: 'dist',
    rollupOptions: {
      external: id => id.startsWith('node:') || Object.keys(pkg.dependencies).some(dep => dep === id || id.startsWith(`${dep}/`))
    }
  },
});
