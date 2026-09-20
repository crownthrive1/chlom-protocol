use super::*;
use pallet_chlom_tokenization::TokenEventType;

fn source_rights() {
    System::set_block_number(1);
    assert_ok!(ChlomRights::record_rights_instrument(
        RuntimeOrigin::root(),
        id(20),
        id(11),
        id(12),
        id(1),
        id(21),
        id(22),
        id(23),
        id(24),
        id(25),
        id(26),
        false,
        true,
        false,
        true,
        Some(1),
        Some(100),
        None,
        RecordState::Operative,
        AuthorityClass::D3,
        Some(id(28)),
        None,
        id(29),
        id(30),
        id(31)
    ));
}

fn dla() {
    source_rights();
    assert_ok!(ChlomLicensing::record_dla_version(
        RuntimeOrigin::root(),
        id(40),
        1,
        id(11),
        id(12),
        id(20),
        RecordState::Operative,
        id(41),
        id(42),
        DlaState::EligiblePublic,
        RecordState::UnderReview,
        None,
        id(43)
    ));
}

fn license(transferable: bool) {
    dla();
    assert_ok!(ChlomLicensing::record_license_version(
        RuntimeOrigin::root(),
        id(44),
        1,
        id(40),
        id(45),
        id(1),
        id(46),
        id(47),
        id(48),
        Some(100),
        LicenseStatus::Active,
        transferable,
        None,
        id(49)
    ));
}

fn entitlement(holder: u8, until: Option<u64>) -> frame_support::dispatch::DispatchResult {
    ChlomLicensing::record_entitlement_version(
        RuntimeOrigin::root(),
        id(56),
        1,
        id(44),
        id(holder),
        id(57),
        id(58),
        RecordState::Operative,
        until,
        None,
        id(59),
    )
}

#[test]
fn credential_subject_type_and_issuer_cannot_be_rebound() {
    new_test_ext().execute_with(|| {
        assert_ok!(ChlomIdentity::record_credential_version(
            RuntimeOrigin::root(),
            id(1),
            1,
            id(2),
            id(3),
            id(4),
            id(5),
            true,
            RecordState::VerifiedForWorkflow,
            None,
            None,
            id(6)
        ));
        for (subject, kind, issuer) in [(9, 3, 4), (2, 9, 4), (2, 3, 9)] {
            assert_noop!(
                ChlomIdentity::record_credential_version(
                    RuntimeOrigin::root(),
                    id(1),
                    2,
                    id(subject),
                    id(kind),
                    id(issuer),
                    id(7),
                    true,
                    RecordState::VerifiedForWorkflow,
                    None,
                    Some(id(6)),
                    id(8)
                ),
                pallet_chlom_identity::Error::<Test>::CredentialBindingMismatch
            );
        }
        assert_eq!(
            pallet_chlom_identity::CredentialHeads::<Test>::get(id(1)),
            Some(1)
        );
        assert_ok!(ChlomIdentity::record_credential_version(
            RuntimeOrigin::root(),
            id(1),
            2,
            id(2),
            id(3),
            id(4),
            id(7),
            true,
            RecordState::Revoked,
            None,
            Some(id(6)),
            id(8)
        ));
    });
}

#[test]
fn dla_rejects_missing_mismatched_and_expired_rights() {
    new_test_ext().execute_with(|| {
        let write = |asset, version_hash, instrument, state| {
            ChlomLicensing::record_dla_version(
                RuntimeOrigin::root(),
                id(40),
                1,
                id(asset),
                id(version_hash),
                id(instrument),
                state,
                id(41),
                id(42),
                DlaState::EligiblePublic,
                RecordState::UnderReview,
                None,
                id(43),
            )
        };
        assert_noop!(
            write(11, 12, 20, RecordState::Operative),
            pallet_chlom_licensing::Error::<Test>::RightsInstrumentMissing
        );
        source_rights();
        for (asset, hash, state) in [
            (99, 12, RecordState::Operative),
            (11, 99, RecordState::Operative),
            (11, 12, RecordState::ContractuallyRecorded),
        ] {
            assert_noop!(
                write(asset, hash, 20, state),
                pallet_chlom_licensing::Error::<Test>::RightsBindingMismatch
            );
        }
        System::set_block_number(101);
        assert_noop!(
            write(11, 12, 20, RecordState::Operative),
            pallet_chlom_licensing::Error::<Test>::RightsNotReady
        );
        assert!(!pallet_chlom_licensing::DlaHeads::<Test>::contains_key(id(
            40
        )));
    });
}

#[test]
fn nontransferable_license_cannot_change_holder_or_enable_transfer() {
    new_test_ext().execute_with(|| {
        license(false);
        for (holder, transferable) in [(99, false), (46, true), (99, true)] {
            assert_noop!(
                ChlomLicensing::record_license_version(
                    RuntimeOrigin::root(),
                    id(44),
                    2,
                    id(40),
                    id(45),
                    id(1),
                    id(holder),
                    id(47),
                    id(48),
                    Some(100),
                    LicenseStatus::Active,
                    transferable,
                    Some(id(49)),
                    id(50)
                ),
                pallet_chlom_licensing::Error::<Test>::TransferForbidden
            );
        }
        assert_eq!(
            pallet_chlom_licensing::LicenseHeads::<Test>::get(id(44)),
            Some(1)
        );
    });
}

