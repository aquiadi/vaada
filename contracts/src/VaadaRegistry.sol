// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Public notary for Vaada deeds. It holds no funds, issues no tokens and keeps
/// no per-record storage; every record is an event. Only the recorder wallet writes.
/// The owner is a cold key that exists to rotate the recorder if the hot key leaks.
contract VaadaRegistry is Ownable2Step {
    enum Kind {
        Published,
        Accepted,
        Funded,
        Delivered,
        Released,
        Refunded,
        Disputed,
        Resolved,
        Cancelled
    }

    event Recorded(bytes32 indexed dealHash, bytes32 indexed makerId, uint8 kind, bytes32 ref, uint64 at);
    event RecorderChanged(address indexed previousRecorder, address indexed newRecorder);

    error NotRecorder(address caller);
    error UnknownKind(uint8 kind);
    error ZeroRecorder();
    error RenounceDisabled();

    address public recorder;

    constructor(address initialOwner, address initialRecorder) Ownable(initialOwner) {
        _setRecorder(initialRecorder);
    }

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder(msg.sender);
        _;
    }

    function record(bytes32 dealHash, bytes32 makerId, uint8 kind, bytes32 ref) external onlyRecorder {
        if (kind > uint8(type(Kind).max)) revert UnknownKind(kind);
        emit Recorded(dealHash, makerId, kind, ref, uint64(block.timestamp));
    }

    function setRecorder(address newRecorder) external onlyOwner {
        _setRecorder(newRecorder);
    }

    /// @dev Without an owner the recorder could never be rotated again, so renouncing is refused.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    function _setRecorder(address newRecorder) private {
        if (newRecorder == address(0)) revert ZeroRecorder();
        emit RecorderChanged(recorder, newRecorder);
        recorder = newRecorder;
    }
}
