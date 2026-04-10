// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// BUILD_TARGET=extension npm run build:extension 으로 호출 시 CRX 플러그인 활성화
const isExtension = process.env.BUILD_TARGET === 'extension';

export default defineConfig(async () => {
  // PluginOption (Plugin | false | null | undefined | PluginOption[]) 허용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [react(), nodePolyfills()];

  if (isExtension) {
    const { crx } = await import('@crxjs/vite-plugin');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = (await import('./manifest.json', { assert: { type: 'json' } })).default as any;
    plugins.push(crx({ manifest }));
  }

  return {
    plugins,

    build: isExtension
      ? {
          outDir: 'dist-extension',
          emptyOutDir: true,
        }
      : undefined,

    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
      proxy: {
        '/api/relay': {
          target: 'http://49.247.139.241:3000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/relay/, ''),
        },
        '/upbit-api': {
          target: 'https://api.upbit.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/upbit-api/, ''),
        },
        '/zeroex-api': {
          target: 'https://api.0x.org',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/zeroex-api/, ''),
          headers: {
            '0x-api-key': 'db6474da-19a1-4409-909f-ded8402c0e4f',
            '0x-version': 'v2',
          },
        },
      },
    },

    define: {
      'process.env': {},
    },
  };
});
