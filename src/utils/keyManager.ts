import { ethers } from "ethers";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
// TronWeb은 타입 정의가 까다로울 수 있어 any로 처리하거나 필요시 import
import * as TronWebPkg from 'tronweb';

// ✨ 지원 체인 타입 정의 (BTC 추가됨)
export type SupportedChain = 'EVM' | 'SOL' | 'TRON' | 'BTC';

export interface ValidationResult {
    isValid: boolean;
    address: string | null;
    formattedKey: string;
}

// TronWeb 인스턴스 헬퍼
const getTronWeb = () => {
    const TronWebConstructor = (TronWebPkg as any).TronWeb || (TronWebPkg as any).default || TronWebPkg;
    return new TronWebConstructor({ fullHost: 'https://api.trongrid.io' });
};

export async function validateAndDeriveAddress(
    chain: SupportedChain, // ✨ BTC 허용
    privateKey: string
): Promise<ValidationResult> {
    try {
        const cleanKey = privateKey.trim();

        // 1. EVM
        if (chain === 'EVM') {
            const wallet = new ethers.Wallet(cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`);
            return { isValid: true, address: wallet.address, formattedKey: wallet.privateKey };
        }

        // 2. Solana
        if (chain === 'SOL') {
            let secretKey: Uint8Array;
            if (cleanKey.includes('[') || cleanKey.includes(',')) {
                // 배열 형태 ([1,2,3...])
                secretKey = Uint8Array.from(JSON.parse(cleanKey));
            } else {
                // Base58 형태
                secretKey = bs58.decode(cleanKey);
            }
            const keypair = Keypair.fromSecretKey(secretKey);
            return { isValid: true, address: keypair.publicKey.toString(), formattedKey: bs58.encode(secretKey) };
        }

        // 3. Tron
        if (chain === 'TRON') {
            const tronWeb = getTronWeb();
            // 0x 제거 처리 (TronLink Export 키 대응)
            const pKey = cleanKey.startsWith('0x') ? cleanKey.slice(2) : cleanKey;
            const address = tronWeb.address.fromPrivateKey(pKey);
            if (!address) throw new Error("Invalid Tron Key");
            return { isValid: true, address: address, formattedKey: pKey };
        }

        // 4. ✨ Bitcoin (WIF 포맷 검증 - 간단 버전)
        if (chain === 'BTC') {
            // 비트코인 키 검증은 복잡하므로 라이브러리(bitcoinjs-lib)가 없으면 
            // 일단 길이/형식 체크만 하거나, 라이브러리를 설치해야 합니다.
            // 여기서는 MVP용으로 간단히 처리합니다.
            if (cleanKey.length < 30) throw new Error("Key too short");
            // 실제 주소 유도는 라이브러리 없이 힘듦. 
            // 임시로: "BTC_IMPORTED_" + 키 일부 (실제 앱에선 bitcoinjs-lib 필수)
            return { isValid: true, address: "BTC_IMPORTED_ADDRESS", formattedKey: cleanKey };
        }

        return { isValid: false, address: null, formattedKey: "" };

    } catch (e) {
        console.error("Key Validation Failed:", e);
        return { isValid: false, address: null, formattedKey: "" };
    }
}