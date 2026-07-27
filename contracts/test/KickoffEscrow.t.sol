// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AccumulatorVault} from "../src/AccumulatorVault.sol";
import {KickoffEscrow} from "../src/KickoffEscrow.sol";

/// Shared deploy + helpers for escrow tests.
abstract contract EscrowTestBase is Test {
    MockUSDC internal usdc;
    AccumulatorVault internal vault;
    KickoffEscrow internal escrow;

    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    address internal agent = makeAddr("agent");

    uint64 internal constant LOCKS_AT = 1_000_000; // arbitrary fixed timestamp

    function setUp() public virtual {
        vm.warp(1); // deterministic clock, well before LOCKS_AT
        usdc = new MockUSDC();
        vm.startPrank(owner);
        vault = new AccumulatorVault(address(usdc), relayer);
        escrow = new KickoffEscrow(address(usdc), relayer, agent, address(vault));
        vault.registerEscrow(address(escrow), true);
        vm.stopPrank();
    }

    function defaultConfig() internal pure returns (KickoffEscrow.MarketConfig memory) {
        return KickoffEscrow.MarketConfig({
            kind: KickoffEscrow.MarketKind.Scoreline,
            stakeMode: KickoffEscrow.StakeMode.Variable,
            gamma: 3,
            takeRateBps: 1000,
            accShareBps: 5000,
            capMultiple: 100,
            maxPositions: 300,
            locksAt: LOCKS_AT,
            minStake: 1e6,      // $1
            maxStake: 500e6,    // $500
            fixedStake: 0
        });
    }

    function createOpenMarket() internal returns (uint256 id) {
        vm.startPrank(agent);
        id = escrow.createMarket(defaultConfig());
        escrow.openMarket(id);
        vm.stopPrank();
    }

    function stakeAs(address trader, uint256 marketId, uint32 gh, uint32 ga, uint128 amount) internal {
        vm.startPrank(trader);
        usdc.faucet(amount);
        usdc.approve(address(escrow), amount);
        escrow.stake(marketId, gh, ga, amount);
        vm.stopPrank();
    }

    function settleMarket(uint256 marketId, uint32 ah, uint32 aa) internal {
        vm.warp(LOCKS_AT);
        vm.prank(relayer);
        escrow.settle(marketId, ah, aa);
    }
}

/// §7.4 worked example — the spec's 5-staker fixture (actual 2-1), γ=3,
/// stake×a split. Golden integers pinned from the TS engine run of 2026-07-21:
/// if these move, the math moved.
contract GoldenSection74Test is EscrowTestBase {
    uint256 internal constant GOLDEN_A = 138_008_050; // $138.008050 (2.76×)
    uint256 internal constant GOLDEN_C = 50_991_923;  // $50.991923 (1.27×)

    address internal A = makeAddr("A");
    address internal C = makeAddr("C");
    address internal B = makeAddr("B");
    address internal D = makeAddr("D");
    address internal E = makeAddr("E");

    uint256 internal marketId;

    function setUp() public override {
        super.setUp();
        marketId = createOpenMarket();
        // Same order as the TS golden test: A, C, B, D, E.
        stakeAs(A, marketId, 2, 1, 50e6);
        stakeAs(C, marketId, 3, 1, 40e6);
        stakeAs(B, marketId, 2, 0, 30e6);
        stakeAs(D, marketId, 1, 1, 20e6);
        stakeAs(E, marketId, 1, 2, 60e6);
        settleMarket(marketId, 2, 1);
    }

    function test_medianAndWinners() public view {
        (, , , , uint128 losersStakeSum, , , uint128 medianD, bool coalitionMode) =
            _marketSummary();
        assertEq(medianD, 1_750_000, "median D = 1.75");
        assertFalse(coalitionMode);
        assertEq(losersStakeSum, 110e6, "losers pool $110");
    }

    function test_goldenPayouts() public view {
        assertEq(escrow.payoutOf(marketId, A), GOLDEN_A, "A golden payout");
        assertEq(escrow.payoutOf(marketId, C), GOLDEN_C, "C golden payout");
        assertEq(escrow.payoutOf(marketId, B), 0, "B loses");
        assertEq(escrow.payoutOf(marketId, D), 0, "D loses");
        assertEq(escrow.payoutOf(marketId, E), 0, "E loses");
    }

    function test_accumulatorForwarded() public view {
        assertEq(usdc.balanceOf(address(vault)), 5_500_000, "$5.50 to vault");
        assertEq(vault.totalDeposited(), 5_500_000);
    }

    function test_conservesExactly() public view {
        uint256 paid = escrow.payoutOf(marketId, A) + escrow.payoutOf(marketId, C);
        (, , , , , uint128 acc, uint128 platformCut, , ) = _marketSummary();
        assertEq(paid + platformCut + acc, 200e6, "conserves to $200");
        // And the escrow actually holds what claimants + platform are owed.
        assertEq(usdc.balanceOf(address(escrow)), paid + platformCut);
    }

    function test_claims() public {
        vm.prank(A);
        escrow.claim(marketId);
        assertEq(usdc.balanceOf(A), GOLDEN_A);
        vm.prank(A);
        vm.expectRevert(KickoffEscrow.NothingToClaim.selector);
        escrow.claim(marketId); // no double-claim
        vm.prank(B);
        vm.expectRevert(KickoffEscrow.NothingToClaim.selector);
        escrow.claim(marketId); // losers have nothing
    }

    function _marketSummary()
        internal
        view
        returns (
            KickoffEscrow.MarketStatus status,
            uint128 totalPool,
            uint32 actualA,
            uint32 actualB,
            uint128 losersStakeSum,
            uint128 accContribution,
            uint128 platformCut,
            uint128 medianD,
            bool coalitionMode
        )
    {
        KickoffEscrow.MarketConfig memory cfg;
        (status, cfg, totalPool, actualA, actualB, losersStakeSum, accContribution, platformCut, medianD, coalitionMode) =
            escrow.markets(marketId);
        cfg; // silence unused
    }
}

