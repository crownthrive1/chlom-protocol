#![cfg(test)]

use chlom_primitives::{
    AuthorityClass, DlaState, ExternalIssuanceState, LicenseStatus, OfferState, RecordState,
    SignalAction, TokenClassKind,
};
use frame_support::{assert_noop, assert_ok, derive_impl, parameter_types, BoundedVec};
use sp_runtime::BuildStorage;

type Block = frame_system::mocking::MockBlock<Test>;

#[frame_support::runtime]
mod runtime {
    #[runtime::runtime]
    #[runtime::derive(
        RuntimeCall,
        RuntimeEvent,
        RuntimeError,
        RuntimeOrigin,
        RuntimeFreezeReason,
        RuntimeHoldReason,
        RuntimeSlashReason,
        RuntimeLockId,
        RuntimeTask,
        RuntimeViewFunction
    )]
    pub struct Test;

    #[runtime::pallet_index(0)]
    pub type System = frame_system::Pallet<Test>;
    #[runtime::pallet_index(1)]
    pub type ChlomAuthority = pallet_chlom_authority::Pallet<Test>;
    #[runtime::pallet_index(2)]
    pub type ChlomIdentity = pallet_chlom_identity::Pallet<Test>;
    #[runtime::pallet_index(3)]
    pub type ChlomRights = pallet_chlom_rights::Pallet<Test>;
    #[runtime::pallet_index(4)]
    pub type ChlomLicensing = pallet_chlom_licensing::Pallet<Test>;
    #[runtime::pallet_index(5)]
    pub type ChlomSettlement = pallet_chlom_settlement::Pallet<Test>;
    #[runtime::pallet_index(6)]
    pub type ChlomTokenization = pallet_chlom_tokenization::Pallet<Test>;
    #[runtime::pallet_index(7)]
    pub type ChlomOracle = pallet_chlom_oracle::Pallet<Test>;
    #[runtime::pallet_index(8)]
    pub type ChlomCheckpoint = pallet_chlom_checkpoint::Pallet<Test>;
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Block = Block;
}

parameter_types! {
    pub const MaxLegs: u32 = 16;
}

impl pallet_chlom_authority::Config for Test {
    type WeightInfo = pallet_chlom_authority::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type AdminOrigin = frame_system::EnsureRoot<u64>;
}

impl pallet_chlom_identity::Config for Test {
    type WeightInfo = pallet_chlom_identity::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type AdminOrigin = frame_system::EnsureRoot<u64>;
}

impl pallet_chlom_rights::Config for Test {
    type WeightInfo = pallet_chlom_rights::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type RightsOrigin = frame_system::EnsureRoot<u64>;
}

pub struct NativeRightsVerifier;
impl pallet_chlom_licensing::RightsVerifier<u64> for NativeRightsVerifier {
    #[cfg(feature = "runtime-benchmarks")]
    fn benchmark_insert(
        instrument_id: [u8; 32],
        reference: pallet_chlom_licensing::RightsReference<u64>,
    ) {
        // Public synthetic benchmark data, never production evidence.
        pallet_chlom_rights::RightsInstruments::<Test>::insert(
            instrument_id,
            pallet_chlom_rights::RightsInstrument {
                asset_id: reference.asset_id,
                asset_version_hash: reference.asset_version_hash,
                grantor_subject_id: [21; 32],
                grantee_subject_id: [22; 32],
                instrument_type: [23; 32],
                rights_scope_hash: [24; 32],
                excluded_scope_hash: [25; 32],
                territory_scope_hash: [26; 32],
                channel_scope_hash: [27; 32],
                exclusive: false,
                transferable: false,
                sublicensable: false,
                commercial_use: false,
                valid_from: reference.valid_from,
                valid_until: reference.valid_until,
                royalty_policy_id: None,
                state: reference.state,
                authority_class: AuthorityClass::D3,
                governing_instrument_hash: Some([28; 32]),
                supersedes_instrument_id: None,
                evidence_hash: [29; 32],
                terms_hash: [30; 32],
                record_hash: [31; 32],
            },
        );
        if reference.superseded {
            pallet_chlom_rights::RightsSupersededBy::<Test>::insert(instrument_id, [32; 32]);
        } else {
            pallet_chlom_rights::RightsSupersededBy::<Test>::remove(instrument_id);
        }
    }

