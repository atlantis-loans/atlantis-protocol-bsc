import { Event } from "../Event";
import { World } from "../World";
import { Invokation } from "../Invokation";
import { Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract } from "../Contract";
import { CommunityVaultProxy } from "../Contract/CommunityVault";

const CommunityVaultProxyContract = getContract("CommunityVaultProxy");

export interface CommunityVaultProxyData {
  invokation: Invokation<CommunityVaultProxy>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildCommunityVaultProxy(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; communityVaultProxy: CommunityVaultProxy; communityVaultData: CommunityVaultProxyData }> {
  const fetchers = [
    new Fetcher<{}, CommunityVaultProxyData>(
      `
      #### CommunityVaultProxy
      * "CommunityVaultProxy Deploy" - Deploys Community Vault proxy contract
      * E.g. "CommunityVaultProxy Deploy"
      `,
      "CommunityVaultProxy",
      [],
      async (world, {}) => {
        return {
          invokation: await CommunityVaultProxyContract.deploy<CommunityVaultProxy>(world, from, []),
          name: "CommunityVaultProxy",
          contract: "CommunityVaultProxy"
        };
      },
      { catchall: true }
    )
  ];

  let communityVaultData = await getFetcherValue<any, CommunityVaultProxyData>(
    "DeployCommunityVaultProxy",
    fetchers,
    world,
    params
  );
  let invokation = communityVaultData.invokation!;
  delete communityVaultData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const communityVaultProxy = invokation.value!;
  communityVaultData.address = communityVaultProxy._address;

  world = await storeAndSaveContract(
    world,
    communityVaultProxy,
    communityVaultData.name,
    invokation,
    [
      { index: ["CommunityVaultProxy", communityVaultData.name], data: communityVaultData },
    ]
  );

  return { world, communityVaultProxy, communityVaultData };
}
