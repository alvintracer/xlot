import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'xlot_device_uuid';

// 1. 기기 ID 가져오기
export const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = uuidv4();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
};

// 2. 기기 정보 문자열
export const getDeviceInfoString = () => {
    const ua = navigator.userAgent;
    let os = "Unknown";
    if (ua.indexOf("Mac") !== -1) os = "Mac";
    if (ua.indexOf("Win") !== -1) os = "Windows";
    if (ua.indexOf("iPhone") !== -1) os = "iPhone";
    if (ua.indexOf("Android") !== -1) os = "Android";

    let browser = "Browser";
    if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
    else if (ua.indexOf("Safari") !== -1) browser = "Safari";

    return `${os} / ${browser}`;
};

// 3. 기기 등록 및 조회 (Upsert 방식)
export const registerCurrentDevice = async (userId: string, nickname?: string) => {
    const deviceId = getDeviceId();
    const ua = navigator.userAgent;

    // Case A: 닉네임이 있다 -> "저장/수정" 의도 (Upsert)
    if (nickname) {
        const { data, error } = await supabase
            .from('user_devices')
            .upsert({
                user_id: userId,
                device_uuid: deviceId,
                nickname: nickname,
                user_agent: ua,
                last_active: new Date().toISOString() // 활동 시간 갱신
            }, { onConflict: 'user_id, device_uuid' }) // 유저ID+기기ID가 같으면 덮어쓰기
            .select()
            .single();

        if (error) {
            console.error("기기 등록 실패:", error);
            throw error;
        }
        return data;
    }

    // Case B: 닉네임이 없다 -> "단순 조회" 의도
    const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .eq('device_uuid', deviceId)
        .maybeSingle();

    return data; // 없으면 null 반환 -> 모달 뜸
};

// 4. 내 기기 목록
export const getMyDevices = async (userId: string) => {
    const { data } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .order('last_active', { ascending: false });
    return data || [];
};