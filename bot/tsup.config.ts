import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';

function resolveWithExtensions(basePath: string): string | null {
  // Direct file with extension
  if (fs.existsSync(basePath + '.ts')) return basePath + '.ts';
  if (fs.existsSync(basePath + '.tsx')) return basePath + '.tsx';
  if (fs.existsSync(basePath + '.js')) return basePath + '.js';
  if (fs.existsSync(basePath + '.jsx')) return basePath + '.jsx';
  // Directory with index file
  if (fs.existsSync(path.join(basePath, 'index.ts'))) return path.join(basePath, 'index.ts');
  if (fs.existsSync(path.join(basePath, 'index.js'))) return path.join(basePath, 'index.js');
  // Already has extension
  if (fs.existsSync(basePath)) return basePath;
  return null;
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  bundle: true,
  external: ['grammy', 'dotenv', 'bigint-buffer', 'undici'],
  esbuildOptions(options) {
    options.alias = {
      'server-only': path.resolve(__dirname, 'shims/server-only.ts'),
    };
  },
  esbuildPlugins: [
    {
      name: 'resolve-at-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const relative = args.path.replace(/^@\//, '');
          const basePath = path.resolve(__dirname, '..', relative);
          const resolved = resolveWithExtensions(basePath);
          if (resolved) {
            return { path: resolved };
          }
          return { path: basePath };
        });
      },
    },
  ],
});
