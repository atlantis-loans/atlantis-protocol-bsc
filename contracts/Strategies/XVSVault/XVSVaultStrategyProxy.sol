pragma solidity ^0.5.16;

import "./XVSVaultStrategyStorage.sol";

contract XVSVaultStrategyProxy is XVSVaultStrategyAdminStorage {
    /**
     * @notice Emitted when pendingImplementation is changed
     */
    event NewPendingImplementation(address oldPendingImplementation, address newPendingImplementation);

    /**
     * @notice Emitted when pendingImplementation is accepted, which means Community Vault implementation is updated
     */
    event NewImplementation(address oldImplementation, address newImplementation);

    /**
     * @notice Emitted when pendingAdmin is changed
     */
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /**
     * @notice Emitted when pendingAdmin is accepted, which means admin is updated
     */
    event NewAdmin(address oldAdmin, address newAdmin);

    constructor() public {
        require(msg.sender != address(0), "Zero address not allowed");
        admin = msg.sender;
    }

    /*** Admin Functions ***/
    function _setPendingImplementation(address newPendingImplementation) external {
        require(msg.sender == admin, "Only admin can set Pending Implementation");

        address oldPendingImplementation = pendingImplementation;

        pendingImplementation = newPendingImplementation;

        emit NewPendingImplementation(oldPendingImplementation, pendingImplementation);
    }

    /**
     * @notice Accepts new implementation of XVS Vault Strategy. msg.sender must be pendingImplementation
     * @dev Admin function for new implementation to accept it's role as implementation
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _acceptImplementation() external {
        // Check caller is pendingImplementation
        require(msg.sender == pendingImplementation, "only address marked as pendingImplementation can accept Implementation");

        // Save current values for inclusion in log
        address oldImplementation = implementation;
        address oldPendingImplementation = pendingImplementation;

        implementation = pendingImplementation;
        pendingImplementation = address(0);

        emit NewImplementation(oldImplementation, implementation);
        emit NewPendingImplementation(oldPendingImplementation, pendingImplementation);
    }

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPendingAdmin(address newPendingAdmin) external {
        // Check caller = admin
        require(msg.sender == admin, "only admin can set pending admin");
        require(newPendingAdmin != pendingAdmin, "New pendingAdmin can not be same as the previous one");

        // Save current value, if any, for inclusion in log
        address oldPendingAdmin = pendingAdmin;

        // Store pendingAdmin with value newPendingAdmin
        pendingAdmin = newPendingAdmin;

        // Emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin)
        emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin);
    }

    /**
     * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
     * @dev Admin function for pending admin to accept role and update admin
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _acceptAdmin() external {
        // Check caller is pendingAdmin
        require(msg.sender == pendingAdmin, "only address marked as pendingAdmin can accept as Admin");

        // Save current values for inclusion in log
        address oldAdmin = admin;
        address oldPendingAdmin = pendingAdmin;

        // Store admin with value pendingAdmin
        admin = pendingAdmin;

        // Clear the pending value
        pendingAdmin = address(0);

        emit NewAdmin(oldAdmin, admin);
        emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
    }

    /**
     * @dev Delegates execution to an implementation contract.
     * It returns to the external caller whatever the implementation returns
     * or forwards reverts.
     */
    function() external payable {
        // delegate all other functions to current implementation
        (bool success, ) = implementation.delegatecall(msg.data);

        assembly {
            let free_mem_ptr := mload(0x40)
            returndatacopy(free_mem_ptr, 0, returndatasize)

            switch success
            case 0 {
                revert(free_mem_ptr, returndatasize)
            }
            default {
                return(free_mem_ptr, returndatasize)
            }
        }
    }
}
