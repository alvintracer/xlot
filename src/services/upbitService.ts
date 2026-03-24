// services/upbitService.ts
import { supabase } from "../lib/supabase";

// 중계 서버 URL (대표님 서버)
const RELAY_URL = "http://49.247.139.241:3000";

// ✨ [수정] 출금 가능 정보 조회 (GET -> POST로 변경)
export async function getUpbitChance(accessKey: string, secretKey: string, currency: string, netType?: string) {
    const RELAY_URL = "http://49.247.139.241:3000"; // 대표님 서버 주소

    // 중요: method를 'POST'로 설정해야 합니다.
    const res = await fetch(`${RELAY_URL}/upbit/withdraws/chance`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            accessKey, 
            secretKey, 
            currency, 
            net_type: netType 
        })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "정보 조회 실패");
    return json;
}

export async function withdrawUpbitCoin(
    accessKey: string, 
    secretKey: string, 
    currency: string, 
    amount: string, 
    netType: string, 
    address: string,
    secondaryAddress?: string 
) {
    const RELAY_URL = "http://49.247.139.241:3000";

    // ✨ 전송할 데이터 객체 미리 만들기
    const payload: any = {
        accessKey,
        secretKey,
        currency,
        amount,
        net_type: netType,
        address
    };

    // ✨ 값이 있을 때만 추가 (null이나 빈 문자열이면 아예 키를 안 넣음)
    if (secondaryAddress) {
        payload.secondary_address = secondaryAddress;
    }

    const res = await fetch(`${RELAY_URL}/upbit/withdraws/coin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) // null이 아예 없는 깔끔한 객체 전송
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "출금 요청 실패");
    return json;
}

// 3. 업비트 입출금 내역 조회 (Activity용)
export async function fetchUpbitActivity(accessKey: string, secretKey: string) {
    const res = await fetch(`${RELAY_URL}/upbit/history?accessKey=${accessKey}&secretKey=${secretKey}`);
    const json = await res.json();
    
    // 포맷 통일 (ActivityItem 형태)
    const list: any[] = [];
    
    // 입금 처리
    json.deposits?.forEach((d: any) => {
        if(d.state === 'DONE') {
            list.push({
                id: d.uuid,
                source: 'CEX',
                type: 'RECEIVE', // 입금
                title: '입금 완료',
                amount: d.amount,
                symbol: d.currency,
                status: 'SUCCESS',
                timestamp: new Date(d.done_at || d.created_at).getTime() / 1000,
                detailUrl: '',
                network: 'Upbit'
            });
        }
    });

    // 출금 처리
    json.withdraws?.forEach((w: any) => {
        if(w.state === 'DONE' || w.state === 'PROCESSING') {
            list.push({
                id: w.uuid,
                source: 'CEX',
                type: 'SEND', // 출금
                title: '출금',
                amount: w.amount,
                symbol: w.currency,
                status: w.state === 'DONE' ? 'SUCCESS' : 'PENDING',
                timestamp: new Date(w.done_at || w.created_at).getTime() / 1000,
                detailUrl: '',
                network: 'Upbit'
            });
        }
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
}

// upbitService.ts
export async function fetchUpbitDepositAddresses(accessKey: string, secretKey: string) {
  const res = await fetch(`http://49.247.139.241:3000/upbit/deposits/addresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey, secretKey }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`서버 에러 (${res.status}): ${text}`);
  }
  return res.json();
}

// 2. 입금 주소 생성 요청
export async function generateUpbitAddress(
    accessKey: string, 
    secretKey: string, 
    currency: string, 
    netType: string
) {
    const res = await fetch(`${RELAY_URL}/upbit/deposits/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, secretKey, currency, net_type: netType })
    });
    return await res.json();
}

// 3. 업비트 전체 네트워크 상태 조회
export async function fetchUpbitStatus(accessKey: string, secretKey: string) {
    const RELAY_URL = "http://49.247.139.241:3000";
    const res = await fetch(`${RELAY_URL}/upbit/status?accessKey=${accessKey}&secretKey=${secretKey}`);
    return await res.json();
}

// ✨ [NEW] 출금 허용 주소 목록 조회
export async function fetchUpbitWithdrawAddresses(accessKey: string, secretKey: string) {
    const res = await fetch(`${RELAY_URL}/upbit/withdraws/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, secretKey })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "주소 목록 조회 실패");
    return json;
}

// ✨ [NEW] 업비트 계좌 정보 조회 (테스트)
export async function fetchUpbitAccounts(accessKey: string, secretKey: string) {
    const res = await fetch(`${RELAY_URL}/upbit/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, secretKey })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "계좌 조회 실패");
    return json;
}