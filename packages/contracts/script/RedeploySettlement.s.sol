// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ScoreStore} from "../src/ScoreStore.sol";
import {LORRegistry} from "../src/LORRegistry.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {RevenueManager} from "../src/RevenueManager.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RightsPriceOracle} from "../src/RightsPriceOracle.sol";

/// @notice Redeploy settlement contracts bound to Cleanverse Opera A-Token (CVA).
contract RedeploySettlement is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        address scoreStore = vm.envAddress("SCORE_STORE");
        address settlement = vm.envAddress("SETTLEMENT_TOKEN"); // Opera A-Token
        address assets = vm.envAddress("ASSET_REGISTRY");
        address oracle = vm.envAddress("ORACLE");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        LORRegistry lors = new LORRegistry(
            deployer, ScoreStore(scoreStore), IERC20(settlement), deployer
        );
        MandateRegistry mandates = new MandateRegistry(
            deployer, IERC20(settlement), ScoreStore(scoreStore)
        );
        RevenueManager revenue = new RevenueManager(
            deployer, IERC20(settlement), ScoreStore(scoreStore), deployer
        );

        uint256 assetId = AssetRegistry(assets).registerAsset(
            settlement,
            address(lors),
            address(mandates),
            bytes32("solar"),
            "opera://solar-farm-malaysia-cva"
        );

        // touch oracle so deployment set is complete
        RightsPriceOracle(oracle);

        vm.stopBroadcast();

        console2.log("SettlementToken", settlement);
        console2.log("LORRegistry", address(lors));
        console2.log("MandateRegistry", address(mandates));
        console2.log("RevenueManager", address(revenue));
        console2.log("assetId", assetId);
    }
}
