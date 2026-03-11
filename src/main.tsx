// ✨ 최상단에 추가: Buffer 폴리필
import { Buffer } from 'buffer';
window.Buffer = Buffer;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ✨ ThirdwebProvider 임포트 필수!
import { ThirdwebProvider } from "thirdweb/react"; 
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ✨ 앱 전체를 Provider로 감싸주세요 */}
    <ThirdwebProvider>
      <App />
    </ThirdwebProvider>
  </StrictMode>,
)