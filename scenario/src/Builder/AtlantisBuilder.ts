import { Event } from '../Event';
import { World, addAction } from '../World';
import { Atlantis, AtlantisScenario } from '../Contract/Atlantis';
import { Invokation } from '../Invokation';
import { getAddressV } from '../CoreValue';
import { StringV, AddressV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const AtlantisContract = getContract('Atlantis');
const AtlantisScenarioContract = getContract('AtlantisScenario');

export interface TokenData {
  invokation: Invokation<Atlantis>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildAtlantis(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; atlantis: Atlantis; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "Atlantis Deploy Scenario account:<Address>" - Deploys Scenario Atlantis Token
        * E.g. "Atlantis Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        return {
          invokation: await AtlantisScenarioContract.deploy<AtlantisScenario>(world, from, [account.val]),
          contract: 'AtlantisScenario',
          symbol: 'Atlantis',
          name: 'Atlantis Governance Token',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Atlantis

      * "Atlantis Deploy account:<Address>" - Deploys Atlantis Token
        * E.g. "Atlantis Deploy Geoff"
    `,
      'Atlantis',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await AtlantisScenarioContract.deploy<AtlantisScenario>(world, from, [account.val]),
            contract: 'AtlantisScenario',
            symbol: 'Atlantis',
            name: 'Atlantis Governance Token',
            decimals: 18
          };
        } else {
          return {
            invokation: await AtlantisContract.deploy<Atlantis>(world, from, [account.val]),
            contract: 'Atlantis',
            symbol: 'Atlantis',
            name: 'Atlantis Governance Token',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployAtl", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const atlantis = invokation.value!;
  tokenData.address = atlantis._address;

  world = await storeAndSaveContract(
    world,
    atlantis,
    'Atlantis',
    invokation,
    [
      { index: ['Atlantis'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, atlantis, tokenData };
}
