// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AccumulatorVault} from "../src/AccumulatorVault.sol";
import {KickoffEscrow} from "../src/KickoffEscrow.sol";
import {AgentVault} from "../src/AgentVault.sol";

/// Deploys the testnet stack to Robinhood Chain testnet (46630):
///   MockUSDC → AccumulatorVault → KickoffEscrow → AgentVault, then wires
///   vault.registerEscrow + escrow.setAgentVault.
///
/// Reuse (v2 upgrade): set MOCKUSDC_ADDRESS / ACCUMULATOR_VAULT_ADDRESS to keep
/// the existing tUSDC (testers' balances survive) and season pool; only the
/// escrow + AgentVault are new. The deployer must own the reused vault.
///
/// Testnet phase: deployer is owner AND relayer AND lister AND agent
/// operator (one throwaway key). Split via setRoles / setOperator before
/// mainnet. AGENT_OPERATOR overrides the operator.
///
///   cd contracts && source ../.env.local && forge script script/Deploy.s.sol \
///     --rpc-url $RH_RPC_URL --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address usdcAddr = vm.envOr("MOCKUSDC_ADDRESS", address(0));
        address accAddr = vm.envOr("ACCUMULATOR_VAULT_ADDRESS", address(0));
        address operator = vm.envOr("AGENT_OPERATOR", deployer);
        console.log("deployer:", deployer);

        vm.startBroadcast(pk);

        MockUSDC usdc = usdcAddr == address(0) ? new MockUSDC() : MockUSDC(usdcAddr);
        AccumulatorVault vault =
            accAddr == address(0) ? new AccumulatorVault(address(usdc), deployer) : AccumulatorVault(accAddr);
        KickoffEscrow escrow = new KickoffEscrow(address(usdc), deployer, deployer, address(vault));
        vault.registerEscrow(address(escrow), true);
        AgentVault agents = new AgentVault(address(usdc), address(escrow), operator);
        escrow.setAgentVault(address(agents));

        vm.stopBroadcast();

        console.log("MockUSDC:        ", address(usdc));
        console.log("AccumulatorVault:", address(vault));
        console.log("KickoffEscrow:   ", address(escrow));
        console.log("AgentVault:      ", address(agents));
    }
}
