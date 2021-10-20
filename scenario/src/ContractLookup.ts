import { Map } from 'immutable';

import { Event } from './Event';
import { World } from './World';
import { Contract } from './Contract';
import { mustString } from './Utils';

import { ABep20Delegate } from './Contract/ABep20Delegate';
import { Atlantis } from './Contract/Atlantis';
import { Comptroller } from './Contract/Comptroller';
import { ComptrollerImpl } from './Contract/ComptrollerImpl';
import { AToken } from './Contract/AToken';
import { Governor } from './Contract/Governor';
import { GovernorBravo } from './Contract/GovernorBravo'
import { Bep20 } from './Contract/Bep20';
import { InterestRateModel } from './Contract/InterestRateModel';
import { PriceOracle } from './Contract/PriceOracle';
import { Timelock } from './Contract/Timelock';
import { AnchoredView } from './Contract/AnchoredView';

type ContractDataEl = string | Map<string, object> | undefined;

function getContractData(world: World, indices: string[][]): ContractDataEl {
  return indices.reduce((value: ContractDataEl, index) => {
    if (value) {
      return value;
    } else {
      return index.reduce((data: ContractDataEl, el) => {
        let lowerEl = el.toLowerCase();

        if (!data) {
          return;
        } else if (typeof data === 'string') {
          return data;
        } else {
          return (data as Map<string, ContractDataEl>).find((_v, key) => key.toLowerCase().trim() === lowerEl.trim());
        }
      }, world.contractData);
    }
  }, undefined);
}

function getContractDataString(world: World, indices: string[][]): string {
  const value: ContractDataEl = getContractData(world, indices);

  if (!value || typeof value !== 'string') {
    throw new Error(
      `Failed to find string value by index (got ${value}): ${JSON.stringify(
        indices
      )}, index contains: ${JSON.stringify(world.contractData.toJSON())}`
    );
  }

  return value;
}

export function getWorldContract<T>(world: World, indices: string[][]): T {
  const address = getContractDataString(world, indices);

  return getWorldContractByAddress<T>(world, address);
}

export function getWorldContractByAddress<T>(world: World, address: string): T {
  const contract = world.contractIndex[address.toLowerCase()];

  if (!contract) {
    throw new Error(
      `Failed to find world contract by address: ${address}, index contains: ${JSON.stringify(
        Object.keys(world.contractIndex)
      )}`
    );
  }

  return <T>(<unknown>contract);
}

export async function getTimelock(world: World): Promise<Timelock> {
  return getWorldContract(world, [['Contracts', 'Timelock']]);
}

export async function getUnitroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Unitroller']]);
}

export async function getMaximillion(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Maximillion']]);
}

export async function getComptroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Comptroller']]);
}

export async function getComptrollerImpl(world: World, comptrollerImplArg: Event): Promise<ComptrollerImpl> {
  return getWorldContract(world, [['Comptroller', mustString(comptrollerImplArg), 'address']]);
}

export function getATokenAddress(world: World, aTokenArg: string): string {
  return getContractDataString(world, [['aTokens', aTokenArg, 'address']]);
}

export function getATokenDelegateAddress(world: World, aTokenDelegateArg: string): string {
  return getContractDataString(world, [['ATokenDelegate', aTokenDelegateArg, 'address']]);
}

export function getBep20Address(world: World, erc20Arg: string): string {
  return getContractDataString(world, [['Tokens', erc20Arg, 'address']]);
}

export function getGovernorAddress(world: World, governorArg: string): string {
  return getContractDataString(world, [['Contracts', governorArg]]);
}

export function getGovernorBravo(world: World, governoBravoArg: string): Promise<GovernorBravo> {
  return getWorldContract(world, [['Contracts', 'GovernorBravo']])
}

export async function getPriceOracleProxy(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [['Contracts', 'PriceOracleProxy']]);
}

export async function getAnchoredView(world: World): Promise<AnchoredView> {
  return getWorldContract(world, [['Contracts', 'AnchoredView']]);
}

export async function getPriceOracle(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [['Contracts', 'PriceOracle']]);
}