    fn instrument(instrument_id: [u8; 32]) -> Option<pallet_chlom_licensing::RightsReference<u64>> {
        pallet_chlom_rights::RightsInstruments::<Test>::get(instrument_id).map(|rights| {
            pallet_chlom_licensing::RightsReference {
                asset_id: rights.asset_id,
                asset_version_hash: rights.asset_version_hash,
                state: rights.state,
                valid_from: rights.valid_from,
                valid_until: rights.valid_until,
                superseded: pallet_chlom_rights::RightsSupersededBy::<Test>::contains_key(
                    instrument_id,
                ),
            }
        })
    }
}

impl pallet_chlom_licensing::Config for Test {
    type WeightInfo = pallet_chlom_licensing::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type LicensingOrigin = frame_system::EnsureRoot<u64>;
    type RightsVerifier = NativeRightsVerifier;
}

impl pallet_chlom_settlement::Config for Test {
    type WeightInfo = pallet_chlom_settlement::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type SettlementOrigin = frame_system::EnsureRoot<u64>;
    type MaxLegs = MaxLegs;
}

impl pallet_chlom_tokenization::Config for Test {
    type WeightInfo = pallet_chlom_tokenization::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type TokenOrigin = frame_system::EnsureRoot<u64>;
}

impl pallet_chlom_oracle::Config for Test {
    type WeightInfo = pallet_chlom_oracle::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type OracleOrigin = frame_system::EnsureRoot<u64>;
    type ReviewOrigin = frame_system::EnsureRoot<u64>;
}

impl pallet_chlom_checkpoint::Config for Test {
    type WeightInfo = pallet_chlom_checkpoint::weights::SubstrateWeight<Test>;
    type RuntimeEvent = RuntimeEvent;
    type CheckpointOrigin = frame_system::EnsureRoot<u64>;
    type AnchorOrigin = frame_system::EnsureRoot<u64>;
}

fn new_test_ext() -> sp_io::TestExternalities {
    frame_system::GenesisConfig::<Test>::default()
        .build_storage()
        .expect("test storage")
        .into()
}

fn id(value: u8) -> [u8; 32] {
    [value; 32]
}

