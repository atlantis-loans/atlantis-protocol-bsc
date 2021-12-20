const {
  advanceBlocks,
  etherUnsigned,
  both,
  encodeParameters,
  etherMantissa,
  mineBlock,
  freezeTime,
  increaseTime
} = require('../../Utils/Ethereum');

const path = require('path');
const solparse = require('solparse');

const governorAlphaPath = path.join(__dirname, '../../..', 'contracts', 'Governance/GovernorAlpha.sol');

const statesInverted = solparse
  .parseFile(governorAlphaPath)
  .body
  .find(k => k.type === 'ContractStatement')
  .body
  .find(k => k.name == 'ProposalState')
  .members

const states = Object.entries(statesInverted).reduce((obj, [key, value]) => ({ ...obj, [value]: key }), {});

describe('GovernorAlpha#state/1', () => {
  let atlantis, gov, root, acct, delay, timelock, atlantisVault;
  
  async function enfranchise(actor, amount) {
    await send(atlantisVault, 'delegate', [actor], { from: actor });
    await send(atlantis, 'approve', [atlantisVault._address, etherMantissa(1e10)], { from: actor });
    // in test cases, we transfer enough token to actor for convenience
    await send(atlantis, 'transfer', [actor, etherMantissa(amount)]);
    await send(atlantisVault, 'deposit', [atlantis._address, 0, etherMantissa(amount)], { from: actor });
  }

  beforeAll(async () => {
    await freezeTime(100);
    [root, acct, ...accounts] = accounts;

    atlantis = await deploy('Atlantis', [root]);
    atlantisVault = await deploy('CommunityVault', []);
    const communityStore = await deploy('CommunityStore', []);
    await send(communityStore, 'setNewOwner', [atlantisVault._address], { from: root });
    await send(atlantisVault, 'setCommunityStore', [atlantis._address, communityStore._address], { from: root });
    await send(atlantisVault, 'add', [atlantis._address, 100, atlantis._address, etherUnsigned(1e16), 300], { from: root }); // lock period 300s
    
    delay = etherUnsigned(2 * 24 * 60 * 60).multipliedBy(2)
    timelock = await deploy('TimelockHarness', [root, delay]);
    gov = await deploy('GovernorAlpha', [timelock._address, atlantisVault._address, root]);

    await send(timelock, "harnessSetAdmin", [gov._address])
    await enfranchise(acct, 400001);
  });

  let trivialProposal, targets, values, signatures, callDatas;
  beforeAll(async () => {
    targets = [root];
    values = ["0"];
    signatures = ["getBalanceOf(address)"]
    callDatas = [encodeParameters(['address'], [acct])];

    await enfranchise(root, 400001);

    await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"]);
    proposalId = await call(gov, 'latestProposalIds', [root]);
    trivialProposal = await call(gov, "proposals", [proposalId])
  })

  it("Invalid for proposal not found", async () => {
    await expect(call(gov, 'state', ["5"])).rejects.toRevert("revert GovernorAlpha::state: invalid proposal id")
  })

  it("Pending", async () => {
    expect(await call(gov, 'state', [trivialProposal.id], {})).toEqual(states["Pending"])
  })

  it("Active", async () => {
    await mineBlock()
    await mineBlock()
    expect(await call(gov, 'state', [trivialProposal.id], {})).toEqual(states["Active"])
  })

  it("Canceled", async () => {
    await enfranchise(accounts[0], 400000);
    await send(atlantisVault, 'delegate', [accounts[0]], { from: accounts[0] });
    await mineBlock()
    await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"], { from: accounts[0] })
    let newProposalId = await call(gov, 'proposalCount')

    // send away the delegates
    await send(atlantisVault, 'delegate', [root], { from: accounts[0] });
    await send(gov, 'cancel', [newProposalId])

    expect(await call(gov, 'state', [+newProposalId])).toEqual(states["Canceled"])
  })

  it("Defeated", async () => {
    // travel to end block
    await advanceBlocks(90000)

    expect(await call(gov, 'state', [trivialProposal.id])).toEqual(states["Defeated"])
  })

  it("Succeeded", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"], { from: acct })
    await mineBlock()
    await send(gov, 'castVote', [newProposalId, true])
    await advanceBlocks(90000)

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Succeeded"])
  })

  it("Queued", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"], { from: acct })
    await mineBlock()
    await send(gov, 'castVote', [newProposalId, true])
    await advanceBlocks(90000)

    await send(gov, 'queue', [newProposalId], { from: acct })
    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Queued"])
  })

  it("Expired", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"], { from: acct })
    await mineBlock()
    await send(gov, 'castVote', [newProposalId, true])
    await advanceBlocks(90000)

    await increaseTime(1)
    await send(gov, 'queue', [newProposalId], { from: acct })

    let gracePeriod = await call(timelock, 'GRACE_PERIOD')
    let p = await call(gov, "proposals", [newProposalId]);
    let eta = etherUnsigned(p.eta)

    await freezeTime(eta.plus(gracePeriod).minus(1).toNumber())

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Queued"])

    await freezeTime(eta.plus(gracePeriod).toNumber())

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Expired"])
  })

  it("Executed", async () => {
    await mineBlock()
    const { reply: newProposalId } = await both(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"], { from: acct })
    await mineBlock()
    await send(gov, 'castVote', [newProposalId, true])
    await advanceBlocks(90000)

    await increaseTime(1)
    await send(gov, 'queue', [newProposalId], { from: acct })

    let gracePeriod = await call(timelock, 'GRACE_PERIOD')
    let p = await call(gov, "proposals", [newProposalId]);
    let eta = etherUnsigned(p.eta)

    await freezeTime(eta.plus(gracePeriod).minus(1).toNumber())

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Queued"])
    await send(gov, 'execute', [newProposalId], { from: acct })

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Executed"])

    // still executed even though would be expired
    await freezeTime(eta.plus(gracePeriod).toNumber())

    expect(await call(gov, 'state', [newProposalId])).toEqual(states["Executed"])
  })

})