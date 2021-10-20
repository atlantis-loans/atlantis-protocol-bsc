const {
  etherUnsigned,
  etherMantissa,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeAToken,
  balanceOf,
  borrowSnapshot,
  totalBorrows,
  fastForward,
  setBalance,
  preApprove,
  pretendBorrow
} = require('../Utils/Atlantis');

const borrowAmount = etherUnsigned(10e3);
const repayAmount = etherUnsigned(10e2);

async function preBorrow(aToken, borrower, borrowAmount) {
  await send(aToken.comptroller, 'setBorrowAllowed', [true]);
  await send(aToken.comptroller, 'setBorrowVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken.underlying, 'harnessSetBalance', [aToken._address, borrowAmount]);
  await send(aToken, 'harnessSetFailTransferToAddress', [borrower, false]);
  await send(aToken, 'harnessSetAccountBorrows', [borrower, 0, 0]);
  await send(aToken, 'harnessSetTotalBorrows', [0]);
}

async function borrowFresh(aToken, borrower, borrowAmount) {
  return send(aToken, 'harnessBorrowFresh', [borrower, borrowAmount]);
}

async function borrow(aToken, borrower, borrowAmount, opts = {}) {
  // make sure to have a block delta so we accrue interest
  await send(aToken, 'harnessFastForward', [1]);
  return send(aToken, 'borrow', [borrowAmount], {from: borrower});
}

async function preRepay(aToken, benefactor, borrower, repayAmount) {
  // setup either benefactor OR borrower for success in repaying
  await send(aToken.comptroller, 'setRepayBorrowAllowed', [true]);
  await send(aToken.comptroller, 'setRepayBorrowVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [benefactor, false]);
  await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [borrower, false]);
  await pretendBorrow(aToken, borrower, 1, 1, repayAmount);
  await preApprove(aToken, benefactor, repayAmount);
  await preApprove(aToken, borrower, repayAmount);
}

async function repayBorrowFresh(aToken, payer, borrower, repayAmount) {
  return send(aToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer});
}

async function repayBorrow(aToken, borrower, repayAmount) {
  // make sure to have a block delta so we accrue interest
  await send(aToken, 'harnessFastForward', [1]);
  return send(aToken, 'repayBorrow', [repayAmount], {from: borrower});
}

async function repayBorrowBehalf(aToken, payer, borrower, repayAmount) {
  // make sure to have a block delta so we accrue interest
  await send(aToken, 'harnessFastForward', [1]);
  return send(aToken, 'repayBorrowBehalf', [borrower, repayAmount], {from: payer});
}

