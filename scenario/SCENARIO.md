
# Types
* `name:<Type>` - Helper to describe arguments with names, not actually input this way
* `<Bool>` - `True` or `False`
* `<Number>` - A standard number (e.g. `5` or `6.0` or `10.0e18`)
* `<AToken>` - The local name for a given aToken when created, e.g. `aZRX`
* `<User>` - One of: `Admin, Bank, Geoff, Torrey, Robert, Coburn, Jared`
* `<String>` - A string, may be quoted but does not have to be if a single-word (e.g. `"Mint"` or `Mint`)
* `<Address>` - TODO
* `<Assertion>` - See assertions below.

# Events

## Core Events

* "History n:<Number>=5" - Prints history of actions
  * E.g. "History"
  * E.g. "History 10"
* `Read ...` - Reads given value and prints result
  * E.g. `Read AToken aBAT ExchangeRateStored` - Returns exchange rate of aBAT
* `Assert <Assertion>` - Validates given assertion, raising an exception if assertion fails
  * E.g. `Assert Equal (Bep20 BAT TokenBalance Geoff) (Exactly 5.0)` - Returns exchange rate of aBAT
* `FastForward n:<Number> Blocks` - For `ATokenScenario`, moves the block number forward n blocks. Note: in `ATokenScenario` the current block number is mocked (starting at 100000). Thus, this is the only way for the protocol to see a higher block number (for accruing interest).
  * E.g. `FastForward 5 Blocks` - Move block number forward 5 blocks.
* `Inspect` - Prints debugging information about the world
* `Debug message:<String>` - Same as inspect but prepends with a string
* `From <User> <Event>` - Runs event as the given user
  * E.g. `From Geoff (AToken aZRX Mint 5e18)`
* `Invariant <Invariant>` - Adds a new invariant to the world which is checked after each transaction
  * E.g. `Invariant Static (AToken aZRX TotalSupply)`
* `WipeInvariants` - Removes all invariants.
* `Comptroller <ComptrollerEvent>` - Runs given Comptroller event
  * E.g. `Comptroller _setReserveFactor 0.5`
* `AToken <ATokenEvent>` - Runs given AToken event
  * E.g. `AToken aZRX Mint 5e18`
* `Bep20 <Bep20Event>` - Runs given Bep20 event
  * E.g. `Bep20 ZRX Facuet Geoff 5e18`
* `InterestRateModel ...event` - Runs given interest rate model event
  * E.g. `InterestRateModel Deployed (Fixed 0.5)`
* `PriceOracle <PriceOracleEvent>` - Runs given Price Oracle event
  * E.g. `PriceOracle SetPrice aZRX 1.5`

## Comptroller Events

* "Comptroller Deploy ...comptrollerParams" - Generates a new Comptroller
  * E.g. "Comptroller Deploy Scenario (PriceOracle Address) 0.1 10"
* `Comptroller SetPaused action:<String> paused:<Bool>` - Pauses or unpaused given aToken function (e.g. Mint)
  * E.g. `Comptroller SetPaused Mint True`
* `Comptroller SupportMarket <AToken>` - Adds support in the Comptroller for the given aToken
  * E.g. `Comptroller SupportMarket aZRX`
* `Comptroller EnterMarkets <User> <AToken> ...` - User enters the given markets
  * E.g. `Comptroller EnterMarkets Geoff aZRX aBNB`
* `Comptroller SetMaxAssets <Number>` - Sets (or resets) the max allowed asset count
  * E.g. `Comptroller SetMaxAssets 4`
* `AToken <aToken> SetOracle oracle:<Contract>` - Sets the oracle
  * E.g. `Comptroller SetOracle (Fixed 1.5)`
* `Comptroller SetCollateralFactor <AToken> <Number>` - Sets the collateral factor for given aToken to number
  * E.g. `Comptroller SetCollateralFactor aZRX 0.1`
* `FastForward n:<Number> Blocks` - Moves the block number forward `n` blocks. Note: in `ATokenScenario` and `ComptrollerScenario` the current block number is mocked (starting at 100000). This is the only way for the protocol to see a higher block number (for accruing interest).
  * E.g. `Comptroller FastForward 5 Blocks` - Move block number forward 5 blocks.

## aToken Events

* `AToken Deploy name:<AToken> underlying:<Contract> comptroller:<Contract> interestRateModel:<Contract> initialExchangeRate:<Number> decimals:<Number> admin:<Address>` - Generates a new comptroller and sets to world global
  * E.g. `AToken Deploy aZRX (Bep20 ZRX Address) (Comptroller Address) (InterestRateModel Address) 1.0 18`
* `AToken <aToken> AccrueInterest` - Accrues interest for given token
  * E.g. `AToken aZRX AccrueInterest`
