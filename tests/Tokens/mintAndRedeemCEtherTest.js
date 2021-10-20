const {
  etherGasCost,
  etherMantissa,
  etherUnsigned,
  sendFallback
} = require('../Utils/Ethereum');

const {
  makeAToken,
  balanceOf,
  fastForward,
  setBalance,
  setEtherBalance,
  getBalances,
  adjustBalances,
} = require('../Utils/Atlantis');

const exchangeRate = 5;
const mintAmount = etherUnsigned(1e5);
const mintTokens = mintAmount.dividedBy(exchangeRate);
const redeemTokens = etherUnsigned(10e3);
const redeemAmount = redeemTokens.multipliedBy(exchangeRate);

async function preMint(aToken, minter, mintAmount, mintTokens, exchangeRate) {
  await send(aToken.comptroller, 'setMintAllowed', [true]);
  await send(aToken.comptroller, 'setMintVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function mintExplicit(aToken, minter, mintAmount) {
  return send(aToken, 'mint', [], {from: minter, value: mintAmount});
}

async function mintFallback(aToken, minter, mintAmount) {
  return sendFallback(aToken, {from: minter, value: mintAmount});
}

async function preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
  await send(aToken.comptroller, 'setRedeemAllowed', [true]);
  await send(aToken.comptroller, 'setRedeemVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
  await setEtherBalance(aToken, redeemAmount);
  await send(aToken, 'harnessSetTotalSupply', [redeemTokens]);
  await setBalance(aToken, redeemer, redeemTokens);
}

async function redeemATokens(aToken, redeemer, redeemTokens, redeemAmount) {
  return send(aToken, 'redeem', [redeemTokens], {from: redeemer});
}

async function redeemUnderlying(aToken, redeemer, redeemTokens, redeemAmount) {
  return send(aToken, 'redeemUnderlying', [redeemAmount], {from: redeemer});
}

describe('ABNB', () => {
  let root, minter, redeemer, accounts;
  let aToken;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    aToken = await makeAToken({kind: 'abnb', comptrollerOpts: {kind: 'bool'}});
    await fastForward(aToken, 1);
  });

  [mintExplicit, mintFallback].forEach((mint) => {
    describe(mint.name, () => {
      beforeEach(async () => {
        await preMint(aToken, minter, mintAmount, mintTokens, exchangeRate);
      });

      it("reverts if interest accrual fails", async () => {
        await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(mint(aToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns success from mintFresh and mints the correct number of tokens", async () => {
        const beforeBalances = await getBalances([aToken], [minter]);
        const receipt = await mint(aToken, minter, mintAmount);
        const afterBalances = await getBalances([aToken], [minter]);
        expect(receipt).toSucceed();
        expect(mintTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [aToken, 'eth', mintAmount],
          [aToken, 'tokens', mintTokens],
          [aToken, minter, 'eth', -mintAmount.plus(await etherGasCost(receipt))],
          [aToken, minter, 'tokens', mintTokens]
        ]));
      });
    });
  });

  [redeemATokens, redeemUnderlying].forEach((redeem) => {
    describe(redeem.name, () => {
      beforeEach(async () => {
        await preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("emits a redeem failure if interest accrual fails", async () => {
        await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(redeem(aToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns error from redeemFresh without emitting any extra logs", async () => {
        expect(await redeem(aToken, redeemer, redeemTokens.multipliedBy(5), redeemAmount.multipliedBy(5))).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED');
      });

      it("returns success from redeemFresh and redeems the correct amount", async () => {
        await fastForward(aToken);
        const beforeBalances = await getBalances([aToken], [redeemer]);
        const receipt = await redeem(aToken, redeemer, redeemTokens, redeemAmount);
        expect(receipt).toTokenSucceed();
        const afterBalances = await getBalances([aToken], [redeemer]);
        expect(redeemTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [aToken, 'eth', -redeemAmount],
          [aToken, 'tokens', -redeemTokens],
          [aToken, redeemer, 'eth', redeemAmount.minus(await etherGasCost(receipt))],
          [aToken, redeemer, 'tokens', -redeemTokens]
        ]));
      });
    });
  });
});
