// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AssetRegistry is Ownable {
    struct Asset {
        address token;
        address lorRegistry;
        address mandateRegistry;
        bytes32 category;
        string metadataURI;
        bool exists;
    }

    uint256 public nextAssetId = 1;
    mapping(uint256 => Asset) public assets;

    event AssetRegistered(uint256 indexed assetId, address token, bytes32 category);

    constructor(address owner_) Ownable(owner_) {}

    function registerAsset(
        address token,
        address lorRegistry,
        address mandateRegistry,
        bytes32 category,
        string calldata metadataURI
    ) external onlyOwner returns (uint256 assetId) {
        assetId = nextAssetId++;
        assets[assetId] = Asset({
            token: token,
            lorRegistry: lorRegistry,
            mandateRegistry: mandateRegistry,
            category: category,
            metadataURI: metadataURI,
            exists: true
        });
        emit AssetRegistered(assetId, token, category);
    }

    function getAsset(uint256 assetId) external view returns (Asset memory) {
        return assets[assetId];
    }
}
