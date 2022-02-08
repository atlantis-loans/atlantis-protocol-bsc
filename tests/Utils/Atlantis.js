"use strict";

const { dfn } = require('./JS');
const {
  encodeParameters,
  etherBalance,
  etherMantissa,
  etherUnsigned,
  mergeInterface
} = require('./Ethereum');
const BigNumber = require('bignumber.js');

async function makeComptroller(opts = {}) {
  const {
    root = saddle.account,
    kind = 'unitroller'
  } = opts || {};

  if (kind == 'bool') {
    return await deploy('BoolComptroller');
  }

  if (kind == 'false-marker') {
    return await deploy('FalseMarkerMethodComptroller');
  }

  if (kind == 'v1-no-proxy') {
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));

    await send(comptroller, '_setCloseFactor', [closeFactor]);
    await send(comptroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(comptroller, { priceOracle });
  }

  if (kind == 'unitroller-g2') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerScenarioG2');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const maxAssets = etherUnsigned(dfn(opts.maxAssets, 10));
    const liquidationIncentive = etherMantissa(1);

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setMaxAssets', [maxAssets]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(unitroller, { priceOracle });
  }

  if (kind == 'unitroller-g3') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerScenarioG3');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const maxAssets = etherUnsigned(dfn(opts.maxAssets, 10));
    const liquidationIncentive = etherMantissa(1);
    const atlantisRate = etherUnsigned(dfn(opts.atlantisRate, 1e18));
    const atlantisMarkets = opts.atlantisMarkets || [];
    const otherMarkets = opts.otherMarkets || [];

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address, atlantisRate, atlantisMarkets, otherMarkets]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setMaxAssets', [maxAssets]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(unitroller, { priceOracle });
  }

  if (kind == 'unitroller-g6') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerScenarioG6');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = etherMantissa(1);
    const atlantis = opts.atlantis || await deploy('Atlantis', [opts.atlantisOwner || root]);
    const atlantisRate = etherUnsigned(dfn(opts.atlantisRate, 1e18));

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, '_setAtlantisRate', [atlantisRate]);
    await send(unitroller, 'setAtlantisAddress', [atlantis._address]); // harness only

    return Object.assign(unitroller, { priceOracle, atlantis });
  }

  if (kind == 'unitroller') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = etherMantissa(1);
    const atlantis = opts.atlantis || await deploy('Atlantis', [opts.atlantisOwner || root]);
    const atlantisRate = etherUnsigned(dfn(opts.atlantisRate, 1e18));

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, 'setAtlantisAddress', [atlantis._address]); // harness only
    await send(unitroller, 'harnessSetAtlantisRate', [atlantisRate]);

    return Object.assign(unitroller, { priceOracle, atlantis });
  }
}

async function makeAToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'abep20'
  } = opts || {};

  const comptroller = opts.comptroller || await makeComptroller(opts.comptrollerOpts);
  const interestRateModel = opts.interestRateModel || await makeInterestRateModel(opts.interestRateModelOpts);
  const exchangeRate = etherMantissa(dfn(opts.exchangeRate, 1));
  const decimals = etherUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === 'abnb' ? 'aBNB' : 'aOMG');
  const name = opts.name || `AToken ${symbol}`;
  const admin = opts.admin || root;

  let aToken, underlying;
  let aDelegator, aDelegatee, aDaiMaker;

  switch (kind) {
    case 'abnb':
      aToken = await deploy('ABNBHarness',
        [
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin
        ])
      break;

    case 'cdai':
      aDaiMaker  = await deploy('ADaiDelegateMakerHarness');
      underlying = aDaiMaker;
      aDelegatee = await deploy('ADaiDelegateHarness');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          encodeParameters(['address', 'address'], [aDaiMaker._address, aDaiMaker._address])
        ]
      );
      aToken = await saddle.getContractAt('ADaiDelegateHarness', aDelegator._address);
      break;
    
    case 'ccomp':
      underlying = await deploy('Atlantis', [opts.atlHolder || root]);
      aDelegatee = await deploy('ABep20DelegateHarness');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          "0x0"
        ]
      );
      aToken = await saddle.getContractAt('ABep20DelegateHarness', aDelegator._address);
      break;

    case 'abep20':
    default:
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      aDelegatee = await deploy('ABep20DelegateHarness');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          "0x0"
        ]
      );
      aToken = await saddle.getContractAt('ABep20DelegateHarness', aDelegator._address);
      break;
      
  }

  if (opts.supportMarket) {
    await send(comptroller, '_supportMarket', [aToken._address]);
  }

  if (opts.addAtlantisMarket) {
    await send(comptroller, '_addAtlantisMarket', [aToken._address]);
  }

  if (opts.underlyingPrice) {
    const price = etherMantissa(opts.underlyingPrice);
    await send(comptroller.priceOracle, 'setUnderlyingPrice', [aToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = etherMantissa(opts.collateralFactor);
    expect(await send(comptroller, '_setCollateralFactor', [aToken._address, factor])).toSucceed();
  }

  return Object.assign(aToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeInterestRateModel(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harnessed'
  } = opts || {};

  if (kind == 'harnessed') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('InterestRateModelHarness', [borrowRate]);
  }

  if (kind == 'false-marker') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
  }

  if (kind == 'white-paper') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 1e-18));
    return await deploy('WhitePaperInterestRateModel', [baseRate, multiplier]);
  }

  if (kind == 'jump-rate') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 1e-18));
    const jump = etherMantissa(dfn(opts.jump, 0));
    const kink = etherMantissa(dfn(opts.kink, 0));
    return await deploy('JumpRateModel', [baseRate, multiplier, jump, kink]);
  }
}