#[test]
fn license_identity_cannot_change_dla_type_or_issuer() {
    new_test_ext().execute_with(|| {
        license(true);
        assert_ok!(ChlomLicensing::record_dla_version(
            RuntimeOrigin::root(),
            id(41),
            1,
            id(11),
            id(12),
            id(20),
            RecordState::Operative,
            id(41),
            id(42),
            DlaState::EligiblePublic,
            RecordState::UnderReview,
            None,
            id(43)
        ));
        for (dla_id, kind, issuer) in [(41, 45, 1), (40, 99, 1), (40, 45, 99)] {
            assert_noop!(
                ChlomLicensing::record_license_version(
                    RuntimeOrigin::root(),
                    id(44),
                    2,
                    id(dla_id),
                    id(kind),
                    id(issuer),
                    id(46),
                    id(47),
                    id(48),
                    Some(100),
                    LicenseStatus::Active,
                    true,
                    Some(id(49)),
                    id(50)
                ),
                pallet_chlom_licensing::Error::<Test>::RecordBindingMismatch
            );
        }
    });
}

#[test]
fn entitlement_requires_matching_holder_and_bounded_validity() {
    new_test_ext().execute_with(|| {
        license(false);
        assert_noop!(
            entitlement(99, Some(100)),
            pallet_chlom_licensing::Error::<Test>::EntitlementHolderMismatch
        );
        assert_noop!(
            entitlement(46, None),
            pallet_chlom_licensing::Error::<Test>::InvalidTerm
        );
        assert_noop!(
            entitlement(46, Some(101)),
            pallet_chlom_licensing::Error::<Test>::InvalidTerm
        );
        assert_noop!(
            entitlement(46, Some(0)),
            pallet_chlom_licensing::Error::<Test>::InvalidTerm
        );
        assert_ok!(entitlement(46, Some(100)));
        assert!(ChlomLicensing::is_entitlement_active(id(56)));
    });
}

#[test]
fn effective_license_and_entitlement_follow_source_rights_and_dla_state() {
    new_test_ext().execute_with(|| {
        license(false);
        assert_ok!(entitlement(46, Some(100)));
        assert!(ChlomLicensing::is_license_active(id(44)));
        assert_ok!(ChlomLicensing::record_dla_version(
            RuntimeOrigin::root(),
            id(40),
            2,
            id(11),
            id(12),
            id(20),
            RecordState::Operative,
            id(41),
            id(42),
            DlaState::Paused,
            RecordState::UnderReview,
            Some(id(43)),
            id(90)
        ));
        assert!(!ChlomLicensing::is_license_active(id(44)));
        assert!(!ChlomLicensing::is_entitlement_active(id(56)));
    });
    new_test_ext().execute_with(|| {
        license(false);
        assert_ok!(entitlement(46, Some(100)));
        pallet_chlom_rights::RightsSupersededBy::<Test>::insert(id(20), id(90));
        assert!(!ChlomLicensing::is_license_active(id(44)));
        assert!(!ChlomLicensing::is_entitlement_active(id(56)));
    });
    new_test_ext().execute_with(|| {
        license(false);
        // Source rights can expire earlier than the recorded license; effective access must stop.
        pallet_chlom_rights::RightsInstruments::<Test>::mutate(id(20), |record| {
            record.as_mut().unwrap().valid_until = Some(10)
        });
        System::set_block_number(11);
        assert!(!ChlomLicensing::is_license_active(id(44)));
    });
}

#[test]
fn transferring_transferable_license_does_not_transfer_prior_entitlement() {
    new_test_ext().execute_with(|| {
        license(true);
        assert_ok!(entitlement(46, Some(100)));
        assert_ok!(ChlomLicensing::record_license_version(
            RuntimeOrigin::root(),
            id(44),
            2,
            id(40),
            id(45),
            id(1),
            id(99),
            id(47),
            id(48),
            Some(100),
            LicenseStatus::Active,
            true,
            Some(id(49)),
            id(50)
        ));
        assert!(ChlomLicensing::is_license_active(id(44)));
        assert!(!ChlomLicensing::is_entitlement_active(id(56)));
    });
}

fn token() {
    assert_ok!(ChlomTokenization::record_token_class(
        RuntimeOrigin::root(),
        id(80),
        TokenClassKind::SmartLicense,
        true,
        id(81),
        false,
        ExternalIssuanceState::TestnetEligible,
        id(82)
    ));
    assert_ok!(ChlomTokenization::register_tokenized_object(
        RuntimeOrigin::root(),
        id(83),
        id(80),
        id(84),
        id(40),
        id(43),
        None,
        None,
        None,
        id(46),
        id(85),
        id(86)
    ));
    assert_ok!(ChlomTokenization::record_chain_adapter(
        RuntimeOrigin::root(),
        id(87),
        id(88),
        id(89),
        true,
        false,
        true,
        id(90)
    ));
}

