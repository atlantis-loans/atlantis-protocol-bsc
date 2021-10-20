import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';
import { ATokenMethods } from './AToken';
import { encodedNumber } from '../Encoding';

interface ABep20DelegatorMethods extends ATokenMethods {
  implementation(): Callable<string>;
  _setImplementation(
    implementation_: string,
    allowResign: boolean,
    becomImplementationData: string
  ): Sendable<void>;
}

interface ABep20DelegatorScenarioMethods extends ABep20DelegatorMethods {
  setTotalBorrows(amount: encodedNumber): Sendable<void>;
  setTotalReserves(amount: encodedNumber): Sendable<void>;
}

export interface ABep20Delegator extends Contract {
  methods: ABep20DelegatorMethods;
  name: string;
}

export interface ABep20DelegatorScenario extends Contract {
  methods: ABep20DelegatorMethods;
  name: string;
}
