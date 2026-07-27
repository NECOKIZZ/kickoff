// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AccumulatorVault} from "../src/AccumulatorVault.sol";
import {KickoffEscrow} from "../src/KickoffEscrow.sol";

/// Deploys the full testnet stack to Robinhood Chain testnet (46630):
///   MockUSDC → AccumulatorVault → KickoffEscrow → vault.registerEscrow.
///
/// Testnet phase: deployer is owner AND relayer AND agent (one throwaway key
/// drives the admin dashboard + settle route). Role separation is enforced by
/// the contract and split into real distinct keys before mainnet — swap via
/// setRoles / setRelayer then.
///
///   cd contracts && source ../.env && forge script script/Deploy.s.sol \
///     --rpc-url $RH_RPC_URL --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console.log("deployer:", deployer);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        AccumulatorVault vault = new AccumulatorVault(address(usdc), deployer);
        KickoffEscrow escrow = new KickoffEscrow(address(usdc), deployer, deployer, address(vault));
        vault.registerEscrow(address(escrow), true);

        vm.stopBroadcast();

        console.log("MockUSDC:        ", address(usdc));
        console.log("AccumulatorVault:", address(vault));
        console.log("KickoffEscrow:   ", address(escrow));
    }
}
