import { Event } from '../Event';
import { addAction, World, describeUser } from '../World';
import { Atlantis, AtlantisScenario } from '../Contract/Atlantis';
import { buildAtlantis } from '../Builder/AtlantisBuilder';
import { invoke } from '../Invokation';
import {
  getAddressV,
  getEventV,
  getNumberV,
  getStringV,
} from '../CoreValue';
import {
  AddressV,
  EventV,
  NumberV,
  StringV
} from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getAtlantis } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';
import { verify } from '../Verify';
import { encodedNumber } from '../Encoding';

async function genAtlantis(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, atlantis, tokenData } = await buildAtlantis(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed Atlantis (${atlantis.name}) to address ${atlantis._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyAtlantis(world: World, atlantis: Atlantis, apiKey: string, modelName: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, atlantis._address);
  }

  return world;
}

async function approve(world: World, from: string, atlantis: Atlantis, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Approved Atlantis token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function transfer(world: World, from: string, atlantis: Atlantis, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Atlantis tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(world: World, from: string, atlantis: Atlantis, owner: string, spender: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.transferFrom(owner, spender, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} Atlantis tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function transferScenario(world: World, from: string, atlantis: AtlantisScenario, addresses: string[], amount: NumberV): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.transferScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Atlantis tokens from ${from} to ${addresses}`,
    invokation
  );

  return world;
}

async function transferFromScenario(world: World, from: string, atlantis: AtlantisScenario, addresses: string[], amount: NumberV): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.transferFromScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Atlantis tokens from ${addresses} to ${from}`,
    invokation
  );

  return world;
}

async function delegate(world: World, from: string, atlantis: Atlantis, account: string): Promise<World> {
  let invokation = await invoke(world, atlantis.methods.delegate(account), from, NoErrorReporter);

  world = addAction(
    world,
    `"Delegated from" ${from} to ${account}`,
    invokation
  );

  return world;
}

async function setBlockNumber(
  world: World,
  from: string,
  atlantis: Atlantis,
  blockNumber: NumberV
): Promise<World> {
  return addAction(
    world,
    `Set Atlantis blockNumber to ${blockNumber.show()}`,
    await invoke(world, atlantis.methods.setBlockNumber(blockNumber.encode()), from)
  );
}

export function atlantisCommands() {
  return [
    new Command<{ params: EventV }>(`
        #### Deploy

        * "Deploy ...params" - Generates a new Atlantis token
          * E.g. "Atlantis Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genAtlantis(world, from, params.val)
    ),

    new View<{ atlantis: Atlantis, apiKey: StringV, contractName: StringV }>(`
        #### Verify

        * "<Atlantis> Verify apiKey:<String> contractName:<String>=Atlantis" - Verifies Atlantis token in Etherscan
          * E.g. "Atlantis Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("Atlantis") })
      ],
      async (world, { atlantis, apiKey, contractName }) => {
        return await verifyAtlantis(world, atlantis, apiKey.val, atlantis.name, contractName.val)
      }
    ),

    new Command<{ atlantis: Atlantis, spender: AddressV, amount: NumberV }>(`
        #### Approve

        * "Atlantis Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "Atlantis Approve Geoff 1.0e18"
      `,
      "Approve",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { atlantis, spender, amount }) => {
        return approve(world, from, atlantis, spender.val, amount)
      }
    ),

    new Command<{ atlantis: Atlantis, recipient: AddressV, amount: NumberV }>(`
        #### Transfer

        * "Atlantis Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "Atlantis Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { atlantis, recipient, amount }) => transfer(world, from, atlantis, recipient.val, amount)
    ),

    new Command<{ atlantis: Atlantis, owner: AddressV, spender: AddressV, amount: NumberV }>(`
        #### TransferFrom

        * "Atlantis TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "Atlantis TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { atlantis, owner, spender, amount }) => transferFrom(world, from, atlantis, owner.val, spender.val, amount)
    ),

    new Command<{ atlantis: AtlantisScenario, recipients: AddressV[], amount: NumberV }>(`
        #### TransferScenario

        * "Atlantis TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "Atlantis TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV)
      ],
      (world, from, { atlantis, recipients, amount }) => transferScenario(world, from, atlantis, recipients.map(recipient => recipient.val), amount)
    ),

    new Command<{ atlantis: AtlantisScenario, froms: AddressV[], amount: NumberV }>(`
        #### TransferFromScenario

        * "Atlantis TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "Atlantis TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV)
      ],
      (world, from, { atlantis, froms, amount }) => transferFromScenario(world, from, atlantis, froms.map(_from => _from.val), amount)
    ),

    new Command<{ atlantis: Atlantis, account: AddressV }>(`
        #### Delegate

        * "Atlantis Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "Atlantis Delegate Torrey"
      `,
      "Delegate",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, from, { atlantis, account }) => delegate(world, from, atlantis, account.val)
    ),
    new Command<{ atlantis: Atlantis, blockNumber: NumberV }>(`
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockTimestamp of the Atlantis Harness
      * E.g. "Atlantis SetBlockNumber 500"
      `,
        'SetBlockNumber',
        [new Arg('atlantis', getAtlantis, { implicit: true }), new Arg('blockNumber', getNumberV)],
        (world, from, { atlantis, blockNumber }) => setBlockNumber(world, from, atlantis, blockNumber)
      )
  ];
}

export async function processAtlantisEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Atlantis", atlantisCommands(), world, event, from);
}