async function makePriceOracle(opts = {}) {
  const {
    root = saddle.account,
    kind = 'simple'
  } = opts || {};

  if (kind == 'simple') {
    return await deploy('SimplePriceOracle');
  }
}

async function makeChainlinkOracle(opts = {}) {
  const {
    root = saddle.account
  } = opts || {};

  return await deploy('MockV3Aggregator', [opts.decimals, opts.initialAnswer]);
}

async function makeToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'erc20'
  } = opts || {};

  if (kind == 'erc20') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Bep20 ${symbol}`;
    return await deploy('BEP20Harness', [quantity, name, decimals, symbol]);
  }
}

async function balanceOf(token, account) {
  return etherUnsigned(await call(token, 'balanceOf', [account]));
}

async function totalSupply(token) {
  return etherUnsigned(await call(token, 'totalSupply'));
}

async function borrowSnapshot(aToken, account) {
  const { principal, interestIndex } = await call(aToken, 'harnessAccountBorrows', [account]);
  return { principal: etherUnsigned(principal), interestIndex: etherUnsigned(interestIndex) };
}

async function totalBorrows(aToken) {
  return etherUnsigned(await call(aToken, 'totalBorrows'));
}

async function totalReserves(aToken) {
  return etherUnsigned(await call(aToken, 'totalReserves'));
}

async function enterMarkets(aTokens, from) {
  return await send(aTokens[0].comptroller, 'enterMarkets', [aTokens.map(c => c._address)], { from });
}

async function fastForward(aToken, blocks = 5) {
  return await send(aToken, 'harnessFastForward', [blocks]);
}

async function setBalance(aToken, account, balance) {
  return await send(aToken, 'harnessSetBalance', [account, balance]);
}

async function setEtherBalance(aBNB, balance) {
  const current = await etherBalance(aBNB._address);
  const root = saddle.account;
  expect(await send(aBNB, 'harnessDoTransferOut', [root, current])).toSucceed();
  expect(await send(aBNB, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
}

async function getBalances(aTokens, accounts) {
  const balances = {};
  for (let aToken of aTokens) {
    const cBalances = balances[aToken._address] = {};
    for (let account of accounts) {
      cBalances[account] = {
        eth: await etherBalance(account),
        cash: aToken.underlying && await balanceOf(aToken.underlying, account),
        tokens: await balanceOf(aToken, account),
        borrows: (await borrowSnapshot(aToken, account)).principal
      };
    }
    cBalances[aToken._address] = {
      eth: await etherBalance(aToken._address),
      cash: aToken.underlying && await balanceOf(aToken.underlying, aToken._address),
      tokens: await totalSupply(aToken),
      borrows: await totalBorrows(aToken),
      reserves: await totalReserves(aToken)
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let aToken, account, key, diff;
    if (delta.length == 4) {
      ([aToken, account, key, diff] = delta);
    } else {
      ([aToken, key, diff] = delta);
      account = aToken._address;
    }
    balances[aToken._address][account][key] = new BigNumber(balances[aToken._address][account][key]).plus(diff);
  }
  return balances;
}


async function preApprove(aToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(aToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(aToken.underlying, 'approve', [aToken._address, amount], { from });
}

async function quickMint(aToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(aToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(aToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'mint', [mintAmount], { from: minter });
}


async function preSupply(aToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(aToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
  }
  return send(aToken, 'harnessSetBalance', [account, tokens]);
}

async function quickRedeem(aToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(aToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(aToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'redeem', [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(aToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(aToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
}

async function setOraclePrice(aToken, price) {
  return send(aToken.comptroller.priceOracle, 'setUnderlyingPrice', [aToken._address, etherMantissa(price)]);
}

async function setBorrowRate(aToken, rate) {
  return send(aToken.interestRateModel, 'setBorrowRate', [etherMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves].map(etherUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
  return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor].map(etherUnsigned));
}

async function pretendBorrow(aToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(aToken, 'harnessSetTotalBorrows', [etherUnsigned(principalRaw)]);
  await send(aToken, 'harnessSetAccountBorrows', [borrower, etherUnsigned(principalRaw), etherMantissa(accountIndex)]);
  await send(aToken, 'harnessSetBorrowIndex', [etherMantissa(marketIndex)]);
  await send(aToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
  await send(aToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber)]);
}

async function quickBorrow(aToken, minter, borrowAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(aToken, 1);

  if (dfn(opts.exchangeRate))
    expect(await send(aToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();

  return send(aToken, 'borrow', [borrowAmount], { from: minter });
}

module.exports = {
  makeComptroller,
  makeAToken,
  makeInterestRateModel,
  makePriceOracle,
  makeChainlinkOracle,
  makeToken,

  balanceOf,
  totalSupply,
  borrowSnapshot,
  totalBorrows,
  totalReserves,
  enterMarkets,
  fastForward,
  setBalance,
  setEtherBalance,
  getBalances,
  adjustBalances,

  preApprove,
  quickMint,
  quickBorrow,
  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  setOraclePrice,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow
};
