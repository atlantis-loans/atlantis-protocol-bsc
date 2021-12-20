import { Contract } from '../Contract';
import { encodedNumber } from '../Encoding';
import { Callable, Sendable } from '../Invokation';

interface Checkpoint {
  fromBlock: number;
  votes: number;
}

export interface CommunityStoreMethods {
  admin(): Callable<string>;
  setRewardToken(tokenAddress: string, status: boolean): Sendable<void>;
}

export interface CommunityStore extends Contract {
  methods: CommunityStoreMethods;
  name: string;
}

export interface CommunityVaultProxyMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  communityVaultImplementation(): Callable<string>;
  pendingCommunityVaultImplementation(): Callable<string>;
  _setPendingImplementation(newPendingImplementation: string): Sendable<number>;
  _acceptImplementation(): Sendable<number>;
  _setPendingAdmin(newPendingAdmin: string): Sendable<number>;
  _acceptAdmin(): Sendable<number>;
}

export interface CommunityVaultProxy extends Contract {
  methods: CommunityVaultProxyMethods;
  name: string;
}

export interface CommunityVaultImplMethods {
  
  _become(communityVaultProxy: string): Sendable<void>;
  setCommunityStore(atlantis: string, communityStore: string): Sendable<void>;
  add(
    rewardToken: string, allocPoint: encodedNumber, token: string,
    rewardPerBlock: encodedNumber, lockPeriod: encodedNumber
  ): Sendable<void>;
  deposit(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  requestWithdrawal(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  executeWithdrawal(rewardToken: string, pid: number): Sendable<void>;
  setWithdrawalLockingPeriod(rewardToken: string, pid: number, newPeriod: number): Sendable<void>;
  checkpoints(account: string, index: number): Callable<Checkpoint>;
  numCheckpoints(account: string): Callable<number>;
  delegate(account: string): Sendable<void>;
  getCurrentVotes(account: string): Callable<number>;
  getPriorVotes(account: string, blockNumber: encodedNumber): Callable<number>;
}

export interface CommunityVaultImpl extends Contract {
  methods: CommunityVaultImplMethods;
  name: string;
}

export interface CommunityVaultMethods extends CommunityVaultProxyMethods, CommunityVaultImplMethods { }

export interface CommunityVault extends Contract {
  methods: CommunityVaultMethods;
  name: string;
}

interface CommunityVaultHarnessMethods extends CommunityVaultMethods {
  getPriorVotesHarness(account: string, blockNumber: encodedNumber, votePower: encodedNumber): Callable<number>;
}

export interface CommunityVaultHarness extends Contract {
  methods: CommunityVaultHarnessMethods;
  name: string;
}
