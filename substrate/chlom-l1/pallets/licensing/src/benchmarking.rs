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

fn dla<T: Config>() {
    T::RightsVerifier::benchmark_insert(
        id(4),
        RightsReference {
            asset_id: id(2),
            asset_version_hash: id(3),
            state: RecordState::Operative,
            valid_from: Some(1u32.into()),
            valid_until: Some(100u32.into()),
            superseded: false,
        },
    );
    assert_ok!(Pallet::<T>::record_dla_version(
        T::LicensingOrigin::try_successful_origin().unwrap(),
        id(1),
        1,
        id(2),
        id(3),
        id(4),
        RecordState::Operative,
        id(5),
        id(6),
        DlaState::EligiblePublic,
        RecordState::UnderReview,
        None,
        id(7)
    ));
}
fn license<T: Config>() {
    dla::<T>();
    assert_ok!(Pallet::<T>::record_license_version(
        T::LicensingOrigin::try_successful_origin().unwrap(),
        id(8),
        1,
        id(1),
        id(9),
        id(10),
        id(11),
        id(12),
        id(13),
        Some(100u32.into()),
        LicenseStatus::Active,
        true,
        None,
        id(14)
    ));
}

#[benchmarks]
mod benchmarks {
    use super::*;
    #[benchmark]
    fn record_dla_version() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        dla::<T>();
        let origin = T::LicensingOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(1),
            2,
            id(2),
            id(3),
            id(4),
            RecordState::Operative,
            id(5),
            id(6),
            DlaState::EligiblePublic,
            RecordState::UnderReview,
            Some(id(7)),
            id(15),
        );
        assert_eq!(DlaHeads::<T>::get(id(1)), Some(2));
    }
    #[benchmark]
    fn record_license_version() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        license::<T>();
        let origin = T::LicensingOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(8),
            2,
            id(1),
            id(9),
            id(10),
            id(11),
            id(12),
            id(13),
            Some(100u32.into()),
            LicenseStatus::Active,
            true,
            Some(id(14)),
            id(15),
        );
        assert_eq!(LicenseHeads::<T>::get(id(8)), Some(2));
    }
    #[benchmark]
    fn record_lex_offer_version() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        dla::<T>();
        assert_ok!(Pallet::<T>::record_lex_offer_version(
            T::LicensingOrigin::try_successful_origin().unwrap(),
            id(8),
            1,
            id(1),
            id(9),
            id(10),
            id(11),
            id(12),
            100,
            id(13),
            OfferState::Published,
            true,
            Some(100u32.into()),
            None,
            id(14)
        ));
        let origin = T::LicensingOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(8),
            2,
            id(1),
            id(9),
            id(10),
            id(11),
            id(12),
            100,
            id(13),
            OfferState::Published,
            true,
            Some(100u32.into()),
            Some(id(14)),
            id(15),
        );
        assert_eq!(OfferHeads::<T>::get(id(8)), Some(2));
    }
    #[benchmark]
    fn record_entitlement_version() {
        frame_system::Pallet::<T>::set_block_number(1u32.into());
        license::<T>();
        assert_ok!(Pallet::<T>::record_entitlement_version(
            T::LicensingOrigin::try_successful_origin().unwrap(),
            id(15),
            1,
            id(8),
            id(11),
            id(16),
            id(17),
            RecordState::Operative,
            Some(100u32.into()),
            None,
            id(18)
        ));
        let origin = T::LicensingOrigin::try_successful_origin().expect("benchmark origin");
        #[extrinsic_call]
        _(
            origin,
            id(15),
            2,
            id(8),
            id(11),
            id(16),
            id(17),
            RecordState::Operative,
            Some(100u32.into()),
            Some(id(18)),
            id(19),
        );
        assert_eq!(EntitlementHeads::<T>::get(id(15)), Some(2));
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
        type LicensingOrigin = frame_system::EnsureRoot<u64>;
        type RightsVerifier = SyntheticRights;
    }
    pub struct SyntheticRights;
    // The isolated pallet fixture uses actual externalities storage; the composed
    // runtime adapter reads the canonical rights pallet's instrument and successor.
    impl RightsVerifier<frame_system::pallet_prelude::BlockNumberFor<Test>> for SyntheticRights {
        fn instrument(
            instrument_id: Id32,
        ) -> Option<RightsReference<frame_system::pallet_prelude::BlockNumberFor<Test>>> {
            use codec::{Decode, Encode};
            type Value = (Id32, Id32, RecordState, Option<u64>, Option<u64>, bool);
            let bytes = sp_io::storage::get(&(b"CHLOM:benchmark:rights", instrument_id).encode())?;
            let (asset_id, asset_version_hash, state, valid_from, valid_until, superseded) =
                Value::decode(&mut &bytes[..]).ok()?;
            Some(RightsReference {
                asset_id,
                asset_version_hash,
                state,
                valid_from,
                valid_until,
                superseded,
            })
        }
        fn benchmark_insert(
            instrument_id: Id32,
            reference: RightsReference<frame_system::pallet_prelude::BlockNumberFor<Test>>,
        ) {
            use codec::Encode;
            sp_io::storage::set(
                &(b"CHLOM:benchmark:rights", instrument_id).encode(),
                &(
                    reference.asset_id,
                    reference.asset_version_hash,
                    reference.state,
                    reference.valid_from,
                    reference.valid_until,
                    reference.superseded,
                )
                    .encode(),
            );
        }
    }
    pub fn ext() -> sp_io::TestExternalities {
        frame_system::GenesisConfig::<Test>::default()
            .build_storage()
            .unwrap()
            .into()
    }
}
