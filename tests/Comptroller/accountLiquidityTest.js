const {
  makeComptroller,
  makeAToken,
  enterMarkets,
  quickMint
} = require('../Utils/Atlantis');

describe('Comptroller', () => {
  let root, accounts;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('liquidity', () => {
    it("fails if a price has not been set", async () => {
      const aToken = await makeAToken({supportMarket: true});
      await enterMarkets([aToken], accounts[1]);
      let result = await call(aToken.comptroller, 'getAccountLiquidity', [accounts[1]]);
      expect(result).toHaveTrollError('PRICE_ERROR');
    });

    it("allows a borrow up to collateralFactor, but not more", async () => {
      const collateralFactor = 0.5, underlyingPrice = 1, user = accounts[1], amount = 1e6;
      const aToken = await makeAToken({supportMarket: true, collateralFactor, underlyingPrice});

      let error, liquidity, shortfall;

      // not in market yet, hypothetical borrow should have no effect
      ({1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken._address, 0, amount]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);

      await enterMarkets([aToken], user);
      await quickMint(aToken, user, amount);

      // total account liquidity after supplying `amount`
      ({1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getAccountLiquidity', [user]));
      expect(liquidity).toEqualNumber(amount * collateralFactor);
      expect(shortfall).toEqualNumber(0);

      // hypothetically borrow `amount`, should shortfall over collateralFactor
      ({1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken._address, 0, amount]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(amount * (1 - collateralFactor));

      // hypothetically redeem `amount`, should be back to even
      ({1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken._address, amount, 0]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    }, 20000);

    it("allows entering 3 markets, supplying to 2 and borrowing up to collateralFactor in the 3rd", async () => {
      const amount1 = 1e6, amount2 = 1e3, user = accounts[1];
      const cf1 = 0.5, cf2 = 0.666, cf3 = 0, up1 = 3, up2 = 2.718, up3 = 1;
      const c1 = amount1 * cf1 * up1, c2 = amount2 * cf2 * up2, collateral = Math.floor(c1 + c2);
      const aToken1 = await makeAToken({supportMarket: true, collateralFactor: cf1, underlyingPrice: up1});
      const aToken2 = await makeAToken({supportMarket: true, comptroller: aToken1.comptroller, collateralFactor: cf2, underlyingPrice: up2});
      const aToken3 = await makeAToken({supportMarket: true, comptroller: aToken1.comptroller, collateralFactor: cf3, underlyingPrice: up3});

      await enterMarkets([aToken1, aToken2, aToken3], user);
      await quickMint(aToken1, user, amount1);
      await quickMint(aToken2, user, amount2);

      let error, liquidity, shortfall;

      ({0: error, 1: liquidity, 2: shortfall} = await call(aToken3.comptroller, 'getAccountLiquidity', [user]));
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(collateral);
      expect(shortfall).toEqualNumber(0);

      ({1: liquidity, 2: shortfall} = await call(aToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken3._address, Math.floor(c2), 0]));
      expect(liquidity).toEqualNumber(collateral);
      expect(shortfall).toEqualNumber(0);

      ({1: liquidity, 2: shortfall} = await call(aToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken3._address, 0, Math.floor(c2)]));
      expect(liquidity).toEqualNumber(c1);
      expect(shortfall).toEqualNumber(0);

      ({1: liquidity, 2: shortfall} = await call(aToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken3._address, 0, collateral + c1]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(c1);

      ({1: liquidity, 2: shortfall} = await call(aToken1.comptroller, 'getHypotheticalAccountLiquidity', [user, aToken1._address, amount1, 0]));
      expect(liquidity).toEqualNumber(Math.floor(c2));
      expect(shortfall).toEqualNumber(0);
    });
  });

  describe("getAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const comptroller = await makeComptroller();
      const {0: error, 1: liquidity, 2: shortfall} = await call(comptroller, 'getAccountLiquidity', [accounts[0]]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    });
  });

  describe("getHypotheticalAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const aToken = await makeAToken();
      const {0: error, 1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getHypotheticalAccountLiquidity', [accounts[0], aToken._address, 0, 0]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    });

    it("returns collateral factor times dollar amount of tokens minted in a single market", async () => {
      const collateralFactor = 0.5, exchangeRate = 1, underlyingPrice = 1;
      const aToken = await makeAToken({supportMarket: true, collateralFactor, exchangeRate, underlyingPrice});
      const from = accounts[0], balance = 1e7, amount = 1e6;
      await enterMarkets([aToken], from);
      await send(aToken.underlying, 'harnessSetBalance', [from, balance], {from});
      await send(aToken.underlying, 'approve', [aToken._address, balance], {from});
      await send(aToken, 'mint', [amount], {from});
      const {0: error, 1: liquidity, 2: shortfall} = await call(aToken.comptroller, 'getHypotheticalAccountLiquidity', [from, aToken._address, 0, 0]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(amount * collateralFactor * exchangeRate * underlyingPrice);
      expect(shortfall).toEqualNumber(0);
    });
  });
});
