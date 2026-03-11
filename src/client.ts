import { createThirdwebClient } from "thirdweb";
import { polygonAmoy } from "thirdweb/chains"; // ✨ 체인 정보 필요

// 여기에 아까 복사한 Client ID를 넣으세요
const clientId = "2bfd39acc1e828acfd63871a0de5a0b8";

export const client = createThirdwebClient({
    clientId: clientId,
});

// ✨ [추가] 스마트 월렛(Account Abstraction) 설정
// 이 설정을 ConnectButton에 전달해야 가스비 대납이 작동합니다.
export const smartWalletConfig = {
    chain: polygonAmoy, // Amoy 테스트넷 사용
    sponsorGas: true,   // 🔥 핵심: 가스비 대납 활성화 (Paymaster)
};