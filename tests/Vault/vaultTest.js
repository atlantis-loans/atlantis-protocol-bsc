const {
    etherUnsigned,
    freezeTime,
    advanceBlocks,
    blockNumber
} = require('../Utils/Ethereum');

const {
    makeToken
} = require('../Utils/Atlantis');

const rewardPerBlock = etherUnsigned(1e16);
const tokenAmount = etherUnsigned(1e22);

describe('Vault', () => {
    let root, notAdmin;
    let blockTimestamp;
    let comptroller;
    let vault;
    let atlantis;
    let stakedToken;
    let atlantisStore;

    beforeEach(async () => {
        [root, notAdmin, newAdmin] = accounts;

        atlantis = await deploy('Atlantis', [root]);
        vault = await deploy('Vault', [], { from: root });

        comptroller = await deploy('ComptrollerHarness', { from: root });
        await send(comptroller, 'setAtlantisAddress', [atlantis._address]);
        await send(comptroller, 'setBlockNumber', [await blockNumber()]);

        stakedToken = await makeToken({ 'name': 'LP', 'root': root });
        atlantisStore = await deploy('AtlantisStore', [atlantis._address], { from: root });

        await send(vault, 'setAtlantisInfo', [atlantisStore._address, stakedToken._address], { from: root });
        await send(atlantisStore, 'setNewOwner', [vault._address]);
        
        await send(atlantis, 'transfer', [comptroller._address, etherUnsigned(1e22)], { from: root });
        await send(comptroller, '_setAtlantisVaultRate', [vault._address, "21000000000000000"]);
        await send(comptroller, '_setVaultInfo', [vault._address, 1, 1]);
    });

    describe('check vault config', () => {
        it('check vault admin', async () => {
            expect(await call(vault, 'getAdmin', [])).toEqual(root);
        });

        it('check atlantis store token address', async () => {
            expect(await call(vault, 'getAtlantisStore', [])).toEqual(atlantisStore._address);
        });

        it('check staked token address', async () => {
            expect(await call(vault, 'stakedToken', [])).toEqual(stakedToken._address);
        });
    });

    describe('deposit staked token', () => {
        it('add stakedToken pool', async () => {
            await send(stakedToken, 'transfer', [notAdmin, tokenAmount.times(2)], { from: root });
            await send(stakedToken, 'approve', [vault._address, tokenAmount.times(2)], { from: notAdmin });
            
            await send(vault, 'deposit', [tokenAmount], { from: notAdmin });

            let userInfo = await call(vault, 'userInfo', [notAdmin])
            expect(userInfo['amount']).toEqual('10000000000000000000000');
            expect(userInfo['rewardDebt']).toEqual('0');

            await send(atlantis, 'transfer', [atlantisStore._address, etherUnsigned(1e22)], { from: root });
            await send(vault, 'updatePendingRewards', [], { from: root });
            
            await send(vault, 'deposit', [tokenAmount], { from: notAdmin });
           
            userInfo = await call(vault, 'userInfo', [notAdmin])
            expect(userInfo['amount']).toEqual('20000000000000000000000');
            expect(userInfo['rewardDebt']).toEqual('20000000000000000000000');
        });
    });

    describe('withdraw staked token', () => {
        it('request and execute withdrawal', async () => {
            await send(stakedToken, 'transfer', [notAdmin, tokenAmount], { from: root });
            await send(stakedToken, 'approve', [vault._address, tokenAmount], { from: notAdmin });
            await send(vault, 'deposit', [tokenAmount], { from: notAdmin });

            await send(vault, 'withdraw', [tokenAmount.div(2)], { from: notAdmin });

            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("0");

            await send(atlantis, 'transfer', [atlantisStore._address, etherUnsigned(1e22)], { from: root });
            await send(vault, 'updatePendingRewards', [], { from: root });

            let userInfo = await call(vault, 'userInfo', [notAdmin])
            expect(userInfo['amount']).toEqual("5000000000000000000000");

            await send(vault, 'withdraw', ["5000000000000000000000"], { from: notAdmin });

            userInfo = await call(vault, 'userInfo', [notAdmin])
            expect(userInfo['amount']).toEqual("0");

            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("10000000000000000000000");
        });
    });

    describe('claim atlantis reward', () => {
        it('deposit and claim after 1 day', async () => {
            await send(stakedToken, 'transfer', [notAdmin, tokenAmount.times(2)], { from: root });
            await send(stakedToken, 'approve', [vault._address, tokenAmount.times(2)], { from: notAdmin });
            await send(vault, 'deposit', [tokenAmount], { from: notAdmin });

            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');

            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("0");
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(comptroller, 'vaults', [0])).toEqual(vault._address)
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("604779000000000000000");
        });

        it('test different atlantis rate', async () => {
            const rate604 = "21000000000000000"
            const rate2295 = "79700000000000000"
            
            await send(stakedToken, 'transfer', [notAdmin, tokenAmount.times(2)], { from: root });
            await send(stakedToken, 'approve', [vault._address, tokenAmount.times(2)], { from: notAdmin });
            await send(vault, 'deposit', [tokenAmount], { from: notAdmin });

            await send(comptroller, '_setAtlantisVaultRate', [vault._address, rate604]);
            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("604779000000000000000");

            await send(comptroller, '_setAtlantisVaultRate', [vault._address, rate2295]);
            await send(comptroller, 'setBlockNumber', [28800 * 2 - 1]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("2900059300000000000000");

            await send(comptroller, '_setAtlantisVaultRate', [vault._address, rate604]);
            await send(comptroller, 'setBlockNumber', [28800 * 3 - 2]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("3504838300000000000000");

            await send(comptroller, 'setBlockNumber', [28800 * 4 - 3]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("4109617300000000000000");

            await send(comptroller, '_setAtlantisVaultRate', [vault._address, rate2295]);
            await send(comptroller, 'setBlockNumber', [28800 * 5 - 4]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("6404897600000000000000");

            await send(comptroller, 'setBlockNumber', [28800 * 6 - 5]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            await send(vault, 'claim', [], { from: notAdmin });
            expect(await call(atlantis, 'balanceOf', [notAdmin])).toEqual("8700177900000000000000");
        });
    });
})