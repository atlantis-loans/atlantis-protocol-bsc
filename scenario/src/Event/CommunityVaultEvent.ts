import { Event } from '../Event';
import { addAction, World, describeUser } from '../World';
import { CommunityVault } from '../Contract/CommunityVault';
import { buildCommunityVaultImpl } from '../Builder/CommunityVaultImplBuilder';
import { invoke } from '../Invokation';
import {
  getAddressV,
  getEventV,
  getNumberV,
  getBoolV
} from '../CoreValue';
import {
  AddressV,
  EventV,
  NumberV,
  BoolV
} from '../Value';
import { Arg, Command, processCommandEvent } from '../Command';
import { getCommunityVault } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';

async function genCommunityVault(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, communityVaultImpl, communityVaultData } = await buildCommunityVaultImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed immutable Atlantis Vault (${communityVaultImpl.name}) to address ${communityVaultImpl._address}`,
    communityVaultData.invokation
  );

  return world;
}

async function delegate(world: World, from: string, communityVault: CommunityVault, account: string): Promise<World> {
  let invokation = await invoke(world, communityVault.methods.delegate(account), from, NoErrorReporter);

  world = addAction(
    world,
    `"Delegated from" ${from} to ${account}`,
    invokation
  );

  return world;
}

async function setCommunityStore(
  world: World,
  from: string,
  communityVault: CommunityVault,
  atlantis: string,
  communityStore: string
): Promise<World> {
  let invokation = await invoke(world, communityVault.methods.setCommunityStore(atlantis, communityStore), from, NoErrorReporter);

  world = addAction(
    world,
    `Configured Atlantis=${atlantis}, CommunityStore=${communityStore} in the CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

