//! Integration tests execute the composed runtime dispatcher, not a mock pallet runtime.
use super::*;
use crate::origins::{account_subject, role_id, DevelopmentCallFilter};
use chlom_primitives::{AuthorityClass, ExternalIssuanceState, TokenClassKind};
use frame_support::{assert_noop, assert_ok, traits::Contains};
use sp_keyring::Sr25519Keyring;
use sp_runtime::{traits::Dispatchable, DispatchError};

fn id(n: u8) -> [u8; 32] {
    [n; 32]
}
fn alice() -> AccountId {
    Sr25519Keyring::Alice.to_account_id()
}
fn bob() -> AccountId {
    Sr25519Keyring::Bob.to_account_id()
}
fn ext() -> sp_io::TestExternalities {
    let mut storage = RuntimeGenesisConfig::default().build_storage().unwrap();
    pallet_balances::GenesisConfig::<Runtime> {
        balances: vec![(alice(), 1_000 * UNIT), (bob(), 1_000 * UNIT)],
        ..Default::default()
    }
    .assimilate_storage(&mut storage)
    .unwrap();
    pallet_sudo::GenesisConfig::<Runtime> { key: Some(alice()) }
        .assimilate_storage(&mut storage)
        .unwrap();
    let mut ext = sp_io::TestExternalities::new(storage);
    ext.execute_with(|| System::set_block_number(1));
    ext
}
fn grant(account: AccountId, role: u8, class: AuthorityClass, until: Option<u32>) {
    assert_ok!(ChlomAuthority::record_grant_version(
        RuntimeOrigin::root(),
        account_subject(&account),
        role_id(role),
        1,
        class,
        true,
        until,
        None,
        id(100),
    ));
}
fn allocation() -> RuntimeCall {
    RuntimeCall::ChlomUtility(pallet_chlom_utility::Call::allocate {
        operation_id: id(1),
        account: bob(),
        resource_id: id(2),
        units: 100,
        approval_hash: id(3),
    })
}

#[test]
fn runtime_dispatch_rejects_unsigned_and_unauthorized_privileged_writes() {
    ext().execute_with(|| {
        assert_eq!(
            allocation()
                .dispatch(RuntimeOrigin::signed(bob()))
                .unwrap_err()
                .error,
            DispatchError::BadOrigin
        );
        assert_eq!(
            allocation()
                .dispatch(RuntimeOrigin::none())
                .unwrap_err()
                .error,
            DispatchError::BadOrigin
        );
        assert_eq!(
            pallet_chlom_utility::Balances::<Runtime>::get(bob(), id(2)).allocated,
            0
        );
        assert_noop!(
            ChlomAuthority::record_grant_version(
                RuntimeOrigin::signed(bob()),
                account_subject(&bob()),
                role_id(8),
                1,
                AuthorityClass::D3,
                true,
                None,
                None,
                id(100),
            ),
            DispatchError::BadOrigin
        );
    });
}

#[test]
fn exact_role_class_expiry_and_latest_revocation_control_dispatch() {
    ext().execute_with(|| {
        grant(bob(), 9, AuthorityClass::D3, None);
        assert!(allocation().dispatch(RuntimeOrigin::signed(bob())).is_err());
        grant(bob(), 8, AuthorityClass::D2, None);
        assert!(allocation().dispatch(RuntimeOrigin::signed(bob())).is_err());
        assert_ok!(ChlomAuthority::record_grant_version(
            RuntimeOrigin::root(),
            account_subject(&bob()),
            role_id(8),
            2,
            AuthorityClass::D3,
            true,
            Some(2),
            Some(id(100)),
            id(101),
        ));
        assert_ok!(allocation().dispatch(RuntimeOrigin::signed(bob())));
        System::set_block_number(3);
        assert_eq!(
            allocation()
                .dispatch(RuntimeOrigin::signed(bob()))
                .unwrap_err()
                .error,
            DispatchError::BadOrigin
        );
        assert_ok!(ChlomAuthority::record_grant_version(
            RuntimeOrigin::root(),
            account_subject(&bob()),
            role_id(8),
            3,
            AuthorityClass::D3,
            false,
            None,
            Some(id(101)),
            id(102),
        ));
        System::set_block_number(2);
        assert_eq!(
            allocation()
                .dispatch(RuntimeOrigin::signed(bob()))
                .unwrap_err()
                .error,
            DispatchError::BadOrigin
        );
    });
}

