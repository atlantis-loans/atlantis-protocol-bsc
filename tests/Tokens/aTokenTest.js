const {
  etherUnsigned,
  etherMantissa,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeAToken,
  setBorrowRate,
  pretendBorrow
} = require('../Utils/Atlantis');

describe('AToken', function () {
  let root, admin, accounts;
  beforeEach(async () => {
    [root, admin, ...accounts] = saddle.accounts;
  });

  describe('constructor', () => {
    it("fails when non erc-20 underlying", async () => {
      await expect(makeAToken({ underlying: { _address: root } })).rejects.toRevert("revert");
    });

    it("fails when 0 initial exchange rate", async () => {
      await expect(makeAToken({ exchangeRate: 0 })).rejects.toRevert("revert initial exchange rate must be greater than zero.");
    });

    it("succeeds with erc-20 underlying and non-zero exchange rate", async () => {
      const aToken = await makeAToken();
      expect(await call(aToken, 'underlying')).toEqual(aToken.underlying._address);
      expect(await call(aToken, 'admin')).toEqual(root);
    });

    it("succeeds when setting admin to contructor argument", async () => {
      const aToken = await makeAToken({ admin: admin });
      expect(await call(aToken, 'admin')).toEqual(admin);
    });
  });

  describe('name, symbol, decimals', () => {
    let aToken;

    beforeEach(async () => {
      aToken = await makeAToken({ name: "AToken Foo", symbol: "cFOO", decimals: 10 });
    });

    it('should return correct name', async () => {
      expect(await call(aToken, 'name')).toEqual("AToken Foo");
    });

    it('should return correct symbol', async () => {
      expect(await call(aToken, 'symbol')).toEqual("cFOO");
    });

    it('should return correct decimals', async () => {
      expect(await call(aToken, 'decimals')).toEqualNumber(10);
    });
  });

  describe('balanceOfUnderlying', () => {
    it("has an underlying balance", async () => {
      const aToken = await makeAToken({ supportMarket: true, exchangeRate: 2 });
      await send(aToken, 'harnessSetBalance', [root, 100]);
      expect(await call(aToken, 'balanceOfUnderlying', [root])).toEqualNumber(200);
    });
  });

  describe('borrowRatePerBlock', () => {
    it("has a borrow rate", async () => {
      const aToken = await makeAToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
      const blocksPerYear = await call(aToken.interestRateModel, 'blocksPerYear');
      const perBlock = await call(aToken, 'borrowRatePerBlock');
      expect(Math.abs(perBlock * blocksPerYear - 5e16)).toBeLessThanOrEqual(1e8);
    });
  });

  describe('supplyRatePerBlock', () => {
    it("returns 0 if there's no supply", async () => {
      const aToken = await makeAToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
      const perBlock = await call(aToken, 'supplyRatePerBlock');
      await expect(perBlock).toEqualNumber(0);
    });

    it("has a supply rate", async () => {
      const baseRate = 0.05;
      const multiplier = 0.45;
      const kink = 0.95;
      const jump = 5 * multiplier;
      const aToken = await makeAToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate, multiplier, kink, jump } });
      await send(aToken, 'harnessSetReserveFactorFresh', [etherMantissa(.01)]);
      await send(aToken, 'harnessExchangeRateDetails', [1, 1, 0]);
      await send(aToken, 'harnessSetExchangeRate', [etherMantissa(1)]);
      // Full utilization (Over the kink so jump is included), 1% reserves
      const borrowRate = baseRate + multiplier * kink + jump * .05;
      const expectedSuplyRate = borrowRate * .99;

      const blocksPerYear = await call(aToken.interestRateModel, 'blocksPerYear');
      const perBlock = await call(aToken, 'supplyRatePerBlock');
      expect(Math.abs(perBlock * blocksPerYear - expectedSuplyRate * 1e18)).toBeLessThanOrEqual(1e8);
    });
  });

  describe("borrowBalanceCurrent", () => {
    let borrower;
    let aToken;

    beforeEach(async () => {
      borrower = accounts[0];
      aToken = await makeAToken();
    });

    beforeEach(async () => {
      await setBorrowRate(aToken, .001)
      await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
    });

    it("reverts if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      // make sure we accrue interest
      await send(aToken, 'harnessFastForward', [1]);
      await expect(send(aToken, 'borrowBalanceCurrent', [borrower])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns successful result from borrowBalanceStored with no interest", async () => {
      await setBorrowRate(aToken, 0);
      await pretendBorrow(aToken, borrower, 1, 1, 5e18);
      expect(await call(aToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18)
    });

    it("returns successful result from borrowBalanceCurrent with no interest", async () => {
      await setBorrowRate(aToken, 0);
      await pretendBorrow(aToken, borrower, 1, 3, 5e18);
      expect(await send(aToken, 'harnessFastForward', [5])).toSucceed();
      expect(await call(aToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18 * 3)
    });
  });

  describe("borrowBalanceStored", () => {
    let borrower;
    let aToken;

    beforeEach(async () => {
      borrower = accounts[0];
      aToken = await makeAToken({ comptrollerOpts: { kind: 'bool' } });
    });

    it("returns 0 for account with no borrows", async () => {
      expect(await call(aToken, 'borrowBalanceStored', [borrower])).toEqualNumber(0)
    });

    it("returns stored principal when account and market indexes are the same", async () => {
      await pretendBorrow(aToken, borrower, 1, 1, 5e18);
      expect(await call(aToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18);
    });

    it("returns calculated balance when market index is higher than account index", async () => {
      await pretendBorrow(aToken, borrower, 1, 3, 5e18);
      expect(await call(aToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18 * 3);
    });

    it("has undefined behavior when market index is lower than account index", async () => {
      // The market index < account index should NEVER happen, so we don't test this case
    });

    it("reverts on overflow of principal", async () => {
      await pretendBorrow(aToken, borrower, 1, 3, UInt256Max());
      await expect(call(aToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
    });

    it("reverts on non-zero stored principal with zero account index", async () => {
      await pretendBorrow(aToken, borrower, 0, 3, 5);
      await expect(call(aToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
    });
  });

  describe('exchangeRateStored', () => {
    let aToken, exchangeRate = 2;

    beforeEach(async () => {
      aToken = await makeAToken({ exchangeRate });
    });

    it("returns initial exchange rate with zero aTokenSupply", async () => {
      const result = await call(aToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(exchangeRate));
    });

    it("calculates with single aTokenSupply and single total borrow", async () => {
      const aTokenSupply = 1, totalBorrows = 1, totalReserves = 0;
      await send(aToken, 'harnessExchangeRateDetails', [aTokenSupply, totalBorrows, totalReserves]);
      const result = await call(aToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(1));
    });

    it("calculates with aTokenSupply and total borrows", async () => {
      const aTokenSupply = 100e18, totalBorrows = 10e18, totalReserves = 0;
      await send(aToken, 'harnessExchangeRateDetails', [aTokenSupply, totalBorrows, totalReserves].map(etherUnsigned));
      const result = await call(aToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(.1));
    });

    it("calculates with cash and aTokenSupply", async () => {
      const aTokenSupply = 5e18, totalBorrows = 0, totalReserves = 0;
      expect(
        await send(aToken.underlying, 'transfer', [aToken._address, etherMantissa(500)])
      ).toSucceed();
      await send(aToken, 'harnessExchangeRateDetails', [aTokenSupply, totalBorrows, totalReserves].map(etherUnsigned));
      const result = await call(aToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(100));
    });

    it("calculates with cash, borrows, reserves and aTokenSupply", async () => {
      const aTokenSupply = 500e18, totalBorrows = 500e18, totalReserves = 5e18;
      expect(
        await send(aToken.underlying, 'transfer', [aToken._address, etherMantissa(500)])
      ).toSucceed();
      await send(aToken, 'harnessExchangeRateDetails', [aTokenSupply, totalBorrows, totalReserves].map(etherUnsigned));
      const result = await call(aToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(1.99));
    });
  });

  describe('getCash', () => {
    it("gets the cash", async () => {
      const aToken = await makeAToken();
      const result = await call(aToken, 'getCash');
      expect(result).toEqualNumber(0);
    });
  });
});
