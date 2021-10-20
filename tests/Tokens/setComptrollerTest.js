const {
  makeComptroller,
  makeAToken
} = require('../Utils/Atlantis');

describe('AToken', function () {
  let root, accounts;
  let aToken, oldComptroller, newComptroller;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    aToken = await makeAToken();
    oldComptroller = aToken.comptroller;
    newComptroller = await makeComptroller();
    expect(newComptroller._address).not.toEqual(oldComptroller._address);
  });

  describe('_setComptroller', () => {
    it("should fail if called by non-admin", async () => {
      expect(
        await send(aToken, '_setComptroller', [newComptroller._address], { from: accounts[0] })
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_COMPTROLLER_OWNER_CHECK');
      expect(await call(aToken, 'comptroller')).toEqual(oldComptroller._address);
    });

    it("reverts if passed a contract that doesn't implement isComptroller", async () => {
      await expect(send(aToken, '_setComptroller', [aToken.underlying._address])).rejects.toRevert("revert");
      expect(await call(aToken, 'comptroller')).toEqual(oldComptroller._address);
    });

    it("reverts if passed a contract that implements isComptroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badComptroller = await makeComptroller({ kind: 'false-marker' });
      await expect(send(aToken, '_setComptroller', [badComptroller._address])).rejects.toRevert("revert marker method returned false");
      expect(await call(aToken, 'comptroller')).toEqual(oldComptroller._address);
    });

    it("updates comptroller and emits log on success", async () => {
      const result = await send(aToken, '_setComptroller', [newComptroller._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewComptroller', {
        oldComptroller: oldComptroller._address,
        newComptroller: newComptroller._address
      });
      expect(await call(aToken, 'comptroller')).toEqual(newComptroller._address);
    });
  });
});