#[test]
fn signed_owner_utility_lifecycle_conserves_units_and_prevents_cross_account_spending() {
    ext().execute_with(|| {
        grant(alice(), 8, AuthorityClass::D3, None);
        assert_ok!(
            RuntimeCall::ChlomUtility(pallet_chlom_utility::Call::approve_service {
                service_id: id(4),
                version: 1,
                resource_id: id(2),
                units_per_action: 7,
                effective_from: 1,
                effective_until: 100,
                approval_hash: id(3),
            })
            .dispatch(RuntimeOrigin::signed(alice()))
        );
        assert_ok!(allocation().dispatch(RuntimeOrigin::signed(alice())));
        assert_ok!(
            RuntimeCall::ChlomUtility(pallet_chlom_utility::Call::reserve {
                operation_id: id(5),
                service_id: id(4),
                version: 1,
                quantity: 3,
            })
            .dispatch(RuntimeOrigin::signed(bob()))
        );
        assert!(
            RuntimeCall::ChlomUtility(pallet_chlom_utility::Call::consume {
                operation_id: id(6),
                reservation_id: id(5),
            })
            .dispatch(RuntimeOrigin::signed(alice()))
            .is_err()
        );
        let consume = RuntimeCall::ChlomUtility(pallet_chlom_utility::Call::consume {
            operation_id: id(6),
            reservation_id: id(5),
        });
        assert_ok!(consume.clone().dispatch(RuntimeOrigin::signed(bob())));
        assert_ok!(consume.dispatch(RuntimeOrigin::signed(bob())));
        let balance = pallet_chlom_utility::Balances::<Runtime>::get(bob(), id(2));
        assert_eq!(
            (
                balance.allocated,
                balance.available,
                balance.reserved,
                balance.consumed
            ),
            (100, 79, 0, 21)
        );
        assert_eq!(pallet_chlom_utility::ReceiptCount::<Runtime>::get(), 3);
    });
}

#[test]
fn public_economic_activation_is_filtered_even_inside_sudo_wrappers() {
    ext().execute_with(|| {
        let call =
            RuntimeCall::ChlomTokenization(pallet_chlom_tokenization::Call::record_token_class {
                token_class_id: id(10),
                kind: TokenClassKind::UtilityCandidate,
                transferable: true,
                rights_semantics_hash: id(11),
                legal_approved_public: true,
                issuance_state: ExternalIssuanceState::ProductionEligible,
                record_hash: id(12),
            });
        assert!(!DevelopmentCallFilter::contains(&call));
        let sudo = RuntimeCall::Sudo(pallet_sudo::Call::sudo {
            call: alloc::boxed::Box::new(call),
        });
        assert!(!DevelopmentCallFilter::contains(&sudo));
        assert_eq!(
            sudo.dispatch(RuntimeOrigin::signed(alice()))
                .unwrap_err()
                .error,
            frame_system::Error::<Runtime>::CallFiltered.into()
        );
        assert!(!pallet_chlom_tokenization::TokenClasses::<Runtime>::contains_key(id(10)));
    });
}

#[test]
fn block_resource_limits_and_pallet_indices_are_finite_and_stable() {
    use frame_support::traits::PalletInfoAccess;
    let limits = configs::RuntimeBlockWeights::get();
    assert!(limits.max_block.ref_time() > 0 && limits.max_block.ref_time() < u64::MAX);
    assert_eq!(limits.max_block.proof_size(), 5 * 1024 * 1024);
    assert_eq!(ChlomAuthority::index(), 20);
    assert_eq!(ChlomPolicy::index(), 29);
    assert_eq!(VERSION.spec_version, 1);
    assert_eq!(genesis_config_presets::preset_names().len(), 2);
}

fn signed_extrinsic(call: RuntimeCall, signer: Sr25519Keyring, nonce: Nonce) -> UncheckedExtrinsic {
    use codec::Encode;
    use sp_core::Pair;
    let extensions: TxExtension = (
        frame_system::AuthorizeCall::new(),
        frame_system::CheckNonZeroSender::new(),
        frame_system::CheckSpecVersion::new(),
        frame_system::CheckTxVersion::new(),
        frame_system::CheckGenesis::new(),
        frame_system::CheckEra::from(generic::Era::Immortal),
        frame_system::CheckNonce::from(nonce),
        frame_system::CheckWeight::new(),
        pallet_transaction_payment::ChargeTransactionPayment::from(0),
        frame_metadata_hash_extension::CheckMetadataHash::new(false),
        frame_system::WeightReclaim::new(),
    );
    let payload = SignedPayload::new(call.clone(), extensions.clone()).unwrap();
    let signature = payload.using_encoded(|bytes| signer.pair().sign(bytes));
    UncheckedExtrinsic::new_signed(
        call,
        signer.to_account_id().into(),
        Signature::Sr25519(signature),
        extensions,
    )
}

