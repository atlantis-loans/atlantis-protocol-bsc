const {
  etherUnsigned,
  etherMantissa,
  etherExp,
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeAToken,
  preApprove,
  preSupply,
  quickRedeem,
} = require('./Utils/Atlantis');

async function AtlantisBalance(comptroller, user) {
  return etherUnsigned(await call(comptroller.atlantis, 'balanceOf', [user]))
}

async function atlantisAccrued(comptroller, user) {
  return etherUnsigned(await call(comptroller, 'atlantisAccrued', [user]));
}

async function fastForwardPatch(patch, comptroller, blocks) {
  if (patch == 'unitroller') {
    return await send(comptroller, 'harnessFastForward', [blocks]);
  } else {
    return await send(comptroller, 'fastForward', [blocks]);
  }
}

const fs = require('fs');
const util = require('util');
const diffStringsUnified = require('jest-diff').default;


async function preRedeem(
  aToken,
  redeemer,
  redeemTokens,
  redeemAmount,
  exchangeRate
) {
  await preSupply(aToken, redeemer, redeemTokens);
  await send(aToken.underlying, 'harnessSetBalance', [
    aToken._address,
    redeemAmount
  ]);
}

const sortOpcodes = (opcodesMap) => {
  return Object.values(opcodesMap)
    .map(elem => [elem.fee, elem.name])
    .sort((a, b) => b[0] - a[0]);
};

const getGasCostFile = name => {
  try {
    const jsonString = fs.readFileSync(name);
    return JSON.parse(jsonString);
  } catch (err) {
    console.log(err);
    return {};
  }
};

const recordGasCost = (totalFee, key, filename, opcodes = {}) => {
  let fileObj = getGasCostFile(filename);
  const newCost = {fee: totalFee, opcodes: opcodes};
  console.log(diffStringsUnified(fileObj[key], newCost));
  fileObj[key] = newCost;
  fs.writeFileSync(filename, JSON.stringify(fileObj, null, ' '), 'utf-8');
};

async function mint(aToken, minter, mintAmount, exchangeRate) {
  expect(await preApprove(aToken, minter, mintAmount, {})).toSucceed();
  return send(aToken, 'mint', [mintAmount], { from: minter });
}

async function claimAtlantis(comptroller, holder) {
  return send(comptroller, 'claimAtlantis', [holder], { from: holder });
}

/// GAS PROFILER: saves a digest of the gas prices of common AToken operations
/// transiently fails, not sure why