fn provider(
    event: u8,
    kind: TokenEventType,
    from: Option<u8>,
    to: Option<u8>,
    adapter: Option<u8>,
    contract: Option<u8>,
    token_id: Option<u8>,
) -> frame_support::dispatch::DispatchResult {
    ChlomTokenization::record_provider_event(
        RuntimeOrigin::root(),
        id(event),
        id(83),
        kind,
        from.map(id),
        to.map(id),
        adapter.map(id),
        contract.map(id),
        token_id.map(id),
        Some(id(95)),
        id(96),
        id(97),
    )
}

fn mint() {
    assert_ok!(provider(
        91,
        TokenEventType::TestnetMintConfirmed,
        None,
        Some(46),
        Some(87),
        Some(92),
        Some(93)
    ));
}

#[test]
fn provider_burn_requires_prior_mint_and_mint_has_holder_and_token_binding() {
    new_test_ext().execute_with(|| {
        token();
        assert_noop!(
            provider(
                94,
                TokenEventType::BurnConfirmed,
                Some(46),
                None,
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::PriorProviderMintRequired
        );
        assert_noop!(
            provider(
                94,
                TokenEventType::TestnetMintConfirmed,
                None,
                Some(99),
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::TokenHolderMismatch
        );
        assert_noop!(
            provider(
                94,
                TokenEventType::TestnetMintConfirmed,
                None,
                Some(46),
                Some(87),
                None,
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::TokenBindingMismatch
        );
        assert!(!pallet_chlom_tokenization::LatestTokenEvent::<Test>::contains_key(id(83)));
    });
}

#[test]
fn token_transfer_cannot_change_network_contract_token_or_current_holder() {
    new_test_ext().execute_with(|| {
        token();
        mint();
        for (adapter, contract, token_id) in [
            (None, Some(92), Some(93)),
            (Some(99), Some(92), Some(93)),
            (Some(87), Some(99), Some(93)),
            (Some(87), Some(92), Some(99)),
        ] {
            assert_noop!(
                provider(
                    94,
                    TokenEventType::TransferConfirmed,
                    Some(46),
                    Some(47),
                    adapter,
                    contract,
                    token_id
                ),
                pallet_chlom_tokenization::Error::<Test>::TokenBindingMismatch
            );
        }
        assert_noop!(
            provider(
                94,
                TokenEventType::TransferConfirmed,
                Some(99),
                Some(47),
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::TokenHolderMismatch
        );
        assert_noop!(
            provider(
                94,
                TokenEventType::TransferConfirmed,
                Some(46),
                None,
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::TokenHolderMismatch
        );
        assert_ok!(provider(
            94,
            TokenEventType::TransferConfirmed,
            Some(46),
            Some(47),
            Some(87),
            Some(92),
            Some(93)
        ));
        assert_noop!(
            provider(
                98,
                TokenEventType::TransferConfirmed,
                Some(46),
                Some(48),
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::TokenHolderMismatch
        );
    });
}

#[test]
fn failure_observation_keeps_effective_head_and_burn_is_terminal() {
    new_test_ext().execute_with(|| {
        token();
        mint();
        assert_ok!(provider(
            94,
            TokenEventType::ProviderFailure,
            None,
            None,
            None,
            None,
            None
        ));
        assert_eq!(
            pallet_chlom_tokenization::LatestTokenEvent::<Test>::get(id(83)),
            Some(id(91))
        );
        assert!(pallet_chlom_tokenization::TokenEvents::<Test>::contains_key(id(94)));
        assert_ok!(provider(
            98,
            TokenEventType::BurnConfirmed,
            Some(46),
            None,
            Some(87),
            Some(92),
            Some(93)
        ));
        assert_noop!(
            provider(
                99,
                TokenEventType::TestnetMintConfirmed,
                None,
                Some(46),
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::InvalidEventTransition
        );
        assert_noop!(
            provider(
                99,
                TokenEventType::TransferConfirmed,
                Some(46),
                Some(47),
                Some(87),
                Some(92),
                Some(93)
            ),
            pallet_chlom_tokenization::Error::<Test>::PriorProviderMintRequired
        );
    });
}

#[test]
fn suspended_or_revoked_token_cannot_be_reminted_or_transferred() {
    for state in [TokenEventType::Suspended, TokenEventType::Revoked] {
        new_test_ext().execute_with(|| {
            token();
            mint();
            assert_ok!(provider(94, state, None, None, None, None, None));
            assert_noop!(
                provider(
                    99,
                    TokenEventType::TestnetMintConfirmed,
                    None,
                    Some(46),
                    Some(87),
                    Some(92),
                    Some(93)
                ),
                pallet_chlom_tokenization::Error::<Test>::InvalidEventTransition
            );
            assert_noop!(
                provider(
                    99,
                    TokenEventType::TransferConfirmed,
                    Some(46),
                    Some(47),
                    Some(87),
                    Some(92),
                    Some(93)
                ),
                pallet_chlom_tokenization::Error::<Test>::PriorProviderMintRequired
            );
        });
    }
}