describe('AToken', function () {
  let aToken, root, borrower, benefactor, accounts;
  beforeEach(async () => {
    [root, borrower, benefactor, ...accounts] = saddle.accounts;
    aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}});
  });

  describe('borrowFresh', () => {
    beforeEach(async () => await preBorrow(aToken, borrower, borrowAmount));

    it("fails if comptroller tells it to", async () => {
      await send(aToken.comptroller, 'setBorrowAllowed', [false]);
      expect(await borrowFresh(aToken, borrower, borrowAmount)).toHaveTrollReject('BORROW_COMPTROLLER_REJECTION');
    });

    it("proceeds if comptroller tells it to", async () => {
      await expect(await borrowFresh(aToken, borrower, borrowAmount)).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(aToken);
      expect(await borrowFresh(aToken, borrower, borrowAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'BORROW_FRESHNESS_CHECK');
    });

    it("continues if fresh", async () => {
      await expect(await send(aToken, 'accrueInterest')).toSucceed();
      await expect(await borrowFresh(aToken, borrower, borrowAmount)).toSucceed();
    });

    it("fails if error if protocol has less than borrowAmount of underlying", async () => {
      expect(await borrowFresh(aToken, borrower, borrowAmount.plus(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(aToken, borrower, 0, 3e18, 5e18);
      expect(await borrowFresh(aToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_ACCUMULATED_BALANCE_CALCULATION_FAILED');
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(aToken, borrower, 1e-18, 1e-18, UInt256Max());
      expect(await borrowFresh(aToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await send(aToken, 'harnessSetTotalBorrows', [UInt256Max()]);
      expect(await borrowFresh(aToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED');
    });

    it("reverts if transfer out fails", async () => {
      await send(aToken, 'harnessSetFailTransferToAddress', [borrower, true]);
      await expect(borrowFresh(aToken, borrower, borrowAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
    });

    xit("reverts if borrowVerify fails", async() => {
      await send(aToken.comptroller, 'setBorrowVerify', [false]);
      await expect(borrowFresh(aToken, borrower, borrowAmount)).rejects.toRevert("revert borrowVerify rejected borrow");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await balanceOf(aToken.underlying, aToken._address);
      const beforeProtocolBorrows = await totalBorrows(aToken);
      const beforeAccountCash = await balanceOf(aToken.underlying, borrower);
      const result = await borrowFresh(aToken, borrower, borrowAmount);
      expect(result).toSucceed();
      expect(await balanceOf(aToken.underlying, borrower)).toEqualNumber(beforeAccountCash.plus(borrowAmount));
      expect(await balanceOf(aToken.underlying, aToken._address)).toEqualNumber(beforeProtocolCash.minus(borrowAmount));
      expect(await totalBorrows(aToken)).toEqualNumber(beforeProtocolBorrows.plus(borrowAmount));
      expect(result).toHaveLog('Transfer', {
        from: aToken._address,
        to: borrower,
        amount: borrowAmount.toString()
      });
      expect(result).toHaveLog('Borrow', {
        borrower: borrower,
        borrowAmount: borrowAmount.toString(),
        accountBorrows: borrowAmount.toString(),
        totalBorrows: beforeProtocolBorrows.plus(borrowAmount).toString()
      });
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await totalBorrows(aToken);
      await pretendBorrow(aToken, borrower, 0, 3, 0);
      await borrowFresh(aToken, borrower, borrowAmount);
      const borrowSnap = await borrowSnapshot(aToken, borrower);
      expect(borrowSnap.principal).toEqualNumber(borrowAmount);
      expect(borrowSnap.interestIndex).toEqualNumber(etherMantissa(3));
      expect(await totalBorrows(aToken)).toEqualNumber(beforeProtocolBorrows.plus(borrowAmount));
    });
  });

  describe('borrow', () => {
    beforeEach(async () => await preBorrow(aToken, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(borrow(aToken, borrower, borrowAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      expect(await borrow(aToken, borrower, borrowAmount.plus(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await balanceOf(aToken.underlying, borrower);
      await fastForward(aToken);
      expect(await borrow(aToken, borrower, borrowAmount)).toSucceed();
      expect(await balanceOf(aToken.underlying, borrower)).toEqualNumber(beforeAccountCash.plus(borrowAmount));
    });
  });

  describe('repayBorrowFresh', () => {
    [true, false].forEach((benefactorIsPayer) => {
      let payer;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          await preRepay(aToken, payer, borrower, repayAmount);
        });

        it("fails if repay is not allowed", async () => {
          await send(aToken.comptroller, 'setRepayBorrowAllowed', [false]);
          expect(await repayBorrowFresh(aToken, payer, borrower, repayAmount)).toHaveTrollReject('REPAY_BORROW_COMPTROLLER_REJECTION', 'MATH_ERROR');
        });

        it("fails if block number ≠ current block number", async () => {
          await fastForward(aToken);
          expect(await repayBorrowFresh(aToken, payer, borrower, repayAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REPAY_BORROW_FRESHNESS_CHECK');
        });

        it("fails if insufficient approval", async() => {
          await preApprove(aToken, payer, 1);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient allowance');
        });

        it("fails if insufficient balance", async() => {
          await setBalance(aToken.underlying, payer, 1);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
        });


        it("returns an error if calculating account new account borrow balance fails", async () => {
          await pretendBorrow(aToken, borrower, 1, 1, 1);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert("revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED");
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await send(aToken, 'harnessSetTotalBorrows', [1]);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert("revert REPAY_BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED");
        });


        it("reverts if doTransferIn fails", async () => {
          await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [payer, true]);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert("revert TOKEN_TRANSFER_IN_FAILED");
        });

        xit("reverts if repayBorrowVerify fails", async() => {
          await send(aToken.comptroller, 'setRepayBorrowVerify', [false]);
          await expect(repayBorrowFresh(aToken, payer, borrower, repayAmount)).rejects.toRevert("revert repayBorrowVerify rejected repayBorrow");
        });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await balanceOf(aToken.underlying, aToken._address);
          const result = await repayBorrowFresh(aToken, payer, borrower, repayAmount);
          expect(await balanceOf(aToken.underlying, aToken._address)).toEqualNumber(beforeProtocolCash.plus(repayAmount));
          expect(result).toHaveLog('Transfer', {
            from: payer,
            to: aToken._address,
            amount: repayAmount.toString()
          });
          expect(result).toHaveLog('RepayBorrow', {
            payer: payer,
            borrower: borrower,
            repayAmount: repayAmount.toString(),
            accountBorrows: "0",
            totalBorrows: "0"
          });
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await totalBorrows(aToken);
          const beforeAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
          expect(await repayBorrowFresh(aToken, payer, borrower, repayAmount)).toSucceed();
          const afterAccountBorrows = await borrowSnapshot(aToken, borrower);
          expect(afterAccountBorrows.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
          expect(afterAccountBorrows.interestIndex).toEqualNumber(etherMantissa(1));
          expect(await totalBorrows(aToken)).toEqualNumber(beforeProtocolBorrows.minus(repayAmount));
        });
      });
    });
  });

  describe('repayBorrow', () => {
    beforeEach(async () => {
      await preRepay(aToken, borrower, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(repayBorrow(aToken, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await setBalance(aToken.underlying, borrower, 1);
      await expect(repayBorrow(aToken, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(aToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
      expect(await repayBorrow(aToken, borrower, repayAmount)).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await fastForward(aToken);
      expect(await repayBorrow(aToken, borrower, UInt256Max())).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await setBalance(aToken.underlying, borrower, 3);
      await fastForward(aToken);
      await expect(repayBorrow(aToken, borrower, UInt256Max())).rejects.toRevert('revert Insufficient balance');
    });
  });

  describe('repayBorrowBehalf', () => {
    let payer;

    beforeEach(async () => {
      payer = benefactor;
      await preRepay(aToken, payer, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(repayBorrowBehalf(aToken, payer, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await setBalance(aToken.underlying, payer, 1);
      await expect(repayBorrowBehalf(aToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(aToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
      expect(await repayBorrowBehalf(aToken, payer, borrower, repayAmount)).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(aToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
    });
  });
});
