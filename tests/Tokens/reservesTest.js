const {
  etherUnsigned,
  etherMantissa,
  both,
  etherExp
} = require('../Utils/Ethereum');

const {fastForward, makeAToken, getBalances, adjustBalances} = require('../Utils/Atlantis');

const factor = etherMantissa(.02);

const reserves = etherUnsigned(3e12);
const cash = etherUnsigned(reserves.multipliedBy(2));
const reduction = etherUnsigned(2e12);

describe('AToken', function () {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('_setReserveFactorFresh', () => {
    let aToken;
    beforeEach(async () => {
      aToken = await makeAToken();
    });

    it("rejects change by non-admin", async () => {
      expect(
        await send(aToken, 'harnessSetReserveFactorFresh', [factor], {from: accounts[0]})
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_RESERVE_FACTOR_ADMIN_CHECK');
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("rejects change if market not fresh", async () => {
      expect(await send(aToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(aToken, 'harnessSetReserveFactorFresh', [factor])).toHaveTokenFailure('MARKET_NOT_FRESH', 'SET_RESERVE_FACTOR_FRESH_CHECK');
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("rejects newReserveFactor that descales to 1", async () => {
      expect(await send(aToken, 'harnessSetReserveFactorFresh', [etherMantissa(1.01)])).toHaveTokenFailure('BAD_INPUT', 'SET_RESERVE_FACTOR_BOUNDS_CHECK');
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("accepts newReserveFactor in valid range and emits log", async () => {
      const result = await send(aToken, 'harnessSetReserveFactorFresh', [factor])
      expect(result).toSucceed();
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(factor);
      expect(result).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: '0',
        newReserveFactorMantissa: factor.toString(),
      });
    });

    it("accepts a change back to zero", async () => {
      const result1 = await send(aToken, 'harnessSetReserveFactorFresh', [factor]);
      const result2 = await send(aToken, 'harnessSetReserveFactorFresh', [0]);
      expect(result1).toSucceed();
      expect(result2).toSucceed();
      expect(result2).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: factor.toString(),
        newReserveFactorMantissa: '0',
      });
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });
  });

  describe('_setReserveFactor', () => {
    let aToken;
    beforeEach(async () => {
      aToken = await makeAToken();
    });

    beforeEach(async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
      await send(aToken, '_setReserveFactor', [0]);
    });

    it("emits a reserve factor failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(aToken, 1);
      await expect(send(aToken, '_setReserveFactor', [factor])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("returns error from setReserveFactorFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(aToken, '_setReserveFactor', [etherMantissa(2)]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'SET_RESERVE_FACTOR_BOUNDS_CHECK');
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("returns success from setReserveFactorFresh", async () => {
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(0);
      expect(await send(aToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(aToken, '_setReserveFactor', [factor])).toSucceed();
      expect(await call(aToken, 'reserveFactorMantissa')).toEqualNumber(factor);
    });
  });

  describe("_reduceReservesFresh", () => {
    let aToken;
    beforeEach(async () => {
      aToken = await makeAToken();
      expect(await send(aToken, 'harnessSetTotalReserves', [reserves])).toSucceed();
      expect(
        await send(aToken.underlying, 'harnessSetBalance', [aToken._address, cash])
      ).toSucceed();
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(aToken, 'harnessReduceReservesFresh', [reduction], {from: accounts[0]})
      ).toHaveTokenFailure('UNAUTHORIZED', 'REDUCE_RESERVES_ADMIN_CHECK');
      expect(await call(aToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if market not fresh", async () => {
      expect(await send(aToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(aToken, 'harnessReduceReservesFresh', [reduction])).toHaveTokenFailure('MARKET_NOT_FRESH', 'REDUCE_RESERVES_FRESH_CHECK');
      expect(await call(aToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if amount exceeds reserves", async () => {
      expect(await send(aToken, 'harnessReduceReservesFresh', [reserves.plus(1)])).toHaveTokenFailure('BAD_INPUT', 'REDUCE_RESERVES_VALIDATION');
      expect(await call(aToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if amount exceeds available cash", async () => {
      const cashLessThanReserves = reserves.minus(2);
      await send(aToken.underlying, 'harnessSetBalance', [aToken._address, cashLessThanReserves]);
      expect(await send(aToken, 'harnessReduceReservesFresh', [reserves])).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDUCE_RESERVES_CASH_NOT_AVAILABLE');
      expect(await call(aToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("increases admin balance and reduces reserves on success", async () => {
      const balance = etherUnsigned(await call(aToken.underlying, 'balanceOf', [root]));
      expect(await send(aToken, 'harnessReduceReservesFresh', [reserves])).toSucceed();
      expect(await call(aToken.underlying, 'balanceOf', [root])).toEqualNumber(balance.plus(reserves));
      expect(await call(aToken, 'totalReserves')).toEqualNumber(0);
    });

    it("emits an event on success", async () => {
      const result = await send(aToken, 'harnessReduceReservesFresh', [reserves]);
      expect(result).toHaveLog('ReservesReduced', {
        admin: root,
        reduceAmount: reserves.toString(),
        newTotalReserves: '0'
      });
    });
  });

  describe("_reduceReserves", () => {
    let aToken;
    beforeEach(async () => {
      aToken = await makeAToken();
      await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
      expect(await send(aToken, 'harnessSetTotalReserves', [reserves])).toSucceed();
      expect(
        await send(aToken.underlying, 'harnessSetBalance', [aToken._address, cash])
      ).toSucceed();
    });

    it("emits a reserve-reduction failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(aToken, 1);
      await expect(send(aToken, '_reduceReserves', [reduction])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from _reduceReservesFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(aToken, 'harnessReduceReservesFresh', [reserves.plus(1)]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'REDUCE_RESERVES_VALIDATION');
    });

    it("returns success code from _reduceReservesFresh and reduces the correct amount", async () => {
      expect(await call(aToken, 'totalReserves')).toEqualNumber(reserves);
      expect(await send(aToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(aToken, '_reduceReserves', [reduction])).toSucceed();
    });
  });

  describe("ABNB addReserves", () => {
    let aToken;
    beforeEach(async () => {
      aToken = await makeAToken({kind: 'abnb'});
    });

    it("add reserves for ABNB", async () => {
      const balanceBefore = await getBalances([aToken], [])
      const reservedAdded = etherExp(1);
      const result = await send(aToken, "_addReserves", {value: reservedAdded}); //assert no erro
      expect(result).toSucceed();
      expect(result).toHaveLog('ReservesAdded', {
        benefactor: root,
        addAmount: reservedAdded.toString(),
        newTotalReserves: reservedAdded.toString()
      });
      const balanceAfter = await getBalances([aToken], []);
      expect(balanceAfter).toEqual(await adjustBalances(balanceBefore, [
        [aToken, aToken._address, 'eth', reservedAdded],
        [aToken, aToken._address, 'reserves', reservedAdded]
      ]));
    });
  });
});
