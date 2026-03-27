import { supabase } from "../lib/supabase";
import { client } from "../client"; // Thirdweb Client

// ✨ Thirdweb Imports (잔액 조회용 - 여기가 훨씬 빠릅니다)
import { getWalletBalance } from "thirdweb/wallets";
import { defineChain } from "thirdweb"; 
// 필요한 체인들을 미리 정의합니다.
const ethMainnet = defineChain(1);
const ethSepolia = defineChain(11155111);
const polygon = defineChain(137);
const polygonAmoy = defineChain(80002);
const base = defineChain(8453);
const arbitrum = defineChain(42161);

// Legacy Imports (Solana, BTC, Tron)
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as TronWebPkg from 'tronweb';
import { getDeviceId } from "../utils/deviceService";
import { fetchCryptoPrices } from "./priceService";

// ==========================================
// 1. Config & Constants
// ==========================================

// ✨ 여기서 조회할 체인들을 관리합니다. (Thirdweb Chain 객체 매핑)
const TARGET_CHAINS = [
    { chain: ethMainnet, symbol: 'ETH', name: 'Ethereum' },
    { chain: ethSepolia, symbol: 'ETH', name: 'Sepolia' },
    { chain: polygon, symbol: 'POL', name: 'Polygon' },
    { chain: polygonAmoy, symbol: 'POL', name: 'Amoy' },
    { chain: base, symbol: 'ETH', name: 'Base' },
    { chain: arbitrum, symbol: 'ETH', name: 'Arbitrum' },
];

// ==========================================
// 2. Interfaces
// ==========================================

export interface WalletAsset {
    symbol: string;
    name: string;
    balance: number;
    price: number;
    value: number;
    change: number;
    network: string;
    isNative: boolean;
    tokenAddress?: string;
}

export interface WalletSlot {
    id: string;
    label: string;
    wallet_type: string;
    device_uuid?: string;
    api_access_key?: string;
    api_secret_key?: string;

    addresses: {
        evm?: string;
        sol?: string;
        btc?: string;
        trx?: string;
    };
    
    assets: WalletAsset[];
    balances: {
        evm?: number;
        sol?: number;
        btc?: number;
        trx?: number;
        krw?: number;
        usd?: number;
    };
    balanceDisplay: string;
    total_value_krw: number;
}

// ==========================================
// 3. Helper Functions
// ==========================================

// Solana Connection
let _solConnection: Connection | null = null;
const getSolanaConnection = () => {
    if (!_solConnection) _solConnection = new Connection("https://rpc.ankr.com/solana");
    return _solConnection;
};

// Tron Web
let _tronWeb: any = null;
const getTronWeb = () => {
    if (!_tronWeb) {
        const TronWebConstructor = (TronWebPkg as any).TronWeb || (TronWebPkg as any).default || TronWebPkg;
        _tronWeb = new TronWebConstructor({ fullHost: 'https://api.trongrid.io' });
    }
    return _tronWeb;
};

// BTC Fetcher
async function fetchBitcoinBalance(address: string): Promise<number> {
    try {
        const res = await fetch(`https://mempool.space/api/address/${address}`);
        const data = await res.json();
        const satoshi = (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum);
        return satoshi / 100000000;
    } catch (e) { return 0; }
}

// ==========================================
// 4. Main Logic: Get Wallets
// ==========================================

