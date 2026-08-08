// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ScoreStore} from "./ScoreStore.sol";

contract RevenueManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable cva;
    ScoreStore public immutable scoreStore;
    address public assetOwner;

    mapping(address => uint256) public escrow;
    uint256 public slashingPool;

    event Distributed(
        address indexed operator,
        uint256 gross,
        uint256 paid,
        uint256 escrowed,
        uint256 slashed,
        uint256 score
    );
    event EscrowReleased(address indexed operator, uint256 amount);
    event SlashToOwner(uint256 amount);

    constructor(address owner_, IERC20 cva_, ScoreStore scoreStore_, address assetOwner_)
        Ownable(owner_)
    {
        cva = cva_;
        scoreStore = scoreStore_;
        assetOwner = assetOwner_;
    }

    function yieldSplit(uint256 score)
        public
        pure
        returns (uint256 paidBps, uint256 escrowBps, bool slashAll)
    {
        if (score >= 95) return (10_000, 0, false);
        if (score >= 80) return (8500, 1500, false);
        if (score >= 70) return (6000, 4000, false);
        return (0, 0, true);
    }

    /// @notice Pulls `gross` from msg.sender (tenant/agent), splits by operator score
    function distribute(address operator, uint256 gross) external {
        cva.safeTransferFrom(msg.sender, address(this), gross);
        uint256 score = scoreStore.getScore(operator);
        (uint256 paidBps, uint256 escrowBps, bool slashAll) = yieldSplit(score);

        uint256 ownerShare = gross / 2; // 50% asset owner baseline for demo economics
        uint256 operatorGross = gross - ownerShare;

        uint256 paid;
        uint256 escrowed;
        uint256 slashed;

        if (slashAll) {
            slashed = operatorGross;
            slashingPool += slashed;
            cva.safeTransfer(assetOwner, ownerShare);
        } else {
            paid = (operatorGross * paidBps) / 10_000;
            escrowed = (operatorGross * escrowBps) / 10_000;
            escrow[operator] += escrowed;
            cva.safeTransfer(assetOwner, ownerShare);
            if (paid > 0) cva.safeTransfer(operator, paid);
        }

        emit Distributed(operator, gross, paid, escrowed, slashed, score);
    }

    function releaseEscrow(address operator, uint256 amount) external onlyOwner {
        require(escrow[operator] >= amount, "escrow");
        escrow[operator] -= amount;
        cva.safeTransfer(operator, amount);
        emit EscrowReleased(operator, amount);
    }

    function slashToOwner(uint256 amount) external onlyOwner {
        require(slashingPool >= amount, "pool");
        slashingPool -= amount;
        cva.safeTransfer(assetOwner, amount);
        emit SlashToOwner(amount);
    }
}