#[test]
fn executive_checks_real_signatures_nonce_and_charges_development_fees() {
    use sp_runtime::traits::Header as HeaderT;
    ext().execute_with(|| {
        Executive::initialize_block(&Header::new(
            1,
            Default::default(),
            Default::default(),
            Default::default(),
            Default::default(),
        ));
        let before = Balances::free_balance(bob());
        // This signer has no CHLOM authority: the transaction is validly signed, but dispatch fails.
        let tx = signed_extrinsic(allocation(), Sr25519Keyring::Bob, 0);
        let dispatch = Executive::apply_extrinsic(tx.clone()).expect("valid signed transaction");
        assert!(dispatch.is_err());
        assert_eq!(System::account_nonce(bob()), 1);
        assert!(Balances::free_balance(bob()) < before);
        assert!(
            Executive::apply_extrinsic(tx).is_err(),
            "nonce replay must be invalid"
        );
        assert_eq!(
            pallet_chlom_utility::Balances::<Runtime>::get(bob(), id(2)).allocated,
            0
        );
        grant(bob(), 8, AuthorityClass::D3, None);
        let tx = signed_extrinsic(allocation(), Sr25519Keyring::Bob, 1);
        assert_ok!(Executive::apply_extrinsic(tx).expect("authorized signed transaction"));
        assert_eq!(
            pallet_chlom_utility::Balances::<Runtime>::get(bob(), id(2)).allocated,
            100
        );
        assert_eq!(System::account_nonce(bob()), 2);
    });
}

#[test]
fn licensing_reads_actual_rights_registry_and_rejects_expired_source() {
    use chlom_primitives::{DlaState, RecordState};
    ext().execute_with(|| {
        grant(alice(), 2, AuthorityClass::D3, None);
        grant(bob(), 3, AuthorityClass::D3, None);
        let dla = RuntimeCall::ChlomLicensing(pallet_chlom_licensing::Call::record_dla_version {
            dla_id: id(51),
            version: 1,
            asset_id: id(52),
            asset_version_hash: id(53),
            rights_instrument_id: id(54),
            rights_state: RecordState::Operative,
            evidence_readiness_hash: id(55),
            policy_binding_hash: id(56),
            offerability: DlaState::EligibleInternal,
            tokenization_state: RecordState::Draft,
            previous_record_hash: None,
            record_hash: id(57),
        });
        assert!(
            dla.clone().dispatch(RuntimeOrigin::signed(bob())).is_err(),
            "missing source rights must reject"
        );
        assert_ok!(
            RuntimeCall::ChlomRights(pallet_chlom_rights::Call::record_rights_instrument {
                instrument_id: id(54),
                asset_id: id(52),
                asset_version_hash: id(53),
                grantor_subject_id: id(58),
                grantee_subject_id: id(59),
                instrument_type: id(60),
                rights_scope_hash: id(61),
                excluded_scope_hash: id(62),
                territory_scope_hash: id(63),
                channel_scope_hash: id(64),
                exclusive: false,
                transferable: false,
                sublicensable: false,
                commercial_use: false,
                valid_from: Some(1),
                valid_until: Some(2),
                royalty_policy_id: None,
                state: RecordState::Operative,
                authority_class: AuthorityClass::D3,
                governing_instrument_hash: Some(id(65)),
                supersedes_instrument_id: None,
                evidence_hash: id(66),
                terms_hash: id(67),
                record_hash: id(68),
            })
            .dispatch(RuntimeOrigin::signed(alice()))
        );
        assert_ok!(dla.dispatch(RuntimeOrigin::signed(bob())));
        System::set_block_number(3);
        assert!(
            RuntimeCall::ChlomLicensing(pallet_chlom_licensing::Call::record_dla_version {
                dla_id: id(51),
                version: 2,
                asset_id: id(52),
                asset_version_hash: id(53),
                rights_instrument_id: id(54),
                rights_state: RecordState::Operative,
                evidence_readiness_hash: id(55),
                policy_binding_hash: id(56),
                offerability: DlaState::EligibleInternal,
                tokenization_state: RecordState::Draft,
                previous_record_hash: Some(id(57)),
                record_hash: id(69),
            })
            .dispatch(RuntimeOrigin::signed(bob()))
            .is_err(),
            "expired source rights cannot authorize licensing"
        );
        assert_eq!(
            pallet_chlom_licensing::DlaHeads::<Runtime>::get(id(51)),
            Some(1)
        );
    });
}

#[test]
fn linker_allowlist_exactly_matches_pinned_sdk_host_providers() {
    use sp_wasm_interface::HostFunctions;
    let mut names: Vec<&str> = <(
        sp_io::SubstrateHostFunctions,
        frame_benchmarking::benchmarking::HostFunctions,
    )>::host_functions()
    .into_iter()
    .map(|function| function.name())
    .collect();
    names.sort_unstable();
    names.dedup();
    let expected = names.join("\n") + "\n";
    assert_eq!(include_str!("../sdk-host-imports.txt"), expected);
}
