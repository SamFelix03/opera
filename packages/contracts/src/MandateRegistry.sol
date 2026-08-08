// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ScoreStore} from "./ScoreStore.sol";

contract MandateRegistry is Ownable {
    using SafeERC20 for IERC20;

    struct Mandate {
        uint256 assetId;
        bytes32 scope;
        uint256 minScore;
        bytes32 jurisdictionRoot; // optional tag
        uint256 stakeAmount;
        uint256 maxSpendPerTx;
        address publisher;
        address winner;
        bool open;
        bool awarded;
    }

    struct Bid {
        address bidder;
        uint256 stake;
        bool active;
    }

    IERC20 public immutable stakeToken;
    ScoreStore public immutable scoreStore;
    uint256 public nextMandateId = 1;

    mapping(uint256 => Mandate) public mandates;
    mapping(uint256 => Bid[]) public bids;

    event MandatePublished(uint256 indexed mandateId, uint256 assetId, uint256 stakeAmount);
    event BidPosted(uint256 indexed mandateId, address bidder, uint256 stake);
    event Awarded(uint256 indexed mandateId, address winner);
    event StakeSlashed(uint256 indexed mandateId, address operator, uint256 amount);
    event StakeReleased(uint256 indexed mandateId, address operator, uint256 amount);

    constructor(address owner_, IERC20 stakeToken_, ScoreStore scoreStore_) Ownable(owner_) {
        stakeToken = stakeToken_;
        scoreStore = scoreStore_;
    }

    function publishMandate(
        uint256 assetId,
        bytes32 scope,
        uint256 minScore,
        bytes32 jurisdictionRoot,
        uint256 stakeAmount,
        uint256 maxSpendPerTx
    ) external returns (uint256 id) {
        id = nextMandateId++;
        mandates[id] = Mandate({
            assetId: assetId,
            scope: scope,
            minScore: minScore,
            jurisdictionRoot: jurisdictionRoot,
            stakeAmount: stakeAmount,
            maxSpendPerTx: maxSpendPerTx,
            publisher: msg.sender,
            winner: address(0),
            open: true,
            awarded: false
        });
        emit MandatePublished(id, assetId, stakeAmount);
    }

    function bid(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        require(m.open && !m.awarded, "closed");
        require(scoreStore.getScore(msg.sender) >= m.minScore, "score");
        stakeToken.safeTransferFrom(msg.sender, address(this), m.stakeAmount);
        bids[mandateId].push(Bid({bidder: msg.sender, stake: m.stakeAmount, active: true}));
        emit BidPosted(mandateId, msg.sender, m.stakeAmount);
    }

    function award(uint256 mandateId, address winner) external {
        Mandate storage m = mandates[mandateId];
        require(msg.sender == m.publisher || msg.sender == owner(), "auth");
        require(m.open && !m.awarded, "closed");
        bool found;
        Bid[] storage bs = bids[mandateId];
        for (uint256 i = 0; i < bs.length; i++) {
            if (bs[i].bidder == winner && bs[i].active) {
                found = true;
            } else if (bs[i].active) {
                bs[i].active = false;
                stakeToken.safeTransfer(bs[i].bidder, bs[i].stake);
                emit StakeReleased(mandateId, bs[i].bidder, bs[i].stake);
            }
        }
        require(found, "no bid");
        m.winner = winner;
        m.awarded = true;
        m.open = false;
        emit Awarded(mandateId, winner);
    }

    /// @notice Compliance slash — not performance. amount routed to publisher.
    function slashStake(uint256 mandateId, uint256 amount) external onlyOwner {
        Mandate storage m = mandates[mandateId];
        require(m.awarded, "not awarded");
        Bid[] storage bs = bids[mandateId];
        for (uint256 i = 0; i < bs.length; i++) {
            if (bs[i].bidder == m.winner && bs[i].active) {
                require(amount <= bs[i].stake, "amount");
                bs[i].stake -= amount;
                stakeToken.safeTransfer(m.publisher, amount);
                emit StakeSlashed(mandateId, m.winner, amount);
                return;
            }
        }
        revert("no stake");
    }

    function releaseStake(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        require(msg.sender == m.publisher || msg.sender == owner(), "auth");
        Bid[] storage bs = bids[mandateId];
        for (uint256 i = 0; i < bs.length; i++) {
            if (bs[i].bidder == m.winner && bs[i].active) {
                bs[i].active = false;
                uint256 amt = bs[i].stake;
                bs[i].stake = 0;
                stakeToken.safeTransfer(m.winner, amt);
                emit StakeReleased(mandateId, m.winner, amt);
                return;
            }
        }
        revert("no stake");
    }

    function principalOk(uint256 mandateId, address agent, uint256 spend)
        external
        view
        returns (bool)
    {
        Mandate storage m = mandates[mandateId];
        return m.awarded && m.winner == agent && spend <= m.maxSpendPerTx;
    }
}
