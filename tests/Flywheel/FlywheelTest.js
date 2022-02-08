const {
  makeComptroller,
  makeAToken,
  balanceOf,
  fastForward,
  pretendBorrow,
  quickMint,
  quickBorrow,
  enterMarkets
} = require('../Utils/Atlantis');
const {
  etherExp,
  etherDouble,
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');
const { default: BigNumber } = require('bignumber.js');

const atlantisRate = etherUnsigned(1e18);
const atlantisInitialIndex = 1e36;

async function atlantisAccrued(comptroller, user) {
  return etherUnsigned(await call(comptroller, 'atlantisAccrued', [user]));
}

async function AtlantisBalance(comptroller, user) {
  return etherUnsigned(await call(comptroller.atlantis, 'balanceOf', [user]))
}

async function totalAtlantisAccrued(comptroller, user) {
  return (await atlantisAccrued(comptroller, user)).plus(await AtlantisBalance(comptroller, user));
}

describe('Flywheel upgrade', () => {
  describe('becomes the comptroller', () => {
    it('adds the atlantis markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let atlantisMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeAToken({comptroller: unitroller, supportMarket: true});
      }));
      atlantisMarkets = atlantisMarkets.map(c => c._address);
      unitroller = await makeComptroller({kind: 'unitroller-g3', unitroller, atlantisMarkets});
      expect(await call(unitroller, 'getAtlantisMarkets')).toEqual(atlantisMarkets);
    });

    it('adds the other markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let allMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeAToken({comptroller: unitroller, supportMarket: true});
      }));
      allMarkets = allMarkets.map(c => c._address);
      unitroller = await makeComptroller({
        kind: 'unitroller-g3',
        unitroller,
        atlantisMarkets: allMarkets.slice(0, 1),
        otherMarkets: allMarkets.slice(1)
      });
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets);
      expect(await call(unitroller, 'getAtlantisMarkets')).toEqual(allMarkets.slice(0, 1));
    });

    it('_supportMarket() adds to all markets, and only once', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g3'});
      let allMarkets = [];
      for (let _ of Array(10)) {
        allMarkets.push(await makeAToken({comptroller: unitroller, supportMarket: true}));
      }
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets.map(c => c._address));
      expect(
        makeComptroller({
          kind: 'unitroller-g3',
          unitroller,
          otherMarkets: [allMarkets[0]._address]
        })
      ).rejects.toRevert('revert market already added');
    });
  });
});

describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, aLOW, aREP, aZRX, aEVIL;
  beforeEach(async () => {
    let interestRateModelOpts = {borrowRate: 0.000001};
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    aLOW = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
    aREP = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
    aZRX = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
    aEVIL = await makeAToken({comptroller, supportMarket: false, underlyingPrice: 3, interestRateModelOpts});
    aUSD = await makeSToken({comptroller, supportMarket: true, underlyingPrice: 1, collateralFactor: 0.5, interestRateModelOpts});
  });

  describe('_grantAtlantis()', () => {
    beforeEach(async () => {
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
    });

    it('should award atlantis if called by admin', async () => {
      const tx = await send(comptroller, '_grantAtlantis', [a1, 100]);
      expect(tx).toHaveLog('AtlantisGranted', {
        recipient: a1,
        amount: 100
      });
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(comptroller, '_grantAtlantis', [a1, 100], {from: a1})
      ).rejects.toRevert('revert only admin can grant atlantis');
    });

    it('should revert if insufficient atlantis', async () => {
      await expect(
        send(comptroller, '_grantAtlantis', [a1, etherUnsigned(1e20)])
      ).rejects.toRevert('revert insufficient atlantis for grant');
    });
  });

  describe('getAtlantisMarkets()', () => {
    it('should return the atlantis markets', async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      expect(await call(comptroller, 'getAtlantisMarkets')).toEqual(
        [aLOW, aREP, aZRX].map((c) => c._address)
      );
    });
  });

  describe('_setAtlantisSpeeds()', () => {
    it('should update market index when calling setAtlantisSpeed', async () => {
      const mkt = aREP;
      await send(comptroller, 'setBlockNumber', [0]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);

      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await fastForward(comptroller, 20);
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(1)], [etherExp(0.5)]]);

      const {index, block} = await call(comptroller, 'atlantisSupplyState', [mkt._address]);
      expect(index).toEqualNumber(2e36);
      expect(block).toEqualNumber(20);
    });

    it('should correctly drop a atlantis market if called by admin', async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      const tx = await send(comptroller, '_setAtlantisSpeeds', [[aLOW._address], [0], [0]]);
      expect(await call(comptroller, 'getAtlantisMarkets')).toEqual(
        [aREP, aZRX].map((c) => c._address)
      );
      expect(tx).toHaveLog('AtlantisBorrowSpeedUpdated', {
        aToken: aLOW._address,
        newSpeed: 0
      });
      expect(tx).toHaveLog('AtlantisSupplySpeedUpdated', {
        aToken: aLOW._address,
        newSpeed: 0
      });
    });

    it('should correctly drop a atlantis market from middle of array', async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      await send(comptroller, '_setAtlantisSpeeds', [[sREP._address], [0], [0]]);
      expect(await call(comptroller, 'getAtlantisMarkets')).toEqual(
        [aLOW, aZRX].map((c) => c._address)
      );
    });

    it('should not drop a atlantis market unless called by admin', async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      await expect(
        send(comptroller, '_setAtlantisSpeeds', [[aLOW._address], [0], [etherExp(0.5)]], {from: a1})
      ).rejects.toRevert('revert only admin can set atlantis speed');
    });

    it('should not add non-listed markets', async () => {
      const aBAT = await makeAToken({ comptroller, supportMarket: false });
      await expect(
        send(comptroller, 'harnessAddAtlantisMarkets', [[aBAT._address]])
      ).rejects.toRevert('revert atlantis market is not listed');

      const markets = await call(comptroller, 'getAtlantisMarkets');
      expect(markets).toEqual([]);
    });
  });

  describe('updateAtlantisBorrowIndex()', () => {
    it('should calculate atlantis borrower index correctly', async () => {
      const mkt = aREP;
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await send(comptroller, 'harnessUpdateAtlantisBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        atlantisAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + atlantisAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */

      const {index, block} = await call(comptroller, 'atlantisBorrowState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not revert or update atlantisBorrowState index if aToken not in Atlantis markets', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAtlantisMarket: false,
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateAtlantisBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'atlantisBorrowState', [mkt._address]);
      expect(index).toEqualNumber(atlantisInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [mkt._address]);
      expect(supplySpeed).toEqualNumber(0);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [mkt._address]);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = aREP;
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessUpdateAtlantisBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'atlantisBorrowState', [mkt._address]);
      expect(index).toEqualNumber(atlantisInitialIndex);
      expect(block).toEqualNumber(0);
    });

    it('should not update index if atlantis speed is 0', async () => {
      const mkt = aREP;
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0)], [etherExp(0)]]);
      await send(comptroller, 'harnessUpdateAtlantisBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'atlantisBorrowState', [mkt._address]);
      expect(index).toEqualNumber(atlantisInitialIndex);
      expect(block).toEqualNumber(100);
    });
  });

  describe('updateAtlantisSupplyIndex()', () => {
    it('should calculate atlantis supplier index correctly', async () => {
      const mkt = aREP;
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, 'harnessUpdateAtlantisSupplyIndex', [mkt._address]);
      /*
        suppyTokens = 10e18
        atlantisAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += atlantisAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      const {index, block} = await call(comptroller, 'atlantisSupplyState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not update index on non-Atlantis markets', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAtlantisMarket: false
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateAtlantisSupplyIndex', [
        mkt._address
      ]);

      const {index, block} = await call(comptroller, 'atlantisSupplyState', [mkt._address]);
      expect(index).toEqualNumber(atlantisInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [mkt._address]);
      expect(supplySpeed).toEqualNumber(0);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [mkt._address]);
      expect(borrowSpeed).toEqualNumber(0);
      // atoken could have no atlantis speed or atlantis supplier state if not in atlantis markets
      // this logic could also possibly be implemented in the allowed hook
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = aREP;
      await send(comptroller, 'setBlockNumber', [0]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, '_setAtlantisSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessUpdateAtlantisSupplyIndex', [mkt._address]);

      const {index, block} = await call(comptroller, 'atlantisSupplyState', [mkt._address]);
      expect(index).toEqualNumber(atlantisInitialIndex);
      expect(block).toEqualNumber(0);
    });

    it('should not matter if the index is updated multiple times', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100)
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');

      await quickMint(aLOW, a2, etherUnsigned(10e18));
      await quickMint(aLOW, a3, etherUnsigned(15e18));

      const a2Accrued0 = await totalAtlantisAccrued(comptroller, a2);
      const a3Accrued0 = await totalAtlantisAccrued(comptroller, a3);
      const a2Balance0 = await balanceOf(aLOW, a2);
      const a3Balance0 = await balanceOf(aLOW, a3);

      await fastForward(comptroller, 20);

      const txT1 = await send(aLOW, 'transfer', [a2, a3Balance0.minus(a2Balance0)], {from: a3});

      const a2Accrued1 = await totalAtlantisAccrued(comptroller, a2);
      const a3Accrued1 = await totalAtlantisAccrued(comptroller, a3);
      const a2Balance1 = await balanceOf(aLOW, a2);
      const a3Balance1 = await balanceOf(aLOW, a3);

      await fastForward(comptroller, 10);
      await send(comptroller, 'harnessUpdateAtlantisSupplyIndex', [aLOW._address]);
      await fastForward(comptroller, 10);

      const txT2 = await send(aLOW, 'transfer', [a3, a2Balance1.minus(a3Balance1)], {from: a2});

      const a2Accrued2 = await totalAtlantisAccrued(comptroller, a2);
      const a3Accrued2 = await totalAtlantisAccrued(comptroller, a3);

      expect(a2Accrued0).toEqualNumber(0);
      expect(a3Accrued0).toEqualNumber(0);
      expect(a2Accrued1).not.toEqualNumber(0);
      expect(a3Accrued1).not.toEqualNumber(0);
      expect(a2Accrued1).toEqualNumber(a3Accrued2.minus(a3Accrued1));
      expect(a3Accrued1).toEqualNumber(a2Accrued2.minus(a2Accrued1));

      expect(txT1.gasUsed).toBeLessThan(200000);
      expect(txT1.gasUsed).toBeGreaterThan(140000);
      expect(txT2.gasUsed).toBeLessThan(150000);
      expect(txT2.gasUsed).toBeGreaterThan(100000);
    });
  });

  describe('distributeBorrowerAtlantis()', () => {

    it('should update borrow index checkpoint but not atlantisAccrued for first time user', async () => {
      const mkt = aREP;
      await send(comptroller, "setAtlantisBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAtlantisBorrowerIndex", [mkt._address, root, etherUnsigned(0)]);

      await send(comptroller, "harnessDistributeBorrowerAtlantis", [mkt._address, root, etherExp(1.1)]);
      expect(await call(comptroller, "atlantisAccrued", [root])).toEqualNumber(0);
      expect(await call(comptroller, "atlantisBorrowerIndex", [ mkt._address, root])).toEqualNumber(6e36);
    });

    it('should transfer atlantis and update borrow index checkpoint correctly for repeat time user', async () => {
      const mkt = aREP;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(comptroller, "setAtlantisBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAtlantisBorrowerIndex", [mkt._address, a1, etherDouble(1)]);

      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 atlantisBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 25e18 Atlantis
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e18 * 1e18 / 1.1e18 = 5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e18 * 5e36 / 1e36 = 25e18
      */
      const tx = await send(comptroller, "harnessDistributeBorrowerAtlantis", [mkt._address, a1, etherUnsigned(1.1e18)]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(25e18);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerAtlantis', {
        aToken: mkt._address,
        borrower: a1,
        atlantisDelta: etherUnsigned(25e18).toFixed(),
        atlantisBorrowIndex: etherDouble(6).toFixed()
      });
    });

    it('should not transfer atlantis automatically', async () => {
      const mkt = aREP;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e17), etherExp(1)]);
      await send(comptroller, "setAtlantisBorrowState", [mkt._address, etherDouble(1.0019), 10]);
      await send(comptroller, "setAtlantisBorrowerIndex", [mkt._address, a1, etherDouble(1)]);
      /*
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e17 * 1e18 / 1.1e18 = 5e17
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 1.0019e36 - 1e36 = 0.0019e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
        0.00095e18 < atlClaimThreshold of 0.001e18
      */
      await send(comptroller, "harnessDistributeBorrowerAtlantis", [mkt._address, a1, etherExp(1.1)]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-Atlantis market', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAtlantisMarket: false,
      });

      await send(comptroller, "harnessDistributeBorrowerAtlantis", [mkt._address, a1, etherExp(1.1)]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'atlantisBorrowerIndex', [mkt._address, a1])).toEqualNumber(atlantisInitialIndex);
    });
  });

  describe('distributeSupplierAtlantis()', () => {
    it('should transfer atlantis and update supply index correctly for first time user', async () => {
      const mkt = aREP;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setAtlantisSupplyState", [mkt._address, etherDouble(6), 10]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 atlantisSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 Atlantis:
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 1e36 = 5e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 5e36 / 1e36 = 25e18
      */

      const tx = await send(comptroller, "harnessDistributeAllSupplierAtlantis", [mkt._address, a1]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(25e18);
      expect(tx).toHaveLog('DistributedSupplierAtlantis', {
        aToken: mkt._address,
        supplier: a1,
        atlantisDelta: etherUnsigned(25e18).toFixed(),
        atlantisSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should update atlantis accrued and supply index for repeat user', async () => {
      const mkt = aREP;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setAtlantisSupplyState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAtlantisSupplierIndex", [mkt._address, a1, etherDouble(2)])
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */

      await send(comptroller, "harnessDistributeAllSupplierAtlantis", [mkt._address, a1]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(20e18);
    });

    it('should not transfer when atlantisAccrued below threshold', async () => {
      const mkt = aREP;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e17)]);
      await send(comptroller, "setAtlantisSupplyState", [mkt._address, etherDouble(1.0019), 10]);
      /*
        supplierAmount  = 5e17
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 1.0019e36 - 1e36 = 0.0019e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
      */

      await send(comptroller, "harnessDistributeSupplierAtlantis", [mkt._address, a1]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-Atlantis market', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAtlantisMarket: false,
      });

      await send(comptroller, "harnessDistributeSupplierAtlantis", [mkt._address, a1]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'atlantisBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
    });

  });

  describe('transferAtl', () => {
    it('should transfer atlantis accrued when amount is above threshold', async () => {
      const atlantisRemaining = 1000, a1AccruedPre = 100, threshold = 1;
      const AtlantisBalancePre = await AtlantisBalance(comptroller, a1);
      const tx0 = await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAtlantisAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAtlantis', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await atlantisAccrued(comptroller, a1);
      const AtlantisBalancePost = await AtlantisBalance(comptroller, a1);
      expect(AtlantisBalancePre).toEqualNumber(0);
      expect(AtlantisBalancePost).toEqualNumber(a1AccruedPre);
    });

    it('should not transfer when atlantis accrued is below threshold', async () => {
      const atlantisRemaining = 1000, a1AccruedPre = 100, threshold = 101;
      const AtlantisBalancePre = await call(comptroller.atlantis, 'balanceOf', [a1]);
      const tx0 = await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAtlantisAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAtlantis', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await atlantisAccrued(comptroller, a1);
      const AtlantisBalancePost = await AtlantisBalance(comptroller, a1);
      expect(AtlantisBalancePre).toEqualNumber(0);
      expect(AtlantisBalancePost).toEqualNumber(0);
    });

    it('should not transfer atlantis if atlantis accrued is greater than atlantis remaining', async () => {
      const atlantisRemaining = 99, a1AccruedPre = 100, threshold = 1;
      const AtlantisBalancePre = await AtlantisBalance(comptroller, a1);
      const tx0 = await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAtlantisAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAtlantis', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await atlantisAccrued(comptroller, a1);
      const AtlantisBalancePost = await AtlantisBalance(comptroller, a1);
      expect(AtlantisBalancePre).toEqualNumber(0);
      expect(AtlantisBalancePost).toEqualNumber(0);
    });
  });

  describe('claimAtlantis', () => {
    it('should accrue atlantis and then transfer atlantis accrued', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, '_setAtlantisSpeeds', [[aLOW._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      const a2AccruedPre = await atlantisAccrued(comptroller, a2);
      const AtlantisBalancePre = await AtlantisBalance(comptroller, a2);
      await quickMint(aLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimAtlantis', [a2]);
      const a2AccruedPost = await atlantisAccrued(comptroller, a2);
      const AtlantisBalancePost = await AtlantisBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(500000);
      expect(supplySpeed).toEqualNumber(atlantisRate);
      expect(borrowSpeed).toEqualNumber(atlantisRate);
      expect(speed).toEqualNumber(atlantisRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(AtlantisBalancePre).toEqualNumber(0);
      expect(AtlantisBalancePost).toEqualNumber(atlantisRate.multipliedBy(deltaBlocks).minus(1)); // index is 8333...
    });

    it('should accrue atlantis and then transfer atlantis accrued in a single market', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      const a2AccruedPre = await atlantisAccrued(comptroller, a2);
      const AtlantisBalancePre = await AtlantisBalance(comptroller, a2);
      await quickMint(aLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimAtlantis', [a2, [aLOW._address]]);
      const a2AccruedPost = await atlantisAccrued(comptroller, a2);
      const AtlantisBalancePost = await AtlantisBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(170000);
      expect(supplySpeed).toEqualNumber(atlantisRate);
      expect(borrowSpeed).toEqualNumber(atlantisRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(AtlantisBalancePre).toEqualNumber(0);
      expect(AtlantisBalancePost).toEqualNumber(atlantisRate.multipliedBy(deltaBlocks).minus(1)); // index is 8333...
    });

    it('should claim when atlantis accrued is below threshold', async () => {
      const atlantisRemaining = etherExp(1), accruedAmt = etherUnsigned(0.0009e18)
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      await send(comptroller, 'setAtlantisAccrued', [a1, accruedAmt]);
      await send(comptroller, 'claimAtlantis', [a1, [aLOW._address]]);
      expect(await atlantisAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await AtlantisBalance(comptroller, a1)).toEqualNumber(accruedAmt);
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeAToken({comptroller});
      await expect(
        send(comptroller, 'claimAtlantis', [a1, [cNOT._address]])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('claimAtlantis batch', () => {
    it('should revert when claiming atlantis from non-listed market', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;

      for(let from of claimAccts) {
        expect(await send(aLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(aLOW.underlying, 'approve', [aLOW._address, mintAmount], { from });
        send(aLOW, 'mint', [mintAmount], { from });
      }

      await pretendBorrow(aLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');

      await fastForward(comptroller, deltaBlocks);

      await expect(send(comptroller, 'claimAtlantis', [claimAccts, [aLOW._address, aEVIL._address], true, true])).rejects.toRevert('revert market must be listed');
    });

    it('should claim the expected amount when holders and atokens arg is duplicated', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(aLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(aLOW.underlying, 'approve', [aLOW._address, mintAmount], { from });
        send(aLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(aLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimAtlantis', [[...claimAccts, ...claimAccts], [aLOW._address, aLOW._address], false, true]);
      // atlantis distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'atlantisSupplierIndex', [aLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await AtlantisBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims atlantis for multiple suppliers only', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(aLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(aLOW.underlying, 'approve', [aLOW._address, mintAmount], { from });
        send(aLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(aLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimAtlantis', [claimAccts, [aLOW._address], false, true]);
      // atlantis distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'atlantisSupplierIndex', [aLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await AtlantisBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims atlantis for multiple borrowers only, primes uninitiated', async () => {
      const atlantisRemaining = atlantisRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10), borrowAmt = etherExp(1), borrowIdx = etherExp(1)
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining], {from: root});
      let [_,__, ...claimAccts] = saddle.accounts;

      for(let acct of claimAccts) {
        await send(aLOW, 'harnessIncrementTotalBorrows', [borrowAmt]);
        await send(aLOW, 'harnessSetAccountBorrows', [acct, borrowAmt, borrowIdx]);
      }
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');

      await send(comptroller, 'harnessFastForward', [10]);

      const tx = await send(comptroller, 'claimAtlantis', [claimAccts, [aLOW._address], true, false]);
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'atlantisBorrowerIndex', [aLOW._address, acct])).toEqualNumber(etherDouble(2.25));
        expect(await call(comptroller, 'atlantisSupplierIndex', [aLOW._address, acct])).toEqualNumber(0);
      }
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeAToken({comptroller});
      await expect(
        send(comptroller, 'claimAtlantis', [[a1, a2], [cNOT._address], true, true])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('harnessRefreshAtlantisSpeeds', () => {
    it('should start out 0', async () => {
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      expect(supplySpeed).toEqualNumber(0);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it('should get correct speeds with borrows', async () => {
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      const tx = await send(comptroller, 'harnessRefreshAtlantisSpeeds');
      const supplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const borrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      expect(supplySpeed).toEqualNumber(atlantisRate);
      expect(borrowSpeed).toEqualNumber(atlantisRate);
      expect(tx).toHaveLog(['AtlantisBorrowSpeedUpdated', 0], {
        aToken: aLOW._address,
        newSpeed: borrowSpeed
      });
      expect(tx).toHaveLog(['AtlantisSupplySpeedUpdated', 0], {
        aToken: aLOW._address,
        newSpeed: supplySpeed
      });
    });

    it('should get correct speeds for 2 assets', async () => {
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await pretendBorrow(aZRX, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address, aZRX._address]]);
      await send(comptroller, 'harnessRefreshAtlantisSpeeds');
      const supplySpeed1 = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const borrowSpeed1 = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      const supplySpeed2 = await call(comptroller, 'atlantisSupplySpeeds', [aREP._address]);
      const borrowSpeed2 = await call(comptroller, 'atlantisBorrowSpeeds', [aREP._address]);
      const supplySpeed3 = await call(comptroller, 'atlantisSupplySpeeds', [aZRX._address]);
      const borrowSpeed3 = await call(comptroller, 'atlantisBorrowSpeeds', [aZRX._address]);
      const atlantisRateBN = new BigNumber(atlantisRate.toString());
      expect(supplySpeed1).toEqualNumber(atlantisRateBN.dividedBy(4));
      expect(borrowSpeed1).toEqualNumber(atlantisRateBN.dividedBy(4));
      expect(supplySpeed2).toEqualNumber(0);
      expect(borrowSpeed2).toEqualNumber(0);
      expect(supplySpeed3).toEqualNumber(atlantisRateBN.dividedBy(4).multipliedBy(3));
      expect(borrowSpeed3).toEqualNumber(atlantisRateBN.dividedBy(4).multipliedBy(3));
    });
  });

  describe('harnessSetAtlantisSpeeds', () => {
    it('should correctly set differing Atlantis supply and borrow speeds', async () => {
      const desiredAtlantisSupplySpeed = 3;
      const desiredAtlantisBorrowSpeed = 20;
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address]]);
      const tx = await send(comptroller, '_setAtlantisSpeeds', [[aLOW._address], [desiredAtlantisSupplySpeed], [desiredAtlantisBorrowSpeed]]);
      expect(tx).toHaveLog(['AtlantisBorrowSpeedUpdated', 0], {
        aToken: aLOW._address,
        newSpeed: desiredAtlantisBorrowSpeed
      });
      expect(tx).toHaveLog(['AtlantisSupplySpeedUpdated', 0], {
        aToken: aLOW._address,
        newSpeed: desiredAtlantisSupplySpeed
      });
      const currentAtlantisSupplySpeed = await call(comptroller, 'atlantisSupplySpeeds', [aLOW._address]);
      const currentAtlantisBorrowSpeed = await call(comptroller, 'atlantisBorrowSpeeds', [aLOW._address]);
      expect(currentAtlantisSupplySpeed).toEqualNumber(desiredAtlantisSupplySpeed);
      expect(currentAtlantisBorrowSpeed).toEqualNumber(desiredAtlantisBorrowSpeed);
    });

    it('should correctly get differing Atlantis supply and borrow speeds for 4 assets', async () => {
      const aBAT = await makeSToken({ comptroller, supportMarket: true });
      const aDAI = await makeSToken({ comptroller, supportMarket: true });

      const borrowSpeed1 = 5;
      const supplySpeed1 = 10;

      const borrowSpeed2 = 0;
      const supplySpeed2 = 100;

      const borrowSpeed3 = 0;
      const supplySpeed3 = 0;

      const borrowSpeed4 = 13;
      const supplySpeed4 = 0;

      await send(comptroller, 'harnessAddAtlantisMarkets', [[aREP._address, aZRX._address, aBAT._address, aDAI._address]]);
      await send(comptroller, '_setAtlantisSpeeds', [[aREP._address, aZRX._address, aBAT._address, aDAI._address], [supplySpeed1, supplySpeed2, supplySpeed3, supplySpeed4], [borrowSpeed1, borrowSpeed2, borrowSpeed3, borrowSpeed4]]);

      const currentSupplySpeed1 = await call(comptroller, 'atlantisSupplySpeeds', [aREP._address]);
      const currentBorrowSpeed1 = await call(comptroller, 'atlantisBorrowSpeeds', [aREP._address]);
      const currentSupplySpeed2 = await call(comptroller, 'atlantisSupplySpeeds', [aZRX._address]);
      const currentBorrowSpeed2 = await call(comptroller, 'atlantisBorrowSpeeds', [aZRX._address]);
      const currentSupplySpeed3 = await call(comptroller, 'atlantisSupplySpeeds', [aBAT._address]);
      const currentBorrowSpeed3 = await call(comptroller, 'atlantisBorrowSpeeds', [aBAT._address]);
      const currentSupplySpeed4 = await call(comptroller, 'atlantisSupplySpeeds', [aDAI._address]);
      const currentBorrowSpeed4 = await call(comptroller, 'atlantisBorrowSpeeds', [aDAI._address]);

      expect(currentSupplySpeed1).toEqualNumber(supplySpeed1);
      expect(currentBorrowSpeed1).toEqualNumber(borrowSpeed1);
      expect(currentSupplySpeed2).toEqualNumber(supplySpeed2);
      expect(currentBorrowSpeed2).toEqualNumber(borrowSpeed2);
      expect(currentSupplySpeed3).toEqualNumber(supplySpeed3);
      expect(currentBorrowSpeed3).toEqualNumber(borrowSpeed3);
      expect(currentSupplySpeed4).toEqualNumber(supplySpeed4);
      expect(currentBorrowSpeed4).toEqualNumber(borrowSpeed4);
    });

    const checkAccrualsBorrowAndSupply = async (atlantisSupplySpeed, atlantisBorrowSpeed) => {
      const atlantisRateBN = new BigNumber(atlantisRate.toString());
      const mintAmount = etherUnsigned(1000e18), borrowAmount = etherUnsigned(1e18), borrowCollateralAmount = etherUnsigned(1000e18), atlantisRemaining = atlantisRateBN.multipliedBy(100), deltaBlocks = 10;

      // Transfer Atlantis to the comptroller
      await send(comptroller.atlantis, 'transfer', [comptroller._address, atlantisRemaining.toString()], {from: root});

      // Setup comptroller
      await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address, aUSD._address]]);

      // Set comp speeds to 0 while we setup
      await send(comptroller, '_setAtlantisSpeeds', [[aLOW._address, aUSD._address], [0, 0], [0, 0]]);

      // a2 - supply
      await quickMint(aLOW, a2, mintAmount); // a2 is the supplier

      // a1 - borrow (with supplied collateral)
      await quickMint(aUSD, a1, borrowCollateralAmount);
      await enterMarkets([aUSD], a1);
      await quickBorrow(aLOW, a1, borrowAmount); // a1 is the borrower

      // Initialize atlantis speeds
      await send(comptroller, '_setAtlantisSpeeds', [[aLOW._address], [atlantisSupplySpeed], [atlantisBorrowSpeed]]);

      // Get initial Atlantis balances
      const a1TotalAtlantisPre = await totalAtlantisAccrued(comptroller, a1);
      const a2TotalAtlantisPre = await totalAtlantisAccrued(comptroller, a2);

      // Start off with no Atlantis accrued and no Atlantis balance
      expect(a1TotalAtlantisPre).toEqualNumber(0);
      expect(a2TotalAtlantisPre).toEqualNumber(0);

      // Fast forward blocks
      await fastForward(comptroller, deltaBlocks);

      // Accrue COMP
      await send(comptroller, 'claimAtlantis', [[a1, a2], [aLOW._address], true, true]);

      // Get accrued Atlantis balances
      const a1TotalAtlantisPost = await totalAtlantisAccrued(comptroller, a1);
      const a2TotalAtlantisPost = await totalAtlantisAccrued(comptroller, a2);

      // check accrual for borrow
      const atlantisBorrowSpeedBN = new BigNumber(atlantisBorrowSpeed.toString());
      expect(a1TotalAtlantisPost).toEqualNumber(Number(atlantisBorrowSpeed) > 0 ? atlantisBorrowSpeedBN.multipliedBy(deltaBlocks).minus(1) : 0);

      // check accrual for supply
      const atlantisSupplySpeedBN = new BigNumber(atlantisSupplySpeed.toString());
      expect(a2TotalAtlantisPost).toEqualNumber(Number(atlantisSupplySpeed) > 0 ? atlantisSupplySpeedBN.multipliedBy(deltaBlocks) : 0);
    };

    it('should accrue atlantis correctly with only supply-side rewards', async () => {
      await checkAccrualsBorrowAndSupply(/* supply speed */ etherExp(0.5), /* borrow speed */ etherExp(0));
    });

    it('should accrue atlantis correctly with only borrow-side rewards', async () => {
      await checkAccrualsBorrowAndSupply(/* supply speed */ 0, /* borrow speed */ etherExp(0.5));
    });
  });

  describe('harnessAddAtlantisMarkets', () => {
    it('should correctly add a atlantis market if called by admin', async () => {
      const aBAT = await makeAToken({comptroller, supportMarket: true});
      const tx1 = await send(comptroller, 'harnessAddAtlantisMarkets', [[aLOW._address, aREP._address, aZRX._address]]);
      const tx2 = await send(comptroller, 'harnessAddAtlantisMarkets', [[aBAT._address]]);
      const markets = await call(comptroller, 'getAtlantisMarkets');
      expect(markets).toEqual([aLOW, aREP, aZRX, aBAT].map((c) => c._address));
      expect(tx2).toHaveLog('AtlantisSpeedUpdated', {
        aToken: aBAT._address,
        newSpeed: 1
      });
    });

    it('should not write over a markets existing state', async () => {
      const mkt = aLOW._address;
      const bn0 = 10, bn1 = 20;
      const idx = etherUnsigned(1.5e36);

      await send(comptroller, "harnessAddAtlantisMarkets", [[mkt]]);
      await send(comptroller, "setAtlantisSupplyState", [mkt, idx, bn0]);
      await send(comptroller, "setAtlantisBorrowState", [mkt, idx, bn0]);
      await send(comptroller, "setBlockNumber", [bn1]);
      await send(comptroller, "_setAtlantisSpeed", [mkt, 0]);
      await send(comptroller, "harnessAddAtlantisMarkets", [[mkt]]);

      const supplyState = await call(comptroller, 'atlantisSupplyState', [mkt]);
      expect(supplyState.block).toEqual(bn1.toString());
      expect(supplyState.index).toEqual(idx.toFixed());

      const borrowState = await call(comptroller, 'atlantisBorrowState', [mkt]);
      expect(borrowState.block).toEqual(bn1.toString());
      expect(borrowState.index).toEqual(idx.toFixed());
    });
  });


  describe('updateContributorRewards', () => {
    it('should not fail when contributor rewards called on non-contributor', async () => {
      const tx1 = await send(comptroller, 'updateContributorRewards', [a1]);
    });

    it('should accrue atlantis to contributors', async () => {
      const tx1 = await send(comptroller, '_setContributorAtlantisSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const a1Accrued = await atlantisAccrued(comptroller, a1);
      expect(a1Accrued).toEqualNumber(0);

      const tx2 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued2 = await atlantisAccrued(comptroller, a1);
      expect(a1Accrued2).toEqualNumber(50 * 2000);
    });

    it('should accrue atlantis with late set', async () => {
      await fastForward(comptroller, 1000);
      const tx1 = await send(comptroller, '_setContributorAtlantisSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const tx2 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued2 = await atlantisAccrued(comptroller, a1);
      expect(a1Accrued2).toEqualNumber(50 * 2000);
    });
  });

  describe('_setContributorAtlantisSpeed', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(comptroller, '_setContributorAtlantisSpeed', [a1, 1000], {from: a1})
      ).rejects.toRevert('revert only admin can set atlantis speed');
    });

    it('should start atlantis stream if called by admin', async () => {
      const tx = await send(comptroller, '_setContributorAtlantisSpeed', [a1, 1000]);
      expect(tx).toHaveLog('ContributorAtlantisSpeedUpdated', {
        contributor: a1,
        newSpeed: 1000
      });
    });

    it('should reset atlantis stream if set to 0', async () => {
      const tx1 = await send(comptroller, '_setContributorAtlantisSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const tx2 = await send(comptroller, '_setContributorAtlantisSpeed', [a1, 0]);
      await fastForward(comptroller, 50);

      const tx3 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued = await atlantisAccrued(comptroller, a1);
      expect(a1Accrued).toEqualNumber(50 * 2000);
    });
  });
});
