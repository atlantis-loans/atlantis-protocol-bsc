pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../Vault/Utils/Address.sol";
import "../../Vault/Utils/SafeBEP20.sol";
import "../../Vault/Utils/IBEP20.sol";
import "../../Vault/Utils/ReentrancyGuard.sol";
import "./XVSVaultStrategyProxy.sol";
import "./XVSVaultStrategyStorage.sol";

// This contract acts as a wrapper for user wallet interaction with the XVS Vault
contract XVSVault is XVSVaultItemStorage, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;
    using Address for address;

    modifier onlyAdminVault() {
        require(msg.sender == adminVault, "only admin vault can");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    function deposit(uint256 amount) external nonReentrant onlyAdminVault {
        IBEP20(xvs).approve(xvsVault, 2**256 - 1);
        IXVSVault(xvsVault).deposit(xvs, pid, amount);
    }

    function requestWithdrawal(uint256 amount) external nonReentrant onlyAdminVault {
        IXVSVault(xvsVault).requestWithdrawal(xvs, pid, amount);
    }

    function claimRewards(address _userAddress) external nonReentrant onlyAdminVault {
        IXVSVault(xvsVault).deposit(xvs, pid, 0);

        // Transfer claimed XVS to the user wallet
        IBEP20(xvs).safeTransferFrom(address(this), _userAddress, IBEP20(xvs).balanceOf(address(this)));
    }

    function compoundRewards() external nonReentrant onlyAdminVault {
        // claim the pending rewards
        IXVSVault(xvsVault).deposit(xvs, pid, 0);

        // deposit the claimed rewards back to the XVS Vault
        IXVSVault(xvsVault).deposit(xvs, pid, IBEP20(xvs).balanceOf(address(this)));
    }

    function executeWithdrawal(address _userAddress) external nonReentrant onlyAdminVault {
        IXVSVault(xvsVault).executeWithdrawal(xvs, pid);

        // Transfer XVS to user wallet
        IBEP20(xvs).safeTransferFrom(address(this), _userAddress, IBEP20(xvs).balanceOf(address(this)));
    }

    /*** Admin Functions ***/

    function _become(XVSVaultStrategyProxy xvsVaultStrategyProxy) public {
        require(msg.sender == xvsVaultStrategyProxy.admin(), "only proxy admin can change brains");
        xvsVaultStrategyProxy._acceptImplementation();
    }

    // Only allow to set the admin vault once. 
    function setAdminVault(address _adminVault) external nonReentrant {
        require(_adminVault != address(0), "Zero address");
        require(_adminVault.isContract(), "call to non-XVSVaultStrategy contract");
        require(adminVault == address(0), "Admin vault is already set");
        adminVault = _adminVault;
    }

    function emergencyWithdraw() external nonReentrant onlyAdmin {
        uint256 eligibleWithdrawalAmount = IXVSVault(xvsVault).getEligibleWithdrawalAmount(xvs, pid, address(this));
        if (eligibleWithdrawalAmount > 0) {
            // Transfer the staked XVS from user vault contract to the user wallet
            IXVSVault(xvsVault).executeWithdrawal(xvs, pid);
        }

        // calculate the current available amount which is not yet requested to be withdrawn
        (uint256 amount, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(xvs, pid, address(this));
        uint256 stakeAmount = amount.sub(pendingWithdrawals);
        if (stakeAmount > 0) {
            IXVSVault(xvsVault).requestWithdrawal(xvs, pid, stakeAmount);
        }

        // Transfer XVS to admin wallet
        IBEP20(xvs).safeTransferFrom(address(this), admin, IBEP20(xvs).balanceOf(address(this)));
    }
}
