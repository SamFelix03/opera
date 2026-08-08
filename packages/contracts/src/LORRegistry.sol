// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ScoreStore} from "./ScoreStore.sol";

/// @notice Living Operating Rights — mint / transfer with score-based fee / auto-list
contract LORRegistry is Ownable {
    using SafeERC20 for IERC20;

    struct LOR {
        uint256 assetId;
        address holder;
        bytes32 scope;
        uint256 price; // last / listing price in stake token units
        bool autoListed;
        bool active;
    }

    ScoreStore public immutable scoreStore;
    IERC20 public immutable feeToken;
    address public assetOwnerTreasury;
    uint256 public autoListThreshold = 72;
    uint256 public nextId = 1;

    mapping(uint256 => LOR) public lors;
    mapping(uint256 => uint256) public minScoreToHold; // per LOR

    event LORMinted(uint256 indexed lorId, uint256 assetId, address holder, bytes32 scope);
    event LORTransferred(uint256 indexed lorId, address from, address to, uint256 fee);
    event AutoListed(uint256 indexed lorId, uint256 price);
    event Acquired(uint256 indexed lorId, address buyer, uint256 price);

    constructor(address owner_, ScoreStore scoreStore_, IERC20 feeToken_, address treasury_)
        Ownable(owner_)
    {
        scoreStore = scoreStore_;
        feeToken = feeToken_;
        assetOwnerTreasury = treasury_;
    }

    function setAutoListThreshold(uint256 t) external onlyOwner {
        autoListThreshold = t;
    }

    function mintLOR(uint256 assetId, address holder, bytes32 scope, uint256 minScore)
        external
        onlyOwner
        returns (uint256 lorId)
    {
        require(scoreStore.getScore(holder) >= minScore, "score too low");
        lorId = nextId++;
        lors[lorId] = LOR({
            assetId: assetId,
            holder: holder,
            scope: scope,
            price: 0,
            autoListed: false,
            active: true
        });
        minScoreToHold[lorId] = minScore;
        emit LORMinted(lorId, assetId, holder, scope);
    }

    /// @notice Transfer fee bps = max(50, 5000 - score*45) — high score → low fee
    function transferFeeBps(address holder) public view returns (uint256) {
        uint256 score = scoreStore.getScore(holder);
        uint256 fee = 5000 - (score * 45);
        if (fee < 50) fee = 50;
        if (fee > 5000) fee = 5000;
        return fee;
    }

    function transferLOR(uint256 lorId, address to, uint256 notional) external {
        LOR storage lor = lors[lorId];
        require(lor.active, "inactive");
        require(msg.sender == lor.holder, "not holder");
        require(scoreStore.getScore(to) >= minScoreToHold[lorId], "buyer score");

        uint256 fee = (notional * transferFeeBps(lor.holder)) / 10_000;
        if (fee > 0) {
            feeToken.safeTransferFrom(msg.sender, assetOwnerTreasury, fee);
        }
        address from = lor.holder;
        lor.holder = to;
        lor.autoListed = false;
        lor.price = notional;
        emit LORTransferred(lorId, from, to, fee);
    }

    function setAutoListed(uint256 lorId, uint256 listPrice) external onlyOwner {
        LOR storage lor = lors[lorId];
        require(lor.active, "inactive");
        lor.autoListed = true;
        lor.price = listPrice;
        emit AutoListed(lorId, listPrice);
    }

    /// @notice Called by auto-list worker when score < threshold
    function maybeAutoList(uint256 lorId, uint256 listPrice) external onlyOwner {
        LOR storage lor = lors[lorId];
        if (scoreStore.getScore(lor.holder) < autoListThreshold) {
            lor.autoListed = true;
            lor.price = listPrice;
            emit AutoListed(lorId, listPrice);
        }
    }

    function acquireLOR(uint256 lorId) external {
        LOR storage lor = lors[lorId];
        require(lor.autoListed, "not listed");
        require(scoreStore.getScore(msg.sender) >= minScoreToHold[lorId], "score");
        uint256 price = lor.price;
        feeToken.safeTransferFrom(msg.sender, lor.holder, price);
        address prev = lor.holder;
        lor.holder = msg.sender;
        lor.autoListed = false;
        emit Acquired(lorId, msg.sender, price);
        emit LORTransferred(lorId, prev, msg.sender, 0);
    }
}
