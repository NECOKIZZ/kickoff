// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LeagueEscrow} from "../src/LeagueEscrow.sol";

/// Deploys LeagueEscrow to BSC mainnet (56) and allowlists the basket tokens.
///
///   STAKE_TOKEN    — BSC USDT (0x55d398326f99059fF775485246999027B3197955, 18 decimals)
///   KEEPER         — settlement keeper address (defaults to the deployer)
///   LEAGUE_TOKENS  — comma-separated stock token addresses (bStocks / Ondo / xStocks),
///                    taken from the Binance Web3 RWA token list, never from memory
///
///   cd contracts && source ../.env.local && forge script script/DeployLeague.s.sol \
///     --rpc-url bsc --broadcast
contract DeployLeague is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address keeper = vm.envOr("KEEPER", deployer);
        address[] memory tokens = vm.envOr("LEAGUE_TOKENS", ",", new address[](0));

        vm.startBroadcast(pk);
        LeagueEscrow escrow = new LeagueEscrow(stakeToken, keeper);
        for (uint256 i; i < tokens.length; ++i) {
            escrow.setTokenAllowed(tokens[i], true);
        }
        vm.stopBroadcast();

        console.log("LeagueEscrow:", address(escrow));
        console.log("keeper:", keeper);
        console.log("allowlisted tokens:", tokens.length);
    }
}
