// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

contract PhoneEscrow is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    address public immutable serverSigner;

    struct DepositInfo {
        address sender;
        address token; // 0x000...000 이면 Native Token (POL/ETH)
        uint256 amount;
        uint64 expiry;
        bool isClaimed;
    }

    mapping(bytes32 => DepositInfo) public deposits;

    event Deposited(bytes32 indexed commitment, address indexed sender, uint256 amount, address token);
    event Claimed(bytes32 indexed commitment, address indexed recipient);
    event Refunded(bytes32 indexed commitment, address indexed sender);

    constructor(address _serverSigner) {
        serverSigner = _serverSigner;
    }

    // ✨ 1. 송금 (payable 추가 및 분기 처리)
    function deposit(bytes32 commitment, address token, uint256 amount, uint64 expiry) external payable nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(deposits[commitment].sender == address(0), "Commitment exists");
        require(expiry > block.timestamp, "Invalid expiry");

        // ✨ [핵심 수정] 토큰 주소가 0이면 Native Token(POL)으로 처리
        if (token == address(0)) {
            require(msg.value == amount, "POL amount mismatch");
        } else {
            // ERC20이면 Native Token을 같이 보내면 안됨
            require(msg.value == 0, "Do not send POL with ERC20");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        deposits[commitment] = DepositInfo({
            sender: msg.sender,
            token: token,
            amount: amount,
            expiry: expiry,
            isClaimed: false
        });

        emit Deposited(commitment, msg.sender, amount, token);
    }

    // ✨ 2. 수령 (Native 지원 추가)
    function claim(bytes32 commitment, bytes calldata signature) external nonReentrant {
        DepositInfo storage d = deposits[commitment];
        
        require(d.sender != address(0), "Not found");
        require(!d.isClaimed, "Already claimed");
        require(block.timestamp <= d.expiry, "Expired");

        bytes32 messageHash = keccak256(abi.encodePacked(commitment, msg.sender, block.chainid));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        
        require(ethSignedMessageHash.recover(signature) == serverSigner, "Invalid signature");

        d.isClaimed = true;

        // ✨ [핵심 수정] 토큰 타입에 따라 다르게 전송
        if (d.token == address(0)) {
            // Native Token (POL) 전송
            (bool success, ) = payable(msg.sender).call{value: d.amount}("");
            require(success, "POL Transfer failed");
        } else {
            // ERC20 전송
            IERC20(d.token).safeTransfer(msg.sender, d.amount);
        }

        emit Claimed(commitment, msg.sender);
    }

    // ✨ 3. 환불 (Native 지원 추가)
    function refund(bytes32 commitment) external nonReentrant {
        DepositInfo storage d = deposits[commitment];
        require(d.sender == msg.sender, "Not sender");
        require(!d.isClaimed, "Already claimed");
        require(block.timestamp > d.expiry, "Not expired");

        uint256 amount = d.amount;
        address token = d.token;
        
        delete deposits[commitment];

        // ✨ [핵심 수정] 환불 시에도 타입 확인
        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "POL Refund failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit Refunded(commitment, msg.sender);
    }
    
    // 혹시 모를 POL 수신을 위한 함수 (필수는 아니지만 권장)
    receive() external payable {}
}