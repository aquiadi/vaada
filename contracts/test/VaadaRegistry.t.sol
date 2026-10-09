// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaadaRegistry} from "../src/VaadaRegistry.sol";

contract VaadaRegistryTest is Test {
    event Recorded(bytes32 indexed dealHash, bytes32 indexed makerId, uint8 kind, bytes32 ref, uint64 at);
    event RecorderChanged(address indexed previousRecorder, address indexed newRecorder);

    VaadaRegistry internal registry;
    address internal owner = makeAddr("owner");
    address internal recorder = makeAddr("recorder");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant DEAL = keccak256("deal");
    bytes32 internal constant MAKER = keccak256("maker");
    bytes32 internal constant REF = keccak256("ref");

    function setUp() public {
        registry = new VaadaRegistry(owner, recorder);
    }

    function test_constructorSetsOwnerAndRecorder() public view {
        assertEq(registry.owner(), owner);
        assertEq(registry.recorder(), recorder);
    }

    function test_constructorRejectsZeroRecorder() public {
        vm.expectRevert(VaadaRegistry.ZeroRecorder.selector);
        new VaadaRegistry(owner, address(0));
    }

    function test_recorderCanRecordEveryKind() public {
        vm.warp(1_791_000_000);
        for (uint8 kind = 0; kind <= uint8(type(VaadaRegistry.Kind).max); kind++) {
            vm.expectEmit(true, true, false, true, address(registry));
            emit Recorded(DEAL, MAKER, kind, REF, 1_791_000_000);
            vm.prank(recorder);
            registry.record(DEAL, MAKER, kind, REF);
        }
    }

    function test_unknownKindReverts() public {
        uint8 tooHigh = uint8(type(VaadaRegistry.Kind).max) + 1;
        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(VaadaRegistry.UnknownKind.selector, tooHigh));
        registry.record(DEAL, MAKER, tooHigh, REF);
    }

    function test_strangerCannotRecord() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VaadaRegistry.NotRecorder.selector, stranger));
        registry.record(DEAL, MAKER, 0, REF);
    }

    function test_ownerIsNotTheRecorder() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaadaRegistry.NotRecorder.selector, owner));
        registry.record(DEAL, MAKER, 0, REF);
    }

    function test_ownerRotatesRecorder() public {
        address next = makeAddr("next");
        vm.expectEmit(true, true, false, false, address(registry));
        emit RecorderChanged(recorder, next);
        vm.prank(owner);
        registry.setRecorder(next);
        assertEq(registry.recorder(), next);

        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(VaadaRegistry.NotRecorder.selector, recorder));
        registry.record(DEAL, MAKER, 0, REF);

        vm.prank(next);
        registry.record(DEAL, MAKER, 0, REF);
    }

    function test_recorderCannotRotateItself() public {
        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, recorder));
        registry.setRecorder(stranger);
    }

    function test_strangerCannotRotate() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.setRecorder(stranger);
    }

    function test_rotationRejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(VaadaRegistry.ZeroRecorder.selector);
        registry.setRecorder(address(0));
    }

    function test_ownershipTransferNeedsAcceptance() public {
        address nextOwner = makeAddr("nextOwner");
        vm.prank(owner);
        registry.transferOwnership(nextOwner);
        assertEq(registry.owner(), owner);
        assertEq(registry.pendingOwner(), nextOwner);

        vm.prank(nextOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nextOwner));
        registry.setRecorder(stranger);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.acceptOwnership();

        vm.prank(nextOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), nextOwner);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        registry.setRecorder(stranger);

        vm.prank(nextOwner);
        registry.setRecorder(stranger);
        assertEq(registry.recorder(), stranger);
    }

    function test_renounceIsRefused() public {
        vm.prank(owner);
        vm.expectRevert(VaadaRegistry.RenounceDisabled.selector);
        registry.renounceOwnership();
        assertEq(registry.owner(), owner);
    }

    function test_recordWritesNoStorage() public {
        vm.record();
        vm.prank(recorder);
        registry.record(DEAL, MAKER, 2, REF);
        (, bytes32[] memory writes) = vm.accesses(address(registry));
        assertEq(writes.length, 0);
    }

    function test_recordGasStaysSmall() public {
        vm.prank(recorder);
        uint256 before = gasleft();
        registry.record(DEAL, MAKER, 2, REF);
        uint256 used = before - gasleft();
        assertLt(used, 12_000);
    }

    function testFuzz_onlyRecorderMayRecord(address caller, uint8 kind) public {
        vm.assume(caller != recorder);
        kind = uint8(bound(kind, 0, uint8(type(VaadaRegistry.Kind).max)));
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(VaadaRegistry.NotRecorder.selector, caller));
        registry.record(DEAL, MAKER, kind, REF);
    }
}