/// Engine edge cases: void paths, coalition mode, equal-D ⇒ equal-ROI, caps.
contract EngineBehaviorTest is EscrowTestBase {
    function test_void_singlePosition() public {
        uint256 id = createOpenMarket();
        address solo = makeAddr("solo");
        stakeAs(solo, id, 1, 0, 10e6);
        settleMarket(id, 2, 1);
        assertEq(escrow.payoutOf(id, solo), 10e6, "refund, no take");
    }

    function test_void_allEqualD() public {
        uint256 id = createOpenMarket();
        address t1 = makeAddr("t1");
        address t2 = makeAddr("t2");
        stakeAs(t1, id, 2, 1, 10e6);
        stakeAs(t2, id, 2, 1, 90e6);
        settleMarket(id, 2, 1);
        assertEq(escrow.payoutOf(id, t1), 10e6);
        assertEq(escrow.payoutOf(id, t2), 90e6);
        assertEq(usdc.balanceOf(address(vault)), 0, "no take on void");
    }

    function test_adminVoid_refundsAll() public {
        uint256 id = createOpenMarket();
        address t1 = makeAddr("t1");
        stakeAs(t1, id, 2, 1, 25e6);
        vm.prank(owner);
        escrow.voidMarket(id, "fixture abandoned");
        vm.prank(t1);
        escrow.claim(id);
        assertEq(usdc.balanceOf(t1), 25e6);
    }

    /// Half-or-more at min D → coalition wins even though d == medianD.
    function test_coalitionMode() public {
        uint256 id = createOpenMarket();
        address w1 = makeAddr("w1");
        address w2 = makeAddr("w2");
        address l1 = makeAddr("l1");
        stakeAs(w1, id, 2, 1, 10e6); // d = 0 (actual 2-1)
        stakeAs(w2, id, 2, 1, 10e6); // d = 0
        stakeAs(l1, id, 0, 3, 10e6); // far off
        settleMarket(id, 2, 1);
        // countAtMin=2, n=3 → coalition. Both exact guesses win.
        assertGt(escrow.payoutOf(id, w1), 10e6);
        assertGt(escrow.payoutOf(id, w2), 10e6);
        assertEq(escrow.payoutOf(id, l1), 0);
    }

    /// §7.2 property: two winners with identical D and identical stake get
    /// identical payout — and with different stakes, identical ROI (exact,
    /// because weight scales linearly in stake before the shared alpha).
    function test_equalD_equalROI() public {
        uint256 id = createOpenMarket();
        address w1 = makeAddr("w1");
        address w2 = makeAddr("w2");
        address l1 = makeAddr("l1");
        address l2 = makeAddr("l2");
        stakeAs(w1, id, 2, 1, 10e6);  // d=0
        stakeAs(w2, id, 2, 1, 40e6);  // d=0, 4× the stake
        stakeAs(l1, id, 0, 0, 25e6);
        stakeAs(l2, id, 5, 0, 25e6);
        settleMarket(id, 2, 1);
        uint256 gain1 = escrow.payoutOf(id, w1) - 10e6;
        uint256 gain2 = escrow.payoutOf(id, w2) - 40e6;
        // ROI parity: gain2 = 4 × gain1, within 4 units of integer-division dust.
        assertApproxEqAbs(gain2, gain1 * 4, 4, "equal accuracy => equal ROI");
    }

    /// One tiny winner among huge losers hits the 100× cap; residual goes to
    /// platform (derived cut), conservation still exact.
    function test_capWaterFill() public {
        uint256 id = createOpenMarket();
        address tiny = makeAddr("tiny");
        address big1 = makeAddr("big1");
        address big2 = makeAddr("big2");
        stakeAs(tiny, id, 2, 1, 1e6);   // exact guess, $1
        stakeAs(big1, id, 0, 3, 500e6);
        stakeAs(big2, id, 4, 0, 500e6);
        settleMarket(id, 2, 1);
        // Cap: gain ≤ 100 × $1 = $100 → payout ≤ $101.
        assertEq(escrow.payoutOf(id, tiny), 101e6, "capped at 100x gain");
        (,,,,, uint128 acc, uint128 platformCut,,) = _summary(id);
        assertEq(uint256(escrow.payoutOf(id, tiny)) + platformCut + acc, 1001e6, "conserves");
    }

    function test_restake_updatesGuessAndStake() public {
        uint256 id = createOpenMarket();
        address t = makeAddr("t");
        stakeAs(t, id, 1, 0, 10e6);
        stakeAs(t, id, 2, 1, 5e6); // restake: +$5, guess now 2-1
        assertEq(escrow.positionCount(id), 1, "still one position");
        KickoffEscrow.Position memory p = escrow.getPosition(id, 0);
        assertEq(p.stake, 15e6);
        assertEq(p.guessA, 2);
        assertEq(p.guessB, 1);
    }

    function test_stakeRejectedAfterLock() public {
        uint256 id = createOpenMarket();
        vm.warp(LOCKS_AT);
        address t = makeAddr("t");
        vm.startPrank(t);
        usdc.faucet(10e6);
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(KickoffEscrow.MarketLocked.selector);
        escrow.stake(id, 2, 1, 10e6);
        vm.stopPrank();
    }

    function test_fixedStakeMode() public {
        KickoffEscrow.MarketConfig memory cfg = defaultConfig();
        cfg.stakeMode = KickoffEscrow.StakeMode.Fixed;
        cfg.fixedStake = 20e6;
        vm.startPrank(agent);
        uint256 id = escrow.createMarket(cfg);
        escrow.openMarket(id);
        vm.stopPrank();

        address t = makeAddr("t");
        vm.startPrank(t);
        usdc.faucet(40e6);
        usdc.approve(address(escrow), 40e6);
        vm.expectRevert(KickoffEscrow.StakeOutOfRange.selector);
        escrow.stake(id, 2, 1, 10e6); // wrong amount
        escrow.stake(id, 2, 1, 20e6); // exact ticket
        vm.expectRevert(KickoffEscrow.StakeOutOfRange.selector);
        escrow.stake(id, 3, 1, 20e6); // no second ticket
        escrow.stake(id, 3, 1, 0);    // guess-only restake is fine
        vm.stopPrank();
        assertEq(escrow.getPosition(id, 0).guessA, 3);
    }

    function _summary(uint256 id)
        internal
        view
        returns (
            KickoffEscrow.MarketStatus status,
            uint128 totalPool,
            uint128 losersStakeSum,
            uint32 actualA,
            uint32 actualB,
            uint128 acc,
            uint128 platformCut,
            uint128 medianD,
            bool coalitionMode
        )
    {
        KickoffEscrow.MarketConfig memory cfg;
        (status, cfg, totalPool, actualA, actualB, losersStakeSum, acc, platformCut, medianD, coalitionMode) =
            escrow.markets(id);
        cfg;
    }
}

