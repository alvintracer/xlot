import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// ==========================================
// 40% Partial Localization Strategy for Compliance
// ==========================================
// 1. Core trading terminologies (Buy, Sell, Margin, etc.) remain in English.
// 2. Disclaimers, tooltips, warnings, and educational content are translated to Korean.
const resources = {
  en: {
    translation: {
      trade: {
        actions: {
          buy: 'Buy',
          sell: 'Sell',
          long: 'Long',
          short: 'Short',
          execute: 'Execute Proxy Order',
          connect: 'Connect Wallet',
          enter_size: 'Enter Size',
          open_perp_panel: '⚡ Open Perp Order Panel',
          deposit: 'Deposit',
          deposit_first: 'Deposit USDC to Vault first',
          withdraw: 'Withdraw',
          swap: 'Swap',
          processing: 'Processing...',
          entry: '1-Click Entry'
        },
        terms: {
          order_size: 'Order Size (USD)',
          leverage: 'Leverage',
          margin: 'Margin Required',
          liq_price: 'Est. Liq. Price',
          est_fee: 'Est. Fee',
          mark_price: 'Mark Price',
          change_24h: '24h Change',
          instruments: 'Instruments',
          best_discount: 'Best Discount',
          cross_compare: 'Cross Market Comparison',
          price: 'Price',
          funding: 'Funding/APY',
          action: 'Action'
        },
        disclaimers: {
          perp_warning: 'Synthetic product. No exposure to underlying assets. Trading with leverage involves significant risk of capital loss.',
          proxy_warning: 'This order is executed via Traverse Proxy accounts on CEX. User capital is strictly isolated by smart contracts. This is a synthetic instrument with no direct ownership.',
          fx_purpose: 'FX Gate — Purpose Required'
        },
        portfolio: {
          asset_class: 'Asset Class Allocation',
          market_venue: 'Market Venue Allocation',
          holdings: 'Holdings Details'
        }
      }
    }
  },
  kr: {
    translation: {
      trade: {
        actions: {
          buy: 'Buy',           // NOT translated
          sell: 'Sell',         // NOT translated
          long: 'Long',         // NOT translated
          short: 'Short',       // NOT translated
          execute: 'Execute Proxy Order', // NOT translated
          connect: '지갑 연결',     // Translated for UX
          enter_size: '수량 입력',   // Translated for UX
          open_perp_panel: '⚡ Perp 주문 패널 열기', // Translated for UX
          deposit: '예치',
          deposit_first: 'Vault에 USDC를 먼저 예치하세요',
          withdraw: 'Withdraw', // Core
          swap: 'Swap',          // Core
          processing: '처리 중...',
          entry: '1-Click 진입'
        },
        terms: {
          order_size: 'Order Size (USD)', // Core
          leverage: 'Leverage',           // Core
          margin: 'Margin',               // Core
          liq_price: 'Liq. Price',        // Core
          est_fee: '수수료(Fee)',            // Partial
          mark_price: '시장가 (Mark Price)', // Partial
          change_24h: '24시간 변동 (24h Change)', // Partial
          instruments: 'Instruments',     // Core
          best_discount: 'Best Discount', // Core
          cross_compare: '크로스 마켓 비교', // Translated for UX
          price: '가격', // Translated
          funding: '펀딩/APY',
          action: '실행'
        },
        disclaimers: {
          perp_warning: '레버리지 거래는 원금 손실 위험이 있습니다. 실제 소유권이 없는 합성 상품입니다.',
          proxy_warning: '이 주문은 스마트 컨트랙트로 격리된 Traverse Proxy를 통해 CEX에 대리 실행됩니다. 기초 자산의 실소유권이 발생하지 않습니다.',
          fx_purpose: 'FX Gate — 거래 목적 필수'
        },
        portfolio: {
          asset_class: '자산군 비중 (Asset Class)',
          market_venue: '마켓 비중 (Market Venue)',
          holdings: '보유 자산 내역'
        }
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