describe('Gas report', () => {
  let root, minter, redeemer, accounts, aToken;
  const exchangeRate = 50e3;
  const preMintAmount = etherUnsigned(30e4);
  const mintAmount = etherUnsigned(10e4);
  const mintTokens = mintAmount.div(exchangeRate);
  const redeemTokens = etherUnsigned(10e3);
  const redeemAmount = redeemTokens.multipliedBy(exchangeRate);
  const filename = './gasCosts.json';

  describe('AToken', () => {
    beforeEach(async () => {
      [root, minter, redeemer, ...accounts] = saddle.accounts;
      aToken = await makeAToken({
        comptrollerOpts: { kind: 'bool'}, 
        interestRateModelOpts: { kind: 'white-paper'},
        exchangeRate
      });
    });

    it('first mint', async () => {
      await send(aToken, 'harnessSetAccrualBlockNumber', [40]);
      await send(aToken, 'harnessSetBlockNumber', [41]);

      const trxReceipt = await mint(aToken, minter, mintAmount, exchangeRate);
      recordGasCost(trxReceipt.gasUsed, 'first mint', filename);
    });

    it('second mint', async () => {
      await mint(aToken, minter, mintAmount, exchangeRate);

      await send(aToken, 'harnessSetAccrualBlockNumber', [40]);
      await send(aToken, 'harnessSetBlockNumber', [41]);

      const mint2Receipt = await mint(aToken, minter, mintAmount, exchangeRate);
      expect(Object.keys(mint2Receipt.events)).toEqual(['AccrueInterest', 'Transfer', 'Mint']);

      console.log(mint2Receipt.gasUsed);
      const opcodeCount = {};

      await saddle.trace(mint2Receipt, {
        execLog: log => {
          if (log.lastLog != undefined) {
            const key = `${log.op} @ ${log.gasCost}`;
            opcodeCount[key] = (opcodeCount[key] || 0) + 1;
          }
        }
      });

      recordGasCost(mint2Receipt.gasUsed, 'second mint', filename, opcodeCount);
    });

    it('second mint, no interest accrued', async () => {
      await mint(aToken, minter, mintAmount, exchangeRate);

      await send(aToken, 'harnessSetAccrualBlockNumber', [40]);
      await send(aToken, 'harnessSetBlockNumber', [40]);

      const mint2Receipt = await mint(aToken, minter, mintAmount, exchangeRate);
      expect(Object.keys(mint2Receipt.events)).toEqual(['Transfer', 'Mint']);
      recordGasCost(mint2Receipt.gasUsed, 'second mint, no interest accrued', filename);

      // console.log("NO ACCRUED");
      // const opcodeCount = {};
      // await saddle.trace(mint2Receipt, {
      //   execLog: log => {
      //     opcodeCount[log.op] = (opcodeCount[log.op] || 0) + 1;
      //   }
      // });
      // console.log(getOpcodeDigest(opcodeCount));
    });

    it('redeem', async () => {
      await preRedeem(aToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      const trxReceipt = await quickRedeem(aToken, redeemer, redeemTokens);
      recordGasCost(trxReceipt.gasUsed, 'redeem', filename);
    });

    it.skip('print mint opcode list', async () => {
      await preMint(aToken, minter, mintAmount, mintTokens, exchangeRate);
      const trxReceipt = await quickMint(aToken, minter, mintAmount);
      const opcodeCount = {};
      await saddle.trace(trxReceipt, {
        execLog: log => {
          opcodeCount[log.op] = (opcodeCount[log.op] || 0) + 1;
        }
      });
      console.log(getOpcodeDigest(opcodeCount));
    });
  });

  describe.each([
    ['unitroller-g6'],
    ['unitroller']
  ])('Atlantis claims %s', (patch) => {
    beforeEach(async () => {
      [root, minter, redeemer, ...accounts] = saddle.accounts;
      comptroller = await makeComptroller({ kind: patch });
      let interestRateModelOpts = {borrowRate: 0.000001};
      aToken = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      if (patch == 'unitroller') {
        await send(comptroller, '_setAtlantisSpeed', [aToken._address, etherExp(0.05)]);
      } else {
        await send(comptroller, '_addAtlantisMarkets', [[aToken].map(c => c._address)]);
        await send(comptroller, 'setAtlantisSpeed', [aToken._address, etherExp(0.05)]);
      }
      await send(comptroller.atlantis, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
    });

    it(`${patch} second mint with atlantis accrued`, async () => {
      await mint(aToken, minter, mintAmount, exchangeRate);

      await fastForwardPatch(patch, comptroller, 10);

      console.log('Atlantis balance before mint', (await AtlantisBalance(comptroller, minter)).toString());
      console.log('Atlantis accrued before mint', (await atlantisAccrued(comptroller, minter)).toString());
      const mint2Receipt = await mint(aToken, minter, mintAmount, exchangeRate);
      console.log('Atlantis balance after mint', (await AtlantisBalance(comptroller, minter)).toString());
      console.log('Atlantis accrued after mint', (await atlantisAccrued(comptroller, minter)).toString());
      recordGasCost(mint2Receipt.gasUsed, `${patch} second mint with atlantis accrued`, filename);
    });

    it(`${patch} claim atlantis`, async () => {
      await mint(aToken, minter, mintAmount, exchangeRate);

      await fastForwardPatch(patch, comptroller, 10);

      console.log('Atlantis balance before claim', (await AtlantisBalance(comptroller, minter)).toString());
      console.log('Atlantis accrued before claim', (await atlantisAccrued(comptroller, minter)).toString());
      const claimReceipt = await claimAtlantis(comptroller, minter);
      console.log('Atlantis balance after claim', (await AtlantisBalance(comptroller, minter)).toString());
      console.log('Atlantis accrued after claim', (await atlantisAccrued(comptroller, minter)).toString());
      recordGasCost(claimReceipt.gasUsed, `${patch} claim atlantis`, filename);
    });
  });
});
