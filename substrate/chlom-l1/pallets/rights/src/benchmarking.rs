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
    fn record_ownership_interest() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_ownership_interest(
            T::RightsOrigin::try_successful_origin().unwrap(),
            id(1),
            id(2),
            id(3),
            id(4),
            id(5),
            10000,
            RecordState::Operative,
            AuthorityClass::D3,
            Some(id(6)),
            None,
            id(7),
            id(8)
        ));
        let origin = T::RightsOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(9),
            id(2),
            id(3),
            id(4),
            id(5),
            10000,
            RecordState::Operative,
            AuthorityClass::D3,
            Some(id(6)),
            Some(id(1)),
            id(7),
            id(10),
        );
        assert_eq!(OwnershipSupersededBy::<T>::get(id(1)), Some(id(9)));
    }
    #[benchmark]
    fn record_rights_instrument() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_rights_instrument(
            T::RightsOrigin::try_successful_origin().unwrap(),
            id(1),
            id(2),
            id(3),
            id(4),
            id(5),
            id(6),
            id(7),
            id(8),
            id(9),
            id(10),
            true,
            true,
            true,
            true,
            Some(1u32.into()),
            Some(100u32.into()),
            Some(id(11)),
            RecordState::Operative,
            AuthorityClass::D3,
            Some(id(12)),
            None,
            id(13),
            id(14),
            id(15)
        ));
        let origin = T::RightsOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(16),
            id(2),
            id(3),
            id(4),
            id(5),
            id(6),
            id(7),
            id(8),
            id(9),
            id(10),
            true,
            true,
            true,
            true,
            Some(1u32.into()),
            Some(100u32.into()),
            Some(id(11)),
            RecordState::Operative,
            AuthorityClass::D3,
            Some(id(12)),
            Some(id(1)),
            id(13),
            id(14),
            id(17),
        );
        assert_eq!(RightsSupersededBy::<T>::get(id(1)), Some(id(16)));
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
        type RightsOrigin = frame_system::EnsureRoot<u64>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
