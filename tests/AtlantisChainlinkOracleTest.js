const {
  makeChainlinkOracle,
  makeAToken,
} = require("./Utils/Atlantis");

describe("AtlantisChainlinkOracle", () => {
  let root, accounts;
  let bnbFeed, daiFeed, usdcFeed, usdtFeed;
  let oracle, aBnb, aDai, aExampleSet, aExampleUnset, aToken, aUsdc, aUsdt, atl;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    aToken = await makeAToken();
    aBnb = await makeAToken({kind: "abnb",
      comptrollerOpts: {kind: "v1-no-proxy"},
      supportMarket: true
    });
    atl = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
      symbol: "ATL"
    });
    aExampleSet = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
    });
    aExampleUnset = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
    });
    aUsdc = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDC"
      }
    });
    aUsdt = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDT"
      }
    });
    aDai = await makeAToken({
      comptroller: aBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 18,
        symbol: "DAI"
      }
    });
    bnbFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 30000000000});
    usdcFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    usdtFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    daiFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    oracle = await deploy("AtlantisChainlinkOracle");
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let admin = await call(oracle, "admin");
      expect(admin).toEqual(root);
    });
  });

  describe("setFeed", () => {
    it("only admin may set a feed", async () => {
      await expect(
        send(oracle, "setFeed", ["aBNB", bnbFeed._address], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("cannot set feed to self address", async () => {
      await expect(
        send(oracle, "setFeed", ["aBNB", oracle._address], {from: root})
      ).rejects.toRevert("revert invalid feed address");
    });

    it("cannot set feed to zero address", async () => {
      await expect(
        send(
          oracle,
          "setFeed",
          ["aBNB", "0x0000000000000000000000000000000000000000"],
          {from: root}
        )
      ).rejects.toRevert("revert invalid feed address");
    });

    it("sets a feed", async () => {
      await send(oracle, "setFeed", ["aBNB", bnbFeed._address], {from: root});
      let feed = await call(oracle, "getFeed", ["aBNB"]);
      expect(feed).toEqual(bnbFeed._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    beforeEach(async () => {
      await send(oracle, "setFeed", ["aBNB", bnbFeed._address], {from: root});
      await send(oracle, "setFeed", ["USDC", usdcFeed._address], {from: root});
      await send(oracle, "setFeed", ["USDT", usdtFeed._address], {from: root});
      await send(oracle, "setFeed", ["DAI", daiFeed._address], {from: root});
      await send(oracle, "setDirectPrice", [atl._address, 7], {from: root});
      await send(oracle, "setUnderlyingPrice", [aExampleSet._address, 1], {from: root});
    });

    it("gets the price from Chainlink for aBNB", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [aBnb._address], {from: root});
      expect(price).toEqual("300000000000000000000");
    });

    it("gets the price from Chainlink for USDC", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [aUsdc._address], {from: root});
      expect(price).toEqual("1000000000000000000000000000000");
    });

    it("gets the price from Chainlink for USDT", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [aUsdt._address], {from: root});
      expect(price).toEqual("1000000000000000000000000000000");
    });

    it("gets the price from Chainlink for DAI", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [aDai._address], {from: root});
      expect(price).toEqual("1000000000000000000");
    });

    it("gets the constant price of ATL", async () => {
      let price = await call(
        oracle,
        "getUnderlyingPrice",
        [atl._address],
        {from: root}
      );
      expect(price).toEqual("7");
    });

    it("gets the direct price of a set asset", async () => {
      let price = await call(
        oracle,
        "getUnderlyingPrice",
        [aExampleSet._address],
        {from: root}
      );
      expect(price).toEqual("1");
    });

    it("reverts if no price or feed has been set", async () => {
      await expect(
        send(oracle, "getUnderlyingPrice", [aExampleUnset._address], {from: root})
      ).rejects.toRevert();
    });
  });

  describe("setUnderlyingPrice", () => {
    it("only admin may set an underlying price", async () => {
      await expect(
        send(oracle, "setUnderlyingPrice", [aExampleSet._address, 1], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("sets the underlying price", async () => {
      await send(oracle, "setUnderlyingPrice", [aExampleSet._address, 1], {from: root});
      let underlying = await call(aExampleSet, "underlying", []);
      let price = await call(oracle, "assetPrices", [underlying], {from: root});
      expect(price).toEqual("1");
    });
  });

  describe("setDirectPrice", () => {
    it("only admin may set an underlying price", async () => {
      await expect(
        send(oracle, "setDirectPrice", [atl._address, 7], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("sets the direct price", async () => {
      await send(oracle, "setDirectPrice", [atl._address, 7], {from: root});
      let price = await call(oracle, "assetPrices", [atl._address], {from: root});
      expect(price).toEqual("7");
    });
  });
});