* `AToken <aToken> Mint <User> amount:<Number>` - Mints the given amount of aToken as specified user
  * E.g. `AToken aZRX Mint Geoff 1.0`
* `AToken <aToken> Redeem <User> amount:<Number>` - Redeems the given amount of aToken as specified user
      * E.g. `AToken aZRX Redeem Geoff 1.0e18`
* `AToken <aToken> Borrow <User> amount:<Number>` - Borrows the given amount of this aToken as specified user
      * E.g. `AToken aZRX Borrow Geoff 1.0e18`
* `AToken <aToken> ReduceReserves amount:<Number>` - Reduces the reserves of the aToken
      * E.g. `AToken aZRX ReduceReserves 1.0e18`
* `AToken <aToken> SetReserveFactor amount:<Number>` - Sets the reserve factor for the aToken
      * E.g. `AToken aZRX SetReserveFactor 0.1`
* `AToken <aToken> SetInterestRateModel interestRateModel:<Contract>` - Sets the interest rate model for the given aToken
  * E.g. `AToken aZRX SetInterestRateModel (Fixed 1.5)`
* `AToken <aToken> SetComptroller comptroller:<Contract>` - Sets the comptroller for the given aToken
  * E.g. `AToken aZRX SetComptroller Comptroller`
* `AToken <aToken> Mock variable:<String> value:<Number>` - Mocks a given value on aToken. Note: value must be a supported mock and this will only work on a ATokenScenario contract.
  * E.g. `AToken aZRX Mock totalBorrows 5.0e18`
  * E.g. `AToken aZRX Mock totalReserves 0.5e18`

## Bep-20 Events

* `Bep20 Deploy name:<Bep20>` - Generates a new BEP-20 token by name
  * E.g. `Bep20 Deploy ZRX`
* `Bep20 <Bep20> Approve <User> <Address> <Amount>` - Adds an allowance between user and address
  * E.g. `Bep20 ZRX Approve Geoff aZRX 1.0e18`
* `Bep20 <Bep20> Faucet <Address> <Amount>` - Adds an arbitrary balance to given user
  * E.g. `Bep20 ZRX Facuet Geoff 1.0e18`

## Price Oracle Events

* `Deploy` - Generates a new price oracle (note: defaults to (Fixed 1.0))
  * E.g. `PriceOracle Deploy (Fixed 1.0)`
  * E.g. `PriceOracle Deploy Simple`
  * E.g. `PriceOracle Deploy NotPriceOracle`
* `SetPrice <AToken> <Amount>` - Sets the per-ether price for the given aToken
  * E.g. `PriceOracle SetPrice aZRX 1.0`

## Interest Rate Model Events

## Deploy

* `Deploy params:<String[]>` - Generates a new interest rate model (note: defaults to (Fixed 0.25))
  * E.g. `InterestRateModel Deploy (Fixed 0.5)`
  * E.g. `InterestRateModel Deploy Whitepaper`

# Values

## Core Values

* `True` - Returns true
* `False` - Returns false
* `Zero` - Returns 0
* `Some` - Returns 100e18
* `Little` - Returns 100e10
* `Exactly <Amount>` - Returns a strict numerical value
  * E.g. `Exactly 5.0`
* `Exp <Amount>` - Returns the mantissa for a given exp
  * E.g. `Exp 5.5`
* `Precisely <Amount>` - Matches a number to given number of significant figures
  * E.g. `Exactly 5.1000` - Matches to 5 sig figs
* `Anything` - Matches anything
* `Nothing` - Matches nothing
* `Default value:<Value> default:<Value>` - Returns value if truthy, otherwise default. Note: this does short-circuit
* `LastContract` - Returns the address of last constructed contract
* `User <...>` - Returns User value (see below)
* `Comptroller <...>` - Returns Comptroller value (see below)
* `AToken <...>` - Returns AToken value (see below)
* `Bep20 <...>` - Returns Bep20 value (see below)
* `InterestRateModel <...>` - Returns InterestRateModel value (see below)
* `PriceOracle <...>` - Returns PriceOracle value (see below)

## User Values

* `User <User> Address` - Returns address of user
  * E.g. `User Geoff Address` - Returns Geoff's address

## Comptroller Values

* `Comptroller Liquidity <User>` - Returns a given user's trued up liquidity
  * E.g. `Comptroller Liquidity Geoff`
* `Comptroller MembershipLength <User>` - Returns a given user's length of membership
  * E.g. `Comptroller MembershipLength Geoff`
* `Comptroller CheckMembership <User> <AToken>` - Returns one if user is in asset, zero otherwise.
  * E.g. `Comptroller CheckMembership Geoff aZRX`
* "Comptroller CheckListed <AToken>" - Returns true if market is listed, false otherwise.
  * E.g. "Comptroller CheckListed aZRX"

