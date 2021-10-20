const {
  address,
  etherUnsigned
} = require('../Utils/Ethereum');

const tokenAmount = etherUnsigned(1e22);

describe('VaultStore', () => {
  let root, owner, notAdmin, accounts;
  let atlantis;
  let atlantisStore;
  let vault;

  beforeEach(async () => {
    [root, owner, notAdmin, ...accounts] = saddle.accounts;
    atlantis = await deploy('Atlantis', [root]);
    vault = await deploy('Vault');
    atlantisStore = await deploy('AtlantisStore', [atlantis._address]);
    await send(atlantisStore, 'setNewOwner', [owner]);
  });

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await call(atlantisStore, 'admin')).toEqual(root);
      expect(await call(atlantisStore, 'owner')).toEqual(owner);
    });
  });

  describe("atlantisBalance", () => {
    it('Get correct balance', async () => {
      await send(atlantis, 'transfer', [atlantisStore._address, tokenAmount], { from: root });
      expect(await call(atlantisStore, 'atlantisBalance')).toEqual("10000000000000000000000");
      
      await send(atlantis, 'transfer', [atlantisStore._address, tokenAmount], { from: root });
      expect(await call(atlantisStore, 'atlantisBalance')).toEqual("20000000000000000000000");
    });
  });
 
  describe("safeAtlantisTransfer", () => {
    it('Transfer atlantis to an account"', async () => {
      await send(atlantis, 'transfer', [atlantisStore._address, tokenAmount], { from: root });
      await send(atlantisStore, 'safeAtlantisTransfer', [notAdmin, tokenAmount], { from: owner });

      expect(await call(atlantisStore, 'atlantisBalance')).toEqual("0");
      expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("10000000000000000000000");
    });

    it('tranfer atlantis token', async () => {
      await expect(
        send(atlantisStore, 'safeAtlantisTransfer', [notAdmin, tokenAmount], { from: root })
      ).rejects.toRevert('revert only owner can');
    });
  });
 
});