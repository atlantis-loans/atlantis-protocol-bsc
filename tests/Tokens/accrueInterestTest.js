const {
  etherMantissa,
  etherUnsigned,
  UInt256Max
} = require('../Utils/Ethereum');
const {
  makeAToken,
  setBorrowRate
} = require('../Utils/Atlantis');

const blockNumber = 2e7;
const borrowIndex = 1e18;
const borrowRate = .000001;

async function pretendBlock(aToken, accrualBlock = blockNumber, deltaBlocks = 1) {
  await send(aToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
  await send(aToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber + deltaBlocks)]);
  await send(aToken, 'harnessSetBorrowIndex', [etherUnsigned(borrowIndex)]);
}

async function preAccrue(aToken) {
  await setBorrowRate(aToken, borrowRate);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken, 'harnessExchangeRateDetails', [0, 0, 0]);
}

describe('AToken', () => {
  let root, accounts;
  let aToken;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}});
  });

  beforeEach(async () => {
    await preAccrue(aToken);
  });

  describe('accrueInterest', () => {
    it('reverts if the interest rate is absurdly high', async () => {
      await pretendBlock(aToken, blockNumber, 1);
      expect(await call(aToken, 'getBorrowRateMaxMantissa')).toEqualNumber(etherMantissa(0.000005)); // 0.0005% per block
      await setBorrowRate(aToken, 0.001e-2); // 0.0010% per block
      await expect(send(aToken, 'accrueInterest')).rejects.toRevert("revert borrow rate is absurdly high");
    });

    it('fails if new borrow rate calculation fails', async () => {
      await pretendBlock(aToken, blockNumber, 1);
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(send(aToken, 'accrueInterest')).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it('fails if simple interest factor calculation fails', async () => {
      await pretendBlock(aToken, blockNumber, 5e70);
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_SIMPLE_INTEREST_FACTOR_CALCULATION_FAILED');
    });

    it('fails if new borrow index calculation fails', async () => {
      await pretendBlock(aToken, blockNumber, 5e60);
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
    });

    it('fails if new borrow interest index calculation fails', async () => {
      await pretendBlock(aToken)
      await send(aToken, 'harnessSetBorrowIndex', [UInt256Max()]);
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
    });

    it('fails if interest accumulated calculation fails', async () => {
      await send(aToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0]);
      await pretendBlock(aToken)
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_ACCUMULATED_INTEREST_CALCULATION_FAILED');
    });

    it('fails if new total borrows calculation fails', async () => {
      await setBorrowRate(aToken, 1e-18);
      await pretendBlock(aToken)
      await send(aToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0]);
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_BORROWS_CALCULATION_FAILED');
    });

    it('fails if interest accumulated for reserves calculation fails', async () => {
      await setBorrowRate(aToken, .000001);
      await send(aToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e30), UInt256Max()]);
      await send(aToken, 'harnessSetReserveFactorFresh', [etherUnsigned(1e10)]);
      await pretendBlock(aToken, blockNumber, 5e20)
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
    });

    it('fails if new total reserves calculation fails', async () => {
      await setBorrowRate(aToken, 1e-18);
      await send(aToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e56), UInt256Max()]);
      await send(aToken, 'harnessSetReserveFactorFresh', [etherUnsigned(1e17)]);
      await pretendBlock(aToken)
      expect(await send(aToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
    });

    it('succeeds and saves updated values in storage on success', async () => {
      const startingTotalBorrows = 1e22;
      const startingTotalReserves = 1e20;
      const reserveFactor = 1e17;

      await send(aToken, 'harnessExchangeRateDetails', [0, etherUnsigned(startingTotalBorrows), etherUnsigned(startingTotalReserves)]);
      await send(aToken, 'harnessSetReserveFactorFresh', [etherUnsigned(reserveFactor)]);
      await pretendBlock(aToken)

      const expectedAccrualBlockNumber = blockNumber + 1;
      const expectedBorrowIndex = borrowIndex + borrowIndex * borrowRate;
      const expectedTotalBorrows = startingTotalBorrows + startingTotalBorrows * borrowRate;
      const expectedTotalReserves = startingTotalReserves + startingTotalBorrows *  borrowRate * reserveFactor / 1e18;

      const receipt = await send(aToken, 'accrueInterest')
      expect(receipt).toSucceed();
      expect(receipt).toHaveLog('AccrueInterest', {
        cashPrior: 0,
        interestAccumulated: etherUnsigned(expectedTotalBorrows).minus(etherUnsigned(startingTotalBorrows)).toFixed(),
        borrowIndex: etherUnsigned(expectedBorrowIndex).toFixed(),
        totalBorrows: etherUnsigned(expectedTotalBorrows).toFixed()
      })
      expect(await call(aToken, 'accrualBlockNumber')).toEqualNumber(expectedAccrualBlockNumber);
      expect(await call(aToken, 'borrowIndex')).toEqualNumber(expectedBorrowIndex);
      expect(await call(aToken, 'totalBorrows')).toEqualNumber(expectedTotalBorrows);
      expect(await call(aToken, 'totalReserves')).toEqualNumber(expectedTotalReserves);
    });
  });
});
