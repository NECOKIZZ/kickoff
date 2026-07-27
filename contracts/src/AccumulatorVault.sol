// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title AccumulatorVault — Season Accumulator Pool (master spec §3.2).
/// @notice Receives 5% of every settled market's losers' pool from registered
///         escrows. At season end the relayer freezes it, posts final rankings
///         (computed off-chain by the same leaderboard formula, §8), and each
///         winner pulls their own share via claim(). Pull payments only, never
///         push. Every deposit and the finalization emit events so the whole
///         season's contribution history is reconstructable from chain data
///         without trusting the off-chain database.
contract AccumulatorVault {
    IERC20 public immutable stakeToken;

    address public owner;
    /// @dev Settlement signer — may finalize the season. Separate key from owner.
    address public relayer;
    /// @dev Escrow contracts allowed to deposit. Registered by owner.
    mapping(address => bool) public isEscrow;

    /// @notice Running season total ever deposited (never decreases).
    uint256 public totalDeposited;
    /// @notice Amount frozen for distribution at finalizeSeason.
    uint256 public finalizedPool;
    bool public finalized;

    mapping(address => uint256) public claimable;
    mapping(address => bool) public hasClaimed;

    event EscrowRegistered(address indexed escrow, bool allowed);
    event RelayerChanged(address indexed relayer);
    event OwnerChanged(address indexed owner);
    event Deposited(address indexed escrow, uint256 indexed marketId, uint256 amount, uint256 totalDeposited);
    event SeasonFinalized(uint256 pool, uint256 winnerCount);
    event Claimed(address indexed winner, uint256 amount);

    error NotOwner();
    error NotRelayer();
    error NotEscrow();
    error AlreadyFinalized();
    error NotFinalized();
    error LengthMismatch();
    error NoWinners();
    error ShareSumInvalid(uint256 sum);
    error NothingToClaim();
    error AlreadyClaimed();
    error ZeroAddress();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _stakeToken, address _relayer) {
        if (_stakeToken == address(0) || _relayer == address(0)) revert ZeroAddress();
        stakeToken = IERC20(_stakeToken);
        owner = msg.sender;
        relayer = _relayer;
    }

    // --- admin ---------------------------------------------------------------

    function setOwner(address _owner) external onlyOwner {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        emit OwnerChanged(_owner);
    }

    function setRelayer(address _relayer) external onlyOwner {
        if (_relayer == address(0)) revert ZeroAddress();
        relayer = _relayer;
        emit RelayerChanged(_relayer);
    }

    function registerEscrow(address escrow, bool allowed) external onlyOwner {
        if (escrow == address(0)) revert ZeroAddress();
        isEscrow[escrow] = allowed;
        emit EscrowRegistered(escrow, allowed);
    }

    // --- deposits ------------------------------------------------------------

    /// @notice Called by a registered escrow inside settle(), same tx as the
    ///         settlement that produced the skim. Escrow has already approved.
    function deposit(uint256 marketId, uint256 amount) external {
        if (!isEscrow[msg.sender]) revert NotEscrow();
        if (finalized) revert AlreadyFinalized();
        if (!stakeToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        totalDeposited += amount;
        emit Deposited(msg.sender, marketId, amount, totalDeposited);
    }

    // --- season end ----------------------------------------------------------

    /// @notice Freeze the vault and set claimable amounts by rank-weight
    ///         (spec §9.1 descending table — shares computed off-chain).
    /// @param winners     Ranked winner addresses, best first.
    /// @param shareBps    Basis-point share per winner; must sum to exactly 10000.
    function finalizeSeason(address[] calldata winners, uint256[] calldata shareBps) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (finalized) revert AlreadyFinalized();
        if (winners.length != shareBps.length) revert LengthMismatch();
        if (winners.length == 0) revert NoWinners();

        uint256 sum;
        for (uint256 i = 0; i < shareBps.length; i++) sum += shareBps[i];
        if (sum != 10_000) revert ShareSumInvalid(sum);

        uint256 pool = stakeToken.balanceOf(address(this));
        finalized = true;
        finalizedPool = pool;

        // Largest-remainder-free: last winner absorbs rounding dust so the sum
        // of claimables is exactly `pool` — no stranded wei.
        uint256 assigned;
        for (uint256 i = 0; i < winners.length; i++) {
            uint256 share = i == winners.length - 1 ? pool - assigned : (pool * shareBps[i]) / 10_000;
            assigned += share;
            // += so a duplicated address in the ranking can't silently drop a share.
            claimable[winners[i]] += share;
        }

        emit SeasonFinalized(pool, winners.length);
    }

    /// @notice Pull payment. Zeroed before transfer — reentrancy-safe by order.
    function claim() external {
        if (!finalized) revert NotFinalized();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        hasClaimed[msg.sender] = true;
        if (!stakeToken.transfer(msg.sender, amount)) revert TransferFailed();

        emit Claimed(msg.sender, amount);
    }
}
