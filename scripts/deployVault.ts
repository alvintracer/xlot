// ============================================================
// XlotBrokerVault — Ethereum Mainnet 배포 스크립트
// ============================================================
// 실행: npx ts-node scripts/deployVault.ts
// 환경변수 필요:
//   DEPLOYER_PRIVATE_KEY — 배포자 지갑 Private Key (ETH 가스비 필요)
//   BACKEND_SIGNER_ADDRESS — 백엔드 서명 검증용 공개 주소
//   ETH_RPC_URL — Ethereum Mainnet RPC (Alchemy/Infura)
// ============================================================

import { ethers } from 'ethers';

// ── Ethereum Mainnet USDC ────────────────────────────────────
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ── Compiled ABI + Bytecode ──────────────────────────────────
// Remix나 solc로 컴파일한 결과물을 여기에 붙여넣으세요.
// Remix에서 컴파일 후: Compilation Details > ABI, Bytecode 복사
const VAULT_ABI = [
  // Constructor
  "constructor(address _backendSigner, address _usdc)",
  // Deposit
  "function deposit(address token, uint256 amount) external",
  "function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  // Withdraw  
  "function withdraw(address token, uint256 amount, uint256 deadline, bytes calldata signature) external",
  // View
  "function balances(address, address) view returns (uint256)",
  "function getBalance(address user, address token) view returns (uint256)",
  "function getNonce(address user) view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function backendSigner() view returns (address)",
  "function allowedTokens(address) view returns (bool)",
  // Admin
  "function setBackendSigner(address _newSigner) external",
  "function setAllowedToken(address token, bool allowed) external",
  "function sweepToCEXBroker(address token, uint256 amount, address to) external",
  // Events
  "event DepositRWA(address indexed user, address indexed token, uint256 amount)",
  "event WithdrawRWA(address indexed user, address indexed token, uint256 amount, uint256 nonce)",
  "event SignerUpdated(address indexed oldSigner, address indexed newSigner)",
  "event TokenAllowanceUpdated(address indexed token, bool allowed)",
  "event Swept(address indexed to, address indexed token, uint256 amount)",
];

// ⚠️ 이 값은 Remix에서 컴파일 후 Bytecode를 복사해 넣어야 합니다.
// Remix: Solidity Compiler > Compilation Details > Bytecode > object 필드
const VAULT_BYTECODE = 'PASTE_COMPILED_BYTECODE_HERE';

async function main() {
  // ── 환경변수 로드 ──
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const signerAddress = process.env.BACKEND_SIGNER_ADDRESS;
  const rpcUrl = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';

  if (!deployerKey) throw new Error('❌ DEPLOYER_PRIVATE_KEY 환경변수가 없습니다.');
  if (!signerAddress) throw new Error('❌ BACKEND_SIGNER_ADDRESS 환경변수가 없습니다.');

  console.log('🚀 XlotBrokerVault 배포 시작...');
  console.log(`   Chain: Ethereum Mainnet (chainId: 1)`);
  console.log(`   USDC: ${USDC_ETHEREUM}`);
  console.log(`   Backend Signer: ${signerAddress}`);

  // ── Provider + Wallet ──
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(deployerKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error('❌ 배포 지갑에 ETH가 없습니다. 가스비용 ETH를 먼저 입금하세요.');
  }

  // ── Deploy ──
  const factory = new ethers.ContractFactory(VAULT_ABI, VAULT_BYTECODE, wallet);
  
  console.log('\n📡 트랜잭션 전송 중...');
  const contract = await factory.deploy(signerAddress, USDC_ETHEREUM);
  
  console.log(`   TX Hash: ${contract.deploymentTransaction()?.hash}`);
  console.log('   ⏳ 컨펌 대기 중...');
  
  await contract.waitForDeployment();
  const deployedAddress = await contract.getAddress();

  console.log('\n✅ 배포 완료!');
  console.log(`   ╔══════════════════════════════════════════════╗`);
  console.log(`   ║  Vault Address: ${deployedAddress}  ║`);
  console.log(`   ╚══════════════════════════════════════════════╝`);
  console.log(`\n📋 다음 단계:`);
  console.log(`   1. .env에 VAULT_CONTRACT_ADDRESS=${deployedAddress} 추가`);
  console.log(`   2. Etherscan에서 Verify & Publish`);
  console.log(`   3. 중계서버(brokerService)에 주소 설정`);
}

main().catch(console.error);
