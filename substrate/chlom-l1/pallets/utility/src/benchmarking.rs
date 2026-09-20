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

fn service<T: Config>() {
    assert_ok!(Pallet::<T>::approve_service(
        T::UtilityOrigin::try_successful_origin().unwrap(),
        id(1),
        1,
        id(2),
        7,
        1u32.into(),
        100u32.into(),
        id(3)
    ));
}
fn reservation<T: Config>() -> T::AccountId {
    service::<T>();
    let caller: T::AccountId = whitelisted_caller();
    assert_ok!(Pallet::<T>::allocate(
        T::UtilityOrigin::try_successful_origin().unwrap(),
        id(4),
        caller.clone(),
        id(2),
        1000,
        id(5)
    ));
    assert_ok!(Pallet::<T>::reserve(
        RawOrigin::Signed(caller.clone()).into(),
        id(6),
        id(1),
        1,
        2
    ));
    caller
}
#[benchmarks]
mod benchmarks {
    use super::*;
    #[benchmark]
    fn approve_service(n: Linear<1, { T::MaxServiceVersions::get() }>) {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        for v in 1..n {
            assert_ok!(Pallet::<T>::approve_service(
                T::UtilityOrigin::try_successful_origin().unwrap(),
                id(1),
                v,
                id(2),
                7,
                1u32.into(),
                100u32.into(),
                id(3)
            ));
        }
        let origin = T::UtilityOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(1),
            n,
            id(2),
            7,
            1u32.into(),
            100u32.into(),
            id(3),
        );
        assert_eq!(ServiceIndex::<T>::get(id(1)).len(), n as usize);
    }
    #[benchmark]
    fn revoke_service() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        service::<T>();
        let origin = T::UtilityOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(1), 1, id(4), id(5));
        assert!(ServiceRevocations::<T>::contains_key(id(1), 1));
    }
    #[benchmark]
    fn allocate() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let caller: T::AccountId = whitelisted_caller();
        let origin = T::UtilityOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, id(4), caller.clone(), id(2), 1000, id(5));
        assert_eq!(Balances::<T>::get(&caller, id(2)).available, 1000);
    }

    #[benchmark]
    fn reserve(n: Linear<1, { T::MaxServiceVersions::get() }>) {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        service::<T>();
        // Future revisions force reverse lookup across the complete bounded index.
        for version in 2..=n {
            assert_ok!(Pallet::<T>::approve_service(
                T::UtilityOrigin::try_successful_origin().unwrap(),
                id(1),
                version,
                id(2),
                7,
                50u32.into(),
                100u32.into(),
                id(3)
            ));
        }
        let caller: T::AccountId = whitelisted_caller();
        assert_ok!(Pallet::<T>::allocate(
            T::UtilityOrigin::try_successful_origin().unwrap(),
            id(4),
            caller.clone(),
            id(2),
            1000,
            id(5)
        ));
        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), id(6), id(1), 1, 2);
        assert_eq!(Balances::<T>::get(&caller, id(2)).reserved, 14);
    }
    #[benchmark]
    fn consume() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let caller = reservation::<T>();
        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), id(7), id(6));
        assert_eq!(Balances::<T>::get(&caller, id(2)).consumed, 14);
        assert_eq!(ReservationClosures::<T>::get(&caller, id(6)), Some(id(7)));
    }
    #[benchmark]
    fn release() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let caller = reservation::<T>();
        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), id(7), id(6));
        assert_eq!(Balances::<T>::get(&caller, id(2)).available, 1000);
        assert_eq!(ReservationClosures::<T>::get(&caller, id(6)), Some(id(7)));
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
        type UtilityOrigin = frame_system::EnsureRoot<u64>;
        type MaxServiceVersions = frame_support::traits::ConstU32<8>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
