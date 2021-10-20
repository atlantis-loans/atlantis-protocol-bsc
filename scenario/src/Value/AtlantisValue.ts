import { Event } from '../Event';
import { World } from '../World';
import { Atlantis } from '../Contract/Atlantis';
import {
  getAddressV,
  getNumberV
} from '../CoreValue';
import {
  AddressV,
  ListV,
  NumberV,
  StringV,
  Value
} from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getAtlantis } from '../ContractLookup';

export function atlantisFetchers() {
  return [
    new Fetcher<{ atlantis: Atlantis }, AddressV>(`
        #### Address

        * "<Atlantis> Address" - Returns the address of Atlantis token
          * E.g. "Atlantis Address"
      `,
      "Address",
      [
        new Arg("atlantis", getAtlantis, { implicit: true })
      ],
      async (world, { atlantis }) => new AddressV(atlantis._address)
    ),

    new Fetcher<{ atlantis: Atlantis }, StringV>(`
        #### Name

        * "<Atlantis> Name" - Returns the name of the Atlantis token
          * E.g. "Atlantis Name"
      `,
      "Name",
      [
        new Arg("atlantis", getAtlantis, { implicit: true })
      ],
      async (world, { atlantis }) => new StringV(await atlantis.methods.name().call())
    ),

    new Fetcher<{ atlantis: Atlantis }, StringV>(`
        #### Symbol

        * "<Atlantis> Symbol" - Returns the symbol of the Atlantis token
          * E.g. "Atlantis Symbol"
      `,
      "Symbol",
      [
        new Arg("atlantis", getAtlantis, { implicit: true })
      ],
      async (world, { atlantis }) => new StringV(await atlantis.methods.symbol().call())
    ),

    new Fetcher<{ atlantis: Atlantis }, NumberV>(`
        #### Decimals

        * "<Atlantis> Decimals" - Returns the number of decimals of the Atlantis token
          * E.g. "Atlantis Decimals"
      `,
      "Decimals",
      [
        new Arg("atlantis", getAtlantis, { implicit: true })
      ],
      async (world, { atlantis }) => new NumberV(await atlantis.methods.decimals().call())
    ),

    new Fetcher<{ atlantis: Atlantis }, NumberV>(`
        #### TotalSupply

        * "Atlantis TotalSupply" - Returns Atlantis token's total supply
      `,
      "TotalSupply",
      [
        new Arg("atlantis", getAtlantis, { implicit: true })
      ],
      async (world, { atlantis }) => new NumberV(await atlantis.methods.totalSupply().call())
    ),

    new Fetcher<{ atlantis: Atlantis, address: AddressV }, NumberV>(`
        #### TokenBalance

        * "Atlantis TokenBalance <Address>" - Returns the Atlantis token balance of a given address
          * E.g. "Atlantis TokenBalance Geoff" - Returns Geoff's Atlantis balance
      `,
      "TokenBalance",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("address", getAddressV)
      ],
      async (world, { atlantis, address }) => new NumberV(await atlantis.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ atlantis: Atlantis, owner: AddressV, spender: AddressV }, NumberV>(`
        #### Allowance

        * "Atlantis Allowance owner:<Address> spender:<Address>" - Returns the Atlantis allowance from owner to spender
          * E.g. "Atlantis Allowance Geoff Torrey" - Returns the Atlantis allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV)
      ],
      async (world, { atlantis, owner, spender }) => new NumberV(await atlantis.methods.allowance(owner.val, spender.val).call())
    ),

    new Fetcher<{ atlantis: Atlantis, account: AddressV }, NumberV>(`
        #### GetCurrentVotes

        * "Atlantis GetCurrentVotes account:<Address>" - Returns the current Atlantis votes balance for an account
          * E.g. "Atlantis GetCurrentVotes Geoff" - Returns the current Atlantis vote balance of Geoff
      `,
      "GetCurrentVotes",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { atlantis, account }) => new NumberV(await atlantis.methods.getCurrentVotes(account.val).call())
    ),

    new Fetcher<{ atlantis: Atlantis, account: AddressV, blockNumber: NumberV }, NumberV>(`
        #### GetPriorVotes

        * "Atlantis GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current Atlantis votes balance at given block
          * E.g. "Atlantis GetPriorVotes Geoff 5" - Returns the Atlantis vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("blockNumber", getNumberV),
      ],
      async (world, { atlantis, account, blockNumber }) => new NumberV(await atlantis.methods.getPriorVotes(account.val, blockNumber.encode()).call())
    ),

    new Fetcher<{ atlantis: Atlantis, account: AddressV }, NumberV>(`
        #### GetCurrentVotesBlock

        * "Atlantis GetCurrentVotesBlock account:<Address>" - Returns the current Atlantis votes checkpoint block for an account
          * E.g. "Atlantis GetCurrentVotesBlock Geoff" - Returns the current Atlantis votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { atlantis, account }) => {
        const numCheckpoints = Number(await atlantis.methods.numCheckpoints(account.val).call());
        const checkpoint = await atlantis.methods.checkpoints(account.val, numCheckpoints - 1).call();

        return new NumberV(checkpoint.fromBlock);
      }
    ),

    new Fetcher<{ atlantis: Atlantis, account: AddressV }, NumberV>(`
        #### VotesLength

        * "Atlantis VotesLength account:<Address>" - Returns the Atlantis vote checkpoint array length
          * E.g. "Atlantis VotesLength Geoff" - Returns the Atlantis vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { atlantis, account }) => new NumberV(await atlantis.methods.numCheckpoints(account.val).call())
    ),

    new Fetcher<{ atlantis: Atlantis, account: AddressV }, ListV>(`
        #### AllVotes

        * "Atlantis AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "Atlantis AllVotes Geoff" - Returns the Atlantis vote checkpoint array
      `,
      "AllVotes",
      [
        new Arg("atlantis", getAtlantis, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { atlantis, account }) => {
        const numCheckpoints = Number(await atlantis.methods.numCheckpoints(account.val).call());
        const checkpoints = await Promise.all(new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
          const {fromBlock, votes} = await atlantis.methods.checkpoints(account.val, i).call();

          return new StringV(`Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`);
        }));

        return new ListV(checkpoints);
      }
    )
  ];
}

export async function getAtlantisValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Atlantis", atlantisFetchers(), world, event);
}
