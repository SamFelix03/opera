// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice On-chain operator compliance scores written by authorised score writer
contract ScoreStore is Ownable {
    address public scoreWriter;
    mapping(address => uint256) public scores; // 0-100

    event ScoreUpdated(address indexed operator, uint256 score, bytes32 inputsHash);

    error NotWriter();

    constructor(address owner_, address writer_) Ownable(owner_) {
        scoreWriter = writer_;
    }

    function setScoreWriter(address writer_) external onlyOwner {
        scoreWriter = writer_;
    }

    function setScore(address operator, uint256 score, bytes32 inputsHash) external {
        if (msg.sender != scoreWriter && msg.sender != owner()) revert NotWriter();
        require(score <= 100, "score>100");
        scores[operator] = score;
        emit ScoreUpdated(operator, score, inputsHash);
    }

    function getScore(address operator) external view returns (uint256) {
        return scores[operator];
    }
}
