// src/utils/eip6963Manager.ts

// EIP-6963 인터페이스 정의
interface EIP6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string;
    rdns: string; // 지갑의 고유 식별자 (예: io.metamask, com.okex.wallet)
}

interface EIP6963ProviderDetail {
    info: EIP6963ProviderInfo;
    provider: any;
}

// 발견된 지갑들을 저장할 저장소 (Key: RDNS, Value: Provider)
const discoveredProviders = new Map<string, any>();

// 이벤트 리스너 (지갑들이 손들면 명단에 적음)
const onAnnounceProvider = (event: CustomEvent<EIP6963ProviderDetail>) => {
    const { info, provider } = event.detail;
    // console.log(`📡 EIP-6963 지갑 발견: ${info.name} (${info.rdns})`);
    discoveredProviders.set(info.rdns, provider);
};

// 초기화 함수: 앱 켜질 때 한 번 실행
export function initEIP6963() {
    window.addEventListener("eip6963:announceProvider", onAnnounceProvider as any);

    // "지갑들아, 다 나와라!" 라고 방송
    window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// 특정 RDNS(고유 ID)를 가진 지갑 꺼내오기
export function getEIP6963Provider(rdns: string) {
    return discoveredProviders.get(rdns);
}

// 수집된 모든 지갑 보기 (디버깅용)
export function getAllDiscoveredProviders() {
    return discoveredProviders;
}