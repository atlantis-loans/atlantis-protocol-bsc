const {
  etherUnsigned,
  freezeTime,
  advanceBlocks
} = require('../Utils/Ethereum');

const rewardPerBlock = etherUnsigned(1e16);
const defaultLockPeriod = 300;
const tokenAmount = etherUnsigned(1e22);

describe('CommunityVault', () => {
  let root, notAdmin;
  let blockTimestamp;
  let communityVault;
  let communityStore;
  let atl;
  let atl2;

  beforeEach(async () => {
    [root, notAdmin, newAdmin] = accounts;

    communityVault = await deploy('CommunityVault', []);
    communityStore = await deploy('CommunityStore', []);
    atl = await deploy('AtlantisScenario', [root]);
    atl2 = await deploy('AtlantisScenario', [root]);

    await send(communityStore, 'setNewOwner', [communityVault._address], { from: root });
    await send(communityVault, 'setCommunityStore', [atl._address, communityStore._address], { from: root });
    await send(atl, 'transfer', [communityStore._address, tokenAmount], { from: root });
    await send(atl2, 'transfer', [communityStore._address, tokenAmount], { from: root });

    blockTimestamp = etherUnsigned(100);
    await freezeTime(blockTimestamp.toNumber())
  });

  describe('atl store', () => {
    it('check atl balance', async () => {
      let atlantisBalanceOfStore = await call(atl, 'balanceOf', [communityStore._address]);
      expect(atlantisBalanceOfStore).toEqual('10000000000000000000000');
    });

    it('set new reward token', async () => {
      await send(communityStore, 'setRewardToken', [atl._address, true], { from: root });
      expect(await call(communityStore, 'rewardTokens', [atl._address])).toEqual(true);
      expect(await call(communityStore, 'rewardTokens', [communityVault._address])).toEqual(false);
      expect(await call(communityStore, 'rewardTokens', [communityStore._address])).toEqual(false);

      await send(communityStore, 'setRewardToken', [atl._address, false], { from: root });
      expect(await call(communityStore, 'rewardTokens', [communityStore._address])).toEqual(false);
    });

    it('tranfer reward token', async () => {
      await expect(
        send(communityStore, 'safeRewardTransfer', [atl._address, root, tokenAmount], { from: root })
      ).rejects.toRevert('revert only owner can');
    });
  });

  describe('check atl vault config', () => {
    it('check atl vault admin', async () => {
      expect(await call(communityVault, 'getAdmin', [])).toEqual(root);
    });

    it('check atl token address', async () => {
      expect(await call(communityVault, 'atlantisAddress', [])).toEqual(atl._address);
    });

    it('check atl store address', async () => {
      expect(await call(communityVault, 'communityStore', [])).toEqual(communityStore._address);
    });
  });

  describe('test to manage reward pool config', () => {
    it('add atl pool', async () => {
      const addTx = await send(
        communityVault,
        'add',
        [atl._address, 100, atl._address, rewardPerBlock, defaultLockPeriod],
        { from: root }
      );

      expect(addTx).toHaveLog('PoolAdded', {
        rewardToken: atl._address,
        pid: '0',
        token: atl._address,
        allocPoints: '100',
        rewardPerBlock: rewardPerBlock.toString(),
        lockPeriod: '300'
      });

      const poolInfo = await call(communityVault, 'poolInfos', [atl._address, 0]);
      expect(poolInfo['token']).toEqual(atl._address);
      expect(poolInfo['allocPoint']).toEqual('100');
      expect(poolInfo['accRewardPerShare']).toEqual('0');
      expect(poolInfo['lockPeriod']).toEqual('300');

      expect(await call(communityStore, 'rewardTokens', [atl._address])).toEqual(true);
    });

    it('update atl pool alloc config', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
        ], { from: root });

      let poolInfo = await call(communityVault, 'poolInfos', [atl._address, 0]);
      expect(poolInfo['allocPoint']).toEqual('100');

      const setTx = await send(
        communityVault, 'set',
        [atl._address, 0, 1000 ],
        { from: root }
      );

      expect(setTx).toHaveLog('PoolUpdated', {
        rewardToken: atl._address,
        pid: '0',
        oldAllocPoints: '100',
        newAllocPoints: '1000'
      });

      poolInfo = await call(communityVault, 'poolInfos', [atl._address, 0]);
      expect(poolInfo['token']).toEqual(atl._address);
      expect(poolInfo['allocPoint']).toEqual('1000');
      expect(poolInfo['accRewardPerShare']).toEqual('0');

      expect(await call(communityStore, 'rewardTokens', [atl._address])).toEqual(true);
    });

    it('sets the reward amount per block', async () => {
      await send(
        communityVault,
        'add',
        [atl._address, 100, atl._address, rewardPerBlock, defaultLockPeriod],
        { from: root }
      );

      const tx = await send(
        communityVault,
        'setRewardAmountPerBlock',
        [atl._address, rewardPerBlock.multipliedBy(2)],
        { from: root }
      );

      expect(tx).toHaveLog('RewardAmountUpdated', {
        rewardToken: atl._address,
        oldReward: rewardPerBlock.toString(),
        newReward: rewardPerBlock.multipliedBy(2).toString(),
      });
    });

    it('fails to update config for nonexistent pools', async () => {
      await expect(
        send(communityVault, 'set', [atl._address, 0, 1000 ], { from: root })
      ).rejects.toRevert('revert vault: pool exists?');
    });
  });

  describe('deposit atl token', () => {
    it('add atl pool', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(atl, 'transfer', [notAdmin, tokenAmount], { from: root });

      const notAdminAtlBal = await call(atl, 'balanceOf', [notAdmin]);
      expect(notAdminAtlBal).toEqual('10000000000000000000000');

      await send(atl, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });

      const notAdminAppr = await call(atl, 'allowance', [notAdmin, communityVault._address]);
      expect(notAdminAppr).toEqual('10000000000000000000000');

      await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });

      const depositedAmount = await call(atl, 'balanceOf', [communityVault._address]);
      expect(depositedAmount).toEqual('10000000000000000000000');

      let userInfo = await call(communityVault, 'getUserInfo', [atl._address, 0, notAdmin]);
      expect(userInfo['amount']).toEqual('10000000000000000000000');
      expect(userInfo['rewardDebt']).toEqual('0');

      await expect(
        call(communityVault, 'getUserInfo', [atl2._address, 0, notAdmin])
      ).rejects.toRevert('revert vault: pool exists?');
    });
  });

  describe('claim atl reward', () => {
    it('deposit and claim', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(atl, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(atl, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
      await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });

      await freezeTime(200);

      let atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('0');

      await send(communityVault, 'deposit', [atl._address, 0, 0], { from: notAdmin });

      atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('20000000000000000');
    });

    it('reverts when trying to deposit to a nonexisting pool', async () => {
      await expect(
        send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin })
      ).rejects.toRevert('revert vault: pool exists?');
    });
  });

  describe('withdrawals', () => {
    async function deposit() {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(atl2, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(atl2, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
      await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });
    }

    // To make sure updates to lock period do not affect the existing withdrawal requests,
    // and to correctly test the order of requests, we need to arbitrarily set the lock period.
    // This function makes our tests a bit more concise.
    async function requestWithdrawalWithLockPeriod({ amount, lockPeriod }) {
      await send(communityVault, 'setWithdrawalLockingPeriod',  [atl._address, 0, lockPeriod], { from: root });
      await send( communityVault, 'requestWithdrawal', [atl._address, 0, amount], { from: notAdmin });
    }

    describe('request withdrawal', () => {
      it('reverts when trying to request a withdrawal from a nonexisting pool', async () => {
        await deposit();
        await expect(
          send(communityVault, 'requestWithdrawal', [atl._address, 1, 0], { from: notAdmin })
        ).rejects.toRevert('revert vault: pool exists?');
      });

      it('prohibits requests with zero amount', async () => {
        await deposit();
        await expect(
          send(communityVault, 'requestWithdrawal', [atl._address, 0, 0], { from: notAdmin })
        ).rejects.toRevert('revert requested amount cannot be zero');
      });

      it('orders the requests by unlock times', async () => {
        // Insert withdrawal requests in arbitrary order
        await deposit();
        // now = 100; lockedUntil = now + lock period
        await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
        await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
        await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
        await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800

        // We should get the requests ordered by lockedUntil desc (800, 600, 400, 200)
        const requests = await call(communityVault, 'getWithdrawalRequests', [atl._address, 0, notAdmin]);
        expect(requests.map(v => v.lockedUntil)).toEqual(['800', '600', '400', '200']);
        expect(requests.map(v => v.amount)).toEqual(['100', '1000', '1', '10']);
      });

      it('increases pending withdrawals', async () => {
        // Insert withdrawal requests in arbitrary order
        await deposit();
        // now = 100; lockedUntil = now + lock period
        await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
        await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
        await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
        await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800

        expect(
          await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin])
        ).toEqual('1111');
      });

      it('does not allow to request more than the current amount', async () => {
        await deposit();
        await send(communityVault, 'requestWithdrawal', [atl._address, 0, tokenAmount], { from: notAdmin });
        await expect(
          send(communityVault, 'requestWithdrawal', [atl._address, 0, '1'], { from: notAdmin })
        ).rejects.toRevert('revert requested amount is invalid');
      });
    });

    describe('execute withdrawal', () => {
      it('fails with "nothing to withdraw" if there are no requests', async () => {
        await deposit();
        await expect(
          send(communityVault, 'executeWithdrawal', [atl._address, 0], { from: notAdmin })
        ).rejects.toRevert('revert nothing to withdraw');
      });

      it('reverts when trying to withdraw from a nonexisting pool', async () => {
        await deposit();
        await expect(
          send(communityVault, 'executeWithdrawal', [atl._address, 1], { from: notAdmin })
        ).rejects.toRevert('revert vault: pool exists?');
      });

      it('fails with "nothing to withdraw" if the requests are still pending', async () => {
        await deposit();
        await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
        await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
        await expect(
          send(communityVault, 'executeWithdrawal', [atl._address, 0], { from: notAdmin })
        ).rejects.toRevert('revert nothing to withdraw');
      });

      it('correctly computes the withdrawal amount for multiple withdrawal requests', async () => {
        await deposit();
        await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
        await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
        await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
        await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800

        await freezeTime(400); // requests locked until 200 & 400 should be unlocked now

        const eligibleAmount = await call(communityVault, 'getEligibleWithdrawalAmount', [atl._address, 0, notAdmin]);
        const requestedAmount = await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin]);
        expect(eligibleAmount).toEqual('11');
        expect(requestedAmount).toEqual('1111');

        let atl2Balance = await call(atl2, 'balanceOf', [notAdmin]);
        expect(atl2Balance).toEqual('0');
        await send(communityVault, 'executeWithdrawal', [atl._address, 0], { from: notAdmin });
        atl2Balance = await call(atl2, 'balanceOf', [notAdmin]);
        expect(atl2Balance).toEqual('11');
      });

      it('reverts when trying to compute the withdrawal amounts for a nonexisting pool', async () => {
        await deposit();

        await expect(
          call(communityVault, 'getEligibleWithdrawalAmount', [atl._address, 1, notAdmin])
        ).rejects.toRevert('revert vault: pool exists?');

        await expect(
          call(communityVault, 'getRequestedAmount', [atl._address, 1, notAdmin])
        ).rejects.toRevert('revert vault: pool exists?');
      });

      it('clears the eligible withdrawals from the queue', async () => {
        await deposit();
        await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
        await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
        await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
        await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800

        await freezeTime(400); // requests locked until 200 & 400 should be unlocked now
        await send(communityVault, 'executeWithdrawal', [atl._address, 0], { from: notAdmin });

        const requests = await call(communityVault, 'getWithdrawalRequests', [atl._address, 0, notAdmin]);
        const requestedAmount = await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin]);

        // requests locked until 600 and 800 should still be in the requests array
        expect(requests.map(v => v.lockedUntil)).toEqual(['800', '600']);
        expect(requests.map(v => v.amount)).toEqual(['100', '1000']);
        expect(requestedAmount).toEqual('1100');
      });
    });

    describe('lock period', () => {
      it('is possible to set lock period when a new pool is created', async () => {
        const lockPeriod1 = '123456';
        await send(
            communityVault,
            'add',
            [atl._address, 100, atl2._address, rewardPerBlock, lockPeriod1],
            { from: root }
        );
        const lockPeriod2 = '654321';
        await send(
          communityVault,
          'add',
          [atl2._address, 100, atl._address, rewardPerBlock, lockPeriod2],
          { from: root }
        );
        const pool1 = await call(communityVault, 'poolInfos', [atl._address, 0]);
        const pool2 = await call(communityVault, 'poolInfos', [atl2._address, 0]);
        expect(pool1.lockPeriod).toEqual('123456');
        expect(pool2.lockPeriod).toEqual('654321');
      });

      it('reverts when trying to set lock period for a nonexisting pool', async () => {
        await expect(
          send(communityVault, 'setWithdrawalLockingPeriod', [atl._address, 0, 42], { from: root })
        ).rejects.toRevert('revert vault: pool exists?');
      });

      it('sets the lock period for a pool', async () => {
        await send(
          communityVault,
          'add',
          [atl2._address, 100, atl._address, rewardPerBlock, 0],
          { from: root }
        );

        const tx = await send(
          communityVault,
          'setWithdrawalLockingPeriod',
          [atl2._address, 0, '1111111'],
          { from: root }
        );

        expect(tx).toHaveLog('WithdrawalLockingPeriodUpdated', {
          rewardToken: atl2._address,
          pid: '0',
          oldPeriod: '0',
          newPeriod: '1111111'
        });

        const pool = await call(communityVault, 'poolInfos', [atl2._address, 0]);
        expect(pool.lockPeriod).toEqual('1111111');
      })

      it('sets lock period separately for each pool', async () => {
        async function newPool(stakingToken, rewardToken, pid) {
          await send(
            communityVault,
            'add',
            [rewardToken._address, 100, stakingToken._address, rewardPerBlock, 0],
            { from: root }
          );
          // pair (reward token, pid) uniquely identifies a pool
          return [rewardToken._address, pid];
        }
        const pool1Id = await newPool(atl, atl, 0);
        const pool2Id = await newPool(atl, atl2, 0);
        const pool3Id = await newPool(atl2, atl, 1);
        const pool4Id = await newPool(atl2, atl2, 1);

        await send(communityVault, 'setWithdrawalLockingPeriod',  [...pool1Id, '1111111'], { from: root });
        await send(communityVault, 'setWithdrawalLockingPeriod',  [...pool2Id, '2222222'], { from: root });
        await send(communityVault, 'setWithdrawalLockingPeriod',  [...pool3Id, '3333333'], { from: root });
        await send(communityVault, 'setWithdrawalLockingPeriod',  [...pool4Id, '4444444'], { from: root });

        const pool1 = await call(communityVault, 'poolInfos', pool1Id);
        const pool2 = await call(communityVault, 'poolInfos', pool2Id);
        const pool3 = await call(communityVault, 'poolInfos', pool3Id);
        const pool4 = await call(communityVault, 'poolInfos', pool4Id);

        expect(pool1.lockPeriod).toEqual('1111111');
        expect(pool2.lockPeriod).toEqual('2222222');
        expect(pool3.lockPeriod).toEqual('3333333');
        expect(pool4.lockPeriod).toEqual('4444444');
      });
    })
  });

  describe('withdraw atl token', () => {
    it('request and execute withdrawal', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(atl, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(atl, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
      await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });

      await send(communityVault, 'requestWithdrawal', [atl._address, 0, tokenAmount.div(2)], { from: notAdmin });

      let eligibleAmount = await call(communityVault, 'getEligibleWithdrawalAmount', [atl._address, 0, notAdmin]);
      let requestAmount = await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin]);
      let withdrawalRequests = await call(communityVault, 'getWithdrawalRequests', [atl._address, 0, notAdmin]);

      expect(eligibleAmount).toEqual('0');
      expect(requestAmount).toEqual('5000000000000000000000');

      expect(withdrawalRequests.length).toEqual(1);
      expect(withdrawalRequests[0]['amount']).toEqual('5000000000000000000000');
      expect(withdrawalRequests[0]['lockedUntil']).toEqual('400');

      await freezeTime(300);

      eligibleAmount = await call(communityVault, 'getEligibleWithdrawalAmount', [atl._address, 0, notAdmin]);
      requestAmount = await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin]);
      expect(eligibleAmount).toEqual('0');
      expect(requestAmount).toEqual('5000000000000000000000');

      await freezeTime(400);

      eligibleAmount = await call(communityVault, 'getEligibleWithdrawalAmount', [atl._address, 0, notAdmin]);
      requestAmount = await call(communityVault, 'getRequestedAmount', [atl._address, 0, notAdmin]);
      expect(eligibleAmount).toEqual('5000000000000000000000');
      expect(requestAmount).toEqual('5000000000000000000000');

      let atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('0');

      await send(communityVault, 'executeWithdrawal', [atl._address, 0], { from: notAdmin });

      atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('5000040000000000000000');
    });
  });

  describe('multiple pools', () => {
    it('add atl and atl2 reward pools', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      await send(communityVault, 'add', [
        atl2._address,
        200,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(communityVault, 'add', [
        atl2._address,
        200,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      const totalAllocPoint1 = await call(communityVault, 'totalAllocPoints', [atl._address]);
      expect(totalAllocPoint1).toEqual('200');

      const totalAllocPoint2 = await call(communityVault, 'totalAllocPoints', [atl2._address]);
      expect(totalAllocPoint2).toEqual('400');
    });

    it('deposit atl and atl2 reward pools', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      await send(communityVault, 'add', [
        atl2._address,
        200,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });
      await send(communityVault, 'add', [
        atl2._address,
        200,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      await send(atl, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(atl, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
      await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });

      await send(atl2, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(atl2, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
      await send(communityVault, 'deposit', [atl2._address, 1, tokenAmount], { from: notAdmin });

      let atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('0');

      await send(communityVault, 'deposit', [atl._address, 0, 0], { from: notAdmin });

      atlantisBalance = await call(atl, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('20000000000000000');

      let atl2Balance = await call(atl2, 'balanceOf', [notAdmin]);
      expect(atl2Balance).toEqual('0');

      await send(communityVault, 'deposit', [atl2._address, 1, 0], { from: notAdmin });

      atlantisBalance = await call(atl2, 'balanceOf', [notAdmin]);
      expect(atlantisBalance).toEqual('10000000000000000');
    });

    it('fails when a pool does not exist', async () => {
      await send(communityVault, 'add', [
        atl._address,
        100,
        atl._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      await send(communityVault, 'add', [
        atl._address,
        100,
        atl2._address,
        rewardPerBlock,
        defaultLockPeriod
      ], { from: root });

      await expect(
        send(communityVault, 'deposit', [atl._address, 2, tokenAmount], { from: notAdmin })
      ).rejects.toRevert('revert vault: pool exists?');
    })
  });

  // describe('get prior votes', () => {
  //   it('check votes value', async () => {
  //     await send(communityVault, 'add', [atl._address, 100, atl._address, rewardPerBlock, defaultLockPeriod, 0], { from: root });
  //     await send(atl, 'transfer', [notAdmin, tokenAmount], { from: root });
  //     await send(atl, 'approve', [communityVault._address, tokenAmount], { from: notAdmin });
  //     await send(communityVault, 'deposit', [atl._address, 0, tokenAmount], { from: notAdmin });

  //     const votes = await call(communityVault, 'getPriorVotes', [notAdmin, 0]);
  //     expect(votes).toEqual('10000000000000000000000');
  //   });
  // });
});