#[test]
fn rights_before_tokens_end_to_end() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        assert_ok!(ChlomAuthority::record_grant_version(
            RuntimeOrigin::root(),
            id(1),
            id(2),
            1,
            AuthorityClass::D3,
            true,
            None,
            None,
            id(3)
        ));
        assert_ok!(ChlomIdentity::record_identity_version(
            RuntimeOrigin::root(),
            id(1),
            1,
            id(4),
            id(5),
            id(1),
            Some(id(6)),
            RecordState::VerifiedForWorkflow,
            None,
            id(7)
        ));

        assert_noop!(
            ChlomRights::record_ownership_interest(
                RuntimeOrigin::root(),
                id(10),
                id(11),
                id(12),
                id(1),
                id(13),
                10_000,
                RecordState::ContractuallyRecorded,
                AuthorityClass::D2,
                Some(id(14)),
                None,
                id(15),
                id(16)
            ),
            pallet_chlom_rights::Error::<Test>::ContractualStateRequiresD3
        );

        assert_ok!(ChlomRights::record_ownership_interest(
            RuntimeOrigin::root(),
            id(10),
            id(11),
            id(12),
            id(1),
            id(13),
            10_000,
            RecordState::ContractuallyRecorded,
            AuthorityClass::D3,
            Some(id(14)),
            None,
            id(15),
            id(16)
        ));
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
            Some(id(27)),
            RecordState::Operative,
            AuthorityClass::D3,
            Some(id(28)),
            None,
            id(29),
            id(30),
            id(31)
        ));

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
            true,
            None,
            id(49)
        ));
        assert_ok!(ChlomLicensing::record_lex_offer_version(
            RuntimeOrigin::root(),
            id(50),
            1,
            id(40),
            id(51),
            id(1),
            id(52),
            id(53),
            100,
            id(54),
            OfferState::Published,
            true,
            Some(100),
            None,
            id(55)
        ));
        assert_ok!(ChlomLicensing::record_entitlement_version(
            RuntimeOrigin::root(),
            id(56),
            1,
            id(44),
            id(46),
            id(57),
            id(58),
            RecordState::Operative,
            Some(100),
            None,
            id(59)
        ));

        let legs: BoundedVec<_, MaxLegs> = vec![
            pallet_chlom_settlement::SplitLeg {
                leg_id: id(60),
                beneficiary_subject_id: id(1),
                allocation_role: id(61),
                basis_points: 7_000,
                conditions_hash: id(62),
            },
            pallet_chlom_settlement::SplitLeg {
                leg_id: id(63),
                beneficiary_subject_id: id(64),
                allocation_role: id(65),
                basis_points: 2_000,
                conditions_hash: id(66),
            },
            pallet_chlom_settlement::SplitLeg {
                leg_id: id(67),
                beneficiary_subject_id: id(68),
                allocation_role: id(69),
                basis_points: 1_000,
                conditions_hash: id(70),
            },
        ]
        .try_into()
        .expect("bounded legs");
        assert_ok!(ChlomSettlement::record_revenue_policy(
            RuntimeOrigin::root(),
            id(71),
            id(72),
            id(73),
            id(74),
            false,
            legs,
            id(75)
        ));
        assert_ok!(ChlomSettlement::preview_settlement(
            RuntimeOrigin::root(),
            id(76),
            id(71),
            id(50),
            101,
            id(73),
            id(77)
        ));
        assert!(
            !pallet_chlom_settlement::SettlementPreviews::<Test>::get(id(76))
                .expect("preview")
                .money_moved
        );

        assert_ok!(ChlomTokenization::record_token_class(
            RuntimeOrigin::root(),
            id(80),
            TokenClassKind::SmartLicense,
            true,
            id(81),
            false,
            ExternalIssuanceState::ProductionGated,
            id(82)
        ));
        assert_ok!(ChlomTokenization::register_tokenized_object(
            RuntimeOrigin::root(),
            id(83),
            id(80),
            id(84),
            id(40),
            id(43),
            Some(id(11)),
            Some(id(40)),
            Some(id(56)),
            id(46),
            id(85),
            id(86)
        ));
        let object =
            pallet_chlom_tokenization::TokenizedObjects::<Test>::get(id(83)).expect("object");
        assert!(!object.external_chain_transaction);
        assert!(!object.raw_private_evidence_embedded);

        assert_ok!(ChlomOracle::report_signal(
            RuntimeOrigin::root(),
            id(90),
            id(91),
            id(92),
            id(83),
            id(93),
            9_000,
            10_000,
            SignalAction::SuspensionReviewRecommended,
            id(94),
            id(95),
            Some((id(96), AuthorityClass::D3))
        ));
        let case = pallet_chlom_oracle::ReviewCases::<Test>::get(id(96)).expect("case");
        assert!(!case.consequential_action_taken);

        assert_ok!(ChlomCheckpoint::record_checkpoint(
            RuntimeOrigin::root(),
            id(100),
            1,
            12,
            12,
            id(101),
            id(102),
            None,
            id(103),
            id(104),
            true,
            false,
            id(105)
        ));
        assert_ok!(ChlomCheckpoint::record_anchor_intent(
            RuntimeOrigin::root(),
            id(106),
            id(100),
            id(107),
            id(108),
            true,
            false,
            id(109)
        ));
    });
}

