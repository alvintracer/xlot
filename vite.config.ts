// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills' // ✨ 추가

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  server: {
    headers: {
      // ✨ [수정] 팝업 차단 문제를 해결하기 위해 'unsafe-none'으로 변경
      "Cross-Origin-Opener-Policy": "unsafe-none",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
    proxy: {
      '/upbit-api': {
        target: 'https://api.upbit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upbit-api/, ''),
      },
      '/zeroex-api': {
        target: 'https://api.0x.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zeroex-api/, ''),
        headers: {
          '0x-api-key': 'db6474da-19a1-4409-909f-ded8402c0e4f', // 본인 키 확인
          '0x-version': 'v2',
        },
      },
    },
  },
  define: {
    'process.env': {}, // 혹시 모를 환경변수 에러 방지
  },
});