import { Event } from '../Event';
import { World } from '../World';
import { AToken } from '../Contract/AToken';
import { ABep20Delegator } from '../Contract/ABep20Delegator';
import { Bep20 } from '../Contract/Bep20';
import {
  getAddressV,
  getCoreValue,
  getStringV,
  mapValue
} from '../CoreValue';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import {
  AddressV,
  NumberV,
  Value,
  StringV
} from '../Value';
import { getWorldContractByAddress, getATokenAddress } from '../ContractLookup';

export async function getATokenV(world: World, event: Event): Promise<AToken> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getATokenAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<AToken>(world, address.val);
}

export async function getABep20DelegatorV(world: World, event: Event): Promise<ABep20Delegator> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getATokenAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<ABep20Delegator>(world, address.val);
}

async function getInterestRateModel(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(await aToken.methods.interestRateModel().call());
}

async function aTokenAddress(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(aToken._address);
}

async function getATokenAdmin(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(await aToken.methods.admin().call());
}

async function getATokenPendingAdmin(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(await aToken.methods.pendingAdmin().call());
}

async function balanceOfUnderlying(world: World, aToken: AToken, user: string): Promise<NumberV> {
  return new NumberV(await aToken.methods.balanceOfUnderlying(user).call());
}

async function getBorrowBalance(world: World, aToken: AToken, user): Promise<NumberV> {
  return new NumberV(await aToken.methods.borrowBalanceCurrent(user).call());
}

async function getBorrowBalanceStored(world: World, aToken: AToken, user): Promise<NumberV> {
  return new NumberV(await aToken.methods.borrowBalanceStored(user).call());
}

async function getTotalBorrows(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.totalBorrows().call());
}

async function getTotalBorrowsCurrent(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.totalBorrowsCurrent().call());
}

async function getReserveFactor(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.reserveFactorMantissa().call(), 1.0e18);
}

async function getTotalReserves(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.totalReserves().call());
}

async function getComptroller(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(await aToken.methods.comptroller().call());
}

async function getExchangeRateStored(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.exchangeRateStored().call());
}

async function getExchangeRate(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.exchangeRateCurrent().call(), 1e18);
}

async function getCash(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.getCash().call());
}

async function getInterestRate(world: World, aToken: AToken): Promise<NumberV> {
  return new NumberV(await aToken.methods.borrowRatePerBlock().call(), 1.0e18 / 2102400);
}

async function getImplementation(world: World, aToken: AToken): Promise<AddressV> {
  return new AddressV(await (aToken as ABep20Delegator).methods.implementation().call());
}

