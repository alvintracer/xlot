import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ethers } from "https://esm.sh/ethers@6.11.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 범용적인 ERC20 Permit ABI
const permitAbi = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function decimals() view returns (uint8)"
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { network, tokenAddress, owner, toAddress, amount, deadline, v, r, s } = body;

    // EVM_RELAYER_KEY는 서버측 가스비 대납용 어드민 지갑의 프라이빗 키
    const EVM_RELAYER_KEY = Deno.env.get("EVM_RELAYER_KEY");

    if (!EVM_RELAYER_KEY) {
      console.log(`[Mock] Received EVM Permit Request: ${amount} to ${toAddress}`);
      return new Response(JSON.stringify({ 
        success: true, 
        txHash: "mock_tx_hash_permit_relay", 
        message: "EVM_RELAYER_KEY not configured. Mock Permit execution success." 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // 1. Provider 설정 (네트워크별 RPC)
    let rpcUrl = "https://eth.llamarpc.com";
    if (network === "Polygon") rpcUrl = "https://polygon-rpc.com";
    if (network === "Base") rpcUrl = "https://mainnet.base.org";
    if (network === "Arbitrum") rpcUrl = "https://arb1.arbitrum.io/rpc";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayerWallet = new ethers.Wallet(EVM_RELAYER_KEY, provider);

    const tokenContract = new ethers.Contract(tokenAddress, permitAbi, relayerWallet);

    // 2. 토큰 decimals 조회 (USDC/PYUSD = 6, 체인마다 다를 수 있으므로 동적 조회)
    let decimals = 6;
    try { decimals = Number(await tokenContract.decimals()); } catch (_) { /* 기본값 6 유지 */ }
    const amountWei = ethers.parseUnits(amount, decimals);

    // 3. Permit 트랜잭션 — 클라이언트가 서명한 value와 동일한 amountWei 사용 필수
    //    (parseEther 대신 parseUnits(amount, decimals) 사용 — USDC는 6 decimals)
    console.log(`Executing permit() on ${network}, amount=${amount}, decimals=${decimals}`);
    let tx = await tokenContract.permit(owner, relayerWallet.address, amountWei, deadline, v, r, s);
    await tx.wait(); // permit 완료 대기

    console.log(`Executing transferFrom() to ${toAddress}`);
    tx = await tokenContract.transferFrom(owner, toAddress, amountWei);
    const receipt = await tx.wait();

    console.log(`Permit + Transfer Executed successfully. TxHash: ${receipt.hash}`);
    
    return new Response(
      JSON.stringify({ success: true, txHash: receipt.hash, message: `Permit + transferFrom executed successfully` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error("Permit Relay Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error occurred in Permit Relay" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
