import { defineConfig } from 'vite';
import path from 'path';

const publicRoot = path.resolve(__dirname, 'src/public');

export default defineConfig({
  root: publicRoot,
  build: {
    outDir: path.resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(publicRoot, 'index.html'),
        fx: path.resolve(publicRoot, 'fx.html'),
      },
    },
  },
});