export function aTokenFetchers() {
  return [
    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### Address

        * "AToken <AToken> Address" - Returns address of AToken contract
          * E.g. "AToken aZRX Address" - Returns aZRX's address
      `,
      "Address",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => aTokenAddress(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### InterestRateModel

        * "AToken <AToken> InterestRateModel" - Returns the interest rate model of AToken contract
          * E.g. "AToken aZRX InterestRateModel" - Returns aZRX's interest rate model
      `,
      "InterestRateModel",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getInterestRateModel(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### Admin

        * "AToken <AToken> Admin" - Returns the admin of AToken contract
          * E.g. "AToken aZRX Admin" - Returns aZRX's admin
      `,
      "Admin",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getATokenAdmin(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### PendingAdmin

        * "AToken <AToken> PendingAdmin" - Returns the pending admin of AToken contract
          * E.g. "AToken aZRX PendingAdmin" - Returns aZRX's pending admin
      `,
      "PendingAdmin",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getATokenPendingAdmin(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### Underlying

        * "AToken <AToken> Underlying" - Returns the underlying asset (if applicable)
          * E.g. "AToken aZRX Underlying"
      `,
      "Underlying",
      [
        new Arg("aToken", getATokenV)
      ],
      async (world, { aToken }) => new AddressV(await aToken.methods.underlying().call()),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressV }, NumberV>(`
        #### UnderlyingBalance

        * "AToken <AToken> UnderlyingBalance <User>" - Returns a user's underlying balance (based on given exchange rate)
          * E.g. "AToken aZRX UnderlyingBalance Geoff"
      `,
      "UnderlyingBalance",
      [
        new Arg("aToken", getATokenV),
        new Arg<AddressV>("address", getAddressV)
      ],
      (world, { aToken, address }) => balanceOfUnderlying(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressV }, NumberV>(`
        #### BorrowBalance

        * "AToken <AToken> BorrowBalance <User>" - Returns a user's borrow balance (including interest)
          * E.g. "AToken aZRX BorrowBalance Geoff"
      `,
      "BorrowBalance",
      [
        new Arg("aToken", getATokenV),
        new Arg("address", getAddressV)
      ],
      (world, { aToken, address }) => getBorrowBalance(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressV }, NumberV>(`
        #### BorrowBalanceStored

        * "AToken <AToken> BorrowBalanceStored <User>" - Returns a user's borrow balance (without specifically re-accruing interest)
          * E.g. "AToken aZRX BorrowBalanceStored Geoff"
      `,
      "BorrowBalanceStored",
      [
        new Arg("aToken", getATokenV),
        new Arg("address", getAddressV)
      ],
      (world, { aToken, address }) => getBorrowBalanceStored(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### TotalBorrows

        * "AToken <AToken> TotalBorrows" - Returns the aToken's total borrow balance
          * E.g. "AToken aZRX TotalBorrows"
      `,
      "TotalBorrows",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalBorrows(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### TotalBorrowsCurrent

        * "AToken <AToken> TotalBorrowsCurrent" - Returns the aToken's total borrow balance with interest
          * E.g. "AToken aZRX TotalBorrowsCurrent"
      `,
      "TotalBorrowsCurrent",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalBorrowsCurrent(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### Reserves

        * "AToken <AToken> Reserves" - Returns the aToken's total reserves
          * E.g. "AToken aZRX Reserves"
      `,
      "Reserves",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalReserves(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### ReserveFactor

        * "AToken <AToken> ReserveFactor" - Returns reserve factor of AToken contract
          * E.g. "AToken aZRX ReserveFactor" - Returns aZRX's reserve factor
      `,
      "ReserveFactor",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getReserveFactor(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### Comptroller

        * "AToken <AToken> Comptroller" - Returns the aToken's comptroller
          * E.g. "AToken aZRX Comptroller"
      `,
      "Comptroller",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getComptroller(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### ExchangeRateStored

        * "AToken <AToken> ExchangeRateStored" - Returns the aToken's exchange rate (based on balances stored)
          * E.g. "AToken aZRX ExchangeRateStored"
      `,
      "ExchangeRateStored",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getExchangeRateStored(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### ExchangeRate

        * "AToken <AToken> ExchangeRate" - Returns the aToken's current exchange rate
          * E.g. "AToken aZRX ExchangeRate"
      `,
      "ExchangeRate",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getExchangeRate(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### Cash

        * "AToken <AToken> Cash" - Returns the aToken's current cash
          * E.g. "AToken aZRX Cash"
      `,
      "Cash",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getCash(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberV>(`
        #### InterestRate

        * "AToken <AToken> InterestRate" - Returns the aToken's current interest rate
          * E.g. "AToken aZRX InterestRate"
      `,
      "InterestRate",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, {aToken}) => getInterestRate(world, aToken),
      {namePos: 1}
    ),
    new Fetcher<{aToken: AToken, signature: StringV}, NumberV>(`
        #### CallNum

        * "AToken <AToken> Call <signature>" - Simple direct call method, for now with no parameters
          * E.g. "AToken aZRX Call \"borrowIndex()\""
      `,
      "CallNum",
      [
        new Arg("aToken", getATokenV),
        new Arg("signature", getStringV),
      ],
      async (world, {aToken, signature}) => {
        const res = await world.web3.eth.call({
            to: aToken._address,
            data: world.web3.eth.abi.encodeFunctionSignature(signature.val)
          })
        const resNum : any = world.web3.eth.abi.decodeParameter('uint256',res);
        return new NumberV(resNum);
      }
      ,
      {namePos: 1}
    ),
    new Fetcher<{ aToken: AToken }, AddressV>(`
        #### Implementation

        * "AToken <AToken> Implementation" - Returns the aToken's current implementation
          * E.g. "AToken aDAI Implementation"
      `,
      "Implementation",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getImplementation(world, aToken),
      { namePos: 1 }
    )
  ];
}

export async function getATokenValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("aToken", aTokenFetchers(), world, event);
}
