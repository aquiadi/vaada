// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VaadaRegistry} from "../src/VaadaRegistry.sol";

/// @notice Deploys VaadaRegistry to whichever chain --rpc-url points at (Anvil, Amoy or
/// Polygon PoS) and writes the address to deployments/<chainid>.json.
/// Env: REGISTRY_OWNER (cold key address), REGISTRY_RECORDER (hot key address).
contract Deploy is Script {
    function run() external returns (VaadaRegistry registry) {
        address owner = vm.envAddress("REGISTRY_OWNER");
        address recorder = vm.envAddress("REGISTRY_RECORDER");

        vm.startBroadcast();
        registry = new VaadaRegistry(owner, recorder);
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "blockNumber", block.number);
        vm.serializeAddress(key, "owner", owner);
        vm.serializeAddress(key, "recorder", recorder);
        string memory json = vm.serializeAddress(key, "registry", address(registry));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));

        console2.log("VaadaRegistry", address(registry));
    }
}
