// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title XlotBrokerVault
 * @notice Traverse Wallet의 RWA Broker Vault.
 *         유저의 USDC 예치를 CEX Sub-account 마진과 연동하기 위한 금고.
 *         입금(Deposit)은 자유 + permit 지원 (가스리스 approve).
 *         출금(Withdraw)은 백엔드 서명(Signature) 필수.
 *         (CEX에 열려있는 포지션 증거금을 검증해야 하므로)
 *
 * @dev    Target chain: Ethereum Mainnet
 *         Primary token: USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
 *         USDC supports EIP-2612 permit → depositWithPermit() 가능
 */
contract XlotBrokerVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────
    // Traverse 백엔드의 서명 검증용 권한 계정
    address public backendSigner;

    // 허용된 입금 토큰 (USDC만 허용하여 관리 단순화)
    mapping(address => bool) public allowedTokens;

    // 유저 -> 토큰 -> 잔고(논리적 기록)
    mapping(address => mapping(address => uint256)) public balances;
    
    // 서명 재사용(Replay Attack) 방지용 논스
    mapping(address => uint256) public nonces;

    // 전체 예치(TVL) 추적
    uint256 public totalDeposited;

    // ── Events ────────────────────────────────────────────────────
    event DepositRWA(address indexed user, address indexed token, uint256 amount);
    event WithdrawRWA(address indexed user, address indexed token, uint256 amount, uint256 nonce);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event TokenAllowanceUpdated(address indexed token, bool allowed);
    event Swept(address indexed to, address indexed token, uint256 amount);

    // ── Constructor ──────────────────────────────────────────────
    constructor(address _backendSigner, address _usdc) Ownable(msg.sender) {
        require(_backendSigner != address(0), "Invalid signer");
        require(_usdc != address(0), "Invalid USDC");
        backendSigner = _backendSigner;
        allowedTokens[_usdc] = true;
        emit TokenAllowanceUpdated(_usdc, true);
    }

    // ── Admin ────────────────────────────────────────────────────
    function setBackendSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "Invalid signer");
        emit SignerUpdated(backendSigner, _newSigner);
        backendSigner = _newSigner;
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowanceUpdated(token, allowed);
    }

    // ── 1. Deposit (일반: 유저가 미리 approve 한 경우) ─────────────
    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(allowedTokens[token], "Token not allowed");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        totalDeposited += amount;

        emit DepositRWA(msg.sender, token, amount);
    }

    // ── 2. Deposit with Permit (가스리스 approve + deposit 원샷) ──
    /**
     * @dev USDC가 EIP-2612 permit을 지원하므로,
     *      유저는 서명 한 번으로 approve + deposit을 동시에 처리할 수 있습니다.
     *      프론트에서 signTypedData로 permit 서명을 받아 이 함수에 전달.
     */
    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(allowedTokens[token], "Token not allowed");

        // EIP-2612: permit → approve를 가스리스 서명으로 처리
        IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        totalDeposited += amount;

        emit DepositRWA(msg.sender, token, amount);
    }

    // ── 3. Withdraw (백엔드 서명 필수) ────────────────────────────
    /**
     * @dev 유저가 출금을 요청하면, 백엔드가 CEX 마진 상태를 확인 후
     *      서명을 발급. 유저는 그 서명을 가지고 이 함수를 호출.
     *      서명 규칙 (EIP-191): hash = keccak256(user, token, amount, nonce, chainid, vault, deadline)
     */
    function withdraw(
        address token, 
        uint256 amount, 
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender][token] >= amount, "Insufficient vault balance");
        require(block.timestamp <= deadline, "Signature expired");

        uint256 currentNonce = nonces[msg.sender];

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                msg.sender, 
                token, 
                amount, 
                currentNonce, 
                block.chainid, 
                address(this),
                deadline
            )
        );

        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        require(ECDSA.recover(ethSignedMessageHash, signature) == backendSigner, "Invalid signature");

        balances[msg.sender][token] -= amount;
        nonces[msg.sender]++;
        totalDeposited -= amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit WithdrawRWA(msg.sender, token, amount, currentNonce);
    }

    // ── 4. Sweep (관리자: CEX 핫월렛으로 내부 이동) ────────────────
    function sweepToCEXBroker(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid destination");
        IERC20(token).safeTransfer(to, amount);
        emit Swept(to, token, amount);
    }

    // ── View helpers ─────────────────────────────────────────────
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }
}
