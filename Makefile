
# Run a single cvl e.g.:
#  make -B spec/certora/ABep20/borrowAndRepayFresh.cvl

# TODO:
#  - mintAndRedeemFresh.cvl in progress and is failing due to issues with tool proving how the exchange rate can change
#    hoping for better division modelling - currently fails to prove (a + 1) / b >= a / b
#  - ABep20Delegator/*.cvl cannot yet be run with the tool
#  - aDAI proofs are WIP, require using the delegate and the new revert message assertions

.PHONY: certora-clean

CERTORA_BIN = $(abspath script/certora)
CERTORA_RUN = $(CERTORA_BIN)/run.py
CERTORA_CLI = $(CERTORA_BIN)/cli.jar
CERTORA_EMV = $(CERTORA_BIN)/emv.jar

export CERTORA = $(CERTORA_BIN)
export CERTORA_DISABLE_POPUP = 1

spec/certora/Math/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/MathCertora.sol \
	--verify \
	 MathCertora:$@

spec/certora/Atlantis/search.cvl:
	$(CERTORA_RUN) \
	spec/certora/contracts/CompCertora.sol \
	--settings -b=4,-graphDrawLimit=0,-assumeUnwindCond,-depth=100 \
	--solc_args "'--evm-version istanbul'" \
	--verify \
	 CompCertora:$@

spec/certora/Atlantis/transfer.cvl:
	$(CERTORA_RUN) \
	spec/certora/contracts/CompCertora.sol \
	--settings -graphDrawLimit=0,-assumeUnwindCond,-depth=100 \
	--solc_args "'--evm-version istanbul'" \
	--verify \
	 CompCertora:$@

spec/certora/Governor/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/GovernorAlphaCertora.sol \
	 spec/certora/contracts/TimelockCertora.sol \
	 spec/certora/contracts/CompCertora.sol \
	 --settings -assumeUnwindCond,-enableWildcardInlining=false \
	 --solc_args "'--evm-version istanbul'" \
	 --link \
	 GovernorAlphaCertora:timelock=TimelockCertora \
	 GovernorAlphaCertora:atlantis=CompCertora \
	--verify \
	 GovernorAlphaCertora:$@

spec/certora/Comptroller/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/PriceOracleModel.sol \
	--link \
	 ComptrollerCertora:oracle=PriceOracleModel \
	--verify \
	 ComptrollerCertora:$@

spec/certora/aDAI/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/ADaiDelegateCertora.sol \
	 spec/certora/contracts/UnderlyingModelNonStandard.sol \
	 spec/certora/contracts/mcd/dai.sol:Dai \
	 spec/certora/contracts/mcd/pot.sol:Pot \
	 spec/certora/contracts/mcd/vat.sol:Vat \
	 spec/certora/contracts/mcd/join.sol:DaiJoin \
	 tests/Contracts/BoolComptroller.sol \
	--link \
	 ADaiDelegateCertora:comptroller=BoolComptroller \
	 ADaiDelegateCertora:underlying=Dai \
	 ADaiDelegateCertora:potAddress=Pot \
	 ADaiDelegateCertora:vatAddress=Vat \
	 ADaiDelegateCertora:daiJoinAddress=DaiJoin \
	--verify \
	 ADaiDelegateCertora:$@ \
	--settings -cache=certora-run-cdai

spec/certora/ABep20/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/ABep20ImmutableCertora.sol \
	 spec/certora/contracts/ATokenCollateral.sol \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/InterestRateModelModel.sol \
	 spec/certora/contracts/UnderlyingModelNonStandard.sol \
	--link \
	 ABep20ImmutableCertora:otherToken=ATokenCollateral \
	 ABep20ImmutableCertora:comptroller=ComptrollerCertora \
	 ABep20ImmutableCertora:underlying=UnderlyingModelNonStandard \
	 ABep20ImmutableCertora:interestRateModel=InterestRateModelModel \
	 ATokenCollateral:comptroller=ComptrollerCertora \
	 ATokenCollateral:underlying=UnderlyingModelNonStandard \
	--verify \
	 ABep20ImmutableCertora:$@ \
	--settings -cache=certora-run-abep20-immutable

spec/certora/ABep20Delegator/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/ABep20DelegatorCertora.sol \
	 spec/certora/contracts/ABep20DelegateCertora.sol \
	 spec/certora/contracts/ATokenCollateral.sol \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/InterestRateModelModel.sol \
	 spec/certora/contracts/UnderlyingModelNonStandard.sol \
	--link \
	 ABep20DelegatorCertora:implementation=ABep20DelegateCertora \
	 ABep20DelegatorCertora:otherToken=ATokenCollateral \
	 ABep20DelegatorCertora:comptroller=ComptrollerCertora \
	 ABep20DelegatorCertora:underlying=UnderlyingModelNonStandard \
	 ABep20DelegatorCertora:interestRateModel=InterestRateModelModel \
	 ATokenCollateral:comptroller=ComptrollerCertora \
	 ATokenCollateral:underlying=UnderlyingModelNonStandard \
	--verify \
	 ABep20DelegatorCertora:$@ \
	--settings -assumeUnwindCond \
	--settings -cache=certora-run-abep20-delegator

spec/certora/Maximillion/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/MaximillionCertora.sol \
	 spec/certora/contracts/ABNBCertora.sol \
	--link \
	 MaximillionCertora:aBNB=ABNBCertora \
	--verify \
	 MaximillionCertora:$@

spec/certora/Timelock/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/TimelockCertora.sol \
	--verify \
	 TimelockCertora:$@

certora-clean:
	rm -rf .certora_build.json .certora_config certora_verify.json emv-*
