import CryptoJS from 'crypto-js';

// ✨ 지원 체인 타입 정의 (BTC 포함)
export type SupportedChain = 'EVM' | 'SOL' | 'TRON' | 'BTC';

// 로컬 스토리지 키 (하나의 배열로 관리)
const LOCAL_STORAGE_KEY = 'xlot_imported_wallets';

export interface EncryptedWallet {
    chain: SupportedChain;
    address: string;
    encryptedKey: string; // 암호화된 프라이빗 키
    timestamp: number;
}

// 1. [Save] 임포트한 키 암호화하여 저장
export const saveImportedKey = (
    chain: SupportedChain, 
    address: string, 
    privateKey: string, 
    passcode: string // ✨ 패스워드 필수
) => {
    try {
        // AES 암호화
        const encrypted = CryptoJS.AES.encrypt(privateKey, passcode).toString();

        const newWallet: EncryptedWallet = {
            chain,
            address,
            encryptedKey: encrypted,
            timestamp: Date.now()
        };

        // 기존 데이터 로드
        const existing = getImportedWallets();
        
        // 동일 주소/체인 중복 제거 후 추가
        const filtered = existing.filter(w => 
            !(w.chain === chain && w.address.toLowerCase() === address.toLowerCase())
        );
        filtered.push(newWallet);

        // 저장
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
        console.log(`[WalletManager] ${chain} Wallet saved securely.`);
    } catch (e) {
        console.error("Save Failed:", e);
        throw new Error("지갑 저장 중 오류가 발생했습니다.");
    }
};

// 2. [List] 저장된 모든 지갑 목록 가져오기
export const getImportedWallets = (): EncryptedWallet[] => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

// 3. [Get] 특정 주소의 키 가져오기 (복호화)
export const getPrivateKeyForAddress = (
    chain: SupportedChain, 
    address: string, 
    passcode?: string // ✨ 복호화 할 때만 필요
): string | null => {
    if (!address) return null;

    const wallets = getImportedWallets();
    // 대소문자 구분 없이 검색 (EVM 호환성)
    const target = wallets.find(w => 
        w.chain === chain && w.address.toLowerCase() === address.toLowerCase()
    );

    // 1. 지갑이 없는 경우
    if (!target) return null;

    // 2. 패스워드가 없으면 -> "존재함"만 알림 (Active 상태 체크용)
    if (!passcode) return "ENCRYPTED_EXIST"; 

    // 3. 패스워드가 있으면 -> 복호화 시도
    try {
        const bytes = CryptoJS.AES.decrypt(target.encryptedKey, passcode);
        const originalKey = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!originalKey) return null; // 패스워드 틀림 (빈 문자열 반환됨)
        return originalKey;
    } catch (e) {
        console.error("Decryption failed:", e);
        return null;
    }
};

// 4. [Check] 로컬 키 보유 여부 확인
export const hasAnyLocalKey = () => {
    const wallets = getImportedWallets();
    return wallets.length > 0;
};

// 5. [Delete] 특정 지갑 삭제
export const removeLocalKey = (chain: SupportedChain, address: string) => {
    const existing = getImportedWallets();
    const filtered = existing.filter(w => 
        !(w.chain === chain && w.address.toLowerCase() === address.toLowerCase())
    );
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
};

// 6. [Export] 백업용 데이터 추출 (암호화된 상태 그대로 내보냄)
export const exportLocalKeysForBackup = () => {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || "";
};

// 7. [Import] 백업 데이터 복원
export const importRestoredKeysToLocal = (jsonString: string) => {
    try {
        const parsed = JSON.parse(jsonString);
        if (Array.isArray(parsed)) {
            // 기존 데이터와 병합 (중복 회피는 복잡하니 덮어쓰기 or 추가)
            const current = getImportedWallets();
            // 간단하게 합치고 저장 (실제로는 중복 체크 권장)
            const merged = [...current, ...parsed];
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
            return parsed.length;
        }
    } catch (e) {
        console.error("Import Failed", e);
    }
    return 0;
};

// 8. [Import Raw Keys] Cloud에서 복원된 원시 키(Record<string, string>) 저장
export const importRestoredRawKeysToLocal = (keys: Record<string, string>, passcode: string) => {
    let count = 0;
    try {
        for (const [keyId, privateKey] of Object.entries(keys)) {
            const parts = keyId.split('_');
            if (parts.length >= 4 && parts[0] === 'xlot' && parts[1] === 'sk') {
                const chain = parts[2].toUpperCase() as SupportedChain;
                const address = parts.slice(3).join('_');
                saveImportedKey(chain, address, privateKey, passcode);
                count++;
            }
        }
    } catch (e) {
        console.error("Raw Key Import Failed:", e);
    }
    return count;
};