/// Access control — the spec's role-separation rails.
contract AccessControlTest is EscrowTestBase {
    function test_onlyRelayerSettles() public {
        uint256 id = createOpenMarket();
        vm.warp(LOCKS_AT);
        vm.prank(agent);
        vm.expectRevert(KickoffEscrow.NotRelayer.selector);
        escrow.settle(id, 2, 1);
        vm.prank(owner);
        vm.expectRevert(KickoffEscrow.NotRelayer.selector);
        escrow.settle(id, 2, 1);
    }

    function test_onlyAgentOrOwnerLists() public {
        vm.prank(relayer);
        vm.expectRevert(KickoffEscrow.NotAgentOrOwner.selector);
        escrow.createMarket(defaultConfig());
    }

    function test_settleBeforeLockReverts() public {
        uint256 id = createOpenMarket();
        vm.prank(relayer);
        vm.expectRevert(KickoffEscrow.MarketNotLocked.selector);
        escrow.settle(id, 2, 1);
    }

    function test_agentDailyCap() public {
        vm.prank(owner);
        escrow.setAgentDailyCap(2);
        vm.startPrank(agent);
        escrow.createMarket(defaultConfig());
        escrow.createMarket(defaultConfig());
        vm.expectRevert(KickoffEscrow.AgentDailyCapReached.selector);
        escrow.createMarket(defaultConfig());
        vm.stopPrank();
        // Owner is not rate-capped; next UTC day resets the agent.
        vm.prank(owner);
        escrow.createMarket(defaultConfig());
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        escrow.createMarket(defaultConfig());
    }

    function test_configFrozenAfterOpen() public {
        uint256 id = createOpenMarket();
        KickoffEscrow.MarketConfig memory cfg = defaultConfig();
        cfg.gamma = 6;
        vm.prank(agent);
        vm.expectRevert(KickoffEscrow.BadStatus.selector);
        escrow.updateDraftConfig(id, cfg);
    }

    function test_platformWithdraw() public {
        uint256 id = createOpenMarket();
        stakeAs(makeAddr("w"), id, 2, 1, 10e6);
        stakeAs(makeAddr("l"), id, 0, 3, 100e6);
        settleMarket(id, 2, 1);
        address treasury = makeAddr("treasury");
        uint256 cut = escrow.platformBalance();
        assertGt(cut, 0);
        vm.prank(relayer);
        vm.expectRevert(KickoffEscrow.NotOwner.selector);
        escrow.withdrawPlatform(treasury);
        vm.prank(owner);
        escrow.withdrawPlatform(treasury);
        assertEq(usdc.balanceOf(treasury), cut);
    }
}