fn record_checkpoint(
    checkpoint: u8,
    start: u64,
    end: u64,
    count: u32,
    first: u8,
    last: u8,
) -> frame_support::dispatch::DispatchResult {
    ChlomCheckpoint::record_checkpoint(
        RuntimeOrigin::root(),
        id(checkpoint),
        start,
        end,
        count,
        id(first),
        id(last),
        None,
        id(103),
        id(104),
        true,
        false,
        id(105),
    )
}

#[test]
fn checkpoints_reject_impossible_cardinality_and_boundaries_without_residue() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        for (start, end, count, first, last) in [
            (1, 2, 3, 101, 102),
            (1, 2, 1, 101, 101),
            (1, 1, 1, 101, 102),
            (1, 2, 2, 101, 101),
            (0, 1, 1, 101, 101),
        ] {
            assert_noop!(
                record_checkpoint(100, start, end, count, first, last),
                pallet_chlom_checkpoint::Error::<Test>::InvalidRange
            );
        }
        assert!(pallet_chlom_checkpoint::CheckpointHead::<Test>::get().is_none());
        assert_eq!(System::events().len(), 0);
    });
}

#[test]
fn checkpoints_allow_allocated_sequence_gaps_and_u64_boundary() {
    new_test_ext().execute_with(|| {
        assert_ok!(record_checkpoint(100, 1, u64::MAX, 2, 101, 102));
        let checkpoint = pallet_chlom_checkpoint::Checkpoints::<Test>::get(id(100)).unwrap();
        assert_eq!(checkpoint.event_count, 2);
        assert_eq!(checkpoint.end_sequence_id, u64::MAX);
    });
    new_test_ext().execute_with(|| {
        assert_ok!(record_checkpoint(100, u64::MAX, u64::MAX, 1, 101, 101));
    });
}

#[test]
fn anchor_receipt_must_match_the_intended_network() {
    new_test_ext().execute_with(|| {
        assert_ok!(record_checkpoint(100, 1, 2, 2, 101, 102));
        assert_ok!(ChlomCheckpoint::record_anchor_intent(
            RuntimeOrigin::root(),
            id(106),
            id(100),
            id(107),
            id(108),
            true,
            false,
            id(109)
        ));
        assert_noop!(
            ChlomCheckpoint::record_anchor_receipt(
                RuntimeOrigin::root(),
                id(110),
                id(106),
                id(111),
                id(112),
                id(113),
                id(114),
                id(115),
                true,
                id(116)
            ),
            pallet_chlom_checkpoint::Error::<Test>::NetworkMismatch
        );
        assert_ok!(ChlomCheckpoint::record_anchor_receipt(
            RuntimeOrigin::root(),
            id(110),
            id(106),
            id(111),
            id(108),
            id(113),
            id(114),
            id(115),
            true,
            id(116)
        ));
    });
}

fn report_signal(signal: u8, case: u8) -> frame_support::dispatch::DispatchResult {
    ChlomOracle::report_signal(
        RuntimeOrigin::root(),
        id(signal),
        id(91),
        id(92),
        id(83),
        id(93),
        9_000,
        10_000,
        SignalAction::Review,
        id(94),
        id(95),
        Some((id(case), AuthorityClass::D3)),
    )
}

