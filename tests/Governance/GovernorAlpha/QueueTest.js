const {
  both,
  etherMantissa,
  encodeParameters,
  advanceBlocks,
  freezeTime,
  mineBlock,
  etherUnsigned
} = require('../../Utils/Ethereum');

describe('GovernorAlpha#queue/1', () => {
  let root, a1, a2, accounts;

  async function enfranchise(atlantis, atlantisVault, actor, amount) {
    await send(atlantisVault, 'delegate', [actor], { from: actor });
    await send(atlantis, 'approve', [atlantisVault._address, etherMantissa(1e10)], { from: actor });
    // in test cases, we transfer enough token to actor for convenience
    await send(atlantis, 'transfer', [actor, etherMantissa(amount)]);
    await send(atlantisVault, 'deposit', [atlantis._address, 0, etherMantissa(amount)], { from: actor });
  }

  async function makeVault(atlantis, actor) {
    const atlantisVault = await deploy('CommunityVault', []);
    const communityStore = await deploy('CommunityStore', []);
    await send(communityStore, 'setNewOwner', [atlantisVault._address], { from: actor });
    await send(atlantisVault, 'setCommunityStore', [atlantis._address, communityStore._address], { from: actor });
    await send(atlantisVault, 'add', [atlantis._address, 100, atlantis._address, etherUnsigned(1e16), 300], { from: actor }); // lock period 300s
    return atlantisVault;
  }

  beforeAll(async () => {
    [root, a1, a2, ...accounts] = saddle.accounts;
  });

  describe("overlapping actions", () => {
    it("reverts on queueing overlapping actions in same proposal", async () => {
      const timelock = await deploy('TimelockHarness', [root, 86400 * 2]);
      const atlantis = await deploy('Atlantis', [root]);
      const atlantisVault = await makeVault(atlantis, root);
      const gov = await deploy('GovernorAlpha', [timelock._address, atlantisVault._address, root]);
      const txAdmin = await send(timelock, 'harnessSetAdmin', [gov._address]);

      await enfranchise(atlantis, atlantisVault, a1, 3e6);
      await mineBlock();

      const targets = [atlantis._address, atlantis._address];
      const values = ["0", "0"];
      const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root]), encodeParameters(['address'], [root])];
      const {reply: proposalId1} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a1});
      await mineBlock();

      const txVote1 = await send(gov, 'castVote', [proposalId1, true], {from: a1});
      await advanceBlocks(90000);

      await expect(
        send(gov, 'queue', [proposalId1])
      ).rejects.toRevert("revert GovernorAlpha::_queueOrRevert: proposal action already queued at eta");
    });

    it("reverts on queueing overlapping actions in different proposals, works if waiting", async () => {
      const timelock = await deploy('TimelockHarness', [root, 86400 * 2]);
      const atlantis = await deploy('Atlantis', [root]);
      const atlantisVault = await makeVault(atlantis, root);
      const gov = await deploy('GovernorAlpha', [timelock._address, atlantisVault._address, root]);
      const txAdmin = await send(timelock, 'harnessSetAdmin', [gov._address]);

      await enfranchise(atlantis, atlantisVault, a1, 3e6);
      await enfranchise(atlantis, atlantisVault, a2, 3e6);
      await mineBlock();

      const targets = [atlantis._address];
      const values = ["0"];
      const signatures = ["getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root])];
      const {reply: proposalId1} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a1});
      const {reply: proposalId2} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a2});
      await mineBlock();

      const txVote1 = await send(gov, 'castVote', [proposalId1, true], {from: a1});
      const txVote2 = await send(gov, 'castVote', [proposalId2, true], {from: a2});
      await advanceBlocks(90000);
      await freezeTime(100);

      const txQueue1 = await send(gov, 'queue', [proposalId1]);
      await expect(
        send(gov, 'queue', [proposalId2])
      ).rejects.toRevert("revert GovernorAlpha::_queueOrRevert: proposal action already queued at eta");

      await freezeTime(101);
      const txQueue2 = await send(gov, 'queue', [proposalId2]);
    });
  });
});
