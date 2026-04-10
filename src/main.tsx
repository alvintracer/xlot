// ✨ 최상단에 추가: Buffer 폴리필
import { Buffer } from 'buffer';
window.Buffer = Buffer;

// 크롬 익스텐션 팝업: 폭 440px, 높이 600px 고정 (100vh = 600px 로 맞춤)
const _chrome = (globalThis as any).chrome;
if (typeof _chrome !== 'undefined' && _chrome?.runtime?.id) {
  document.documentElement.style.width    = '375px';
  document.documentElement.style.minWidth = '375px';
  document.documentElement.style.height   = '600px';
  document.documentElement.style.minHeight = '600px';
  document.body.style.width               = '375px';
  document.body.style.minWidth            = '375px';
  document.body.style.height              = '600px';
  document.body.style.minHeight           = '600px';
  document.body.style.margin              = '0';
  document.body.style.padding             = '0';
  document.body.style.overflowX           = 'hidden';
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ✨ ThirdwebProvider 임포트 필수!
import { ThirdwebProvider } from "thirdweb/react"; 
import { Toaster } from 'react-hot-toast';
import './i18n';
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ✨ 앱 전체를 Provider로 감싸주세요 */}
    <ThirdwebProvider>
      <App />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 8000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '16px',
            fontSize: '13px',
            maxWidth: '360px',
          },
          success: { iconTheme: { primary: '#34d399', secondary: '#1e293b' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#1e293b' } },
        }}
      />
    </ThirdwebProvider>
  </StrictMode>,
)