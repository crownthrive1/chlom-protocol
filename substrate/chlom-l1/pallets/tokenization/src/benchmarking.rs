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
    fn record_token_class() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());

        let origin = T::TokenOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(1),
            TokenClassKind::UniqueAsset,
            true,
            id(2),
            false,
            ExternalIssuanceState::TestnetEligible,
            id(3),
        );
        assert!(TokenClasses::<T>::contains_key(id(1)));
    }
    #[benchmark]
    fn record_chain_adapter() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());

        let origin = T::TokenOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(1), id(2), id(3), true, false, true, id(4));
        assert!(ChainAdapters::<T>::contains_key(id(1)));
    }
    #[benchmark]
    fn register_tokenized_object() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_token_class(
            T::TokenOrigin::try_successful_origin().unwrap(),
            id(1),
            TokenClassKind::UniqueAsset,
            true,
            id(2),
            false,
            ExternalIssuanceState::TestnetEligible,
            id(3)
        ));
        let origin = T::TokenOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(4),
            id(1),
            id(5),
            id(6),
            id(7),
            Some(id(8)),
            Some(id(9)),
            Some(id(10)),
            id(11),
            id(12),
            id(13),
        );
        assert!(TokenizedObjects::<T>::contains_key(id(4)));
    }
    #[benchmark]
    fn record_provider_event() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_token_class(
            T::TokenOrigin::try_successful_origin().unwrap(),
            id(1),
            TokenClassKind::UniqueAsset,
            true,
            id(2),
            false,
            ExternalIssuanceState::TestnetEligible,
            id(3)
        ));
        assert_ok!(Pallet::<T>::record_chain_adapter(
            T::TokenOrigin::try_successful_origin().unwrap(),
            id(4),
            id(5),
            id(6),
            true,
            false,
            true,
            id(7)
        ));
        assert_ok!(Pallet::<T>::register_tokenized_object(
            T::TokenOrigin::try_successful_origin().unwrap(),
            id(8),
            id(1),
            id(9),
            id(10),
            id(11),
            None,
            None,
            None,
            id(12),
            id(13),
            id(14)
        ));
        assert_ok!(Pallet::<T>::record_provider_event(
            T::TokenOrigin::try_successful_origin().unwrap(),
            id(15),
            id(8),
            TokenEventType::TestnetMintConfirmed,
            None,
            Some(id(12)),
            Some(id(4)),
            Some(id(16)),
            Some(id(17)),
            Some(id(18)),
            id(19),
            id(20)
        ));
        let origin = T::TokenOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(21),
            id(8),
            TokenEventType::TransferConfirmed,
            Some(id(12)),
            Some(id(22)),
            Some(id(4)),
            Some(id(16)),
            Some(id(17)),
            Some(id(23)),
            id(24),
            id(25),
        );
        assert_eq!(LatestTokenEvent::<T>::get(id(8)), Some(id(21)));
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
        type TokenOrigin = frame_system::EnsureRoot<u64>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
