const {
  etherUnsigned,
  etherMantissa,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeAToken,
  balanceOf,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  preApprove,
  quickMint,
  preSupply,
  quickRedeem,
  quickRedeemUnderlying
} = require('../Utils/Atlantis');

const exchangeRate = 50e3;
const mintAmount = etherUnsigned(10e4);
const mintTokens = mintAmount.dividedBy(exchangeRate);
const redeemTokens = etherUnsigned(10e3);
const redeemAmount = redeemTokens.multipliedBy(exchangeRate);

async function preMint(aToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(aToken, minter, mintAmount);
  await send(aToken.comptroller, 'setMintAllowed', [true]);
  await send(aToken.comptroller, 'setMintVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [minter, false]);
  await send(aToken, 'harnessSetBalance', [minter, 0]);
  await send(aToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function mintFresh(aToken, minter, mintAmount) {
  return send(aToken, 'harnessMintFresh', [minter, mintAmount]);
}

async function preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
  await preSupply(aToken, redeemer, redeemTokens);
  await send(aToken.comptroller, 'setRedeemAllowed', [true]);
  await send(aToken.comptroller, 'setRedeemVerify', [true]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aToken.underlying, 'harnessSetBalance', [aToken._address, redeemAmount]);
  await send(aToken.underlying, 'harnessSetBalance', [redeemer, 0]);
  await send(aToken.underlying, 'harnessSetFailTransferToAddress', [redeemer, false]);
  await send(aToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function redeemFreshTokens(aToken, redeemer, redeemTokens, redeemAmount) {
  return send(aToken, 'harnessRedeemFresh', [redeemer, redeemTokens, 0]);
}

async function redeemFreshAmount(aToken, redeemer, redeemTokens, redeemAmount) {
  return send(aToken, 'harnessRedeemFresh', [redeemer, 0, redeemAmount]);
}

describe('AToken', function () {
  let root, minter, redeemer, accounts;
  let aToken;
  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
  });

  describe('mintFresh', () => {
    beforeEach(async () => {
      await preMint(aToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      await send(aToken.comptroller, 'setMintAllowed', [false]);
      expect(await mintFresh(aToken, minter, mintAmount)).toHaveTrollReject('MINT_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("proceeds if comptroller tells it to", async () => {
      await expect(await mintFresh(aToken, minter, mintAmount)).toSucceed();
    });

    it("fails if not fresh", async () => {
      await fastForward(aToken);
      expect(await mintFresh(aToken, minter, mintAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'MINT_FRESHNESS_CHECK');
    });

    it("continues if fresh", async () => {
      await expect(await send(aToken, 'accrueInterest')).toSucceed();
      expect(await mintFresh(aToken, minter, mintAmount)).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      expect(
        await send(aToken.underlying, 'approve', [aToken._address, 1], {from: minter})
      ).toSucceed();
      await expect(mintFresh(aToken, minter, mintAmount)).rejects.toRevert('revert Insufficient allowance');
    });

    it("fails if insufficient balance", async() => {
      await setBalance(aToken.underlying, minter, 1);
      await expect(mintFresh(aToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("proceeds if sufficient approval and balance", async () =>{
      expect(await mintFresh(aToken, minter, mintAmount)).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      expect(await send(aToken, 'harnessSetExchangeRate', [0])).toSucceed();
      await expect(mintFresh(aToken, minter, mintAmount)).rejects.toRevert('revert MINT_EXCHANGE_CALCULATION_FAILED');
    });

    it("fails if transferring in fails", async () => {
      await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [minter, true]);
      await expect(mintFresh(aToken, minter, mintAmount)).rejects.toRevert('revert TOKEN_TRANSFER_IN_FAILED');
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([aToken], [minter]);
      const result = await mintFresh(aToken, minter, mintAmount);
      const afterBalances = await getBalances([aToken], [minter]);
      expect(result).toSucceed();
      expect(result).toHaveLog('Mint', {
        minter,
        mintAmount: mintAmount.toString(),
        mintTokens: mintTokens.toString()
      });
      expect(result).toHaveLog(['Transfer', 1], {
        from: aToken._address,
        to: minter,
        amount: mintTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [aToken, minter, 'cash', -mintAmount],
        [aToken, minter, 'tokens', mintTokens],
        [aToken, 'cash', mintAmount],
        [aToken, 'tokens', mintTokens]
      ]));
    });
  });

  describe('mint', () => {
    beforeEach(async () => {
      await preMint(aToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(quickMint(aToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await send(aToken.underlying, 'harnessSetBalance', [minter, 1]);
      await expect(mintFresh(aToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      expect(await quickMint(aToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(aToken, minter)).toEqualNumber(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(aToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
        borrowIndex: "1000000000000000000",
        cashPrior: "0",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach((redeemFresh) => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("fails if comptroller tells it to", async () =>{
        await send(aToken.comptroller, 'setRedeemAllowed', [false]);
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTrollReject('REDEEM_COMPTROLLER_REJECTION');
      });

      it("fails if not fresh", async () => {
        await fastForward(aToken);
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REDEEM_FRESHNESS_CHECK');
      });

      it("continues if fresh", async () => {
        await expect(await send(aToken, 'accrueInterest')).toSucceed();
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async() => {
        await send(aToken.underlying, 'harnessSetBalance', [aToken._address, 1]);
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          expect(await send(aToken, 'harnessSetExchangeRate', [UInt256Max()])).toSucceed();
          expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_EXCHANGE_TOKENS_CALCULATION_FAILED');
        } else {
          expect(await send(aToken, 'harnessSetExchangeRate', [0])).toSucceed();
          expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_EXCHANGE_AMOUNT_CALCULATION_FAILED');
        }
      });

      it("fails if transferring out fails", async () => {
        await send(aToken.underlying, 'harnessSetFailTransferToAddress', [redeemer, true]);
        await expect(redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
      });

      it("fails if total supply < redemption amount", async () => {
        await send(aToken, 'harnessExchangeRateDetails', [0, 0, 0]);
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED');
      });

      it("reverts if new account balance underflows", async () => {
        await send(aToken, 'harnessSetBalance', [redeemer, 0]);
        expect(await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_ACCOUNT_BALANCE_CALCULATION_FAILED');
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([aToken], [redeemer]);
        const result = await redeemFresh(aToken, redeemer, redeemTokens, redeemAmount);
        const afterBalances = await getBalances([aToken], [redeemer]);
        expect(result).toSucceed();
        expect(result).toHaveLog('Redeem', {
          redeemer,
          redeemAmount: redeemAmount.toString(),
          redeemTokens: redeemTokens.toString()
        });
        expect(result).toHaveLog(['Transfer', 1], {
          from: redeemer,
          to: aToken._address,
          amount: redeemTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [aToken, redeemer, 'cash', redeemAmount],
          [aToken, redeemer, 'tokens', -redeemTokens],
          [aToken, 'cash', -redeemAmount],
          [aToken, 'tokens', -redeemTokens]
        ]));
      });
    });
  });

  describe('redeem', () => {
    beforeEach(async () => {
      await preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(quickRedeem(aToken, redeemer, redeemTokens)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await setBalance(aToken.underlying, aToken._address, 0);
      expect(await quickRedeem(aToken, redeemer, redeemTokens, {exchangeRate})).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      expect(
        await send(aToken.underlying, 'harnessSetBalance', [aToken._address, redeemAmount])
      ).toSucceed();
      expect(await quickRedeem(aToken, redeemer, redeemTokens, {exchangeRate})).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(aToken.underlying, redeemer)).toEqualNumber(redeemAmount);
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      expect(
        await send(aToken.underlying, 'harnessSetBalance', [aToken._address, redeemAmount])
      ).toSucceed();
      expect(
        await quickRedeemUnderlying(aToken, redeemer, redeemAmount, {exchangeRate})
      ).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(aToken.underlying, redeemer)).toEqualNumber(redeemAmount);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(aToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
        borrowIndex: "1000000000000000000",
        cashPrior: "500000000",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });
});
