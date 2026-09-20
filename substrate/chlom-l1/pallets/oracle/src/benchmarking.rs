//! FRAME v2 dispatch benchmarks. Fixtures contain synthetic commitments only.
//! Benchmark setup/verification is not measured weight-generation evidence.
//! The configured successful origin may be Root; signed role verification must
//! be measured separately when calibrating a deployed runtime.
use super::*;
#[allow(unused_imports)]
use chlom_primitives::*;
use frame_benchmarking::v2::*;
#[allow(unused_imports)]
use frame_support::{
    assert_ok,
    traits::{EnsureOrigin, Get},
    BoundedVec,
};
#[allow(unused_imports)]
use frame_system::RawOrigin;

fn id(n: u8) -> Id32 {
    [n; 32]
}

#[benchmarks]
mod benchmarks {
    use super::*;
    #[benchmark]
    fn report_signal() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());

        let origin = T::OracleOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(1),
            id(2),
            id(3),
            id(4),
            id(5),
            10000,
            10000,
            SignalAction::Review,
            id(6),
            id(7),
            Some((id(8), AuthorityClass::D3)),
        );
        assert_eq!(ReviewCaseHeads::<T>::get(id(8)), Some(1));
        assert!(OracleSignals::<T>::contains_key(id(1)));
    }
    #[benchmark]
    fn record_review_decision() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        // Pre-upgrade head exercises the most expensive lazy history-preservation path.
        ReviewCases::<T>::insert(
            id(1),
            ReviewCase {
                signal_id: id(2),
                target_type: id(3),
                target_id: id(4),
                state: CaseState::Open,
                authority_required: AuthorityClass::D3,
                consequential_action_taken: false,
                decision_hash: None,
                record_hash: id(5),
            },
        );
        let origin = T::ReviewOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(1),
            AuthorityClass::D3,
            CaseState::Resolved,
            id(6),
            false,
            id(7),
        );
        assert_eq!(ReviewCaseHeads::<T>::get(id(1)), Some(2));
        assert!(ReviewCaseVersions::<T>::contains_key(id(1), 1));
    }

    impl_benchmark_test_suite!(
        Pallet,
        crate::benchmarking::mock::ext(),
        crate::benchmarking::mock::Test
    );
}

#[cfg(test)]
mod mock {
    use super::*;
    use frame_support::derive_impl;
    use sp_runtime::BuildStorage;
    type Block = frame_system::mocking::MockBlock<Test>;
    frame_support::construct_runtime!(pub enum Test { System: frame_system, Chlom: crate });
    #[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
    impl frame_system::Config for Test {
        type Block = Block;
    }
    impl Config for Test {
        type RuntimeEvent = RuntimeEvent;
        type WeightInfo = crate::weights::SubstrateWeight<Test>;
        type OracleOrigin = frame_system::EnsureRoot<u64>;
        type ReviewOrigin = frame_system::EnsureRoot<u64>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
