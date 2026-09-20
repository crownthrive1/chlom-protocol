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
    fn record_checkpoint() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_checkpoint(
            T::CheckpointOrigin::try_successful_origin().unwrap(),
            id(1),
            1,
            2,
            2,
            id(2),
            id(3),
            None,
            id(4),
            id(5),
            true,
            false,
            id(6)
        ));
        let origin = T::CheckpointOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(7),
            3,
            4,
            2,
            id(8),
            id(9),
            Some(id(4)),
            id(10),
            id(11),
            true,
            false,
            id(12),
        );
        assert_eq!(CheckpointHead::<T>::get(), Some(id(7)));
    }
    #[benchmark]
    fn record_anchor_intent() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_checkpoint(
            T::CheckpointOrigin::try_successful_origin().unwrap(),
            id(1),
            1,
            2,
            2,
            id(2),
            id(3),
            None,
            id(4),
            id(5),
            true,
            false,
            id(6)
        ));
        let origin = T::AnchorOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(7), id(1), id(8), id(9), true, false, id(10));
        assert_eq!(AnchorIntents::<T>::get(id(7)).unwrap().root, id(4));
    }
    #[benchmark]
    fn record_anchor_receipt() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_checkpoint(
            T::CheckpointOrigin::try_successful_origin().unwrap(),
            id(1),
            1,
            2,
            2,
            id(2),
            id(3),
            None,
            id(4),
            id(5),
            true,
            false,
            id(6)
        ));
        assert_ok!(Pallet::<T>::record_anchor_intent(
            T::AnchorOrigin::try_successful_origin().unwrap(),
            id(7),
            id(1),
            id(8),
            id(9),
            true,
            false,
            id(10)
        ));
        let origin = T::AnchorOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(11),
            id(7),
            id(12),
            id(9),
            id(13),
            id(14),
            id(15),
            true,
            id(16),
        );
        assert_eq!(AnchorReceipts::<T>::get(id(11)).unwrap().intent_id, id(7));
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
        type CheckpointOrigin = frame_system::EnsureRoot<u64>;
        type AnchorOrigin = frame_system::EnsureRoot<u64>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
