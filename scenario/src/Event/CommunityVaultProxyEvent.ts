import { Event } from '../Event';
import { addAction, World } from '../World';
import { CommunityVaultProxy } from '../Contract/CommunityVault';
import { buildCommunityVaultProxy } from '../Builder/CommunityVaultProxyBuilder';
import { invoke } from '../Invokation';
import {
  getAddressV,
  getEventV
} from '../CoreValue';
import {
  AddressV,
  EventV
} from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getCommunityVaultProxy } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';

async function genCommunityVaultProxy(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, communityVaultProxy, communityVaultData } = await buildCommunityVaultProxy(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed Community Vault Proxy to address ${communityVaultProxy._address}`,
    communityVaultData.invokation
  );

  return world;
}

async function setPendingImplementation(world: World, from: string, communityVault: CommunityVaultProxy, impl: string): Promise<World> {
  let invokation = await invoke(world, communityVault.methods._setPendingImplementation(impl), from, NoErrorReporter);

  world = addAction(
    world,
    `Set pending implementation of ${communityVault.name} to ${impl}`,
    invokation
  );

  return world;
}

export function communityVaultProxyCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new Community Vault (non-proxy version)
        * E.g. "CommunityVaultProxy Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genCommunityVaultProxy(world, from, params.val)
    ),
    new Command<{ communityVaultProxy: CommunityVaultProxy, newImpl: AddressV }>(
      `
        #### SetPendingImplementation

        * "CommunityVault SetPendingImplementation newImpl:<Address>" - Sets the new pending implementation
        * E.g. "CommunityVault SetPendingImplementation (Address CommunityVaultImplementation)"
      `,
      "SetPendingImplementation",
      [
        new Arg("communityVaultProxy", getCommunityVaultProxy, { implicit: true }),
        new Arg("newImpl", getAddressV),
      ],
      (world, from, { communityVaultProxy, newImpl }) =>
            setPendingImplementation(world, from, communityVaultProxy, newImpl.val)
    )
  ];
}

export async function processCommunityVaultProxyEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("CommunityVaultProxy", communityVaultProxyCommands(), world, event, from);
}
