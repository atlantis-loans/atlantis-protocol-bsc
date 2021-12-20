const {
  address,
  etherMantissa,
  encodeParameters,
  mineBlock,
  etherUnsigned
} = require('../../Utils/Ethereum');

describe('GovernorAlpha#propose/5', () => {
  let gov, root, acct, atlantis, atlantisVault;
    
  async function enfranchise(actor, amount) {
    await send(atlantisVault, 'delegate', [actor], { from: actor });
    await send(atlantis, 'approve', [atlantisVault._address, etherMantissa(1e10)], { from: actor });
    // in test cases, we transfer enough token to actor for convenience
    await send(atlantis, 'transfer', [actor, etherMantissa(amount)]);
    await send(atlantisVault, 'deposit', [atlantis._address, 0, etherMantissa(amount)], { from: actor });
  }

  beforeAll(async () => {
    [root, acct, ...accounts] = accounts;
    
    atlantisVault = await deploy('CommunityVault', []);
    communityStore = await deploy('CommunityStore', []);
    atlantis = await deploy('Atlantis', [root]);

    await send(communityStore, 'setNewOwner', [atlantisVault._address], { from: root });
    await send(atlantisVault, 'setCommunityStore', [atlantis._address, communityStore._address], { from: root });
    // address _rewardToken, uint256 _allocPoint, IBEP20 _token, uint256 _rewardPerBlock, uint256 _lockPeriod
    await send(atlantisVault, 'add', [atlantis._address, 100, atlantis._address, etherUnsigned(1e16), 300], { from: root }); // lock period 300s
    await send(atlantisVault, 'delegate', [root]);

    gov = await deploy('GovernorAlpha', [address(0), atlantisVault._address, root]);
  });

  let trivialProposal, targets, values, signatures, callDatas;
  let proposalBlock;
  let votingDelay;
  let votingPeriod;
  beforeAll(async () => {
    targets = [root];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [acct])];
    await enfranchise(root, 400000);
    await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    proposalBlock = +(await web3.eth.getBlockNumber());
    proposalId = await call(gov, 'latestProposalIds', [root]);
    trivialProposal = await call(gov, "proposals", [proposalId]);
    votingDelay = Number(await call(gov, 'votingDelay'));
    votingPeriod = Number(await call(gov, 'votingPeriod'));
  });

  it("Given the sender's GetPriorVotes for the immediately previous block is above the Proposal Threshold (e.g. 2%), the given proposal is added to all proposals, given the following settings", async () => {
    test.todo('depends on get prior votes and delegation and voting');
  });

  describe("simple initialization", () => {
    it("ID is set to a globally unique identifier", async () => {
      expect(trivialProposal.id).toEqual(proposalId);
    });

    it("Proposer is set to the sender", async () => {
      expect(trivialProposal.proposer).toEqual(root);
    });

    it("Start block is set to the current block number plus vote delay", async () => {
      expect(trivialProposal.startBlock).toEqual(proposalBlock + votingDelay + "");
    });

    it("End block is set to the current block number plus the sum of vote delay and vote period", async () => {
      expect(trivialProposal.endBlock).toEqual(proposalBlock + votingDelay + votingPeriod + "");
    });

    it("ForVotes and AgainstVotes are initialized to zero", async () => {
      expect(trivialProposal.forVotes).toEqual("0");
      expect(trivialProposal.againstVotes).toEqual("0");
    });

    xit("Voters is initialized to the empty set", async () => {
      test.todo('mmm probably nothing to prove here unless we add a counter or something');
    });

    it("Executed and Canceled flags are initialized to false", async () => {
      expect(trivialProposal.canceled).toEqual(false);
      expect(trivialProposal.executed).toEqual(false);
    });

    it("ETA is initialized to zero", async () => {
      expect(trivialProposal.eta).toEqual("0");
    });

    it("Targets, Values, Signatures, Calldatas are set according to parameters", async () => {
      let dynamicFields = await call(gov, 'getActions', [trivialProposal.id]);
      expect(dynamicFields.targets).toEqual(targets);
      expect(dynamicFields.values).toEqual(values);
      expect(dynamicFields.signatures).toEqual(signatures);
      expect(dynamicFields.calldatas).toEqual(callDatas);
    });

    describe("This function must revert if", () => {
      it("the length of the values, signatures or calldatas arrays are not the same length,", async () => {
        await expect(
          call(gov, 'propose', [targets.concat(root), values, signatures, callDatas, "do nothing"])
        ).rejects.toRevert("revert GovernorAlpha::propose: proposal function information arity mismatch");

        await expect(
          call(gov, 'propose', [targets, values.concat(values), signatures, callDatas, "do nothing"])
        ).rejects.toRevert("revert GovernorAlpha::propose: proposal function information arity mismatch");

        await expect(
          call(gov, 'propose', [targets, values, signatures.concat(signatures), callDatas, "do nothing"])
        ).rejects.toRevert("revert GovernorAlpha::propose: proposal function information arity mismatch");

        await expect(
          call(gov, 'propose', [targets, values, signatures, callDatas.concat(callDatas), "do nothing"])
        ).rejects.toRevert("revert GovernorAlpha::propose: proposal function information arity mismatch");
      });

      it("or if that length is zero or greater than Max Operations.", async () => {
        await expect(
          call(gov, 'propose', [[], [], [], [], "do nothing"])
        ).rejects.toRevert("revert GovernorAlpha::propose: must provide actions");
      });

      describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", () => {
        it("reverts with pending", async () => {
          await expect(
            call(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"])
          ).rejects.toRevert("revert GovernorAlpha::propose: one live proposal per proposer, found an already pending proposal");
        });

        it("reverts with active", async () => {
          await mineBlock();
          await mineBlock();

          await expect(
            call(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"])
          ).rejects.toRevert("revert GovernorAlpha::propose: one live proposal per proposer, found an already active proposal");
        });
      });
    });

    it("This function returns the id of the newly created proposal. # proposalId(n) = succ(proposalId(n-1))", async () => {
      await enfranchise(accounts[2], 400001);

      await mineBlock();
      let nextProposalId = await gov.methods['propose'](targets, values, signatures, callDatas, "yoot").call({ from: accounts[2] });
      // let nextProposalId = await call(gov, 'propose', [targets, values, signatures, callDatas, "second proposal"], { from: accounts[2] });

      expect(+nextProposalId).toEqual(+trivialProposal.id + 1);
    });

    it("emits log with id and description", async () => {
      await enfranchise(accounts[3], 400001);

      await mineBlock();
      let nextProposalId = await gov.methods['propose'](targets, values, signatures, callDatas, "yoot").call({ from: accounts[3] });

      expect(
        await send(gov, 'propose', [targets, values, signatures, callDatas, "second proposal"], { from: accounts[3] })
      ).toHaveLog("ProposalCreated", {
        id: nextProposalId,
        targets: targets,
        values: values,
        signatures: signatures,
        calldatas: callDatas,
        startBlock: 26 + votingDelay,
        endBlock: 26 + votingDelay + votingPeriod,
        description: "second proposal",
        proposer: accounts[3]
      });
    });
  });
});
