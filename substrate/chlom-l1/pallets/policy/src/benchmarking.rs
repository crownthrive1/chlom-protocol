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
    fn approve_version(n: Linear<1, { T::MaxVersionsPerScope::get() }>) {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let scope = PolicyScope {
            tenant_id: id(1),
            jurisdiction_id: id(2),
            purpose_id: id(3),
        };
        for v in 1..n {
            assert_ok!(Pallet::<T>::approve_version(
                T::PolicyOrigin::try_successful_origin().unwrap(),
                scope.clone(),
                v,
                id(4),
                1u32.into(),
                100u32.into(),
                id(5),
                id(6)
            ));
        }
        let scope_id = Pallet::<T>::scope_id(&scope);
        let origin = T::PolicyOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            scope,
            n,
            id(4),
            1u32.into(),
            100u32.into(),
            id(5),
            id(6),
        );
        assert_eq!(VersionIndex::<T>::get(scope_id).len(), n as usize);
    }
    #[benchmark]
    fn revoke_version() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        let scope = PolicyScope {
            tenant_id: id(1),
            jurisdiction_id: id(2),
            purpose_id: id(3),
        };
        let scope_id = Pallet::<T>::scope_id(&scope);
        assert_ok!(Pallet::<T>::approve_version(
            T::PolicyOrigin::try_successful_origin().unwrap(),
            scope,
            1,
            id(4),
            1u32.into(),
            100u32.into(),
            id(5),
            id(6)
        ));
        let origin = T::PolicyOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(origin, scope_id, 1, id(7), id(8));
        assert!(Revocations::<T>::contains_key(scope_id, 1));
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
        type PolicyOrigin = frame_system::EnsureRoot<u64>;
        type MaxVersionsPerScope = frame_support::traits::ConstU32<8>;
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
