import { supabase } from "../lib/supabase";
import AES from 'crypto-js/aes';
import CryptoJS from 'crypto-js';
import { getDeviceId } from "../utils/deviceService";

// 메모리상 데이터 구조
interface VaultContent {
    keys: { [label: string]: string }; // { "SOL-Wallet": "privKey...", ... }
    updatedAt: number;
}

// 1. [암호화/복호화] 헬퍼
const encryptData = (data: VaultContent, pass: string) => AES.encrypt(JSON.stringify(data), pass).toString();
const decryptData = (blob: string, pass: string): VaultContent | null => {
    try {
        const bytes = AES.decrypt(blob, pass);
        const str = bytes.toString(CryptoJS.enc.Utf8);
        return str ? JSON.parse(str) : null;
    } catch { return null; }
};

// ✨ [수정] 단일 키 추가 -> 키 꾸러미(Bundle) 병합으로 변경
export async function syncKeyToCloud(
    userId: string,
    newKeysBundle: { [label: string]: string }, // 👈 여기가 핵심 변경점!
    passcode: string
): Promise<'SUCCESS' | 'WRONG_PASSWORD'> {

    const MAX_RETRIES = 3;

    for (let i = 0; i < MAX_RETRIES; i++) {
        // Step A: Pull
        const { data: serverData } = await supabase
            .from('user_vaults')
            .select('encrypted_data, version')
            .eq('user_id', userId)
            .maybeSingle();

        let vault: VaultContent = { keys: {}, updatedAt: Date.now() };
        let currentVersion = 0;

        if (serverData) {
            currentVersion = serverData.version;
            const decrypted = decryptData(serverData.encrypted_data, passcode);

            if (!decrypted) return 'WRONG_PASSWORD';
            vault = decrypted;
        }

        // Step B: Merge (✨ 객체 병합 로직으로 변경)
        // 기존: vault.keys[newKeyEntry.label] = newKeyEntry.key;
        // 변경: 기존 키들에 새 꾸러미를 합침
        vault.keys = { ...vault.keys, ...newKeysBundle };

        vault.updatedAt = Date.now();

        // Step C: Encrypt
        const newBlob = encryptData(vault, passcode);

        // Step D: Atomic Push
        const { data: success, error } = await supabase.rpc('update_vault_atomic', {
            p_user_id: userId,
            p_new_data: newBlob,
            p_old_version: currentVersion,
            p_device_uuid: getDeviceId()
        });

        if (error) throw error;

        if (success) {
            console.log("✅ 동기화 성공!");
            return 'SUCCESS';
        } else {
            await new Promise(res => setTimeout(res, 300 + Math.random() * 200));
        }
    }

    throw new Error("동시 수정이 너무 많아 동기화에 실패했습니다.");
}

// 3. [복구] 전체 키 다운로드
export async function restoreVault(userId: string, passcode: string) {
    const { data } = await supabase
        .from('user_vaults')
        .select('encrypted_data')
        .eq('user_id', userId)
        .maybeSingle();

    if (!data) return null; // 데이터 없음

    const vault = decryptData(data.encrypted_data, passcode);
    if (!vault) throw new Error("비밀번호가 일치하지 않습니다.");

    return vault.keys; // { "SOL": "...", "BTC": "..." }
}

// 4. [상태 확인] 서버에 백업본이 있는지?
export async function checkVaultExists(userId: string) {
    const { data } = await supabase.from('user_vaults').select('updated_at').eq('user_id', userId).maybeSingle();
    return !!data;
}