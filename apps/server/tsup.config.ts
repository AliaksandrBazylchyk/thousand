import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Ядро подаётся исходниками TypeScript, поэтому вшиваем его в бандл.
  noExternal: ['@thousand/core'],
});