## AToken Values
* `AToken <AToken> UnderlyingBalance <User>` - Returns a user's underlying balance (based on given exchange rate)
  * E.g. `AToken aZRX UnderlyingBalance Geoff`
* `AToken <AToken> BorrowBalance <User>` - Returns a user's borrow balance (including interest)
  * E.g. `AToken aZRX BorrowBalance Geoff`
* `AToken <AToken> TotalBorrowBalance` - Returns the aToken's total borrow balance
  * E.g. `AToken aZRX TotalBorrowBalance`
* `AToken <AToken> Reserves` - Returns the aToken's total reserves
  * E.g. `AToken aZRX Reserves`
* `AToken <AToken> Comptroller` - Returns the aToken's comptroller
  * E.g. `AToken aZRX Comptroller`
* `AToken <AToken> PriceOracle` - Returns the aToken's price oracle
  * E.g. `AToken aZRX PriceOracle`
* `AToken <AToken> ExchangeRateStored` - Returns the aToken's exchange rate (based on balances stored)
  * E.g. `AToken aZRX ExchangeRateStored`
* `AToken <AToken> ExchangeRate` - Returns the aToken's current exchange rate
  * E.g. `AToken aZRX ExchangeRate`

## Bep-20 Values

* `Bep20 <Bep20> Address` - Returns address of BEP-20 contract
  * E.g. `Bep20 ZRX Address` - Returns ZRX's address
* `Bep20 <Bep20> Name` - Returns name of BEP-20 contract
  * E.g. `Bep20 ZRX Address` - Returns ZRX's name
* `Bep20 <Bep20> Symbol` - Returns symbol of BEP-20 contract
  * E.g. `Bep20 ZRX Symbol` - Returns ZRX's symbol
* `Bep20 <Bep20> Decimals` - Returns number of decimals in BEP-20 contract
  * E.g. `Bep20 ZRX Decimals` - Returns ZRX's decimals
* `Bep20 <Bep20> TotalSupply` - Returns the BEP-20 token's total supply
  * E.g. `Bep20 ZRX TotalSupply`
  * E.g. `Bep20 aZRX TotalSupply`
* `Bep20 <Bep20> TokenBalance <Address>` - Returns the BEP-20 token balance of a given address
  * E.g. `Bep20 ZRX TokenBalance Geoff` - Returns a user's ZRX balance
  * E.g. `Bep20 aZRX TokenBalance Geoff` - Returns a user's aZRX balance
  * E.g. `Bep20 ZRX TokenBalance aZRX` - Returns aZRX's ZRX balance
* `Bep20 <Bep20> Allowance owner:<Address> spender:<Address>` - Returns the BEP-20 allowance from owner to spender
  * E.g. `Bep20 ZRX Allowance Geoff Torrey` - Returns the ZRX allowance of Geoff to Torrey
  * E.g. `Bep20 aZRX Allowance Geoff Coburn` - Returns the aZRX allowance of Geoff to Coburn
  * E.g. `Bep20 ZRX Allowance Geoff aZRX` - Returns the ZRX allowance of Geoff to the aZRX aToken

## PriceOracle Values

* `Address` - Gets the address of the global price oracle
* `Price asset:<Address>` - Gets the price of the given asset

## Interest Rate Model Values

* `Address` - Gets the address of the global interest rate model

# Assertions

* `Equal given:<Value> expected:<Value>` - Asserts that given matches expected.
  * E.g. `Assert Equal (Exactly 0) Zero`
  * E.g. `Assert Equal (AToken aZRX TotalSupply) (Exactly 55)`
  * E.g. `Assert Equal (AToken aZRX Comptroller) (Comptroller Address)`
* `True given:<Value>` - Asserts that given is true.
  * E.g. `Assert True (Comptroller CheckMembership Geoff aBNB)`
* `False given:<Value>` - Asserts that given is false.
  * E.g. `Assert False (Comptroller CheckMembership Geoff aBNB)`
* `Failure error:<String> info:<String> detail:<Number?>` - Asserts that last transaction had a graceful failure with given error, info and detail.
  * E.g. `Assert Failure UNAUTHORIZED SUPPORT_MARKET_OWNER_CHECK`
  * E.g. `Assert Failure MATH_ERROR MINT_CALCULATE_BALANCE 5`
* `Revert` - Asserts that the last transaction reverted.
* `Success` - Asserts that the last transaction completed successfully (that is, did not revert nor emit graceful failure).
* `Log name:<String> ((key:<String> value:<Value>) ...)` - Asserts that last transaction emitted log with given name and key-value pairs.
  * E.g. `Assert Log Minted (("account" (User Geoff address)) ("amount" (Exactly 55)))`