#[test]
fn oracle_decisions_append_history_and_keep_the_compatible_head() {
    use pallet_chlom_oracle::{CaseState, ReviewCaseHeads, ReviewCaseVersions, ReviewCases};
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        assert_ok!(report_signal(90, 96));
        let opening = ReviewCaseVersions::<Test>::get(id(96), 1).unwrap();
        System::set_block_number(2);
        assert_ok!(ChlomOracle::record_review_decision(
            RuntimeOrigin::root(),
            id(96),
            AuthorityClass::D3,
            CaseState::Review,
            id(110),
            false,
            id(111)
        ));
        System::set_block_number(3);
        assert_ok!(ChlomOracle::record_review_decision(
            RuntimeOrigin::root(),
            id(96),
            AuthorityClass::D3,
            CaseState::Resolved,
            id(112),
            false,
            id(113)
        ));
        assert_eq!(ReviewCaseVersions::<Test>::get(id(96), 1).unwrap(), opening);
        let review = ReviewCaseVersions::<Test>::get(id(96), 2).unwrap();
        let resolved = ReviewCaseVersions::<Test>::get(id(96), 3).unwrap();
        assert_eq!(review.previous_record_hash, Some(id(95)));
        assert_eq!(resolved.previous_record_hash, Some(id(111)));
        assert_eq!(review.case.state, CaseState::Review);
        assert_eq!(resolved.case.state, CaseState::Resolved);
        assert_eq!(resolved.recorded_at, 3);
        assert_eq!(ReviewCaseHeads::<Test>::get(id(96)), Some(3));
        assert_eq!(ReviewCases::<Test>::get(id(96)).unwrap(), resolved.case);
    });
}

#[test]
fn rejected_oracle_case_does_not_leave_a_signal_or_event() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        assert_ok!(report_signal(90, 96));
        assert_noop!(
            report_signal(97, 96),
            pallet_chlom_oracle::Error::<Test>::RecordAlreadyExists
        );
        assert_noop!(
            report_signal(98, 0),
            pallet_chlom_oracle::Error::<Test>::InvalidIdentifier
        );
        assert!(!pallet_chlom_oracle::OracleSignals::<Test>::contains_key(
            id(97)
        ));
        assert!(!pallet_chlom_oracle::OracleSignals::<Test>::contains_key(
            id(98)
        ));
    });
}

#[test]
fn rejected_oracle_decision_does_not_append_a_revision() {
    use pallet_chlom_oracle::{CaseState, ReviewCaseHeads, ReviewCaseVersions};
    new_test_ext().execute_with(|| {
        assert_ok!(report_signal(90, 96));
        assert_noop!(
            ChlomOracle::record_review_decision(
                RuntimeOrigin::root(),
                id(96),
                AuthorityClass::D2,
                CaseState::Resolved,
                id(110),
                false,
                id(111)
            ),
            pallet_chlom_oracle::Error::<Test>::InsufficientReviewAuthority
        );
        assert_noop!(
            ChlomOracle::record_review_decision(
                RuntimeOrigin::root(),
                id(96),
                AuthorityClass::D3,
                CaseState::Resolved,
                id(110),
                false,
                id(95)
            ),
            pallet_chlom_oracle::Error::<Test>::InvalidRevision
        );
        assert_eq!(ReviewCaseHeads::<Test>::get(id(96)), Some(1));
        assert!(ReviewCaseVersions::<Test>::get(id(96), 2).is_none());
    });
}

#[test]
fn legacy_oracle_head_is_preserved_on_first_new_decision() {
    use pallet_chlom_oracle::{CaseState, ReviewCaseHeads, ReviewCaseVersions, ReviewCases};
    new_test_ext().execute_with(|| {
        assert_ok!(report_signal(90, 96));
        // Model the old storage layout: only the latest case was persisted.
        ReviewCaseHeads::<Test>::remove(id(96));
        ReviewCaseVersions::<Test>::remove(id(96), 1);
        let legacy = ReviewCases::<Test>::get(id(96)).unwrap();
        System::set_block_number(10);
        assert_ok!(ChlomOracle::record_review_decision(
            RuntimeOrigin::root(),
            id(96),
            AuthorityClass::D3,
            CaseState::Review,
            id(110),
            false,
            id(111)
        ));
        let preserved = ReviewCaseVersions::<Test>::get(id(96), 1).unwrap();
        assert_eq!(preserved.case, legacy);
        assert_eq!(preserved.recorded_at, 10);
        assert_eq!(ReviewCaseHeads::<Test>::get(id(96)), Some(2));
    });
}

mod reference_invariants;
