import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import bs58 from "bs58";

// 로컬 스토리지 키
const SOL_LOCAL_KEY = "xlot_sol_sk";

export interface LocalWalletData {
    publicKey: string;
    secretKey: string; // Base58 string
    mnemonic?: string; // 생성 시점에만 존재
}

/**
 * 1. 지갑 생성 (니모닉 포함)
 * - 신규 유저용
 * - 생성 후 바로 로컬 스토리지에 저장
 */
export const createLocalSolanaWallet = (): LocalWalletData => {
    // 1. 니모닉 생성 (12단어)
    const mnemonic = bip39.generateMnemonic();

    // 2. 시드 추출 (동기식 처리)
    const seed = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32); // 솔라나는 첫 32바이트 사용

    // 3. 키페어 생성
    const keypair = Keypair.fromSeed(seed);

    const publicKey = keypair.publicKey.toString();
    const secretKey = bs58.encode(keypair.secretKey);

    // 4. 로컬 스토리지 저장 (보안상 암호화 권장하지만, 일단 평문 저장)
    localStorage.setItem(SOL_LOCAL_KEY, secretKey);

    return { publicKey, secretKey, mnemonic };
};

/**
 * 2. 지갑 불러오기
 * - 로컬 스토리지에 저장된 비밀키가 있는지 확인
 */
export const loadLocalSolanaWallet = (): string | null => {
    const storedSk = localStorage.getItem(SOL_LOCAL_KEY);
    if (!storedSk) return null;

    try {
        // 유효성 검사
        const secretKeyUint8 = bs58.decode(storedSk);
        const keypair = Keypair.fromSecretKey(secretKeyUint8);
        return keypair.publicKey.toString(); // 공개키 반환
    } catch (e) {
        console.error("로컬 지갑 로드 실패:", e);
        return null;
    }
};

/**
 * 3. 비밀키 가져오기 (송금 서명용)
 * - 유저 승인(서명) 단계에서만 호출
 */
export const getLocalSolanaSecretKey = (): Uint8Array | null => {
    const storedSk = localStorage.getItem(SOL_LOCAL_KEY);
    if (!storedSk) return null;
    return bs58.decode(storedSk);
}

// ✨ [추가] 지갑 복구 (Import)
export const importLocalSolanaWallet = (mnemonic: string): boolean => {
    try {
        if (!bip39.validateMnemonic(mnemonic)) return false;

        const seed = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32);
        const keypair = Keypair.fromSeed(seed);
        const secretKey = bs58.encode(keypair.secretKey);

        // 로컬 스토리지에 저장 (복구 완료)
        localStorage.setItem(SOL_LOCAL_KEY, secretKey);
        return true;
    } catch (e) {
        console.error("지갑 복구 실패:", e);
        return false;
    }
};

// ✨ [추가] 현재 로컬에 키가 있는지 확인 (boolean)
export const hasLocalPrivateKey = (): boolean => {
    return !!localStorage.getItem(SOL_LOCAL_KEY);
};