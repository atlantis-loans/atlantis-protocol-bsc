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

describe('MultiVault', () => {
    let root, user1, user2, user3;
    let blockTimestamp;
    let comptroller;
    let vault1, vault2;
    let atlantis;
    let stakedToken1;
    let atlantisStore1, atlantisStore2;

    beforeEach(async () => {
        [root, user1, user2, user3] = accounts;

        atlantis = await deploy('Atlantis', [root]);
        vault1 = await deploy('Vault', { from: root });
        vault2 = await deploy('Vault', { from: root });

        comptroller = await deploy('ComptrollerHarness', { from: root });
        await send(comptroller, 'setAtlantisAddress', [atlantis._address]);
        await send(comptroller, 'setBlockNumber', [await blockNumber()]);

        stakedToken1 = await makeToken({ 'name': 'LP', 'root': root });

        atlantisStore1 = await deploy('AtlantisStore', [atlantis._address], { from: root });
        atlantisStore2 = await deploy('AtlantisStore', [atlantis._address], { from: root });

        await send(vault1, 'setAtlantisInfo', [atlantisStore1._address, stakedToken1._address], { from: root });
        await send(vault2, 'setAtlantisInfo', [atlantisStore2._address, atlantis._address], { from: root });
        
        await send(atlantisStore1, 'setNewOwner', [vault1._address]);
        await send(atlantisStore2, 'setNewOwner', [vault2._address]);
        
        await send(atlantis, 'transfer', [comptroller._address, etherUnsigned(1e22)], { from: root });
        await send(comptroller, '_setAtlantisVaultRate', [vault1._address, "21000000000000000"]);
        await send(comptroller, '_setAtlantisVaultRate', [vault2._address, "2080000000000000"]);
        
        await send(comptroller, '_setVaultInfo', [vault1._address, 1, 1]);
        await send(comptroller, '_setVaultInfo', [vault2._address, 1, 1]);
    });

    describe('check vault config', () => {
        it('check vault admin', async () => {
            expect(await call(vault1, 'getAdmin', [])).toEqual(root);
            expect(await call(vault2, 'getAdmin', [])).toEqual(root);
        });

        it('check atlantis store token address for each vault', async () => {
            expect(await call(vault1, 'getAtlantisStore', [])).toEqual(atlantisStore1._address);
            expect(await call(vault2, 'getAtlantisStore', [])).toEqual(atlantisStore2._address);
        });

        it('check staked token address', async () => {
            expect(await call(vault1, 'stakedToken', [])).toEqual(stakedToken1._address);
            expect(await call(vault2, 'stakedToken', [])).toEqual(atlantis._address);
        });
    });

    describe('claim atlantis reward', () => {
        it('deposit and claim in Vault 1', async () => {
            const amount = "1000000000000000000"; // 1 Atlantis

            await send(stakedToken1, 'transfer', [user1, amount], { from: root });
            await send(stakedToken1, 'approve', [vault1._address, amount], { from: user1 });
            await send(vault1, 'deposit', [amount], { from: user1 });

            await send(stakedToken1, 'transfer', [user2, amount], { from: root });
            await send(stakedToken1, 'approve', [vault1._address, amount], { from: user2 });
            await send(vault1, 'deposit', [amount], { from: user2 });

            expect(await call(atlantis, 'balanceOf', [user1])).toEqual("0");
            expect(await call(atlantis, 'balanceOf', [user2])).toEqual("0");

            
            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            
            await send(vault1, 'claim', [], { from: user1 });
            await send(vault1, 'claim', [], { from: user2 });

            expect(await call(comptroller, 'vaults', [0])).toEqual(vault1._address)
            expect(await call(atlantis, 'balanceOf', [user1])).toEqual("302389500000000000000");
            expect(await call(atlantis, 'balanceOf', [user2])).toEqual("302389500000000000000");
        });

        it('deposit and claim in Vault 1 with 3 different users', async () => {
            const amount = "1000000000000000000"; // 1 Atlantis

            await send(stakedToken1, 'transfer', [user1, amount], { from: root });
            await send(stakedToken1, 'approve', [vault1._address, amount], { from: user1 });
            await send(vault1, 'deposit', [amount], { from: user1 });

            await send(stakedToken1, 'transfer', [user2, amount], { from: root });
            await send(stakedToken1, 'approve', [vault1._address, amount], { from: user2 });
            await send(vault1, 'deposit', [amount], { from: user2 });

            await send(stakedToken1, 'transfer', [user3, amount], { from: root });
            await send(stakedToken1, 'approve', [vault1._address, amount], { from: user3 });
            await send(vault1, 'deposit', [amount], { from: user3 });

            expect(await call(atlantis, 'balanceOf', [user1])).toEqual("0");
            expect(await call(atlantis, 'balanceOf', [user2])).toEqual("0");
            expect(await call(atlantis, 'balanceOf', [user3])).toEqual("0");
            
            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            
            await send(vault1, 'claim', [], { from: user1 });
            await send(vault1, 'claim', [], { from: user2 });
            await send(vault1, 'claim', [], { from: user3 });

            expect(await call(comptroller, 'vaults', [0])).toEqual(vault1._address)
            expect(await call(atlantis, 'balanceOf', [user1])).toEqual("201593000000000000000");
            expect(await call(atlantis, 'balanceOf', [user2])).toEqual("201593000000000000000");
            expect(await call(atlantis, 'balanceOf', [user3])).toEqual("201593000000000000000");
        });


        it('deposit and claim in Vault 2', async () => {
            const amount = "1000000000000000000"; // 1 Atlantis
          
            expect(await call(comptroller, 'vaults', [1])).toEqual(vault2._address)
       
            await send(atlantis, 'transfer', [user1, amount], { from: root });
            await send(atlantis, 'approve', [vault2._address, amount], { from: user1 });
            await send(vault2, 'deposit', [amount], { from: user1 });

            await send(atlantis, 'transfer', [user2, amount], { from: root });
            await send(atlantis, 'approve', [vault2._address, amount], { from: user2 });
            await send(vault2, 'deposit', [amount], { from: user2 });

            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            
            await send(vault2, 'claim', [], { from: user1 });

            expect(await call(atlantis, 'balanceOf', [user1])).toEqual("29950960000000000000");
            expect(await call(atlantis, 'balanceOf', [atlantisStore2._address])).toEqual("29950960000000000000");
        });

        it('deposit and claim while updating vault info', async () => {
            await send(comptroller, 'setBlockNumber', [28800]); // fast forward to 24 hours
            await send(comptroller, 'releaseToVault');
            expect(await call(atlantis, 'balanceOf', [atlantisStore2._address])).toEqual("59901920000000000000");

            await send(comptroller, '_setVaultInfo', [vault2._address, 30, 1]);
            await send(comptroller, 'setBlockNumber', [70]);
            await send(comptroller, 'releaseToVault');
            expect(await call(atlantis, 'balanceOf', [atlantisStore2._address])).toEqual("59985120000000000000");
        });
    });
})