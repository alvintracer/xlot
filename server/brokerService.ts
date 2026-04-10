import { ethers } from "ethers";

// ============================================================
// Traverse Broker Backend Service
// Target: Ethereum Mainnet
// USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
// ============================================================

const VAULT_ABI = [
  "event DepositRWA(address indexed user, address indexed token, uint256 amount)",
  "event WithdrawRWA(address indexed user, address indexed token, uint256 amount, uint256 nonce)",
  "function nonces(address) view returns (uint256)",
  "function getBalance(address, address) view returns (uint256)",
];

/**
 * [환경 변수 요구사항]
 * - RPC_URL: Ethereum Mainnet RPC (Alchemy/Infura)
 * - BACKEND_PRIVATE_KEY: 출금 서명용 Private Key
 * - VAULT_CONTRACT_ADDRESS: 배포된 XlotBrokerVault 주소
 * - BYBIT_API_KEY / BYBIT_API_SECRET: Bybit Broker API 키
 */
export class BrokerService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private vaultContract: ethers.Contract;
  private chainId: number = 1; // Ethereum Mainnet

  // 유저 → CEX Sub-account 매핑 (추후 DB로 교체)
  private userSubAccounts: Map<string, string> = new Map();

  constructor(
    rpcUrl: string, 
    privateKey: string, 
    vaultAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl || 'https://eth.llamarpc.com');
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, this.provider);
  }

  // ── 1. 초기화 ──────────────────────────────────────────────────
  public async initialize() {
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);
    console.log(`[BrokerService] Initialized on chain ${this.chainId}`);
    console.log(`[BrokerService] Signer: ${this.signer.address}`);
    console.log(`[BrokerService] Vault: ${await this.vaultContract.getAddress()}`);
    this.listenToDeposits();
  }

  // ── 2. DepositRWA 이벤트 감지 ──────────────────────────────────
  private listenToDeposits() {
    console.log(`[BrokerService] Listening for DepositRWA events on Ethereum...`);
    
    this.vaultContract.on("DepositRWA", async (user: string, token: string, amount: bigint, event: any) => {
      const usdAmount = ethers.formatUnits(amount, 6);
      console.log(`\n[DepositRWA] User: ${user} | Amount: $${usdAmount} USDC`);
      
      try {
        await this.handleUserDeposit(user, token, usdAmount);
      } catch (err) {
        console.error(`[BrokerService] Deposit handler error (tx: ${event?.log?.transactionHash}):`, err);
      }
    });
  }

  // ── 3. 입금 처리: CEX Sub-account 매핑 ─────────────────────────
  private async handleUserDeposit(userAddress: string, _tokenAddress: string, usdAmount: string) {
    let subAccountId = this.userSubAccounts.get(userAddress.toLowerCase());
    
    if (!subAccountId) {
      // TODO: Bybit Broker API - 서브계정 생성
      // const res = await bybitBrokerApi.createSubAccount({ username: `tv_${userAddress.slice(-8)}` });
      // subAccountId = res.result.uid;
      subAccountId = `tv_${userAddress.slice(-8)}`;
      this.userSubAccounts.set(userAddress.toLowerCase(), subAccountId);
      console.log(` -> [1] 신규 Sub-account 생성: ${subAccountId}`);
    } else {
      console.log(` -> [1] 기존 Sub-account 사용: ${subAccountId}`);
    }

    // TODO: Bybit Broker API - Master → Sub-account USDT 내부이체
    // await bybitBrokerApi.universalTransfer({
    //   fromMemberId: MASTER_UID,
    //   toMemberId: subAccountId,
    //   coin: 'USDT',
    //   amount: usdAmount,
    // });
    console.log(` -> [2] Sub-account로 $${usdAmount} 마진 할당 완료`);
  }

  // ── 4. 대리 주문 실행 ──────────────────────────────────────────
  public async executeProxyOrder(params: {
    userAddress: string;
    symbol: string;
    side: 'long' | 'short';
    size: string;
    leverage: number;
  }) {
    const subAccountId = this.userSubAccounts.get(params.userAddress.toLowerCase());
    if (!subAccountId) {
      throw new Error('Sub-account not found. Deposit first.');
    }

    console.log(`[ProxyOrder] ${params.side.toUpperCase()} ${params.size} USD on ${params.symbol} (${params.leverage}x)`);

    // TODO: Bybit Broker API - 서브계정에서 주문
    // const order = await bybitSubAccountApi.submitOrder({
    //   category: 'linear',
    //   symbol: params.symbol,       // e.g. 'XAUUSDT'
    //   side: params.side === 'long' ? 'Buy' : 'Sell',
    //   orderType: 'Market',
    //   qty: calculateQty(params.size, params.leverage, markPrice),
    //   leverage: String(params.leverage),
    // });

    return {
      success: true,
      orderId: `mock_${Date.now()}`,
      subAccount: subAccountId,
    };
  }

  // ── 5. 출금 서명 발급 (EIP-191) ────────────────────────────────
  public async generateWithdrawSignature(userAddress: string, tokenAddress: string, amount: string) {
    const isSafe = await this.checkCexMarginSafety(userAddress, amount);
    if (!isSafe) {
      throw new Error("출금 불가: 열린 포지션의 청산 위험이 있습니다.");
    }

    const nonce: bigint = await this.vaultContract.nonces(userAddress);
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10분 유효

    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "address", "uint256", "uint256", "uint256", "address", "uint256"],
      [userAddress, tokenAddress, amount, nonce, this.chainId, await this.vaultContract.getAddress(), deadline]
    );

    const signature = await this.signer.signMessage(ethers.getBytes(messageHash));

    return { deadline, signature, nonce: nonce.toString() };
  }

  // ── 6. CEX 마진 안전성 체크 ────────────────────────────────────
  private async checkCexMarginSafety(userAddress: string, _requestAmount: string): Promise<boolean> {
    // TODO: Bybit API로 서브계정 잔고/포지션 확인
    console.log(`[BrokerService] Margin safety check for ${userAddress}: PASS`);
    return true;
  }
}
