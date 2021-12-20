import { Event } from '../Event';
import { addAction, World } from '../World';
import { CommunityVault, CommunityVaultImpl, CommunityVaultProxy } from '../Contract/CommunityVault';
import { buildCommunityVaultImpl } from '../Builder/CommunityVaultImplBuilder';
import { invoke } from '../Invokation';
import { getEventV } from '../CoreValue';
import { EventV } from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getCommunityVaultImpl, getCommunityVaultProxy } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';
import { mergeContractABI } from '../Networks';

async function genCommunityVault(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, communityVaultImpl, communityVaultData } = await buildCommunityVaultImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed Community Vault implementation (${communityVaultImpl.name}) to address ${communityVaultImpl._address}`,
    communityVaultData.invokation
  );

  return world;
}

async function become(
    world: World,
    from: string,
    impl: CommunityVaultImpl,
    proxy: CommunityVaultProxy
  ): Promise<World> {
  let invokation = await invoke(
    world,
    impl.methods._become(proxy._address),
    from,
    NoErrorReporter // TODO: Change to vault reporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons

    // ^ I copied this comment from other parts of the code that merge ABIs but I have no idea
    // what exactly the "number of reasons" means here. So let me just hate people who write
    // these kinds of comments.

    world = await mergeContractABI(world, 'CommunityVault', proxy, proxy.name, impl.name);
  }

  world = addAction(world, `Become ${proxy._address}'s Community Vault Implementation`, invokation);

  return world;
}

export function communityVaultImplCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new Community Vault implementation contract
        * E.g. "CommunityVaultImpl Deploy MyVaultImpl"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genCommunityVault(world, from, params.val)
    ),

    new Command<{ proxy: CommunityVault, impl: CommunityVaultImpl }>(
      `
        #### Become

        * "CommunityVaultImpl <Impl> Become" - Become the new Community Vault implementation
        * E.g. "CommunityVaultImpl MyVoteImpl Become"
      `,
      "Become",
      [
        new Arg("proxy", getCommunityVaultProxy, { implicit: true }),
        new Arg("impl", getCommunityVaultImpl),
      ],
      (world, from, { proxy, impl }) => become(world, from, impl, proxy),
      { namePos: 1 }
    )
  ];
}

export async function processCommunityVaultImplEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("CommunityVaultImpl", communityVaultImplCommands(), world, event, from);
}
