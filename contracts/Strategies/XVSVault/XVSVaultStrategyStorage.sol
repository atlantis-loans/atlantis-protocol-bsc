pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../SafeMath.sol";
import "../../Vault/Utils/IBEP20.sol";

contract XVSVaultStrategyAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of XVS Vault Strategy
     */
    address public implementation;

    /**
     * @notice Pending brains of XVS Vault Strategy
     */
    address public pendingImplementation;
}

contract XVSVaultStrategyStorage is XVSVaultStrategyAdminStorage {
    /// @notice Guard variable for re-entrancy checks
    bool public _notEntered;

    /// @notice pause indicator for Vault
    bool public vaultPaused;

    /// @notice The treasury address
    address public treasury;

    /// @notice The Atlantis token address
    address public constant atlantis = address(0x1fD991fb6c3102873ba68a4e6e6a87B3a5c10271);

    /// @notice The XVS token address
    address public constant xvs = address(0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63);

    /// @notice The XVS Vault address
    address public constant xvsVault = address(0x051100480289e704d20e9DB4804837068f3f9204);

    /// @notice The XVS Vaut pair id
    uint8 public constant pid = 0;

    /// @notice The minimum amount of ATL required for an user to participate in auto compounding.
    uint256 public minRequiredATLForCompounding;

    uint256 public constant DENOMINATOR = 10000;

    uint256 public performanceFee;

    /// @notice Info of each user.
    struct UserInfo {
        address contractAddress;
        address userAddress;
        uint256 amountATL;
    }

    /// Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;

    /// key = required ATL amount, value = max deposit allowance %
    mapping(uint256 => uint256) depositAllowanceData;

    /// Bidirectional, key = max deposit allowance %, value = required ATL amount (used only for getting the data in frontend)
    mapping(uint256 => uint256) depositAllowanceDataBi;

    struct UserInfoLens {
        address contractAddress;
        address userAddress;
        uint256 amount;
        uint256 amountATL;
        bool compounding;
        uint256 pendingReward;
        uint256 pendingWithdrawals;
        uint256 eligibleWithdrawalAmount;
        uint256 stakeAmount;
        uint256 usedDepositPercentage;
        uint256 maxDepositPercentage;
        uint256 requiredATL;
        IXVSVault.WithdrawalRequest[] withdrawalRequest;
    }
}

contract XVSVaultItemStorage is XVSVaultStrategyStorage {
    /// @notice This is the address of the xvs vault strategy contract (aka. parent contract)
    address public adminVault;
}

interface IAToken {
    function exchangeRateStored() external view returns (uint256);

    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external returns (bool);

    function _transferLiquidityToStrategyVault(uint256 tokensIn) external returns (uint256);

    function _transferLiquidityFromStrategyVault(uint256 tokensIn, uint256 amountIn) external;

    function getCash() external view returns (uint256);

    function totalBorrows() external view returns (uint256);

    function totalReserves() external view returns (uint256);

    function interestRateModel() external view returns (address);

    function redeem(uint256 redeemTokens) external returns (uint256);
}

interface IXVSVaultItem {
    function deposit(uint256 amount) external;

    function requestWithdrawal(uint256 amount) external;

    function executeWithdrawal(address userAddress) external;

    function claimRewards(address userAddress) external;

    function compoundRewards() external;

    function setAdminVault(address adminVault) external;
}

interface IXVSVault {
    function deposit(
        address _rewardToken,
        uint256 _pid,
        uint256 _amount
    ) external;

    function requestWithdrawal(
        address _rewardToken,
        uint256 _pid,
        uint256 _amount
    ) external;

    function executeWithdrawal(address _rewardToken, uint256 _pid) external;

    struct WithdrawalRequest {
        uint256 amount;
        uint256 lockedUntil;
    }

    function getWithdrawalRequests(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (WithdrawalRequest[] memory);

    function getEligibleWithdrawalAmount(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (uint256 withdrawalAmount);

    function pendingReward(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (uint256);

    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    )
        external
        view
        returns (
            uint256 amount,
            uint256 rewardDebt,
            uint256 pendingWithdrawals
        );

    struct PoolInfo {
        IBEP20 token; // Address of token contract to stake.
        uint256 allocPoint; // How many allocation points assigned to this pool.
        uint256 lastRewardBlock; // Last block number that reward tokens distribution occurs.
        uint256 accRewardPerShare; // Accumulated per share, times 1e12. See below.
        uint256 lockPeriod; // Min time between withdrawal request and its execution.
    }

    function poolInfos(address _rewardToken, uint256 index) external view returns (PoolInfo memory);

    function rewardTokenAmountsPerBlock(address _rewardToken) external view returns (uint256);

    function totalAllocPoints(address _rewardToken) external view returns (uint256);
}
