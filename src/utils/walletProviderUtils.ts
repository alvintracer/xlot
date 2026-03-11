// src/utils/walletProviderUtils.ts
import { getEIP6963Provider } from "./eip6963Manager";

export const getSpecificProvider = (walletType: string) => {
    const win = window as any;

    // =========================================================
    // 🥇 1순위: EIP-6963 표준으로 찾기 (가장 정확함)
    // =========================================================

    // MetaMask (RDNS: io.metamask)
    if (walletType === 'METAMASK') {
        const eipProvider = getEIP6963Provider("io.metamask");
        if (eipProvider) return eipProvider;
    }

    // OKX Wallet (RDNS: com.okex.wallet)
    if (walletType === 'OKX') {
        const eipProvider = getEIP6963Provider("com.okex.wallet");
        if (eipProvider) return eipProvider;
    }

    // Rabby (RDNS: io.rabby)
    if (walletType === 'RABBY') {
        const eipProvider = getEIP6963Provider("io.rabby");
        if (eipProvider) return eipProvider;
    }

    // Phantom (RDNS: app.phantom)
    if (walletType === 'PHANTOM') {
        const eipProvider = getEIP6963Provider("app.phantom");
        if (eipProvider) return eipProvider;
    }

    // =========================================================
    // 🥈 2순위: 전용 객체 확인 (Legacy)
    // =========================================================

    // OKX 전용 객체
    if (walletType === 'OKX') {
        if (win.okxwallet) return win.okxwallet;
    }

    // Rabby 전용 객체
    if (walletType === 'RABBY') {
        if (win.rabby) return win.rabby;
    }

    // Solflare 전용 객체
    if (walletType === 'SOLFLARE') {
        if (win.solflare) return win.solflare;
    }

    // Phantom 전용 객체
    if (walletType === 'PHANTOM') {
        // Phantom은 EIP-6963을 지원하지만, solana 객체도 확인
        if (win.solana?.isPhantom) return win.solana;
    }

    // =========================================================
    // 🥉 3순위: window.ethereum 뒤지기 (최후의 수단)
    // =========================================================

    if (walletType === 'METAMASK') {
        // A. ethereum.providers 배열 확인 (구형 EIP-6963 유사 방식)
        if (win.ethereum?.providers) {
            const realMetaMask = win.ethereum.providers.find((p: any) => p.isMetaMask && !p.isOkxWallet && !p.isRabby);
            if (realMetaMask) return realMetaMask;
        }

        // B. 그냥 window.ethereum 확인 (단, OKX/Rabby가 아닐 때만)
        if (win.ethereum) {
            if (win.ethereum.isOkxWallet) return null; // OKX면 무시
            if (win.ethereum.isRabby) return null; // Rabby면 무시
            if (win.ethereum.isMetaMask) return win.ethereum; // 이게 진짜 메타마스크
        }
    }

    // 아무것도 해당 안 되면 기본값 (보통 여기서 OKX가 잡힘)
    if (walletType === 'OKX' && win.ethereum?.isOkxWallet) return win.ethereum;

    return null;
};