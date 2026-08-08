// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice CVA-backed RWA asset token (Opera-side ERC20 with pause + transfer hook)
contract OperaToken is ERC20, Ownable, Pausable {
    mapping(address => bool) public minters;
    address public transferGate; // optional external gate (validator adapter)

    error NotMinter();
    error TransferRestricted();

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        minters[owner_] = true;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
    }

    function setTransferGate(address gate) external onlyOwner {
        transferGate = gate;
    }

    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (transferGate != address(0) && from != address(0) && to != address(0)) {
            (bool ok, bytes memory ret) =
                transferGate.staticcall(abi.encodeWithSignature("canTransfer(address,address,uint256)", from, to, value));
            if (!ok || (ret.length == 32 && !abi.decode(ret, (bool)))) revert TransferRestricted();
        }
        super._update(from, to, value);
    }
}
