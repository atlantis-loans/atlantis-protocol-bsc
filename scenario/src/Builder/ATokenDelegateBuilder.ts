import { Event } from '../Event';
import { World } from '../World';
import { ABep20Delegate, ABep20DelegateScenario } from '../Contract/ABep20Delegate';
import { AToken } from '../Contract/AToken';
import { Invokation } from '../Invokation';
import { getStringV } from '../CoreValue';
import { AddressV, NumberV, StringV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract, getTestContract } from '../Contract';

const ADaiDelegateContract = getContract('ADaiDelegate');
const ADaiDelegateScenarioContract = getTestContract('ADaiDelegateScenario');
const ABep20DelegateContract = getContract('ABep20Delegate');
const ABep20DelegateScenarioContract = getTestContract('ABep20DelegateScenario');


export interface ATokenDelegateData {
  invokation: Invokation<ABep20Delegate>;
  name: string;
  contract: string;
  description?: string;
}

export async function buildATokenDelegate(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; aTokenDelegate: ABep20Delegate; delegateData: ATokenDelegateData }> {
  const fetchers = [
    new Fetcher<{ name: StringV; }, ATokenDelegateData>(
      `
        #### ADaiDelegate

        * "ADaiDelegate name:<String>"
          * E.g. "ATokenDelegate Deploy ADaiDelegate aDAIDelegate"
      `,
      'ADaiDelegate',
      [
        new Arg('name', getStringV)
      ],
      async (
        world,
        { name }
      ) => {
        return {
          invokation: await ADaiDelegateContract.deploy<ABep20Delegate>(world, from, []),
          name: name.val,
          contract: 'ADaiDelegate',
          description: 'Standard ADai Delegate'
        };
      }
    ),

    new Fetcher<{ name: StringV; }, ATokenDelegateData>(
      `
        #### ADaiDelegateScenario

        * "ADaiDelegateScenario name:<String>" - A ADaiDelegate Scenario for local testing
          * E.g. "ATokenDelegate Deploy ADaiDelegateScenario aDAIDelegate"
      `,
      'ADaiDelegateScenario',
      [
        new Arg('name', getStringV)
      ],
      async (
        world,
        { name }
      ) => {
        return {
          invokation: await ADaiDelegateScenarioContract.deploy<ABep20DelegateScenario>(world, from, []),
          name: name.val,
          contract: 'ADaiDelegateScenario',
          description: 'Scenario ADai Delegate'
        };
      }
    ),

    new Fetcher<{ name: StringV; }, ATokenDelegateData>(
      `
        #### ABep20Delegate

        * "ABep20Delegate name:<String>"
          * E.g. "ATokenDelegate Deploy ABep20Delegate aDAIDelegate"
      `,
      'ABep20Delegate',
      [
        new Arg('name', getStringV)
      ],
      async (
        world,
        { name }
      ) => {
        return {
          invokation: await ABep20DelegateContract.deploy<ABep20Delegate>(world, from, []),
          name: name.val,
          contract: 'ABep20Delegate',
          description: 'Standard ABep20 Delegate'
        };
      }
    ),

    new Fetcher<{ name: StringV; }, ATokenDelegateData>(
      `
        #### ABep20DelegateScenario

        * "ABep20DelegateScenario name:<String>" - A ABep20Delegate Scenario for local testing
          * E.g. "ATokenDelegate Deploy ABep20DelegateScenario aDAIDelegate"
      `,
      'ABep20DelegateScenario',
      [
        new Arg('name', getStringV),
      ],
      async (
        world,
        { name }
      ) => {
        return {
          invokation: await ABep20DelegateScenarioContract.deploy<ABep20DelegateScenario>(world, from, []),
          name: name.val,
          contract: 'ABep20DelegateScenario',
          description: 'Scenario ABep20 Delegate'
        };
      }
    )
  ];

  let delegateData = await getFetcherValue<any, ATokenDelegateData>("DeployAToken", fetchers, world, params);
  let invokation = delegateData.invokation;
  delete delegateData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const aTokenDelegate = invokation.value!;

  world = await storeAndSaveContract(
    world,
    aTokenDelegate,
    delegateData.name,
    invokation,
    [
      {
        index: ['ATokenDelegate', delegateData.name],
        data: {
          address: aTokenDelegate._address,
          contract: delegateData.contract,
          description: delegateData.description
        }
      }
    ]
  );

  return { world, aTokenDelegate, delegateData };
}
