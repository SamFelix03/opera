// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OperaToken} from "../src/OperaToken.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ScoreStore} from "../src/ScoreStore.sol";
import {LORRegistry} from "../src/LORRegistry.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {RevenueManager} from "../src/RevenueManager.sol";
import {RightsPriceOracle} from "../src/RightsPriceOracle.sol";

contract OperaSuiteTest is Test {
    address owner = address(this);
    address writer = address(0xBEEF);
    address opA = address(0xA11);
    address opB = address(0xB22);
    address treasury = address(0x71);

    OperaToken token;
    AssetRegistry assets;
    ScoreStore scores;
    LORRegistry lors;
    MandateRegistry mandates;
    RevenueManager revenue;
    RightsPriceOracle oracle;

    function setUp() public {
        token = new OperaToken("Opera Solar CVA", "oCVA", owner);
        assets = new AssetRegistry(owner);
        scores = new ScoreStore(owner, writer);
        lors = new LORRegistry(owner, scores, token, treasury);
        mandates = new MandateRegistry(owner, token, scores);
        revenue = new RevenueManager(owner, token, scores, treasury);
        oracle = new RightsPriceOracle(owner);

        token.mint(opA, 1_000_000 ether);
        token.mint(opB, 1_000_000 ether);
        token.mint(address(this), 1_000_000 ether);

        vm.prank(writer);
        scores.setScore(opA, 95, bytes32("a"));
        vm.prank(writer);
        scores.setScore(opB, 90, bytes32("b"));
    }

    function test_mintAndPause() public {
        assertEq(token.balanceOf(opA), 1_000_000 ether);
        token.pause();
        vm.expectRevert();
        vm.prank(opA);
        token.transfer(opB, 1);
    }

    function test_assetRegister() public {
        uint256 id = assets.registerAsset(
            address(token), address(lors), address(mandates), bytes32("solar"), "ipfs://x"
        );
        assertEq(id, 1);
        assertTrue(assets.getAsset(1).exists);
    }

    function test_lorMintTransferAutoListAcquire() public {
        uint256 lorId = lors.mintLOR(1, opA, bytes32("maint"), 80);
        vm.prank(opA);
        token.approve(address(lors), type(uint256).max);
        vm.prank(opA);
        lors.transferLOR(lorId, opB, 1000 ether);

        // degrade opB and auto-list
        vm.prank(writer);
        scores.setScore(opB, 31, bytes32("frozen"));
        lors.maybeAutoList(lorId, 500 ether);
        (,,,, bool listed,) = _lor(lorId);
        assertTrue(listed);

        vm.prank(writer);
        scores.setScore(opA, 96, bytes32("a2"));
        vm.prank(opA);
        token.approve(address(lors), type(uint256).max);
        // opB must approve? acquire pays previous holder from buyer
        // buyer is opA
        vm.prank(opA);
        lors.acquireLOR(lorId);
        (,, address holder,, bool listed2,) = _unpack(lorId);
        assertEq(holder, opA);
        assertFalse(listed2);
    }

    function _lor(uint256 id)
        internal
        view
        returns (uint256, address, bytes32, uint256, bool, bool)
    {
        return lors.lors(id);
    }

    function _unpack(uint256 id)
        internal
        view
        returns (uint256, address, address, uint256, bool, bool)
    {
        (uint256 assetId, address holder, , uint256 price, bool autoListed, bool active) = lors.lors(id);
        return (assetId, holder, holder, price, autoListed, active);
    }

    function test_mandateBidAwardSlash() public {
        vm.prank(opA);
        token.approve(address(mandates), type(uint256).max);
        vm.prank(opB);
        token.approve(address(mandates), type(uint256).max);

        uint256 id = mandates.publishMandate(1, bytes32("energy"), 80, bytes32("SG"), 5_000 ether, 1_000 ether);
        vm.prank(opA);
        mandates.bid(id);
        vm.prank(opB);
        mandates.bid(id);
        mandates.award(id, opA);

        mandates.slashStake(id, 100 ether);
        mandates.releaseStake(id);
        assertTrue(mandates.principalOk(id, opA, 500 ether));
        assertFalse(mandates.principalOk(id, opA, 2_000 ether));
    }

    function test_revenueBands() public {
        token.approve(address(revenue), type(uint256).max);

        vm.prank(writer);
        scores.setScore(opA, 96, 0);
        revenue.distribute(opA, 1000 ether);

        vm.prank(writer);
        scores.setScore(opA, 85, 0);
        revenue.distribute(opA, 1000 ether);
        assertGt(revenue.escrow(opA), 0);

        vm.prank(writer);
        scores.setScore(opA, 75, 0);
        revenue.distribute(opA, 1000 ether);

        vm.prank(writer);
        scores.setScore(opA, 31, 0);
        uint256 poolBefore = revenue.slashingPool();
        revenue.distribute(opA, 1000 ether);
        assertGt(revenue.slashingPool(), poolBefore);
    }

    function test_oracleTwap() public {
        oracle.recordPrice(bytes32("solar"), 100 ether);
        vm.warp(block.timestamp + 100);
        oracle.recordPrice(bytes32("solar"), 200 ether);
        vm.warp(block.timestamp + 100);
        uint256 avg = oracle.twap(bytes32("solar"), 1000);
        assertGt(avg, 0);
    }
}
