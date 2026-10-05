// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title LeagueEscrow — ETF League rounds on BSC (tokenized stocks).
/// @notice Holds the fixed ticket stakes and the creators' locked stock
///         baskets for each round, then pays out the keeper's settlement.
///
///         Creators lock ≥ $10 of a basket of allowlisted stock tokens
///         (bStocks / Ondo / xStocks) plus one ticket. The locked quantities
///         ARE the ETF: its score is the buy-and-hold return of exactly what
///         was locked. Backers join a creator's team with a ticket only
///         (buying the basket happens outside the escrow, through the Binance
///         Web3 Wallet trading API, with the creator as fee referrer).
///
///         Settlement is computed off-chain by the open-source engine
///         (packages/engine/src/league.ts) and submitted by the keeper — a
///         disclosed trust assumption. The contract enforces:
///           - conservation: Σ payouts + platform + seasonIn == Σ stakes + seasonOut
///           - the season pot can never go negative
///           - no payout above stake × (1 + capMultiple)
///           - locked baskets always go back to their owner, whatever the result
///           - liveness: if the keeper never settles, anyone can void the round
///             VOID_GRACE after it ends, and everyone gets their stake back.
///         The settlement inputs (prices, baskets, team keys) are committed by
///         hash and published, so anyone can recompute the payouts.
///
///         Team keys (clone-merging) and the $10 basket minimum are checked by
///         the keeper off-chain; an invalid entry is refunded its stake.
contract LeagueEscrow {
    // --- constants -------------------------------------------------------------

    uint256 public constant MAX_BASKET_TOKENS = 10;
    uint256 public constant MIN_BASKET_TOKENS = 3;
    uint256 public constant VOID_GRACE = 3 days;

    // --- types -----------------------------------------------------------------

    enum Status {
        None,
        Open,
        Settled,
        Voided
    }

    struct Round {
        Status status;
        uint64 entryClose; // entries rejected at/after this time
        uint64 end;        // settlement allowed at/after this time
        uint16 capMultiple; // max gain = capMultiple × stake
        uint16 maxBackers;  // per team (captain excluded)
        uint128 stake;      // fixed ticket, stake-token base units
        uint128 totalStakes;
        bytes32 inputsHash; // hash of the published settlement inputs
    }

    struct Entry {
        address wallet;
        bytes32 teamKey;
        bool isCreator; // locked a basket (captain or merged clone)
        bool claimed;
        uint128 payout;
    }

    // --- storage ---------------------------------------------------------------

    IERC20Min public immutable stakeToken;

    address public owner;
    address public keeper;
    bool public paused;

    uint256 public roundCount;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Entry[]) internal _entries;
    mapping(uint256 => mapping(address => uint256)) public entryIndex; // 1-based; 0 = none

    mapping(uint256 => mapping(bytes32 => address)) public captainOf;
    mapping(uint256 => mapping(bytes32 => uint256)) public membersOf; // non-captain entries

    mapping(uint256 => mapping(address => address[])) internal _basketTokens;
    mapping(uint256 => mapping(address => uint256[])) internal _basketAmounts;

    mapping(address => bool) public allowedToken; // stock tokens a basket may hold

    uint256 public seasonPot;
    uint256 public platformBalance;

    bool private _locked;

    // --- events ----------------------------------------------------------------

    event RoundOpened(uint256 indexed roundId, uint64 entryClose, uint64 end, uint128 stake);
    event CreatorEntered(uint256 indexed roundId, address indexed wallet, bytes32 indexed teamKey, bool captain, address[] tokens, uint256[] amounts);
    event BackerEntered(uint256 indexed roundId, address indexed wallet, bytes32 indexed teamKey);
    event RoundSettled(uint256 indexed roundId, bytes32 inputsHash, uint256 platformCut, uint256 seasonIn, uint256 seasonOut);
    event RoundVoided(uint256 indexed roundId);
    event Claimed(uint256 indexed roundId, address indexed wallet, uint256 payout);
    event BasketReturned(uint256 indexed roundId, address indexed wallet, address token, uint256 amount);
    event BasketReturnFailed(uint256 indexed roundId, address indexed wallet, address token, uint256 amount);
    event TokenAllowed(address indexed token, bool allowed);
    event KeeperSet(address keeper);
    event OwnerSet(address owner);
    event PausedSet(bool paused);
    event SeasonFunded(uint256 amount);
    event PlatformWithdrawn(address to, uint256 amount);

    // --- errors ----------------------------------------------------------------

    error NotOwner();
    error NotKeeper();
    error Paused();
    error Reentrancy();
    error BadRound();
    error BadTimes();
    error EntriesClosed();
    error AlreadyEntered();
    error BadBasket();
    error TokenNotAllowed(address token);
    error NoSuchTeam();
    error TeamFull();
    error TooEarly();
    error LengthMismatch();
    error NotConserved();
    error SeasonOverdrawn();
    error PayoutTooLarge(uint256 index);
    error NothingToClaim();
    error TransferFailed();

    // --- modifiers -------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner) revert NotKeeper();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address stakeToken_, address keeper_) {
        stakeToken = IERC20Min(stakeToken_);
        owner = msg.sender;
        keeper = keeper_;
        emit OwnerSet(msg.sender);
        emit KeeperSet(keeper_);
    }

    // --- admin -----------------------------------------------------------------

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
        emit OwnerSet(owner_);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Seed the season pot (used for thin-pot top-ups).
    function fundSeason(uint256 amount) external nonReentrant {
        _pull(stakeToken, msg.sender, amount);
        seasonPot += amount;
        emit SeasonFunded(amount);
    }

    function withdrawPlatform(address to) external onlyOwner nonReentrant {
        uint256 amount = platformBalance;
        platformBalance = 0;
        _push(stakeToken, to, amount);
        emit PlatformWithdrawn(to, amount);
    }

    // --- rounds ----------------------------------------------------------------

    function openRound(uint64 entryClose, uint64 end, uint128 stake, uint16 capMultiple, uint16 maxBackers)
        external
        onlyKeeper
        returns (uint256 roundId)
    {
        if (entryClose <= block.timestamp || end <= entryClose || stake == 0 || capMultiple == 0) revert BadTimes();
        roundId = ++roundCount;
        Round storage r = rounds[roundId];
        r.status = Status.Open;
        r.entryClose = entryClose;
        r.end = end;
        r.stake = stake;
        r.capMultiple = capMultiple;
        r.maxBackers = maxBackers;
        emit RoundOpened(roundId, entryClose, end, stake);
    }

    /// @notice Enter as a creator: lock a basket of stock tokens + one ticket.
    ///         The first creator with a team key becomes its captain; later
    ///         creators with the same key (clones) join that team.
    function enterCreator(uint256 roundId, bytes32 teamKey, address[] calldata tokens, uint256[] calldata amounts)
        external
        nonReentrant
    {
        Round storage r = _openRound(roundId);
        uint256 n = tokens.length;
        if (n != amounts.length) revert LengthMismatch();
        if (n < MIN_BASKET_TOKENS || n > MAX_BASKET_TOKENS || teamKey == bytes32(0)) revert BadBasket();

        bool captain = captainOf[roundId][teamKey] == address(0);
        if (captain) {
            captainOf[roundId][teamKey] = msg.sender;
        } else {
            _addMember(r, roundId, teamKey);
        }
        _addEntry(r, roundId, teamKey, true);

        uint256[] memory received = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address t = tokens[i];
            if (!allowedToken[t] || t == address(stakeToken)) revert TokenNotAllowed(t);
            if (amounts[i] == 0) revert BadBasket();
            for (uint256 j; j < i; ++j) {
                if (tokens[j] == t) revert BadBasket();
            }
            received[i] = _pull(IERC20Min(t), msg.sender, amounts[i]);
        }
        _basketTokens[roundId][msg.sender] = tokens;
        _basketAmounts[roundId][msg.sender] = received;

        emit CreatorEntered(roundId, msg.sender, teamKey, captain, tokens, received);
    }

    /// @notice Back a creator's team with one ticket.
    function enterBacker(uint256 roundId, bytes32 teamKey) external nonReentrant {
        Round storage r = _openRound(roundId);
        if (captainOf[roundId][teamKey] == address(0)) revert NoSuchTeam();
        _addMember(r, roundId, teamKey);
        _addEntry(r, roundId, teamKey, false);
        emit BackerEntered(roundId, msg.sender, teamKey);
    }

    /// @notice Keeper submits the engine's payouts, one per entry in entry order.
    function settle(
        uint256 roundId,
        uint128[] calldata payouts,
        uint256 platformCut,
        uint256 seasonIn,
        uint256 seasonOut,
        bytes32 inputsHash
    ) external onlyKeeper {
        Round storage r = rounds[roundId];
        if (r.status != Status.Open) revert BadRound();
        if (block.timestamp < r.end) revert TooEarly();
        Entry[] storage es = _entries[roundId];
        if (payouts.length != es.length) revert LengthMismatch();

        uint256 maxPayout = uint256(r.stake) * (1 + uint256(r.capMultiple));
        uint256 paid;
        for (uint256 i; i < payouts.length; ++i) {
            if (payouts[i] > maxPayout) revert PayoutTooLarge(i);
            es[i].payout = payouts[i];
            paid += payouts[i];
        }
        if (paid + platformCut + seasonIn != uint256(r.totalStakes) + seasonOut) revert NotConserved();
        if (seasonOut > seasonPot + seasonIn) revert SeasonOverdrawn();

        seasonPot = seasonPot + seasonIn - seasonOut;
        platformBalance += platformCut;
        r.status = Status.Settled;
        r.inputsHash = inputsHash;
        emit RoundSettled(roundId, inputsHash, platformCut, seasonIn, seasonOut);
    }

    /// @notice Void a round: everyone gets their stake and basket back.
    ///         Keeper/owner any time before settlement (bad feed, outage);
    ///         anyone once VOID_GRACE has passed after the end without a settle.
    function voidRound(uint256 roundId) external {
        Round storage r = rounds[roundId];
        if (r.status != Status.Open) revert BadRound();
        bool privileged = msg.sender == keeper || msg.sender == owner;
        if (!privileged && block.timestamp < uint256(r.end) + VOID_GRACE) revert TooEarly();
        r.status = Status.Voided;
        emit RoundVoided(roundId);
    }

    /// @notice Claim the payout (or refund) and any locked basket.
    function claim(uint256 roundId) external nonReentrant {
        Round storage r = rounds[roundId];
        uint256 idx = entryIndex[roundId][msg.sender];
        if (idx == 0) revert NothingToClaim();
        Entry storage e = _entries[roundId][idx - 1];
        if (e.claimed) revert NothingToClaim();

        uint256 amount;
        if (r.status == Status.Settled) amount = e.payout;
        else if (r.status == Status.Voided) amount = r.stake;
        else revert BadRound();

        e.claimed = true;
        if (amount > 0) _push(stakeToken, msg.sender, amount);

        emit Claimed(roundId, msg.sender, amount);
        if (e.isCreator) _returnBasket(roundId, msg.sender);
    }

    /// @notice Retry returning basket tokens whose transfer failed at claim
    ///         (e.g. a stock token was paused). Only after the entry is claimed.
    function claimBasket(uint256 roundId) external nonReentrant {
        uint256 idx = entryIndex[roundId][msg.sender];
        if (idx == 0 || !_entries[roundId][idx - 1].claimed) revert NothingToClaim();
        _returnBasket(roundId, msg.sender);
    }

    // --- views -----------------------------------------------------------------

    function entryCount(uint256 roundId) external view returns (uint256) {
        return _entries[roundId].length;
    }

    function entryAt(uint256 roundId, uint256 i) external view returns (Entry memory) {
        return _entries[roundId][i];
    }

    function basketOf(uint256 roundId, address wallet)
        external
        view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        return (_basketTokens[roundId][wallet], _basketAmounts[roundId][wallet]);
    }

    // --- internals -------------------------------------------------------------

    function _openRound(uint256 roundId) internal view returns (Round storage r) {
        if (paused) revert Paused();
        r = rounds[roundId];
        if (r.status != Status.Open) revert BadRound();
        if (block.timestamp >= r.entryClose) revert EntriesClosed();
    }

    function _addMember(Round storage r, uint256 roundId, bytes32 teamKey) internal {
        uint256 m = membersOf[roundId][teamKey] + 1;
        if (m > r.maxBackers) revert TeamFull();
        membersOf[roundId][teamKey] = m;
    }

    function _addEntry(Round storage r, uint256 roundId, bytes32 teamKey, bool isCreator) internal {
        if (entryIndex[roundId][msg.sender] != 0) revert AlreadyEntered();
        _entries[roundId].push(Entry({wallet: msg.sender, teamKey: teamKey, isCreator: isCreator, claimed: false, payout: 0}));
        entryIndex[roundId][msg.sender] = _entries[roundId].length;
        r.totalStakes += r.stake;
        _pull(stakeToken, msg.sender, r.stake);
    }

    /// @dev Pull with balance-diff accounting (safe for fee-on-transfer tokens)
    ///      and support for tokens that return nothing.
    function _pull(IERC20Min token, address from, uint256 amount) internal returns (uint256 received) {
        uint256 before = token.balanceOf(address(this));
        (bool ok, bytes memory ret) =
            address(token).call(abi.encodeWithSelector(IERC20Min.transferFrom.selector, from, address(this), amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        received = token.balanceOf(address(this)) - before;
        if (token == stakeToken && received != amount) revert TransferFailed();
    }

    /// @dev Return each locked token; a failing token stays owed (retry via
    ///      claimBasket) instead of blocking the stake payout.
    function _returnBasket(uint256 roundId, address wallet) internal {
        address[] storage ts = _basketTokens[roundId][wallet];
        uint256[] storage as_ = _basketAmounts[roundId][wallet];
        for (uint256 i; i < ts.length; ++i) {
            uint256 amt = as_[i];
            if (amt == 0) continue;
            as_[i] = 0;
            (bool ok, bytes memory ret) =
                ts[i].call(abi.encodeWithSelector(IERC20Min.transfer.selector, wallet, amt));
            if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
                emit BasketReturned(roundId, wallet, ts[i], amt);
            } else {
                as_[i] = amt;
                emit BasketReturnFailed(roundId, wallet, ts[i], amt);
            }
        }
    }

    function _push(IERC20Min token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(token).call(abi.encodeWithSelector(IERC20Min.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
