// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {OperaToken} from "../src/OperaToken.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ScoreStore} from "../src/ScoreStore.sol";
import {LORRegistry} from "../src/LORRegistry.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {RevenueManager} from "../src/RevenueManager.sol";
import {RightsPriceOracle} from "../src/RightsPriceOracle.sol";

contract Deploy is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        address scoreWriter = vm.envAddress("SCORE_WRITER_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        OperaToken token = new OperaToken("Opera Solar CVA", "oCVA", deployer);
        AssetRegistry assets = new AssetRegistry(deployer);
        ScoreStore scores = new ScoreStore(deployer, scoreWriter);
        LORRegistry lors = new LORRegistry(deployer, scores, token, deployer);
        MandateRegistry mandates = new MandateRegistry(deployer, token, scores);
        RevenueManager revenue = new RevenueManager(deployer, token, scores, deployer);
        RightsPriceOracle oracle = new RightsPriceOracle(deployer);

        uint256 assetId = assets.registerAsset(
            address(token),
            address(lors),
            address(mandates),
            bytes32("solar"),
            "opera://solar-farm-malaysia"
        );

        vm.stopBroadcast();

        console2.log("OperaToken", address(token));
        console2.log("AssetRegistry", address(assets));
        console2.log("ScoreStore", address(scores));
        console2.log("LORRegistry", address(lors));
        console2.log("MandateRegistry", address(mandates));
        console2.log("RevenueManager", address(revenue));
        console2.log("RightsPriceOracle", address(oracle));
        console2.log("assetId", assetId);
        console2.log("deployer", deployer);
        console2.log("scoreWriter", scoreWriter);
    }
}
