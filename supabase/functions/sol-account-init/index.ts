import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userAddress } = await req.json();

    if (!userAddress) {
      throw new Error("Missing userAddress parameter.");
    }

    const SOL_RELAYER_KEY = Deno.env.get("SOL_RELAYER_KEY");

    if (!SOL_RELAYER_KEY) {
      console.log(`[Mock] Received SOL Init Request: 0.01 SOL to ${userAddress}`);
      return new Response(JSON.stringify({ 
        success: true, 
        txHash: "mock_tx_hash_sol_init", 
        message: "SOL_RELAYER_KEY not configured. Mock JIT success." 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // TODO: @solana/web3.js 연동하여 실제 0.01 SOL JIT 전송
    // const connection = new Connection('https://rpc.ankr.com/solana');
    // const fromWallet = Keypair.fromSecretKey(bs58.decode(SOL_RELAYER_KEY));
    // const tx = new Transaction().add(SystemProgram.transfer({
    //    fromPubkey: fromWallet.publicKey, toPubkey: new PublicKey(userAddress), lamports: 10000000 // 0.01 SOL
    // }));
    // const signature = await sendAndConfirmTransaction(connection, tx, [fromWallet]);

    console.log(`JIT SOL Executed (Skeleton): 0.01 SOL to ${userAddress}`);
    return new Response(
      JSON.stringify({ success: true, message: `JIT 0.01 SOL requested for ${userAddress}.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error("SOL Init Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error occurred" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