/// Fuzz: conservation invariant — Σ payouts + platformCut + acc == totalPool,
/// and the escrow's token balance covers every outstanding claim, always.
contract ConservationFuzzTest is EscrowTestBase {
    function testFuzz_conservation(uint256 seed) public {
        uint256 n = 2 + (seed % 9); // 2..10 positions
        uint256 id = createOpenMarket();

        address[] memory traders = new address[](n);
        uint256 totalPool;
        for (uint256 i = 0; i < n; i++) {
            uint256 s = uint256(keccak256(abi.encode(seed, i)));
            traders[i] = address(uint160(uint256(keccak256(abi.encode("trader", seed, i)))));
            uint128 amount = uint128(1e6 + (s % 499e6)); // $1..$500
            uint32 gh = uint32(s % 6);
            uint32 ga = uint32((s >> 8) % 6);
            stakeAs(traders[i], id, gh, ga, amount);
            totalPool += amount;
        }

        uint256 seed2 = uint256(keccak256(abi.encode(seed, "actual")));
        settleMarket(id, uint32(seed2 % 6), uint32((seed2 >> 8) % 6));

        uint256 paid;
        for (uint256 i = 0; i < n; i++) {
            paid += escrow.payoutOf(id, traders[i]);
        }
        (, , , , , uint128 acc, uint128 platformCut, , ) = _summary(id);
        assertEq(paid + platformCut + acc, totalPool, "conservation");
        assertEq(usdc.balanceOf(address(escrow)), paid + platformCut, "escrow solvent");
        assertEq(usdc.balanceOf(address(vault)), acc, "vault got the skim");
    }

    function _summary(uint256 id)
        internal
        view
        returns (
            KickoffEscrow.MarketStatus status,
            uint128 totalPool,
            uint32 actualA,
            uint32 actualB,
            uint128 losersStakeSum,
            uint128 acc,
            uint128 platformCut,
            uint128 medianD,
            bool coalitionMode
        )
    {
        KickoffEscrow.MarketConfig memory cfg;
        (status, cfg, totalPool, actualA, actualB, losersStakeSum, acc, platformCut, medianD, coalitionMode) =
            escrow.markets(id);
        cfg;
    }
}
