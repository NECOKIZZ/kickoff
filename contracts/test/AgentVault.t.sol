// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EscrowTestBase} from "./KickoffEscrow.t.sol";
import {KickoffEscrow} from "../src/KickoffEscrow.sol";
import {AgentVault} from "../src/AgentVault.sol";

contract AgentVaultTest is EscrowTestBase {
    AgentVault internal agents;

    address internal operator = makeAddr("operator");
    uint256 internal humanPk = 0xA11CE;
    address internal human;
    address internal agentAddr;

    uint128 internal constant FIXED = 10e6; // $10

    function setUp() public override {
        super.setUp();
        human = vm.addr(humanPk);
        vm.startPrank(owner);
        agents = new AgentVault(address(usdc), address(escrow), operator);
        escrow.setAgentVault(address(agents));
        vm.stopPrank();
        agentAddr = agents.agentOf(human);
    }

    function fixedConfig() internal pure returns (KickoffEscrow.MarketConfig memory c) {
        c = defaultConfig();
        c.stakeMode = KickoffEscrow.StakeMode.Fixed;
        c.fixedStake = FIXED;
    }

    function openFixed() internal returns (uint256 id) {
        vm.startPrank(agent); // market-listing role
        id = escrow.createMarket(fixedConfig());
        escrow.openMarket(id);
        vm.stopPrank();
    }

    function registerAndFund(uint256 amount) internal {
        vm.prank(human);
        agents.registerAgent();
        vm.startPrank(human);
        usdc.faucet(amount);
        usdc.approve(address(agents), amount);
        agents.deposit(agentAddr, amount);
        vm.stopPrank();
    }

    function sign(uint256 pk, address who, uint256 deadline) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, agents.linkDigest(who, deadline));
        return abi.encodePacked(r, s, v);
    }

    // --- identity -----------------------------------------------------------------

    function test_agentAddressIsDeterministicAndDistinct() public {
        assertEq(agents.agentOf(human), agentAddr);
        assertTrue(agentAddr != human);
        assertTrue(agents.agentOf(makeAddr("other")) != agentAddr);
    }

    function test_oneAgentPerHuman() public {
        vm.startPrank(human);
        assertEq(agents.registerAgent(), agentAddr);
        vm.expectRevert(AgentVault.AlreadyRegistered.selector);
        agents.registerAgent();
        vm.stopPrank();
        assertEq(agents.agentOfOwner(human), agentAddr);
    }

    function test_gaslessRegistrationWithSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = sign(humanPk, human, deadline);
        vm.prank(operator);
        assertEq(agents.registerAgentFor(human, deadline, sig), agentAddr);
        (address o,,) = agents.agents(agentAddr);
        assertEq(o, human);

        vm.prank(operator); // replay can't mint a second agent
        vm.expectRevert(AgentVault.AlreadyRegistered.selector);
        agents.registerAgentFor(human, deadline, sig);
    }

    function test_registrationRejectsWrongSignerExpiryAndNonOperator() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory forged = sign(0xB0B, human, deadline);
        vm.prank(operator);
        vm.expectRevert(AgentVault.BadSignature.selector);
        agents.registerAgentFor(human, deadline, forged);

        bytes memory sig = sign(humanPk, human, deadline);
        vm.expectRevert(AgentVault.NotOperator.selector);
        agents.registerAgentFor(human, deadline, sig);

        vm.warp(deadline + 1);
        vm.prank(operator);
        vm.expectRevert(AgentVault.Expired.selector);
        agents.registerAgentFor(human, deadline, sig);
    }

    // --- money ----------------------------------------------------------------------

    function test_depositAndOwnerOnlyWithdraw() public {
        registerAndFund(50e6);
        (,, uint256 bal) = agents.agents(agentAddr);
        assertEq(bal, 50e6);

        vm.prank(operator);
        vm.expectRevert(AgentVault.NotAgentOwner.selector);
        agents.withdraw(agentAddr, 1);

        vm.prank(human);
        vm.expectRevert(AgentVault.InsufficientBalance.selector);
        agents.withdraw(agentAddr, 51e6);

        vm.prank(human);
        agents.withdraw(agentAddr, 20e6);
        assertEq(usdc.balanceOf(human), 20e6);
        (,, bal) = agents.agents(agentAddr);
        assertEq(bal, 30e6);
    }

    function test_depositToUnknownAgentReverts() public {
        vm.expectRevert(AgentVault.UnknownAgent.selector);
        agents.deposit(makeAddr("nobody"), 1);
    }

    // --- staking ----------------------------------------------------------------------

    function test_operatorStakesFixedAmountAsTheAgent() public {
        registerAndFund(25e6);
        uint256 id = openFixed();

        vm.prank(operator);
        agents.stake(agentAddr, id, 2, 1);

        (,, uint256 bal) = agents.agents(agentAddr);
        assertEq(bal, 15e6);
        assertEq(escrow.positionCount(id), 1);
        KickoffEscrow.Position memory p = escrow.getPosition(id, 0);
        assertEq(p.trader, agentAddr);
        assertEq(p.stake, FIXED);
        assertEq(p.guessA, 2);

        // Restake before lock: guess moves, no extra money.
        vm.prank(operator);
        agents.stake(agentAddr, id, 1, 1);
        (,, bal) = agents.agents(agentAddr);
        assertEq(bal, 15e6);
        assertEq(escrow.getPosition(id, 0).guessA, 1);
        assertEq(escrow.getPosition(id, 0).stake, FIXED);
    }

    function test_stakeGuards() public {
        registerAndFund(5e6); // less than one $10 ticket
        uint256 fixedId = openFixed();
        uint256 variableId = createOpenMarket();

        vm.expectRevert(AgentVault.NotOperator.selector);
        agents.stake(agentAddr, fixedId, 1, 0);

        vm.startPrank(operator);
        vm.expectRevert(AgentVault.InsufficientBalance.selector);
        agents.stake(agentAddr, fixedId, 1, 0);
        vm.expectRevert(AgentVault.NotFixedStake.selector);
        agents.stake(agentAddr, variableId, 1, 0);
        vm.expectRevert(AgentVault.UnknownAgent.selector);
        agents.stake(makeAddr("ghost"), fixedId, 1, 0);
        vm.stopPrank();
    }

    function test_pauseAndHaltStopStaking() public {
        registerAndFund(30e6);
        uint256 id = openFixed();

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(AgentVault.NotAgentOwner.selector);
        agents.setPaused(agentAddr, true);

        vm.prank(human);
        agents.setPaused(agentAddr, true);
        vm.prank(operator);
        vm.expectRevert(AgentVault.Paused.selector);
        agents.stake(agentAddr, id, 1, 0);

        vm.prank(human);
        agents.setPaused(agentAddr, false);
        vm.prank(owner);
        agents.setStakingHalted(true);
        vm.prank(operator);
        vm.expectRevert(AgentVault.Paused.selector);
        agents.stake(agentAddr, id, 1, 0);

        // Paused/halted never traps funds.
        vm.prank(human);
        agents.withdraw(agentAddr, 30e6);
        assertEq(usdc.balanceOf(human), 30e6);
    }

    function test_onlyVaultCanStakeOrClaimForOthers() public {
        uint256 id = openFixed();
        vm.expectRevert(KickoffEscrow.NotAgentVault.selector);
        escrow.stakeFor(makeAddr("x"), id, 1, 0, FIXED);
        vm.expectRevert(KickoffEscrow.NotAgentVault.selector);
        escrow.claimFor(id, makeAddr("x"));
    }

    // --- full lifecycle ------------------------------------------------------------------

    function test_agentWinsClaimsIntoBalanceOwnerWithdraws() public {
        registerAndFund(10e6);
        uint256 id = openFixed();

        vm.prank(operator);
        agents.stake(agentAddr, id, 2, 1); // exact
        address h1 = makeAddr("h1");
        address h2 = makeAddr("h2");
        stakeAs(h1, id, 0, 0, FIXED);
        stakeAs(h2, id, 0, 3, FIXED);
        assertEq(escrow.positionCount(id), 3); // agent is one vote, like any trader

        settleMarket(id, 2, 1);
        uint256 owed = escrow.payoutOf(id, agentAddr);
        assertGt(owed, FIXED);

        vm.prank(makeAddr("anyone")); // permissionless: can only credit the agent
        uint256 got = agents.claim(agentAddr, id);
        assertEq(got, owed);
        (,, uint256 bal) = agents.agents(agentAddr);
        assertEq(bal, owed);
        assertEq(escrow.payoutOf(id, agentAddr), 0);

        vm.prank(human);
        agents.withdraw(agentAddr, bal);
        assertEq(usdc.balanceOf(human), owed);
        assertEq(usdc.balanceOf(address(agents)), 0);
    }

    function test_agentRefundOnVoid() public {
        registerAndFund(10e6);
        uint256 id = openFixed();
        vm.prank(operator);
        agents.stake(agentAddr, id, 1, 1);
        settleMarket(id, 3, 0); // single position → FewerThanTwo void
        agents.claim(agentAddr, id);
        (,, uint256 bal) = agents.agents(agentAddr);
        assertEq(bal, 10e6);
    }
}

/// TS ↔ Solidity parity for the agent-link protocol. The constants come from
/// src/lib/agentLink.ts (see test/agentLink.test.ts, same fixed inputs): if
/// either side's address derivation or EIP-712 encoding drifts, this breaks.
contract AgentLinkParityTest is EscrowTestBase {
    address internal constant VAULT_AT = 0x00000000000000000000000000000000000a6E47;

    function test_agentOfAndDigestMatchTypeScript() public {
        vm.chainId(46630);
        deployCodeTo("AgentVault.sol:AgentVault", abi.encode(address(usdc), address(escrow), makeAddr("op")), VAULT_AT);
        AgentVault v = AgentVault(VAULT_AT);
        address human = vm.addr(0xA11CE);
        assertEq(human, 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7);
        assertEq(v.agentOf(human), 0x7fbd46B91D5539a7A5Ee618f0c78E591Fa8Ecc80);
        assertEq(v.linkDigest(human, 2_000_000_000), 0x68fa3f0c0c8407ccbeb4ef6b0316006ff66e4bfa38f2c0e5d03380e6017b065d);
    }
}
