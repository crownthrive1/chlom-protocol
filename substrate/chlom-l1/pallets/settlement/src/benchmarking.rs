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

fn legs<T: Config>(count: u32) -> BoundedVec<SplitLeg, T::MaxLegs> {
    let mut legs = BoundedVec::default();
    for i in 0..count {
        let mut leg_id = id(1);
        leg_id[..4].copy_from_slice(&i.to_le_bytes());
        legs.try_push(SplitLeg {
            leg_id,
            beneficiary_subject_id: id(2),
            allocation_role: id(3),
            basis_points: if i + 1 == count {
                (10000 - 10000 / count * (count - 1)) as u16
            } else {
                (10000 / count) as u16
            },
            conditions_hash: id(4),
        })
        .unwrap();
    }
    legs
}
#[benchmarks]
mod benchmarks {
    use super::*;
    #[benchmark]
    fn record_revenue_policy(l: Linear<1, { T::MaxLegs::get() }>) {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let legs = legs::<T>(l);
        let origin = T::SettlementOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(1), id(2), id(3), id(4), false, legs, id(5));
        assert_eq!(
            RevenuePolicies::<T>::get(id(1)).unwrap().legs.len(),
            l as usize
        );
    }
    #[benchmark]
    fn preview_settlement(l: Linear<1, { T::MaxLegs::get() }>) {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        assert_ok!(Pallet::<T>::record_revenue_policy(
            T::SettlementOrigin::try_successful_origin().unwrap(),
            id(1),
            id(2),
            id(3),
            id(4),
            false,
            legs::<T>(l),
            id(5)
        ));
        let origin = T::SettlementOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(6), id(1), id(7), 1_000_000u128, id(3), id(8));
        assert!(!SettlementPreviews::<T>::get(id(6)).unwrap().money_moved);
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
        type SettlementOrigin = frame_system::EnsureRoot<u64>;
        type MaxLegs = frame_support::traits::ConstU32<16>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
