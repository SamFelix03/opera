// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Simple cumulative TWAP of LOR prices per asset category
contract RightsPriceOracle is Ownable {
    struct Obs {
        uint256 price;
        uint256 timestamp;
    }

    mapping(bytes32 => Obs[]) internal series;

    event PriceRecorded(bytes32 indexed category, uint256 price, uint256 timestamp);

    constructor(address owner_) Ownable(owner_) {}

    function recordPrice(bytes32 category, uint256 price) external onlyOwner {
        series[category].push(Obs({price: price, timestamp: block.timestamp}));
        emit PriceRecorded(category, price, block.timestamp);
    }

    function observationCount(bytes32 category) external view returns (uint256) {
        return series[category].length;
    }

    /// @notice Time-weighted average over the last `window` seconds (or all if shorter)
    function twap(bytes32 category, uint256 window) external view returns (uint256) {
        Obs[] storage s = series[category];
        require(s.length > 0, "empty");
        uint256 cutoff = block.timestamp > window ? block.timestamp - window : 0;
        uint256 weighted;
        uint256 timeSum;
        for (uint256 i = 1; i < s.length; i++) {
            if (s[i].timestamp < cutoff) continue;
            uint256 dt = s[i].timestamp - s[i - 1].timestamp;
            if (dt == 0) continue;
            weighted += s[i - 1].price * dt;
            timeSum += dt;
        }
        // include last observation until now
        Obs storage last = s[s.length - 1];
        if (last.timestamp >= cutoff) {
            uint256 dt = block.timestamp - last.timestamp;
            if (dt == 0) dt = 1;
            weighted += last.price * dt;
            timeSum += dt;
        }
        require(timeSum > 0, "no window");
        return weighted / timeSum;
    }
}
