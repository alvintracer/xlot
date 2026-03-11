import { useState } from "react";
import { SecureKeypad } from "./SecureKeypad"; // ✨ 방금 만든 컴포넌트 임포트
import { syncKeyToCloud, restoreVault } from "../services/vaultService";
import { importRestoredKeysToLocal } from "../utils/localWalletManager";
import { useActiveAccount } from "thirdweb/react";

type VaultMode = 'SETUP' | 'SYNC' | 'RESTORE';

interface Props {
  mode: VaultMode;
  onClose: () => void;
  onSuccess: () => void;
  pendingKey?: { [label: string]: string }; 
}

export function VaultAuthModal({ mode, onClose, onSuccess, pendingKey }: Props) {
  const smartAccount = useActiveAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); // 에러 발생 시 처리 (alert 사용 등)

  // ✨ 타이틀/설명 결정 헬퍼
  const getText = () => {
    switch (mode) {
      case 'SETUP': return { title: "보안 비밀번호 설정", desc: "백업에 사용할 6자리 비밀번호를 설정하세요." };
      case 'SYNC': return { title: "비밀번호 입력", desc: "지갑 동기화를 위해 비밀번호를 입력하세요." };
      case 'RESTORE': return { title: "금고 잠금 해제", desc: "복구하려면 설정한 비밀번호를 입력하세요." };
    }
  };

  // ✨ 키패드 입력 완료 핸들러
  const handleKeypadComplete = async (passcode: string) => {
    if (!smartAccount) return;
    
    // 로딩 표시 (필요하다면 SecureKeypad에 loading prop을 넘겨서 스피너 표시 가능)
    // 여기선 간단히 alert이나 콘솔로 처리하거나 별도 로딩 오버레이 사용
    setLoading(true); 

    try {
      if (mode === 'SETUP' || mode === 'SYNC') {
        if (!pendingKey) throw new Error("저장할 데이터 없음");
        
        const res = await syncKeyToCloud(smartAccount.address, pendingKey, passcode);
        
        if (res === 'WRONG_PASSWORD') {
            alert("❌ 비밀번호가 틀렸습니다. 다시 시도해주세요.");
            setLoading(false);
            return; // 창 닫지 않음
        }
      } 
      else if (mode === 'RESTORE') {
        const keys = await restoreVault(smartAccount.address, passcode);
        if (keys) {
            const count = importRestoredKeysToLocal(keys);
            alert(`✅ ${count}개의 지갑이 성공적으로 복구되었습니다!`);
        } else {
            alert("❌ 비밀번호가 틀렸거나 데이터가 없습니다.");
            setLoading(false);
            return;
        }
      }

      onSuccess();
      onClose();

    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const { title, desc } = getText();

  // ✨ 기존 모달 UI 싹 지우고 SecureKeypad만 리턴
  return (
    <SecureKeypad 
      title={title}
      description={desc}
      maxLength={6} // 6자리 핀번호
      onClose={onClose}
      onComplete={handleKeypadComplete}
    />
  );
}