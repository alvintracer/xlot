// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PhoneEscrow.sol";

contract DeployEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        // 백엔드에서 사용할 지갑 주소 (공개키) - 아래 환경변수나 하드코딩으로 넣으세요
        address serverSigner = vm.envAddress("SERVER_SIGNER_ADDRESS"); 

        vm.startBroadcast(deployerPrivateKey);

        PhoneEscrow escrow = new PhoneEscrow(serverSigner);

        vm.stopBroadcast();
        
        console.log("PhoneEscrow Deployed at:", address(escrow));
    }
}