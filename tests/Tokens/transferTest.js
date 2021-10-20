const {makeAToken} = require('../Utils/Atlantis');

describe('AToken', function () {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      const aToken = await makeAToken({supportMarket: true});
      expect(await call(aToken, 'balanceOf', [root])).toEqualNumber(0);
      expect(await send(aToken, 'transfer', [accounts[0], 100])).toHaveTokenFailure('MATH_ERROR', 'TRANSFER_NOT_ENOUGH');
    });

    it("transfers 50 tokens", async () => {
      const aToken = await makeAToken({supportMarket: true});
      await send(aToken, 'harnessSetBalance', [root, 100]);
      expect(await call(aToken, 'balanceOf', [root])).toEqualNumber(100);
      await send(aToken, 'transfer', [accounts[0], 50]);
      expect(await call(aToken, 'balanceOf', [root])).toEqualNumber(50);
      expect(await call(aToken, 'balanceOf', [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const aToken = await makeAToken({supportMarket: true});
      await send(aToken, 'harnessSetBalance', [root, 100]);
      expect(await call(aToken, 'balanceOf', [root])).toEqualNumber(100);
      expect(await send(aToken, 'transfer', [root, 50])).toHaveTokenFailure('BAD_INPUT', 'TRANSFER_NOT_ALLOWED');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}});
      await send(aToken, 'harnessSetBalance', [root, 100]);
      expect(await call(aToken, 'balanceOf', [root])).toEqualNumber(100);

      await send(aToken.comptroller, 'setTransferAllowed', [false])
      expect(await send(aToken, 'transfer', [root, 50])).toHaveTrollReject('TRANSFER_COMPTROLLER_REJECTION');

      await send(aToken.comptroller, 'setTransferAllowed', [true])
      await send(aToken.comptroller, 'setTransferVerify', [false])
      // no longer support verifyTransfer on aToken end
      // await expect(send(aToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});