export async function getMyWallets(userId: string): Promise<WalletSlot[]> {
    const currentDeviceId = getDeviceId();
    const pricesPromise = fetchCryptoPrices().catch(() => null);
    
    const { data, error } = await supabase
        .from('user_wallets')
        .select(`*, wallet_api_keys (device_uuid, api_access_key, api_secret_key)`)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error || !data) return [];
    const prices = await pricesPromise;
    const exchangeRate = prices?.exchangeRate || 1450;

    const results = await Promise.all(data.map(async (slot: any) => {
        const myKeyData = Array.isArray(slot.wallet_api_keys) ? slot.wallet_api_keys.find((k: any) => k.device_uuid === currentDeviceId) : null;
        
        const wallet: WalletSlot = {
            id: slot.id,
            label: slot.label,
            wallet_type: slot.wallet_type,
            device_uuid: slot.device_uuid,
            api_access_key: myKeyData?.api_access_key,
            api_secret_key: myKeyData?.api_secret_key,
            addresses: {
                evm: slot.address || undefined,
                sol: slot.address_sol || undefined,
                btc: slot.address_btc || undefined,
                trx: slot.address_trx || undefined
            },
            assets: [],
            balances: {},
            balanceDisplay: "Loading...",
            total_value_krw: 0
        };

        try {
            // A. Upbit (Relay Server - POST 방식)
            if (['UPBIT'].includes(wallet.wallet_type)) {
                if (wallet.api_access_key && wallet.api_secret_key) {
                    try {
                        // ✨ [수정 1] 중계 서버 URL (상단에 상수로 빼두셔도 됩니다)
                        const RELAY_URL = "http://49.247.139.241:3000";

                        // ✨ [수정 2] POST 요청으로 변경 (키를 Body에 담아서 전송)
                        const response = await fetch(`${RELAY_URL}/upbit/accounts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                accessKey: wallet.api_access_key, 
                                secretKey: wallet.api_secret_key 
                            })
                        });

                        const upbitAssets = await response.json();

                        // ✨ [수정 3] 에러 체크 방식 변경 (Supabase 방식 -> 일반 JSON 방식)
                        if (upbitAssets.error) throw new Error(upbitAssets.error);
                        if (!Array.isArray(upbitAssets)) throw new Error("Invalid Data");

                        // --- (이하 매핑 로직은 기존과 동일합니다) ---
                        const krw = upbitAssets.find((a: any) => a.currency === "KRW");
                        wallet.balances.krw = krw ? Number(krw.balance) : 0;
                        
                        upbitAssets.forEach((asset: any) => {
                            if (asset.currency !== 'KRW') {
                                const price = Number(asset.avg_buy_price); 
                                const balance = Number(asset.balance);
                                wallet.assets.push({
                                    symbol: asset.currency,
                                    name: asset.currency, 
                                    balance: balance,
                                    price: price, 
                                    value: (balance * price) / exchangeRate, 
                                    change: 0, 
                                    network: 'Upbit',
                                    isNative: true
                                });
                            }
                        });
                        
                        // 총 자산 가치 계산 (KRW 현금 포함 여부는 기획에 따라 조정)
                        const totalCoinKrw = upbitAssets.reduce((acc: number, cur: any) => 
                            acc + (Number(cur.balance) * Number(cur.avg_buy_price)), 0);
                        
                        // 현금(KRW)까지 포함한 총 자산
                        const finalTotal = totalCoinKrw + (wallet.balances.krw || 0);

                        wallet.balanceDisplay = `≈ ₩ ${Math.floor(finalTotal).toLocaleString()}`;
                        wallet.total_value_krw = Math.floor(finalTotal); // 정렬용 값 업데이트

                    } catch (e: any) {
                        console.error("Upbit Load Error:", e);
                        wallet.balanceDisplay = "연결 실패";
                    }
                } else {
                    wallet.balanceDisplay = "Need Key";
                }
            }

            // ✨ B. EVM (Thirdweb SDK 사용 - 빠르고 안정적)
            if (wallet.addresses.evm) {
                const evmPromises = TARGET_CHAINS.map(async (item) => {
                    try {
                        // Thirdweb의 getWalletBalance는 내부적으로 RPC를 사용하여 매우 빠름
                        const result = await getWalletBalance({
                            client,
                            chain: item.chain,
                            address: wallet.addresses.evm!
                        });

                        const balance = Number(result.displayValue);

                        if (balance > 0) {
                            let price = 0;
                            let change = 0;
                            const symbolKey = item.symbol.toLowerCase();
                            const tokenPrices = prices?.tokens as any; // any 캐스팅으로 에러 방지

                            if (tokenPrices && tokenPrices[symbolKey]) {
                                price = tokenPrices[symbolKey].usd;
                                change = tokenPrices[symbolKey].change;
                            }

                            // 메인 화면 표시용 (이더리움 메인넷 잔액 우선)
                            if (item.chain.id === 1) wallet.balances.evm = balance;

                            return {
                                symbol: item.symbol,
                                name: item.name,
                                balance: balance,
                                price: price,
                                value: balance * price,
                                change: change,
                                network: item.name,
                                isNative: true
                            } as WalletAsset;
                        }
                    } catch (e) {
                        // 특정 체인 조회 실패해도 무시하고 진행
                    }
                    return null;
                });

                const evmAssets = (await Promise.all(evmPromises)).filter(Boolean) as WalletAsset[];
                wallet.assets.push(...evmAssets);
            }

            // C. Solana
            if (wallet.addresses.sol) {
                try {
                    const bal = await getSolanaConnection().getBalance(new PublicKey(wallet.addresses.sol));
                    const solVal = bal / LAMPORTS_PER_SOL;
                    wallet.balances.sol = solVal;
                    if (solVal > 0) {
                        wallet.assets.push({
                            symbol: "SOL",
                            name: "Solana",
                            balance: solVal,
                            price: prices?.tokens.sol.usd || 0,
                            value: solVal * (prices?.tokens.sol.usd || 0),
                            change: prices?.tokens.sol.change || 0,
                            network: "Solana",
                            isNative: true
                        });
                    }
                } catch (e) { wallet.balances.sol = 0; }
            }

            // D. Bitcoin
            if (wallet.addresses.btc) {
                try {
                    const btcVal = await fetchBitcoinBalance(wallet.addresses.btc);
                    wallet.balances.btc = btcVal;
                    if (btcVal > 0) {
                        wallet.assets.push({
                            symbol: "BTC",
                            name: "Bitcoin",
                            balance: btcVal,
                            price: prices?.tokens.btc.usd || 0,
                            value: btcVal * (prices?.tokens.btc.usd || 0),
                            change: prices?.tokens.btc.change || 0,
                            network: "Bitcoin",
                            isNative: true
                        });
                    }
                } catch(e) { wallet.balances.btc = 0; }
            }

            // E. Tron
            if (wallet.addresses.trx) {
                try {
                    const tron = getTronWeb();
                    const sun = await tron.trx.getBalance(wallet.addresses.trx);
                    const trxVal = sun / 1000000;
                    wallet.balances.trx = trxVal;
                     if (trxVal > 0) {
                        wallet.assets.push({
                            symbol: "TRX",
                            name: "Tron",
                            balance: trxVal,
                            price: prices?.tokens.trx.usd || 0,
                            value: trxVal * (prices?.tokens.trx.usd || 0),
                            change: prices?.tokens.trx.change || 0,
                            network: "Tron",
                            isNative: true
                        });
                    }
                } catch (e) { wallet.balances.trx = 0; }
            }

            // F. 총 가치 계산
            const totalUsd = wallet.assets.reduce((acc, cur) => acc + cur.value, 0);
            wallet.total_value_krw = Math.floor(totalUsd * exchangeRate) + (wallet.balances.krw || 0);

            // Display String Logic
            if (['XLOT', 'METAMASK', 'RABBY', 'MANUAL'].includes(wallet.wallet_type)) {
                wallet.balanceDisplay = `≈ ₩ ${wallet.total_value_krw.toLocaleString()}`;
            } else if (wallet.wallet_type === 'SOLANA') {
                wallet.balanceDisplay = `${(wallet.balances.sol || 0).toFixed(2)} SOL`;
            } else if (wallet.balanceDisplay === "Loading..." && wallet.total_value_krw === 0) {
                 wallet.balanceDisplay = `₩ 0`;
            }

            return wallet;
        } catch (e) {
            console.error(`Error (${slot.label}):`, e);
            wallet.balanceDisplay = "Error";
            return wallet;
        }
    }));

    return results.filter(Boolean) as WalletSlot[];
}

// ... (하단부 addCexWallet 등 기존 함수들은 변경 없음, 그대로 유지) ...
export async function addCexWallet(userId: string, type: string, access: string, secret: string, label: string) {
    const deviceId = getDeviceId();
    const { data: wallet, error } = await supabase.from('user_wallets').insert({
        user_id: userId,
        wallet_type: type,
        label,
        device_uuid: deviceId
    }).select().single();

    if (error) throw error;
    await supabase.from('wallet_api_keys').insert({
        wallet_id: wallet.id,
        device_uuid: deviceId,
        api_access_key: access,
        api_secret_key: secret
    });
}

export async function addKeyToExistingWallet(walletId: string, access: string, secret: string) {
    const deviceId = getDeviceId();
    await supabase.from('wallet_api_keys').upsert({
        wallet_id: walletId,
        device_uuid: deviceId,
        api_access_key: access,
        api_secret_key: secret
    }, { onConflict: 'wallet_id, device_uuid' });
}

export async function ensureMainWallet(userId: string, evmAddress: string, solAddress?: string) {
    const { data } = await supabase
        .from('user_wallets')
        .select('id, address_sol')
        .eq('user_id', userId)
        .eq('wallet_type', 'XLOT')
        .maybeSingle();

    if (!data) {
        await supabase.from('user_wallets').insert({
            user_id: userId,
            wallet_type: 'XLOT',
            label: "xLOT 메인 지갑",
            address: evmAddress,
            address_sol: solAddress || null,
            device_uuid: getDeviceId()
        });
    } else if (data && !data.address_sol && solAddress) {
        await supabase.from('user_wallets').update({ address_sol: solAddress }).eq('id', data.id);
    }
}

export async function addWeb3Wallet(userId: string, address: string, label: string, type: string) {
    const { data } = await supabase.from('user_wallets').select('id').eq('user_id', userId).eq('address', address).maybeSingle();
    if (data) throw new Error("이미 등록된 주소입니다.");

    await supabase.from('user_wallets').insert({
        user_id: userId,
        address,
        label,
        wallet_type: type,
        device_uuid: getDeviceId()
    });
}

// SSS 비수탁 지갑 — EVM/SOL/BTC/TRX 주소를 한 번에 저장
export async function addSSSWallet(
    userId: string,
    addresses: { evm: string; sol?: string; btc?: string; trx?: string },
    label: string,
) {
    const { data } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('address', addresses.evm.toLowerCase())
        .maybeSingle();
    if (data) throw new Error("이미 등록된 주소입니다.");

    await supabase.from('user_wallets').insert({
        user_id:      userId,
        address:      addresses.evm.toLowerCase(),
        address_sol:  addresses.sol  || null,
        address_btc:  addresses.btc  || null,
        address_trx:  addresses.trx  || null,
        label,
        wallet_type:  'XLOT_SSS',
        device_uuid:  getDeviceId(),
    });
}

export async function addSolanaWallet(userId: string, address: string, label: string) {
    try { new PublicKey(address); } catch (e) { throw new Error("올바른 Solana 주소 아님"); }
    const { data } = await supabase.from('user_wallets').select('id').eq('user_id', userId).eq('address', address).maybeSingle();
    if (data) throw new Error("이미 등록된 지갑입니다.");
    await supabase.from('user_wallets').insert({
        user_id: userId,
        address, 
        address_sol: address, 
        label,
        wallet_type: 'SOLANA',
        device_uuid: getDeviceId()
    });
}

export async function addBitcoinWallet(userId: string, address: string, label: string) {
    if (!address.match(/^(1|3|bc1)/)) throw new Error("올바른 비트코인 주소 아님");
    await supabase.from('user_wallets').insert({
        user_id: userId, address_btc: address, label, wallet_type: 'BITCOIN', device_uuid: getDeviceId()
    });
}

export async function addTronWallet(userId: string, address: string, label: string) {
    const tron = getTronWeb();
    if (!tron.isAddress(address)) throw new Error("올바른 트론 주소 아님");
    await supabase.from('user_wallets').insert({
        user_id: userId, address_trx: address, label, wallet_type: 'TRON', device_uuid: getDeviceId()
    });
}

export async function deleteWallet(id: string) {
    const { error } = await supabase.from('user_wallets').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function updateWalletAddresses(
    slotId: string,
    addresses: { evm?: string; sol?: string; btc?: string; trx?: string }
) {
    const updates: any = {};
    if (addresses.evm) updates.address = addresses.evm;
    if (addresses.sol) updates.address_sol = addresses.sol;
    if (addresses.btc) updates.address_btc = addresses.btc;
    if (addresses.trx) updates.address_trx = addresses.trx;
    if (Object.keys(updates).length === 0) return;
    await supabase.from('user_wallets').update(updates).eq('id', slotId);
}