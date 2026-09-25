// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IKickoffEscrow {
    struct MarketConfig {
        uint8 kind;
        uint8 stakeMode;
        uint8 gamma;
        uint16 takeRateBps;
        uint16 accShareBps;
        uint16 capMultiple;
        uint16 maxPositions;
        uint64 locksAt;
        uint128 minStake;
        uint128 maxStake;
        uint128 fixedStake;
    }

    function getConfig(uint256 marketId) external view returns (MarketConfig memory);
    function stakeFor(address trader, uint256 marketId, uint32 guessA, uint32 guessB, uint128 amount) external;
    function claimFor(uint256 marketId, address trader) external returns (uint256);
}

/// @title AgentVault — ring-fenced balances for user prediction agents.
/// @notice Every agent is a KEYLESS address derived from its human owner
///         (agentOf). Nobody holds its private key, so it can only act through
///         this vault:
///           - the human deposits tUSDC into the agent's balance and is the
///             only one who can withdraw it (always to themselves);
///           - the operator (Kickoff's server key) places the agent's
///             predictions, but the money can ONLY go into the escrow, at the
///             market's fixed stake — never to any other address;
///           - payouts claim straight back into the agent's balance.
///         One agent per human, enforced here (the address is a pure function
///         of the owner) and in the app DB. Worst case for a human is losing
///         what they deposited; their main wallet is never touched.
contract AgentVault {
    // Mirrors KickoffEscrow.StakeMode.Fixed.
    uint8 internal constant STAKE_MODE_FIXED = 1;

    // EIP-712: the human's gasless authorization of their agent.
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant LINK_TYPEHASH = keccak256("LinkAgent(address owner,address agent,uint256 deadline)");
    bytes32 internal constant NAME_HASH = keccak256("Kickoff AgentVault");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    IERC20 public immutable stakeToken;
    IKickoffEscrow public immutable escrow;

    address public owner;    // platform admin: roles + kill switch
    address public operator; // Kickoff server key: register + stake only

    struct Agent {
        address owner;   // the human
        bool paused;     // human's pause/disconnect
        uint256 balance; // tUSDC base units available to stake
    }

    mapping(address => Agent) public agents; // agent address → state
    mapping(address => address) public agentOfOwner; // human → agent (0 = none)
    /// @notice Platform-wide kill switch for all agent staking.
    bool public stakingHalted;

    bool private _entered;

    event OwnerChanged(address indexed owner);
    event OperatorChanged(address indexed operator);
    event StakingHalted(bool halted);
    event AgentRegistered(address indexed owner, address indexed agent);
    event AgentPaused(address indexed agent, bool paused);
    event Deposited(address indexed agent, address indexed from, uint256 amount, uint256 balance);
    event Withdrawn(address indexed agent, address indexed to, uint256 amount, uint256 balance);
    event AgentStaked(address indexed agent, uint256 indexed marketId, uint32 guessA, uint32 guessB, uint256 amount);
    event AgentClaimed(address indexed agent, uint256 indexed marketId, uint256 amount, uint256 balance);

    error NotOwner();
    error NotOperator();
    error NotAgentOwner();
    error ZeroAddress();
    error AlreadyRegistered();
    error UnknownAgent();
    error BadSignature();
    error Expired();
    error Paused();
    error NotFixedStake();
    error InsufficientBalance();
    error TransferFailed();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address _stakeToken, address _escrow, address _operator) {
        if (_stakeToken == address(0) || _escrow == address(0) || _operator == address(0)) revert ZeroAddress();
        stakeToken = IERC20(_stakeToken);
        escrow = IKickoffEscrow(_escrow);
        operator = _operator;
        owner = msg.sender;
    }

    // --- admin ------------------------------------------------------------------

    function setOwner(address _owner) external onlyOwner {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        emit OwnerChanged(_owner);
    }

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        operator = _operator;
        emit OperatorChanged(_operator);
    }

    function setStakingHalted(bool halted) external onlyOwner {
        stakingHalted = halted;
        emit StakingHalted(halted);
    }

    // --- identity -------------------------------------------------------------------

    /// @notice The agent address for a human. Keyless: a hash, not a keypair.
    function agentOf(address human) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked("kickoff.agent", address(this), human)))));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice Digest the human signs (EIP-712 typed data) to link their agent.
    function linkDigest(address human, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(LINK_TYPEHASH, human, agentOf(human), deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Human registers their own agent (pays their own gas).
    function registerAgent() external returns (address) {
        return _register(msg.sender);
    }

    /// @notice Operator registers on the human's behalf with their EIP-712
    ///         signature — gasless for the human.
    function registerAgentFor(address human, uint256 deadline, bytes calldata signature)
        external
        onlyOperator
        returns (address)
    {
        if (block.timestamp > deadline) revert Expired();
        if (_recover(linkDigest(human, deadline), signature) != human) revert BadSignature();
        return _register(human);
    }

    function _register(address human) internal returns (address agent) {
        if (human == address(0)) revert ZeroAddress();
        if (agentOfOwner[human] != address(0)) revert AlreadyRegistered();
        agent = agentOf(human);
        agentOfOwner[human] = agent;
        agents[agent].owner = human;
        emit AgentRegistered(human, agent);
    }

    /// @notice Human pauses/unpauses their agent. Paused = no new stakes;
    ///         claims and withdrawals still work.
    function setPaused(address agent, bool paused) external {
        if (agents[agent].owner != msg.sender) revert NotAgentOwner();
        agents[agent].paused = paused;
        emit AgentPaused(agent, paused);
    }

    // --- money in / out ---------------------------------------------------------------

    /// @notice Fund an agent. Anyone may top up; only the owner can withdraw.
    function deposit(address agent, uint256 amount) external nonReentrant {
        Agent storage a = agents[agent];
        if (a.owner == address(0)) revert UnknownAgent();
        a.balance += amount;
        if (!stakeToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(agent, msg.sender, amount, a.balance);
    }

    /// @notice Owner pulls funds back to their own wallet (never elsewhere).
    function withdraw(address agent, uint256 amount) external nonReentrant {
        Agent storage a = agents[agent];
        if (a.owner != msg.sender) revert NotAgentOwner();
        if (amount > a.balance) revert InsufficientBalance();
        a.balance -= amount;
        if (!stakeToken.transfer(msg.sender, amount)) revert TransferFailed();
        emit Withdrawn(agent, msg.sender, amount, a.balance);
    }

    // --- predictions ----------------------------------------------------------------------

    /// @notice Operator places (or re-guesses, pre-lock) an agent's prediction.
    ///         The amount is NOT a parameter: first stake is the market's
    ///         fixedStake, a restake moves only the guess (escrow parity).
    ///         Fixed-stake markets only.
    function stake(address agent, uint256 marketId, uint32 guessA, uint32 guessB)
        external
        onlyOperator
        nonReentrant
    {
        if (stakingHalted) revert Paused();
        Agent storage a = agents[agent];
        if (a.owner == address(0)) revert UnknownAgent();
        if (a.paused) revert Paused();

        IKickoffEscrow.MarketConfig memory cfg = escrow.getConfig(marketId);
        if (cfg.stakeMode != STAKE_MODE_FIXED) revert NotFixedStake();

        uint128 amount = _hasPosition[agent][marketId] ? 0 : cfg.fixedStake;
        if (amount > 0) {
            if (amount > a.balance) revert InsufficientBalance();
            a.balance -= amount;
            _hasPosition[agent][marketId] = true;
            if (!stakeToken.approve(address(escrow), amount)) revert TransferFailed();
        }
        escrow.stakeFor(agent, marketId, guessA, guessB, amount);
        emit AgentStaked(agent, marketId, guessA, guessB, amount);
    }

    mapping(address => mapping(uint256 => bool)) internal _hasPosition;

    /// @notice Pull an agent's payout/refund back into its balance.
    ///         Permissionless: it can only ever credit the agent.
    function claim(address agent, uint256 marketId) external nonReentrant returns (uint256 amount) {
        Agent storage a = agents[agent];
        if (a.owner == address(0)) revert UnknownAgent();
        amount = escrow.claimFor(marketId, agent);
        a.balance += amount;
        emit AgentClaimed(agent, marketId, amount, a.balance);
    }

    // --- signatures -----------------------------------------------------------------------

    /// @dev EOA-only ECDSA recover with low-s check (Privy embedded wallets
    ///      are EOAs; a smart-wallet owner uses registerAgent() directly).
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
