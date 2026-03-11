export const getClientIp = async (): Promise<string> => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error("IP 확인 실패:", error);
        return "IP 확인 불가";
    }
};