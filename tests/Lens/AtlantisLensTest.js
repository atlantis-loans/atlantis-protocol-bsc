const {
  address,
  encodeParameters,
} = require('../Utils/Ethereum');
const {
  makeComptroller,
  makeAToken,
} = require('../Utils/Atlantis');

function cullTuple(tuple) {
  return Object.keys(tuple).reduce((acc, key) => {
    if (Number.isNaN(Number(key))) {
      return {
        ...acc,
        [key]: tuple[key]
      };
    } else {
      return acc;
    }
  }, {});
}

describe('AtlantisLens', () => {
  let atlantisLens;
  let acct;

  beforeEach(async () => {
    atlantisLens = await deploy('AtlantisLens');
    acct = accounts[0];
  });

  describe('aTokenMetadata', () => {
    it('is correct for a aBep20', async () => {
      let aBep20 = await makeAToken();
      expect(
        cullTuple(await call(atlantisLens, 'aTokenMetadata', [aBep20._address]))
      ).toEqual(
        {
          aToken: aBep20._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerBlock: "0",
          borrowRatePerBlock: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          isListed:false,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(aBep20, 'underlying', []),
          aTokenDecimals: "8",
          underlyingDecimals: "18",
          atlantisSpeed: "0",
          borrowCap: "0"
        }
      );
    });

    it('is correct for aBNB', async () => {
      let aBNB = await makeAToken({kind: 'abnb'});
      expect(
        cullTuple(await call(atlantisLens, 'aTokenMetadata', [aBNB._address]))
      ).toEqual({
        borrowRatePerBlock: "0",
        aToken: aBNB._address,
        aTokenDecimals: "8",
        collateralFactorMantissa: "0",
        exchangeRateCurrent: "1000000000000000000",
        isListed: false,
        reserveFactorMantissa: "0",
        supplyRatePerBlock: "0",
        totalBorrows: "0",
        totalCash: "0",
        totalReserves: "0",
        totalSupply: "0",
        underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
        underlyingDecimals: "18",
        atlantisSpeed: "0",
        borrowCap: "0"
      });
    });
  });

  describe('aTokenMetadataAll', () => {
    it('is correct for a aBep20 and aBNB', async () => {
      let aBep20 = await makeAToken();
      let aBNB = await makeAToken({kind: 'abnb'});
      expect(
        (await call(atlantisLens, 'aTokenMetadataAll', [[aBep20._address, aBNB._address]])).map(cullTuple)
      ).toEqual([
        {
          aToken: aBep20._address,
          exchangeRateCurrent: "1000000000000000000",
          supplyRatePerBlock: "0",
          borrowRatePerBlock: "0",
          reserveFactorMantissa: "0",
          totalBorrows: "0",
          totalReserves: "0",
          totalSupply: "0",
          totalCash: "0",
          isListed:false,
          collateralFactorMantissa: "0",
          underlyingAssetAddress: await call(aBep20, 'underlying', []),
          aTokenDecimals: "8",
          underlyingDecimals: "18",
          atlantisSpeed: "0",
          borrowCap: "0",
        },
        {
          borrowRatePerBlock: "0",
          aToken: aBNB._address,
          aTokenDecimals: "8",
          collateralFactorMantissa: "0",
          exchangeRateCurrent: "1000000000000000000",
          isListed: false,
          reserveFactorMantissa: "0",
          supplyRatePerBlock: "0",
          totalBorrows: "0",
          totalCash: "0",
          totalReserves: "0",
          totalSupply: "0",
          underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
          underlyingDecimals: "18",
          atlantisSpeed: "0",
          borrowCap: "0",
        }
      ]);
    });
  });

  describe('aTokenBalances', () => {
    it('is correct for aBEP20', async () => {
      let aBep20 = await makeAToken();
      expect(
        cullTuple(await call(atlantisLens, 'aTokenBalances', [aBep20._address, acct]))
      ).toEqual(
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          aToken: aBep20._address,
          tokenAllowance: "0",
          tokenBalance: "10000000000000000000000000",
        }
      );
    });

    it('is correct for aBNB', async () => {
      let aBNB = await makeAToken({kind: 'abnb'});
      let ethBalance = await web3.eth.getBalance(acct);
      expect(
        cullTuple(await call(atlantisLens, 'aTokenBalances', [aBNB._address, acct], {gasPrice: '0'}))
      ).toEqual(
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          aToken: aBNB._address,
          tokenAllowance: ethBalance,
          tokenBalance: ethBalance,
        }
      );
    });
  });

  describe('aTokenBalancesAll', () => {
    it('is correct for aBNB and aBep20', async () => {
      let aBep20 = await makeAToken();
      let aBNB = await makeAToken({kind: 'abnb'});
      let ethBalance = await web3.eth.getBalance(acct);
      expect(
        (await call(atlantisLens, 'aTokenBalancesAll', [[aBep20._address, aBNB._address], acct], {gasPrice: '0'})).map(cullTuple)
      ).toEqual([
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          aToken: aBep20._address,
          tokenAllowance: "0",
          tokenBalance: "10000000000000000000000000",
        },
        {
          balanceOf: "0",
          balanceOfUnderlying: "0",
          borrowBalanceCurrent: "0",
          aToken: aBNB._address,
          tokenAllowance: ethBalance,
          tokenBalance: ethBalance,
        }
      ]);
    })
  });

  describe('aTokenUnderlyingPrice', () => {
    it('gets correct price for aBep20', async () => {
      let aBep20 = await makeAToken();
      expect(
        cullTuple(await call(atlantisLens, 'aTokenUnderlyingPrice', [aBep20._address]))
      ).toEqual(
        {
          aToken: aBep20._address,
          underlyingPrice: "0",
        }
      );
    });

    it('gets correct price for aBNB', async () => {
      let aBNB = await makeAToken({kind: 'abnb'});
      expect(
        cullTuple(await call(atlantisLens, 'aTokenUnderlyingPrice', [aBNB._address]))
      ).toEqual(
        {
          aToken: aBNB._address,
          underlyingPrice: "1000000000000000000",
        }
      );
    });
  });

  describe('aTokenUnderlyingPriceAll', () => {
    it('gets correct price for both', async () => {
      let aBep20 = await makeAToken();
      let aBNB = await makeAToken({kind: 'abnb'});
      expect(
        (await call(atlantisLens, 'aTokenUnderlyingPriceAll', [[aBep20._address, aBNB._address]])).map(cullTuple)
      ).toEqual([
        {
          aToken: aBep20._address,
          underlyingPrice: "0",
        },
        {
          aToken: aBNB._address,
          underlyingPrice: "1000000000000000000",
        }
      ]);
    });
  });

  describe('getAccountLimits', () => {
    it('gets correct values', async () => {
      let comptroller = await makeComptroller();

      expect(
        cullTuple(await call(atlantisLens, 'getAccountLimits', [comptroller._address, acct]))
      ).toEqual({
        liquidity: "0",
        markets: [],
        shortfall: "0"
      });
    });
  });

  describe('governance', () => {
    let atlantis, gov;
    let targets, values, signatures, callDatas;
    let proposalBlock, proposalId;
    let votingDelay;
    let votingPeriod;

    beforeEach(async () => {
      atlantis = await deploy('Atlantis', [acct]);
      gov = await deploy('GovernorAlpha', [address(0), atlantis._address, address(0)]);
      targets = [acct];
      values = ["0"];
      signatures = ["getBalanceOf(address)"];
      callDatas = [encodeParameters(['address'], [acct])];
      await send(atlantis, 'delegate', [acct]);
      await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"]);
      proposalBlock = +(await web3.eth.getBlockNumber());
      proposalId = await call(gov, 'latestProposalIds', [acct]);
      votingDelay = Number(await call(gov, 'votingDelay'));
      votingPeriod = Number(await call(gov, 'votingPeriod'));
    });

    describe('getGovReceipts', () => {
      it('gets correct values', async () => {
        expect(
          (await call(atlantisLens, 'getGovReceipts', [gov._address, acct, [proposalId]])).map(cullTuple)
        ).toEqual([
          {
            hasVoted: false,
            proposalId: proposalId,
            support: false,
            votes: "0",
          }
        ]);
      })
    });

    describe('getGovProposals', () => {
      it('gets correct values', async () => {
        expect(
          (await call(atlantisLens, 'getGovProposals', [gov._address, [proposalId]])).map(cullTuple)
        ).toEqual([
          {
            againstVotes: "0",
            calldatas: callDatas,
            canceled: false,
            endBlock: (Number(proposalBlock) + votingDelay + votingPeriod).toString(),
            eta: "0",
            executed: false,
            forVotes: "0",
            proposalId: proposalId,
            proposer: acct,
            signatures: signatures,
            startBlock: (Number(proposalBlock) + votingDelay).toString(),
            targets: targets
          }
        ]);
      })
    });
  });

  describe('atlantis', () => {
    let atlantis, currentBlock;

    beforeEach(async () => {
      currentBlock = +(await web3.eth.getBlockNumber());
      atlantis = await deploy('Atlantis', [acct]);
    });

    describe('getAtlantisBalanceMetadata', () => {
      it('gets correct values', async () => {
        expect(
          cullTuple(await call(atlantisLens, 'getAtlantisBalanceMetadata', [atlantis._address, acct]))
        ).toEqual({
          balance: "6500000000000000000000000",
          delegate: "0x0000000000000000000000000000000000000000",
          votes: "0",
        });
      });
    });

    describe('getAtlantisBalanceMetadataExt', () => {
      it('gets correct values', async () => {
        let comptroller = await makeComptroller();
        await send(comptroller, 'setAtlantisAccrued', [acct, 5]); // harness only

        expect(
          cullTuple(await call(atlantisLens, 'getAtlantisBalanceMetadataExt', [atlantis._address, comptroller._address, acct]))
        ).toEqual({
          balance: "6500000000000000000000000",
          delegate: "0x0000000000000000000000000000000000000000",
          votes: "0",
          allocated: "5"
        });
      });
    });

    describe('getAtlantisVotes', () => {
      it('gets correct values', async () => {
        expect(
          (await call(atlantisLens, 'getAtlantisVotes', [atlantis._address, acct, [currentBlock, currentBlock - 1]])).map(cullTuple)
        ).toEqual([
          {
            blockNumber: currentBlock.toString(),
            votes: "0",
          },
          {
            blockNumber: (Number(currentBlock) - 1).toString(),
            votes: "0",
          }
        ]);
      });

      it('reverts on future value', async () => {
        await expect(
          call(atlantisLens, 'getAtlantisVotes', [atlantis._address, acct, [currentBlock + 1]])
        ).rejects.toRevert('revert Atlantis::getPriorVotes: not yet determined')
      });
    });
  });
});
