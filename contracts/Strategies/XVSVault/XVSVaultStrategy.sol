pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../Vault/Utils/SafeBEP20.sol";
import "../../Vault/Utils/IBEP20.sol";
import "../../Vault/Utils/ReentrancyGuard.sol";
import "./XVSVaultStrategyProxy.sol";
import "./XVSVaultStrategyStorage.sol";
import "./XVSVault.sol";

contract XVSVaultStrategy is XVSVaultStrategyStorage, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted on aXVS deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when execute withrawal
    event ExecutedWithdrawal(address indexed user, uint256 amount);

    /// @notice Event emitted when request withrawal
    event WithdrawalRequested(address indexed user, uint256 amount);

    /// @notice Event emitted on aXVS deposit
    event DepositATL(address indexed user, uint256 amount);

    /// @notice Event emitted when withrawal
    event WithdrawATL(address indexed user, uint256 amount);

    /// @notice Event emitted when claiming XVS rewards
    event Claim(address indexed user, uint256 amount);

    /// @notice Event emitted when vault is paused
    event VaultPaused(address indexed admin);

    /// @notice Event emitted when vault is resumed after pause
    event VaultResumed(address indexed admin);

    /// @notice Event emitted when deposit limit is updated
    event DepositLimitUpdated(uint256 maxDepositPercentage, uint256 amountATL);

    /// @notice Event emitted when compounding is stopt is resumed after pause
    event CompoundingExecuted(address indexed user);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier isActive() {
        require(vaultPaused == false, "Vault is paused");
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }

    modifier userHasPosition(address userAddress) {
        UserInfo storage user = userInfo[userAddress];
        require(user.userAddress != address(0) && user.contractAddress != address(0), "No position in the XVS Vault");
        _;
    }

    modifier hasValideDepositLimit(uint256 _depositAmount) {
        UserInfo storage user = userInfo[msg.sender];
        (uint256 newDepositPercentage, uint256 roundedMaxDepositPercentage, uint256 requiredATL) = this.calculateUserDepositAllowance(user.userAddress, _depositAmount);

        require(user.amountATL >= requiredATL && newDepositPercentage <= roundedMaxDepositPercentage, "increase deposit limit");
        _;
    }

    function deposit(uint256 depositAmount) external nonReentrant isActive hasValideDepositLimit(depositAmount) {
        require(depositAmount > 0, "zero amount");

        UserInfo storage user = userInfo[msg.sender];
        if (user.userAddress == address(0)) {
            user.contractAddress = address(initializeXVSVaultContract());
            user.userAddress = msg.sender;
        }

        // Transfer XVS from the user wallet to the user vault contract
        IBEP20(xvs).safeTransferFrom(address(msg.sender), address(user.contractAddress), depositAmount);

        // Transfer XVS from user vault contract to Venus XVS Vault
        IXVSVaultItem(address(user.contractAddress)).deposit(depositAmount);

        // Request withdrawal
        IXVSVaultItem(address(user.contractAddress)).requestWithdrawal(depositAmount);

        emit Deposit(user.userAddress, depositAmount);
    }

    function withdraw() external nonReentrant userHasPosition(msg.sender) {
        address userAddress = msg.sender;
        UserInfo storage user = userInfo[userAddress];

        // get the current available amount to be withdrawn
        uint256 eligibleWithdrawalAmount = IXVSVault(xvsVault).getEligibleWithdrawalAmount(xvs, pid, user.contractAddress);
        require(eligibleWithdrawalAmount > 0, "Nothing to withdraw");

        // Transfer the staked XVS from user vault contract to the user wallet
        IXVSVaultItem(address(user.contractAddress)).executeWithdrawal(user.userAddress);

        emit ExecutedWithdrawal(userAddress, eligibleWithdrawalAmount);
    }

    // This function is used for requesting withdrawal of all available XVS from the Venus XVS Vault
    // This is mostly used when auto compounding is active.
    function requistWithdrawal() external nonReentrant userHasPosition(msg.sender) {
        UserInfo storage user = userInfo[msg.sender];
        (uint256 amount, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(xvs, pid, user.contractAddress);

        // calculate the current available amount which is not yet requested to be withdrawn
        uint256 userStakeAmount = amount.sub(pendingWithdrawals);
        require(userStakeAmount > 0, "Nothing to withdraw");

        // Request withdrawal
        IXVSVaultItem(address(user.contractAddress)).requestWithdrawal(userStakeAmount);

        emit WithdrawalRequested(msg.sender, userStakeAmount);
    }

    function compound(address[] calldata users) external nonReentrant isActive {
        for (uint256 i = 0; i < users.length; ++i) {
            UserInfo storage user = userInfo[users[i]];
            (uint256 amount, , ) = IXVSVault(xvsVault).getUserInfo(xvs, pid, user.contractAddress);

            if (user.amountATL >= minRequiredATLForCompounding && amount > 0) {
                /*
                    1. claim all pending rewards
                    2. deposit the claimed rewards back to the XVS Vault
                */
                IXVSVaultItem(address(user.contractAddress)).compoundRewards();
                emit CompoundingExecuted(user.userAddress);
            }
        }
    }

    function claim() external nonReentrant userHasPosition(msg.sender) {
        UserInfo storage user = userInfo[msg.sender];

        uint256 pendingRewards = IXVSVault(xvsVault).pendingReward(xvs, pid, user.contractAddress);
        IXVSVaultItem(address(user.contractAddress)).claimRewards(user.userAddress);

        emit Claim(user.userAddress, pendingRewards);
    }

    function depositATL(uint256 amount) external nonReentrant isActive {
        require(address(msg.sender) != address(0), "zero address");
        require(amount > 0, "zero amount");

        UserInfo storage user = userInfo[msg.sender];
        if (user.userAddress == address(0)) {
            user.contractAddress = address(initializeXVSVaultContract());
            user.userAddress = msg.sender;
        }

        user.amountATL = user.amountATL.add(amount);

        // Transfer ATL from user wallet to this vault
        IBEP20(atlantis).safeTransferFrom(user.userAddress, address(this), amount);

        emit DepositATL(user.userAddress, amount);
    }

    // Withdraw all ATL and transfer it to the user wallet
    function withdrawATL() external nonReentrant {
        require(address(msg.sender) != address(0), "zero address");

        UserInfo storage user = userInfo[msg.sender];
        require(user.amountATL > 0, "nothing to withdraw");

        uint256 _amountATL = user.amountATL;
        user.amountATL = 0;

        (uint256 newDepositPercentage, uint256 roundedMaxDepositPercentage, ) = this.calculateUserDepositAllowance(user.userAddress, 0);
        require(newDepositPercentage <= roundedMaxDepositPercentage, "Decrease your total XVS deposit below max deposit limit.");

        // Transfer ATL back to the user wallet
        IBEP20(atlantis).safeTransferFrom(address(this), user.userAddress, _amountATL);

        emit WithdrawATL(user.userAddress, _amountATL);
    }

    // Get user info with some extra data
    function getUserInfo(address _user) external view returns (UserInfoLens memory) {
        UserInfoLens memory userInfoLens;

        UserInfo storage user = userInfo[_user];
        userInfoLens.contractAddress = user.contractAddress;
        userInfoLens.userAddress = user.userAddress;
        userInfoLens.amountATL = user.amountATL;
        userInfoLens.compounding = user.amountATL >= minRequiredATLForCompounding;
        userInfoLens.pendingReward = IXVSVault(xvsVault).pendingReward(xvs, pid, user.contractAddress);

        (uint256 _amount, , uint256 _pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(xvs, pid, user.contractAddress);
        userInfoLens.amount = _amount;
        userInfoLens.pendingWithdrawals = _pendingWithdrawals;
        userInfoLens.stakeAmount = _amount.sub(_pendingWithdrawals);

        userInfoLens.eligibleWithdrawalAmount = IXVSVault(xvsVault).getEligibleWithdrawalAmount(xvs, pid, user.contractAddress);

        (uint256 _usedDepositPercentage, uint256 _maxDepositPercentage, uint256 _requiredATL) = this.calculateUserDepositAllowance(user.userAddress, 0);
        userInfoLens.usedDepositPercentage = _usedDepositPercentage;
        userInfoLens.maxDepositPercentage = _maxDepositPercentage;
        userInfoLens.requiredATL = _requiredATL;

        userInfoLens.withdrawalRequest = IXVSVault(xvsVault).getWithdrawalRequests(xvs, pid, user.contractAddress);

        return userInfoLens;
    }

    function getPoolInfo()
        external
        view
        returns (
            uint256 rewardTokenAmountsPerBlock,
            uint256 totalAllocPoints,
            uint256 allocPoint,
            uint256 totalStaked
        )
    {
        rewardTokenAmountsPerBlock = IXVSVault(xvsVault).rewardTokenAmountsPerBlock(xvs);
        totalAllocPoints = IXVSVault(xvsVault).totalAllocPoints(xvs);
        IXVSVault.PoolInfo memory pool = IXVSVault(xvsVault).poolInfos(xvs, pid);
        allocPoint = pool.allocPoint;
        totalStaked = IBEP20(xvs).balanceOf(xvsVault);
    }

    struct RequiredATL {
        uint256 amountATL;
        uint256 depositPercentage;
    }

    function getRequiredATLInfo() external view returns (RequiredATL[] memory) {
        RequiredATL[] memory result = new RequiredATL[](10);

        for (uint256 i = 1; i <= 10; ++i) {
            RequiredATL memory item;
            item.amountATL = depositAllowanceDataBi[i.mul(10)];
            item.depositPercentage = i.mul(10);
            result[i.sub(1)] = item;
        }

        return (result);
    }

    function calculateUserDepositAllowance(address _userAddress, uint256 _depositAmount)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        UserInfo storage user = userInfo[_userAddress];
        if (user.userAddress == address(0)) {
            return (0, depositAllowanceData[0], 0);
        }

        (uint256 amount, , ) = IXVSVault(xvsVault).getUserInfo(xvs, pid, user.contractAddress);
        uint256 userWalletBalance = IBEP20(xvs).balanceOf(user.userAddress);
        uint256 roundedDepositedATL = user.amountATL.sub(user.amountATL.mod(10));

        if (userWalletBalance == 0 && amount == 0 && _depositAmount == 0) {
            return (0, depositAllowanceData[roundedDepositedATL], roundedDepositedATL);
        }

        uint256 newDepositPercentage = amount.add(_depositAmount).mul(DENOMINATOR).div(amount.add(userWalletBalance)).div(100);
        return (newDepositPercentage, depositAllowanceData[roundedDepositedATL], roundedDepositedATL);
    }

    /*** Admin Functions ***/

    function _become(XVSVaultStrategyProxy xvsVaultStrategyProxy) public {
        require(msg.sender == xvsVaultStrategyProxy.admin(), "only proxy admin can change brains");
        xvsVaultStrategyProxy._acceptImplementation();
    }

    function pause() external onlyAdmin {
        require(vaultPaused == false, "Vault is already paused");
        vaultPaused = true;
        emit VaultPaused(msg.sender);
    }

    function resume() external onlyAdmin {
        require(vaultPaused == true, "Vault is not paused");
        vaultPaused = false;
        emit VaultResumed(msg.sender);
    }

    function setDepositLimit(uint256 _requiredATL, uint256 _maxDepositPercentage) external onlyAdmin {
        require(_maxDepositPercentage >= 10 && _maxDepositPercentage <= 100, "Must be between 10 and 100");
        depositAllowanceData[_requiredATL] = _maxDepositPercentage;
        depositAllowanceDataBi[_maxDepositPercentage] = _requiredATL;
        emit DepositLimitUpdated(_requiredATL, _maxDepositPercentage);
    }

    function setMinRequiredATLForCompounding(uint256 _minRequiredATLForCompounding) external onlyAdmin {
        minRequiredATLForCompounding = _minRequiredATLForCompounding;
    }

    function initializeXVSVaultContract() internal returns (address) {
        XVSVault xvsVault = new XVSVault();
        XVSVaultStrategyProxy proxy = new XVSVaultStrategyProxy();
        proxy._setPendingImplementation(address(xvsVault));
        xvsVault._become(proxy);
        proxy._setPendingAdmin(admin); // for future upgrades
        IXVSVaultItem(address(proxy)).setAdminVault(address(this));
        return address(proxy);
    }
}
