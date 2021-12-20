import { Event } from "../Event";
import { World } from "../World";
import { Invokation } from "../Invokation";
import { getStringV } from "../CoreValue";
import { StringV } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { storeAndSaveContract } from "../Networks";
import { getContract } from "../Contract";
import { CommunityVaultImpl } from "../Contract/CommunityVault";

const CommunityVaultImplementation = getContract("CommunityVault");

export interface CommunityVaultImplData {
  invokation: Invokation<CommunityVaultImpl>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildCommunityVaultImpl(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; communityVaultImpl: CommunityVaultImpl; communityVaultData: CommunityVaultImplData }> {
  const fetchers = [
    new Fetcher<{ name: StringV }, CommunityVaultImplData>(
      `
      #### CommunityVaultImpl
      * "CommunityVaultImpl Deploy name:<String>" - Deploys Community Vault implementation contract
      * E.g. "CommunityVaultImpl Deploy MyVaultImpl"
      `,
      "CommunityVaultImpl",
      [new Arg('name', getStringV)],
      async (world, { name }) => {
        return {
          invokation: await CommunityVaultImplementation.deploy<CommunityVaultImpl>(world, from, []),
          name: name.val,
          contract: "CommunityVault"
        };
      },
      { catchall: true }
    )
  ];

  let communityVaultData = await getFetcherValue<any, CommunityVaultImplData>(
    "DeployCommunityVaultImpl",
    fetchers,
    world,
    params
  );
  let invokation = communityVaultData.invokation!;
  delete communityVaultData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const communityVaultImpl = invokation.value!;
  communityVaultData.address = communityVaultImpl._address;

  world = await storeAndSaveContract(
    world,
    communityVaultImpl,
    communityVaultData.name,
    invokation,
    [
      { index: ["CommunityVault", communityVaultData.name], data: communityVaultData },
    ]
  );

  return { world, communityVaultImpl, communityVaultData };
}
