import { Contract } from '../Contract';
import { Sendable } from '../Invokation';
import { ATokenMethods, ATokenScenarioMethods } from './AToken';

interface ABep20DelegateMethods extends ATokenMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

interface ABep20DelegateScenarioMethods extends ATokenScenarioMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

export interface ABep20Delegate extends Contract {
  methods: ABep20DelegateMethods;
  name: string;
}

export interface ABep20DelegateScenario extends Contract {
  methods: ABep20DelegateScenarioMethods;
  name: string;
}