async function addPool(
  world: World,
  from: string,
  communityVault: CommunityVault,
  rewardToken: string,
  allocPoint: NumberV,
  token: string,
  rewardPerBlock: NumberV,
  lockPeriod: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    communityVault.methods.add(
      rewardToken, allocPoint.encode(), token,
      rewardPerBlock.encode(), lockPeriod.encode()
    ),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Added new (${token}, ${rewardToken}) pool to CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

async function deposit(
  world: World,
  from: string,
  communityVault: CommunityVault,
  rewardToken: string,
  pid: NumberV,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    communityVault.methods.deposit(rewardToken, pid.toNumber(), amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Deposited ${amount.toString()} tokens to pool (${rewardToken}, ${pid.toNumber()})
     in the CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

async function requestWithdrawal(
  world: World,
  from: string,
  communityVault: CommunityVault,
  rewardToken: string,
  pid: NumberV,
  amount: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    communityVault.methods.requestWithdrawal(rewardToken, pid.toNumber(), amount.encode()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Requested withdrawal of ${amount.toString()} tokens from pool (${rewardToken}, ${pid.toNumber()})
     in the CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

async function executeWithdrawal(
  world: World,
  from: string,
  communityVault: CommunityVault,
  rewardToken: string,
  pid: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    communityVault.methods.executeWithdrawal(rewardToken, pid.toNumber()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Executed withdrawal of tokens from pool (${rewardToken}, ${pid.toNumber()})
     in the CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

async function setWithdrawalLockingPeriod(
  world: World,
  from: string,
  communityVault: CommunityVault,
  rewardToken: string,
  pid: NumberV,
  newPeriod: NumberV
): Promise<World> {
  let invokation = await invoke(
    world,
    communityVault.methods.setWithdrawalLockingPeriod(rewardToken, pid.toNumber(), newPeriod.toNumber()),
    from,
    NoErrorReporter
  );

  world = addAction(
    world,
    `Set lock period to ${newPeriod.toString()} in the CommunityVault (${communityVault._address})`,
    invokation
  );

  return world;
}

export function communityVaultCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new Community Vault (non-proxy version)
        * E.g. "CommunityVault Deploy MyVaultImpl"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genCommunityVault(world, from, params.val)
    ),

    new Command<{ communityVault: CommunityVault, account: AddressV }>(
      `
        #### Delegate

        * "CommunityVault Delegate account:<Address>" - Delegates votes to a given account
        * E.g. "CommunityVault Delegate Torrey"
      `,
      "Delegate",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, from, { communityVault, account }) => delegate(world, from, communityVault, account.val)
    ),

    new Command<{ communityVault: CommunityVault, atlantis: AddressV, communityStore: AddressV }>(
      `
        #### SetCommunityStore

        * "CommunityVault SetCommunityStore atlantis:<Address> communityStore:<Address>" - Configures Atlantis and CommunityStore addresses in the vault
        * E.g. "CommunityVault SetCommunityStore (Address Atlantis) (Address CommunityStore)"
      `,
      "SetCommunityStore",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("atlantis", getAddressV),
        new Arg("communityStore", getAddressV),
      ],
      (world, from, { communityVault, atlantis, communityStore }) =>
          setCommunityStore(world, from, communityVault, atlantis.val, communityStore.val)
    ),

    new Command<{
      communityVault: CommunityVault,
      rewardToken: AddressV,
      allocPoint: NumberV,
      token: AddressV,
      rewardPerBlock: NumberV,
      lockPeriod: NumberV
    }>(
      `
        #### Add

        * "CommunityVault Add rewardToken:<Address> allocPoint:<Number> token:<Address> rewardPerBlock:<Number>"
            - Adds a new token pool
        * E.g. "CommunityVault Add (Address Atlantis) 1000 (Address Atlantis) 12345"
      `,
      "Add",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("allocPoint", getNumberV),
        new Arg("token", getAddressV),
        new Arg("rewardPerBlock", getNumberV),
        new Arg("lockPeriod", getNumberV)
      ],
      (world, from, { communityVault, rewardToken, allocPoint, token, rewardPerBlock, lockPeriod }) =>
          addPool(
            world, from, communityVault, rewardToken.val, allocPoint,
            token.val, rewardPerBlock, lockPeriod
          )
    ),

    new Command<{
      communityVault: CommunityVault,
      rewardToken: AddressV,
      pid: NumberV,
      amount: NumberV
    }>(
      `
        #### Deposit

        * "CommunityVault Deposit rewardToken:<Address> pid:<Number> amount:<Number>"
            - Deposits tokens to the pool identified by (rewardToken, pid) pair
        * E.g. "CommunityVault Deposit (Address Atlantis) 42 12345"
      `,
      "Deposit",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { communityVault, rewardToken, pid, amount }) =>
          deposit(world, from, communityVault, rewardToken.val, pid, amount)
    ),

    new Command<{
      communityVault: CommunityVault,
      rewardToken: AddressV,
      pid: NumberV,
      amount: NumberV
    }>(
      `
        #### RequestWithdrawal

        * "CommunityVault RequestWithdrawal rewardToken:<Address> pid:<Number> amount:<Number>"
            - Submits a withdrawal request
        * E.g. "CommunityVault RequestWithdrawal (Address Atlantis) 42 12345"
      `,
      "RequestWithdrawal",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { communityVault, rewardToken, pid, amount }) =>
          requestWithdrawal(world, from, communityVault, rewardToken.val, pid, amount)
    ),

    new Command<{
      communityVault: CommunityVault,
      rewardToken: AddressV,
      pid: NumberV
    }>(
      `
        #### ExecuteWithdrawal

        * "CommunityVault ExecuteWithdrawal rewardToken:<Address> pid:<Number>"
            - Executes all requests eligible for withdrawal in a certain pool
        * E.g. "CommunityVault ExecuteWithdrawal (Address Atlantis) 42"
      `,
      "ExecuteWithdrawal",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
      ],
      (world, from, { communityVault, rewardToken, pid }) =>
          executeWithdrawal(world, from, communityVault, rewardToken.val, pid)
    ),

    new Command<{
      communityVault: CommunityVault,
      rewardToken: AddressV,
      pid: NumberV,
      newPeriod: NumberV
    }>(
      `
        #### SetWithdrawalLockingPeriod

        * "CommunityVault SetWithdrawalLockingPeriod rewardToken:<Address> pid:<Number> newPeriod:<Number>"
            - Sets the locking period for withdrawals
        * E.g. "CommunityVault SetWithdrawalLockingPeriod (Address Atlantis) 0 42"
      `,
      "SetWithdrawalLockingPeriod",
      [
        new Arg("communityVault", getCommunityVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("newPeriod", getNumberV),
      ],
      (world, from, { communityVault, rewardToken, pid, newPeriod }) =>
        setWithdrawalLockingPeriod(world, from, communityVault, rewardToken.val, pid, newPeriod)
    ),
  ];
}

export async function processCommunityVaultEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("CommunityVault", communityVaultCommands(), world, event, from);
}
