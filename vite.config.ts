import { defineConfig } from 'vite';

export default defineConfig({
    base: '',
    build: {
        target: 'esnext', // Ensures the output uses ESNext features like top-level await
    },
    esbuild: {
        target: 'esnext', // Ensures esbuild respects top-level await
    },
});
