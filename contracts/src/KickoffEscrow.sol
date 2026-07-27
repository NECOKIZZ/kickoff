// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IAccumulatorVault {
    function deposit(uint256 marketId, uint256 amount) external;
}

/// @title KickoffEscrow — multi-market proximity-market escrow + settlement.
/// @notice One contract holds every market, keyed by marketId, each with its
///         own config frozen at open — mirroring the markets-app DB rows.
///
///         The settlement math is a byte-identical port of the off-chain
///         engine (~/kickoff/src/engine/engine.ts). Same fixed-point SCALE
///         (1e6, matching the 6-decimal stake token), same integer division
///         order, same rounding. The golden §7.4 payouts and a differential
///         fuzz vs the TS engine pin this in the test suite.
///
///         Settlement is relayer-submitted (spec §3.3 Option A) — an openly
///         disclosed centralized trust assumption, not presented as trustless.
///         Role separation, non-negotiable (spec safety rails):
///           owner   — config, void, platform withdrawal; never auto-settles
///           agent   — createMarket/openMarket ONLY (daily rate-capped)
///           relayer — settle ONLY; can never move stake directly
contract KickoffEscrow {
    // --- engine constants (mirror engine.ts) ----------------------------------

    uint256 internal constant SCALE = 1_000_000; // 6-decimal fixed point
    uint256 internal constant WATER_FILL_ROUNDS = 10;

    // Market A distance params (DEFAULT_DIST_PARAMS in engine.ts).
    uint256 internal constant P_WRONG = 4 * SCALE; // wrong-outcome penalty 4.0
    uint256 internal constant W_GD = SCALE;        // goal-diff weight 1.0
    uint256 internal constant W_TG = SCALE / 2;    // total-goals weight 0.5
    uint256 internal constant W_CS = SCALE / 4;    // clean-sheet weight 0.25
    uint256 internal constant CAP_GD = 3;
    uint256 internal constant CAP_TG = 4;

    // --- types -----------------------------------------------------------------

    enum MarketKind {
        Scoreline,   // Market A — guess packs (home, away)
        PlayerPoints // Market B — guess is fixed-point points ×1e6
    }

    enum MarketStatus {
        None,     // unused id
        Draft,    // created, knobs still editable, no staking
        Open,     // staking live — config FROZEN
        Settled,  // payouts computed, claims live
        Voided    // refund-all (N<=1, all-equal-D, abandoned fixture, admin)
    }

    enum StakeMode {
        Variable,
        Fixed
    }

    struct MarketConfig {
        MarketKind kind;
        StakeMode stakeMode;
        uint8 gamma;              // accuracy exponent, 1..12 (γ=3 default off-chain)
        uint16 takeRateBps;       // 1000 = 10% of losers' pool
        uint16 accShareBps;       // 5000 = 50% of the take (5% of losers' pool)
        uint16 capMultiple;       // 100 → max gain = 100× stake
        uint16 maxPositions;      // single-tx settle gas guard
        uint64 locksAt;           // staking rejected at/after this timestamp
        uint128 minStake;         // base units (variable mode)
        uint128 maxStake;         // base units (variable mode)
        uint128 fixedStake;       // base units (fixed mode)
    }

    struct Position {
        address trader;
        uint128 stake;
        // Scoreline: guessA=home goals, guessB=away goals (small ints).
        // PlayerPoints: guessA=points fixed-point ×1e6, guessB unused.
        uint32 guessA;
        uint32 guessB;
        bool claimed;
    }

    struct Market {
        MarketStatus status;
        MarketConfig config;
        uint128 totalPool;
        // Outcome (set at settle).
        uint32 actualA;
        uint32 actualB;
        // Settlement summary (mirrors engine.ts SettleResult).
        uint128 losersStakeSum;
        uint128 accContribution;
        uint128 platformCut;
        uint128 medianD;
        bool coalitionMode;
    }

    // --- storage ---------------------------------------------------------------

    IERC20 public immutable stakeToken;
    IAccumulatorVault public immutable vault;

    address public owner;
    address public relayer; // settle only
    address public agent;   // list only

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => Position[]) internal _positions;
    mapping(uint256 => mapping(address => uint256)) internal _positionIndex; // 1-based; 0 = none
    /// @dev Payout per trader per market, set at settle; zeroed on claim.
    mapping(uint256 => mapping(address => uint256)) public payoutOf;

    /// @notice Platform reserve — absorbs rounding dust + undistributed residual.
    uint256 public platformBalance;

    // Agent rate-cap: markets listed per UTC day (spec safety rail — a feed
    // glitch can't spawn hundreds of garbage markets before a human notices).
    uint256 public agentDailyCap = 40;
    mapping(uint256 => uint256) public agentListedOnDay; // day = timestamp / 1 days

    bool private _entered; // reentrancy guard

    // --- events ----------------------------------------------------------------

    event MarketCreated(uint256 indexed marketId, MarketKind kind, uint64 locksAt);
    event MarketOpened(uint256 indexed marketId);
    event Staked(uint256 indexed marketId, address indexed trader, uint256 stake, uint32 guessA, uint32 guessB, bool restake);
    event Settled(uint256 indexed marketId, uint32 actualA, uint32 actualB, uint256 losersStakeSum, uint256 accContribution, uint256 platformCut, bool coalitionMode);
    event MarketVoided(uint256 indexed marketId, string reason);
    event Claimed(uint256 indexed marketId, address indexed trader, uint256 amount);
    event PlatformWithdrawn(address indexed to, uint256 amount);
    event RolesChanged(address owner, address relayer, address agent);

    // --- errors ----------------------------------------------------------------

    error NotOwner();
    error NotRelayer();
    error NotAgentOrOwner();
    error BadStatus();
    error BadConfig();
    error MarketLocked();
    error MarketNotLocked();
    error StakeOutOfRange();
    error MarketFull();
    error AgentDailyCapReached();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address _stakeToken, address _relayer, address _agent, address _vault) {
        if (_stakeToken == address(0) || _relayer == address(0) || _agent == address(0) || _vault == address(0)) {
            revert ZeroAddress();
        }
        stakeToken = IERC20(_stakeToken);
        relayer = _relayer;
        agent = _agent;
        vault = IAccumulatorVault(_vault);
        owner = msg.sender;
    }

    // --- admin -----------------------------------------------------------------

    function setRoles(address _owner, address _relayer, address _agent) external onlyOwner {
        if (_owner == address(0) || _relayer == address(0) || _agent == address(0)) revert ZeroAddress();
        owner = _owner;
        relayer = _relayer;
        agent = _agent;
        emit RolesChanged(_owner, _relayer, _agent);
    }

    function setAgentDailyCap(uint256 cap) external onlyOwner {
        agentDailyCap = cap;
    }

    function withdrawPlatform(address to) external onlyOwner nonReentrant {
        uint256 amount = platformBalance;
        platformBalance = 0;
        if (!stakeToken.transfer(to, amount)) revert TransferFailed();
        emit PlatformWithdrawn(to, amount);
    }

    // --- market lifecycle --------------------------------------------------------

    /// @notice Agent (or owner) lists a market in Draft. Knobs editable until open.
    function createMarket(MarketConfig calldata cfg) external returns (uint256 marketId) {
        if (msg.sender != agent && msg.sender != owner) revert NotAgentOrOwner();
        if (msg.sender == agent) {
            uint256 day = block.timestamp / 1 days;
            if (agentListedOnDay[day] >= agentDailyCap) revert AgentDailyCapReached();
            agentListedOnDay[day] += 1;
        }
        _validateConfig(cfg);

        marketId = ++marketCount;
        Market storage m = markets[marketId];
        m.status = MarketStatus.Draft;
        m.config = cfg;
        emit MarketCreated(marketId, cfg.kind, cfg.locksAt);
    }

    /// @notice Draft-only config replacement (mirrors app: knobs frozen at open).
    function updateDraftConfig(uint256 marketId, MarketConfig calldata cfg) external {
        if (msg.sender != agent && msg.sender != owner) revert NotAgentOrOwner();
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Draft) revert BadStatus();
        _validateConfig(cfg);
        m.config = cfg;
    }

    function openMarket(uint256 marketId) external {
        if (msg.sender != agent && msg.sender != owner) revert NotAgentOrOwner();
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Draft) revert BadStatus();
        if (m.config.locksAt <= block.timestamp) revert MarketLocked();
        m.status = MarketStatus.Open;
        emit MarketOpened(marketId);
    }

    function _validateConfig(MarketConfig calldata cfg) internal pure {
        if (cfg.gamma == 0 || cfg.gamma > 12) revert BadConfig();
        if (cfg.takeRateBps > 10_000 || cfg.accShareBps > 10_000) revert BadConfig();
        if (cfg.capMultiple == 0 || cfg.maxPositions == 0) revert BadConfig();
        if (cfg.stakeMode == StakeMode.Variable) {
            if (cfg.minStake == 0 || cfg.minStake > cfg.maxStake) revert BadConfig();
        } else {
            if (cfg.fixedStake == 0) revert BadConfig();
        }
    }

    // --- staking -----------------------------------------------------------------

    /// @notice Place or update a position. One per address per market; a restake
    ///         before lock adds to the stake and replaces the guess (app parity).
    function stake(uint256 marketId, uint32 guessA, uint32 guessB, uint128 amount) external nonReentrant {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open) revert BadStatus();
        if (block.timestamp >= m.config.locksAt) revert MarketLocked();

        uint256 idx = _positionIndex[marketId][msg.sender];
        Position[] storage ps = _positions[marketId];

        if (m.config.stakeMode == StakeMode.Fixed) {
            // Fixed mode: exactly one fixedStake ticket; restake only moves the guess.
            if (idx == 0) {
                if (amount != m.config.fixedStake) revert StakeOutOfRange();
            } else {
                if (amount != 0) revert StakeOutOfRange();
            }
        }

        if (idx == 0) {
            if (ps.length >= m.config.maxPositions) revert MarketFull();
            if (m.config.stakeMode == StakeMode.Variable) {
                if (amount < m.config.minStake || amount > m.config.maxStake) revert StakeOutOfRange();
            }
            ps.push(Position({trader: msg.sender, stake: amount, guessA: guessA, guessB: guessB, claimed: false}));
            _positionIndex[marketId][msg.sender] = ps.length; // 1-based
        } else {
            Position storage p = ps[idx - 1];
            uint256 newStake = uint256(p.stake) + amount;
            if (m.config.stakeMode == StakeMode.Variable) {
                if (newStake < m.config.minStake || newStake > m.config.maxStake) revert StakeOutOfRange();
            }
            p.stake = uint128(newStake);
            p.guessA = guessA;
            p.guessB = guessB;
        }

        if (amount > 0) {
            m.totalPool += amount;
            if (!stakeToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        }
        emit Staked(marketId, msg.sender, amount, guessA, guessB, idx != 0);
    }

    // --- settlement (engine.ts port) ----------------------------------------------

    /// @notice Relayer-only. Submits the actual outcome; the contract computes
    ///         distances, the unweighted median gate, coalition mode, stake×a
    ///         split, cap water-fill, and the 10% take split — exactly as
    ///         engine.ts. Auto-voids on N<=1 or all-equal-D.
    /// @dev Single-tx settle; maxPositions bounds the O(n²) median selection.
    function settle(uint256 marketId, uint32 actualA, uint32 actualB) external nonReentrant {
        if (msg.sender != relayer) revert NotRelayer();
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open) revert BadStatus();
        if (block.timestamp < m.config.locksAt) revert MarketNotLocked();

        m.actualA = actualA;
        m.actualB = actualB;

        Position[] storage ps = _positions[marketId];
        uint256 n = ps.length;

        // 1. Void checks — refund everyone, no take. (engine.ts step 1)
        if (n <= 1) {
            _void(marketId, n == 0 ? "FewerThanTwo" : "FewerThanTwo");
            return;
        }

        uint256[] memory d = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            d[i] = m.config.kind == MarketKind.Scoreline
                ? _distanceA(ps[i].guessA, ps[i].guessB, actualA, actualB)
                : _absDiff(ps[i].guessA, actualA); // Market B: |guess − actual|
        }

        uint256[] memory sorted = _sortedCopy(d);
        if (sorted[0] == sorted[n - 1]) {
            _void(marketId, "AllEqualD");
            return;
        }

        // 2. Best-coalition exception (unweighted head-count). (engine.ts step 2)
        uint256 minD = sorted[0];
        uint256 countAtMin;
        for (uint256 i = 0; i < n; i++) {
            if (d[i] == minD) countAtMin++;
        }
        bool coalitionMode = countAtMin * 2 >= n;

        // 3. Median gate (unweighted — one trader, one vote). (engine.ts step 3)
        uint256 medianD = sorted[(n + 1) / 2 - 1];

        // 4. Accuracy weights + §7.2 split weights, winners only. (engine.ts step 4)
        bool[] memory isWinner = new bool[](n);
        uint256[] memory weight = new uint256[](n); // stake × a / SCALE
        uint256 losersStakeSum;
        for (uint256 i = 0; i < n; i++) {
            isWinner[i] = coalitionMode ? d[i] == minD : d[i] < medianD;
            if (isWinner[i]) {
                uint256 r = medianD == 0 ? 0 : (d[i] * SCALE) / medianD;
                uint256 a = _accuracyWeight(r, m.config.gamma);
                weight[i] = (uint256(ps[i].stake) * a) / SCALE;
            } else {
                losersStakeSum += ps[i].stake;
            }
        }

        // 5. Pools. (engine.ts step 5)
        uint256 take = (losersStakeSum * m.config.takeRateBps) / 10_000;
        uint256 accContribution = (take * m.config.accShareBps) / 10_000;
        uint256 dividendPool = losersStakeSum - take;

        // 6. Cap + water-fill over weight = stake × a. (engine.ts step 6)
        uint256[] memory gain = new uint256[](n);
        {
            bool[] memory capped = new bool[](n);
            uint256 remaining = dividendPool;
            for (uint256 round = 0; round < WATER_FILL_ROUNDS; round++) {
                uint256 sumW;
                uint256 uncappedCount;
                for (uint256 i = 0; i < n; i++) {
                    if (isWinner[i] && !capped[i]) {
                        sumW += weight[i];
                        uncappedCount++;
                    }
                }
                if (uncappedCount == 0 || sumW == 0) break; // remaining → platform (derived)
                uint256 alpha = (remaining * SCALE) / sumW;
                bool anyCapped = false;
                for (uint256 i = 0; i < n; i++) {
                    if (!isWinner[i] || capped[i]) continue;
                    uint256 naive = (alpha * weight[i]) / SCALE;
                    uint256 cap = uint256(ps[i].stake) * m.config.capMultiple;
                    if (naive > cap) {
                        gain[i] = cap;
                        capped[i] = true;
                        remaining -= cap;
                        anyCapped = true;
                    }
                }
                if (!anyCapped) {
                    for (uint256 i = 0; i < n; i++) {
                        if (isWinner[i] && !capped[i]) gain[i] = (alpha * weight[i]) / SCALE;
                    }
                    break;
                }
            }
        }

        // 7. Payouts + exact conservation: platform cut is DERIVED so
        //    Σ payout + platformCut + accContribution == totalPool. (engine.ts step 7)
        uint256 winnersGainSum;
        for (uint256 i = 0; i < n; i++) {
            if (isWinner[i]) {
                winnersGainSum += gain[i];
                payoutOf[marketId][ps[i].trader] = uint256(ps[i].stake) + gain[i];
            }
        }
        uint256 platformCut = losersStakeSum - winnersGainSum - accContribution;

        m.status = MarketStatus.Settled;
        m.losersStakeSum = uint128(losersStakeSum);
        m.accContribution = uint128(accContribution);
        m.platformCut = uint128(platformCut);
        m.medianD = uint128(medianD);
        m.coalitionMode = coalitionMode;
        platformBalance += platformCut;

        if (accContribution > 0) {
            if (!stakeToken.approve(address(vault), accContribution)) revert TransferFailed();
            vault.deposit(marketId, accContribution);
        }

        emit Settled(marketId, actualA, actualB, losersStakeSum, accContribution, platformCut, coalitionMode);
    }

    /// @notice Owner void — abandoned/postponed fixture. Open markets only.
    function voidMarket(uint256 marketId, string calldata reason) external onlyOwner {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Open && m.status != MarketStatus.Draft) revert BadStatus();
        _void(marketId, reason);
    }

    function _void(uint256 marketId, string memory reason) internal {
        Market storage m = markets[marketId];
        Position[] storage ps = _positions[marketId];
        for (uint256 i = 0; i < ps.length; i++) {
            payoutOf[marketId][ps[i].trader] = ps[i].stake; // refund-all, no take
        }
        m.status = MarketStatus.Voided;
        emit MarketVoided(marketId, reason);
    }

    // --- claims ---------------------------------------------------------------------

    /// @notice Pull payment (spec §3.2 pattern). Zeroed before transfer.
    function claim(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        if (m.status != MarketStatus.Settled && m.status != MarketStatus.Voided) revert BadStatus();
        uint256 amount = payoutOf[marketId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        payoutOf[marketId][msg.sender] = 0;
        if (!stakeToken.transfer(msg.sender, amount)) revert TransferFailed();
        emit Claimed(marketId, msg.sender, amount);
    }

    // --- views ----------------------------------------------------------------------

    function positionCount(uint256 marketId) external view returns (uint256) {
        return _positions[marketId].length;
    }

    function getPosition(uint256 marketId, uint256 index) external view returns (Position memory) {
        return _positions[marketId][index];
    }

    function getConfig(uint256 marketId) external view returns (MarketConfig memory) {
        return markets[marketId].config;
    }

    // --- engine math (byte-identical to engine.ts) -------------------------------------

    /// @dev Market A distance. Mirrors distanceA(): outcome penalty + capped
    ///      goal-diff and total-goals terms + clean-sheet-call term.
    function _distanceA(uint32 gh, uint32 ga, uint32 ah, uint32 aa) internal pure returns (uint256) {
        int256 gdGuess = int256(uint256(gh)) - int256(uint256(ga));
        int256 gdActual = int256(uint256(ah)) - int256(uint256(aa));
        uint256 tgGuess = uint256(gh) + uint256(ga);
        uint256 tgActual = uint256(ah) + uint256(aa);

        bool correct = _sign(gdGuess) == _sign(gdActual);
        uint256 dGd = _min(_absInt(gdGuess - gdActual), CAP_GD);
        uint256 dTg = _min(tgGuess > tgActual ? tgGuess - tgActual : tgActual - tgGuess, CAP_TG);

        // |csGuess − csActual| per side — 1 when the clean-sheet call is wrong.
        uint256 csTerm = ((ga == 0) != (aa == 0) ? 1 : 0) + ((gh == 0) != (ah == 0) ? 1 : 0);

        return (correct ? 0 : P_WRONG) + W_GD * dGd + W_TG * dTg + W_CS * csTerm;
    }

    /// @dev a = (1/(1+r))^gamma in fixed point — same repeated-multiply loop as
    ///      accuracyWeight() in engine.ts (no general pow, identical rounding).
    function _accuracyWeight(uint256 r, uint8 gamma) internal pure returns (uint256) {
        uint256 base = (SCALE * SCALE) / (SCALE + r);
        uint256 result = SCALE;
        for (uint256 i = 0; i < gamma; i++) {
            result = (result * base) / SCALE;
        }
        return result;
    }

    function _sign(int256 x) internal pure returns (int256) {
        return x > 0 ? int256(1) : x < 0 ? int256(-1) : int256(0);
    }

    function _absInt(int256 x) internal pure returns (uint256) {
        return uint256(x < 0 ? -x : x);
    }

    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @dev Insertion sort on a copy — n is bounded by maxPositions.
    function _sortedCopy(uint256[] memory src) internal pure returns (uint256[] memory out) {
        uint256 n = src.length;
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = src[i];
        }
        for (uint256 i = 1; i < n; i++) {
            uint256 key = out[i];
            uint256 j = i;
            while (j > 0 && out[j - 1] > key) {
                out[j] = out[j - 1];
                j--;
            }
            out[j] = key;
        }
    }
}
