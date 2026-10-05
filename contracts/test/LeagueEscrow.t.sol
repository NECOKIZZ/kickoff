// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LeagueEscrow} from "../src/LeagueEscrow.sol";

/// Minimal 18-decimal token (BSC USDT / stock tokens) with a pause switch.
contract MockToken {
    string public symbol;
    uint8 public constant decimals = 18;
    bool public paused;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory s) {
        symbol = s;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        return _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal returns (bool) {
        require(!paused, "paused");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract LeagueEscrowTest is Test {
    LeagueEscrow internal escrow;
    MockToken internal usdt;
    MockToken internal nvda;
    MockToken internal tsla;
    MockToken internal aapl;
    MockToken internal junk;

    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice"); // creator A
    address internal bob = makeAddr("bob");     // creator B
    address internal carol = makeAddr("carol"); // backer of A
    address internal dave = makeAddr("dave");   // clone of A

    uint128 internal constant STAKE = 5e18;
    uint64 internal constant CLOSE = 1_000;
    uint64 internal constant END = 5_000;
    bytes32 internal constant TEAM_A = keccak256("A");
    bytes32 internal constant TEAM_B = keccak256("B");

    uint256 internal roundId;

    function setUp() public {
        vm.warp(1);
        usdt = new MockToken("USDT");
        nvda = new MockToken("NVDAB");
        tsla = new MockToken("TSLAB");
        aapl = new MockToken("AAPLB");
        junk = new MockToken("JUNK");
        vm.startPrank(owner);
        escrow = new LeagueEscrow(address(usdt), keeper);
        escrow.setTokenAllowed(address(nvda), true);
        escrow.setTokenAllowed(address(tsla), true);
        escrow.setTokenAllowed(address(aapl), true);
        vm.stopPrank();
        vm.prank(keeper);
        roundId = escrow.openRound(CLOSE, END, STAKE, 100, 20);
    }

    // --- helpers ---------------------------------------------------------------

    function _basket() internal view returns (address[] memory t, uint256[] memory a) {
        t = new address[](3);
        a = new uint256[](3);
        (t[0], t[1], t[2]) = (address(nvda), address(tsla), address(aapl));
        (a[0], a[1], a[2]) = (1e18, 2e18, 3e18);
    }

    function _fund(address who) internal {
        usdt.mint(who, STAKE);
        nvda.mint(who, 1e18);
        tsla.mint(who, 2e18);
        aapl.mint(who, 3e18);
        vm.startPrank(who);
        usdt.approve(address(escrow), type(uint256).max);
        nvda.approve(address(escrow), type(uint256).max);
        tsla.approve(address(escrow), type(uint256).max);
        aapl.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    function _enterCreator(address who, bytes32 key) internal {
        _fund(who);
        (address[] memory t, uint256[] memory a) = _basket();
        vm.prank(who);
        escrow.enterCreator(roundId, key, t, a);
    }

    function _enterBacker(address who, bytes32 key) internal {
        usdt.mint(who, STAKE);
        vm.startPrank(who);
        usdt.approve(address(escrow), type(uint256).max);
        escrow.enterBacker(roundId, key);
        vm.stopPrank();
    }

    function _fullRound() internal {
        _enterCreator(alice, TEAM_A); // 0
        _enterCreator(bob, TEAM_B);   // 1
        _enterBacker(carol, TEAM_A);  // 2
        _enterCreator(dave, TEAM_A);  // 3 (clone → member of A)
    }

    // --- entry -----------------------------------------------------------------

    function test_creatorLocksBasketAndStake() public {
        _enterCreator(alice, TEAM_A);
        assertEq(usdt.balanceOf(address(escrow)), STAKE);
        assertEq(nvda.balanceOf(address(escrow)), 1e18);
        assertEq(aapl.balanceOf(address(escrow)), 3e18);
        assertEq(escrow.captainOf(roundId, TEAM_A), alice);
        (address[] memory t, uint256[] memory a) = escrow.basketOf(roundId, alice);
        assertEq(t.length, 3);
        assertEq(a[1], 2e18);
    }

    function test_cloneJoinsExistingTeam() public {
        _fullRound();
        assertEq(escrow.captainOf(roundId, TEAM_A), alice);
        assertEq(escrow.membersOf(roundId, TEAM_A), 2); // carol + dave
        assertTrue(escrow.entryAt(roundId, 3).isCreator);
    }

    function test_rejectsBadBaskets() public {
        _fund(alice);
        (address[] memory t, uint256[] memory a) = _basket();
        t[2] = address(junk);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LeagueEscrow.TokenNotAllowed.selector, address(junk)));
        escrow.enterCreator(roundId, TEAM_A, t, a);

        (t, a) = _basket();
        t[2] = address(nvda); // duplicate
        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.BadBasket.selector);
        escrow.enterCreator(roundId, TEAM_A, t, a);

        address[] memory two = new address[](2);
        uint256[] memory twoA = new uint256[](2);
        (two[0], two[1], twoA[0], twoA[1]) = (address(nvda), address(tsla), 1, 1);
        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.BadBasket.selector);
        escrow.enterCreator(roundId, TEAM_A, two, twoA);
    }

    function test_stakeTokenCannotBeInBasket() public {
        vm.prank(owner);
        escrow.setTokenAllowed(address(usdt), true);
        _fund(alice);
        usdt.mint(alice, 10e18);
        (address[] memory t, uint256[] memory a) = _basket();
        t[2] = address(usdt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LeagueEscrow.TokenNotAllowed.selector, address(usdt)));
        escrow.enterCreator(roundId, TEAM_A, t, a);
    }

    function test_backerNeedsExistingTeam() public {
        usdt.mint(carol, STAKE);
        vm.startPrank(carol);
        usdt.approve(address(escrow), STAKE);
        vm.expectRevert(LeagueEscrow.NoSuchTeam.selector);
        escrow.enterBacker(roundId, TEAM_A);
        vm.stopPrank();
    }

    function test_oneEntryPerWallet() public {
        _enterCreator(alice, TEAM_A);
        usdt.mint(alice, STAKE);
        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.AlreadyEntered.selector);
        escrow.enterBacker(roundId, TEAM_A);
    }

    function test_teamCap() public {
        vm.prank(keeper);
        uint256 r2 = escrow.openRound(CLOSE, END, STAKE, 100, 1);
        roundId = r2;
        _enterCreator(alice, TEAM_A);
        _enterBacker(carol, TEAM_A);
        usdt.mint(bob, STAKE);
        vm.startPrank(bob);
        usdt.approve(address(escrow), STAKE);
        vm.expectRevert(LeagueEscrow.TeamFull.selector);
        escrow.enterBacker(roundId, TEAM_A);
        vm.stopPrank();
    }

    function test_entriesCloseAtEntryClose() public {
        vm.warp(CLOSE);
        _fund(alice);
        (address[] memory t, uint256[] memory a) = _basket();
        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.EntriesClosed.selector);
        escrow.enterCreator(roundId, TEAM_A, t, a);
    }

    // --- settlement --------------------------------------------------------------

    function _payouts(uint128 a, uint128 b, uint128 c, uint128 d) internal pure returns (uint128[] memory p) {
        p = new uint128[](4);
        (p[0], p[1], p[2], p[3]) = (a, b, c, d);
    }

    function test_settleAndClaim() public {
        _fullRound();
        vm.warp(END);
        // Team A wins: B's 5 is the losing pool. Take 0.5: 0.25 platform, 0.25 season.
        // Pot 4.5 split over A's three tickets, creator fee folded in (sums to 15 + 4.5).
        uint128[] memory p = _payouts(6.62e18, 0, 6.35e18, 6.53e18);
        vm.prank(keeper);
        escrow.settle(roundId, p, 0.25e18, 0.25e18, 0, keccak256("inputs"));

        assertEq(escrow.seasonPot(), 0.25e18);
        assertEq(escrow.platformBalance(), 0.25e18);

        vm.prank(alice);
        escrow.claim(roundId);
        assertEq(usdt.balanceOf(alice), 6.62e18);
        assertEq(nvda.balanceOf(alice), 1e18); // basket back

        vm.prank(bob);
        escrow.claim(roundId);
        assertEq(usdt.balanceOf(bob), 0);
        assertEq(aapl.balanceOf(bob), 3e18); // loser still gets the basket back

        vm.prank(carol);
        escrow.claim(roundId);
        assertEq(usdt.balanceOf(carol), 6.35e18);

        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.NothingToClaim.selector);
        escrow.claim(roundId);
    }

    function test_settleRejectsBrokenConservation() public {
        _fullRound();
        vm.warp(END);
        uint128[] memory p = _payouts(7e18, 0, 6.35e18, 6.53e18);
        vm.prank(keeper);
        vm.expectRevert(LeagueEscrow.NotConserved.selector);
        escrow.settle(roundId, p, 0.25e18, 0.25e18, 0, bytes32(0));
    }

    function test_settleRejectsSeasonOverdraw() public {
        _fullRound();
        vm.warp(END);
        uint128[] memory p = _payouts(7e18, 0, 7e18, 7e18);
        vm.prank(keeper);
        vm.expectRevert(LeagueEscrow.SeasonOverdrawn.selector);
        escrow.settle(roundId, p, 0, 0, 1e18, bytes32(0));
    }

    function test_seasonTopUpFromFundedPot() public {
        usdt.mint(owner, 10e18);
        vm.startPrank(owner);
        usdt.approve(address(escrow), 10e18);
        escrow.fundSeason(10e18);
        vm.stopPrank();
        _fullRound();
        vm.warp(END);
        uint128[] memory p = _payouts(7e18, 0, 7e18, 7e18);
        vm.prank(keeper);
        escrow.settle(roundId, p, 0, 0, 1e18, bytes32(0));
        assertEq(escrow.seasonPot(), 9e18);
    }

    function test_settleRejectsOversizedPayout() public {
        vm.prank(keeper);
        roundId = escrow.openRound(CLOSE, END, STAKE, 1, 20); // cap: payout ≤ 2× stake
        _fullRound();
        vm.warp(END);
        uint128[] memory p = _payouts(11e18, 0, 4.5e18, 4.5e18);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(LeagueEscrow.PayoutTooLarge.selector, 0));
        escrow.settle(roundId, p, 0, 0, 0, bytes32(0));
    }

    function test_settleOnlyKeeperAndAfterEnd() public {
        _fullRound();
        uint128[] memory p = _payouts(5e18, 5e18, 5e18, 5e18);
        vm.prank(keeper);
        vm.expectRevert(LeagueEscrow.TooEarly.selector);
        escrow.settle(roundId, p, 0, 0, 0, bytes32(0));
        vm.warp(END);
        vm.prank(alice);
        vm.expectRevert(LeagueEscrow.NotKeeper.selector);
        escrow.settle(roundId, p, 0, 0, 0, bytes32(0));
    }

    // --- void --------------------------------------------------------------------

    function test_voidRefundsEveryone() public {
        _fullRound();
        vm.prank(keeper);
        escrow.voidRound(roundId);
        for (uint256 i; i < 4; ++i) {
            address w = escrow.entryAt(roundId, i).wallet;
            vm.prank(w);
            escrow.claim(roundId);
            assertEq(usdt.balanceOf(w), STAKE);
        }
        assertEq(tsla.balanceOf(dave), 2e18);
        assertEq(usdt.balanceOf(address(escrow)), 0);
    }

    function test_anyoneCanVoidAfterGrace() public {
        _fullRound();
        vm.warp(END + 1 days);
        vm.prank(carol);
        vm.expectRevert(LeagueEscrow.TooEarly.selector);
        escrow.voidRound(roundId);
        vm.warp(uint256(END) + escrow.VOID_GRACE());
        vm.prank(carol);
        escrow.voidRound(roundId);
        vm.prank(carol);
        escrow.claim(roundId);
        assertEq(usdt.balanceOf(carol), STAKE);
    }

    function test_pausedStockTokenDoesNotBlockPayout() public {
        _fullRound();
        vm.prank(keeper);
        escrow.voidRound(roundId);
        tsla.setPaused(true);
        vm.prank(alice);
        escrow.claim(roundId);
        assertEq(usdt.balanceOf(alice), STAKE);
        assertEq(nvda.balanceOf(alice), 1e18);
        assertEq(tsla.balanceOf(alice), 0);
        tsla.setPaused(false);
        vm.prank(alice);
        escrow.claimBasket(roundId);
        assertEq(tsla.balanceOf(alice), 2e18);
        // A second retry moves nothing.
        vm.prank(alice);
        escrow.claimBasket(roundId);
        assertEq(tsla.balanceOf(alice), 2e18);
    }

    function test_platformWithdraw() public {
        _fullRound();
        vm.warp(END);
        uint128[] memory p = _payouts(6.62e18, 0, 6.35e18, 6.53e18);
        vm.prank(keeper);
        escrow.settle(roundId, p, 0.25e18, 0.25e18, 0, bytes32(0));
        vm.prank(owner);
        escrow.withdrawPlatform(owner);
        assertEq(usdt.balanceOf(owner), 0.25e18);
        assertEq(escrow.platformBalance(), 0);
    }

    // --- fuzz: escrow always holds enough to pay every claim ------------------------

    function testFuzz_solventAfterSettle(uint96 seed, uint96 seasonSeed) public {
        uint256 season = uint256(seasonSeed) % 50e18;
        if (season > 0) {
            usdt.mint(owner, season);
            vm.startPrank(owner);
            usdt.approve(address(escrow), season);
            escrow.fundSeason(season);
            vm.stopPrank();
        }
        _fullRound();
        vm.warp(END);
        uint256 total = 4 * uint256(STAKE);
        uint256 seasonOut = uint256(seed) % (season + 1);
        uint256 budget = total + seasonOut;
        uint128[] memory p = new uint128[](4);
        uint256 left = budget;
        for (uint256 i; i < 4; ++i) {
            uint256 x = uint256(keccak256(abi.encode(seed, i))) % (left + 1);
            if (x > uint256(STAKE) * 101) x = uint256(STAKE) * 101;
            p[i] = uint128(x);
            left -= x;
        }
        vm.prank(keeper);
        escrow.settle(roundId, p, left, 0, seasonOut, bytes32(0));
        for (uint256 i; i < 4; ++i) {
            vm.prank(escrow.entryAt(roundId, i).wallet);
            escrow.claim(roundId);
        }
        vm.prank(owner);
        escrow.withdrawPlatform(owner);
        assertEq(usdt.balanceOf(address(escrow)), escrow.seasonPot());
    }
}