export async function getAtlantis(
  world: World,
  atlantisArg: Event
): Promise<Atlantis> {
  return getWorldContract(world, [['Atlantis', 'address']]);
}

export async function getAtlantisData(
  world: World,
  atlantisArg: string
): Promise<[Atlantis, string, Map<string, string>]> {
  let contract = await getAtlantis(world, <Event>(<any>atlantisArg));
  let data = getContractData(world, [['Atlantis', atlantisArg]]);

  return [contract, atlantisArg, <Map<string, string>>(<any>data)];
}

export async function getGovernorData(
  world: World,
  governorArg: string
): Promise<[Governor, string, Map<string, string>]> {
  let contract = getWorldContract<Governor>(world, [['Governor', governorArg, 'address']]);
  let data = getContractData(world, [['Governor', governorArg]]);

  return [contract, governorArg, <Map<string, string>>(<any>data)];
}

export async function getInterestRateModel(
  world: World,
  interestRateModelArg: Event
): Promise<InterestRateModel> {
  return getWorldContract(world, [['InterestRateModel', mustString(interestRateModelArg), 'address']]);
}

export async function getInterestRateModelData(
  world: World,
  interestRateModelArg: string
): Promise<[InterestRateModel, string, Map<string, string>]> {
  let contract = await getInterestRateModel(world, <Event>(<any>interestRateModelArg));
  let data = getContractData(world, [['InterestRateModel', interestRateModelArg]]);

  return [contract, interestRateModelArg, <Map<string, string>>(<any>data)];
}

export async function getBep20Data(
  world: World,
  erc20Arg: string
): Promise<[Bep20, string, Map<string, string>]> {
  let contract = getWorldContract<Bep20>(world, [['Tokens', erc20Arg, 'address']]);
  let data = getContractData(world, [['Tokens', erc20Arg]]);

  return [contract, erc20Arg, <Map<string, string>>(<any>data)];
}

export async function getATokenData(
  world: World,
  aTokenArg: string
): Promise<[AToken, string, Map<string, string>]> {
  let contract = getWorldContract<AToken>(world, [['aTokens', aTokenArg, 'address']]);
  let data = getContractData(world, [['ATokens', aTokenArg]]);

  return [contract, aTokenArg, <Map<string, string>>(<any>data)];
}

export async function getATokenDelegateData(
  world: World,
  aTokenDelegateArg: string
): Promise<[ABep20Delegate, string, Map<string, string>]> {
  let contract = getWorldContract<ABep20Delegate>(world, [['ATokenDelegate', aTokenDelegateArg, 'address']]);
  let data = getContractData(world, [['ATokenDelegate', aTokenDelegateArg]]);

  return [contract, aTokenDelegateArg, <Map<string, string>>(<any>data)];
}

export async function getComptrollerImplData(
  world: World,
  comptrollerImplArg: string
): Promise<[ComptrollerImpl, string, Map<string, string>]> {
  let contract = await getComptrollerImpl(world, <Event>(<any>comptrollerImplArg));
  let data = getContractData(world, [['Comptroller', comptrollerImplArg]]);

  return [contract, comptrollerImplArg, <Map<string, string>>(<any>data)];
}

export function getAddress(world: World, addressArg: string): string {
  if (addressArg.toLowerCase() === 'zero') {
    return '0x0000000000000000000000000000000000000000';
  }

  if (addressArg.startsWith('0x')) {
    return addressArg;
  }

  let alias = Object.entries(world.settings.aliases).find(
    ([alias, addr]) => alias.toLowerCase() === addressArg.toLowerCase()
  );
  if (alias) {
    return alias[1];
  }

  let account = world.accounts.find(account => account.name.toLowerCase() === addressArg.toLowerCase());
  if (account) {
    return account.address;
  }

  return getContractDataString(world, [
    ['Contracts', addressArg],
    ['aTokens', addressArg, 'address'],
    ['ATokenDelegate', addressArg, 'address'],
    ['Tokens', addressArg, 'address'],
    ['Comptroller', addressArg, 'address']
  ]);
}

export function getContractByName(world: World, name: string): Contract {
  return getWorldContract(world, [['Contracts', name]]);
}
