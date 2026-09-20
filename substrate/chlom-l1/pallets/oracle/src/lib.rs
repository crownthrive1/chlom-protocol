#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;
pub mod weights;
pub use weights::WeightInfo;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

#[frame_support::pallet]
pub mod pallet {
    use crate::weights::WeightInfo;
    use chlom_primitives::{AuthorityClass, Id32, SignalAction, ZERO_ID};
    use codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
    use frame_support::{pallet_prelude::*, traits::EnsureOrigin};
    use frame_system::pallet_prelude::*;
    use scale_info::TypeInfo;
    use sp_runtime::RuntimeDebug;

    #[derive(
        Clone,
        Copy,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub enum SignalState {
        Reported,
        Acknowledged,
        UnderReview,
        Dismissed,
        Confirmed,
        Superseded,
    }

    #[derive(
        Clone,
        Copy,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub enum CaseState {
        Open,
        Triage,
        EvidenceHold,
        Review,
        Resolved,
        Dismissed,
        Appealed,
        Superseded,
    }

    #[derive(
        Clone,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub struct OracleSignal {
        pub oracle_subject_id: Id32,
        pub target_type: Id32,
        pub target_id: Id32,
        pub signal_type: Id32,
        pub risk_basis_points: u16,
        pub confidence_basis_points: u16,
        pub recommended_action: SignalAction,
        pub state: SignalState,
        pub autonomous_legal_effect: bool,
        pub evidence_hash: Id32,
        pub record_hash: Id32,
    }

    #[derive(
        Clone,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub struct ReviewCase {
        pub signal_id: Id32,
        pub target_type: Id32,
        pub target_id: Id32,
        pub state: CaseState,
        pub authority_required: AuthorityClass,
        pub consequential_action_taken: bool,
        pub decision_hash: Option<Id32>,
        pub record_hash: Id32,
    }

    /// Immutable revisions back the compatibility `ReviewCases` head projection.
    #[derive(
        Clone,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub struct ReviewCaseRevision<BlockNumber> {
        pub case: ReviewCase,
        pub previous_record_hash: Option<Id32>,
        pub recorded_at: BlockNumber,
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// Runtime-specific dispatch costs; defaults are unmeasured conservative estimates.
        type WeightInfo: WeightInfo;
        #[allow(deprecated)]
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type OracleOrigin: EnsureOrigin<Self::RuntimeOrigin>;
        type ReviewOrigin: EnsureOrigin<Self::RuntimeOrigin>;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::storage]
    pub type OracleSignals<T: Config> =
        StorageMap<_, Blake2_128Concat, Id32, OracleSignal, OptionQuery>;
    #[pallet::storage]
    pub type ReviewCases<T: Config> =
        StorageMap<_, Blake2_128Concat, Id32, ReviewCase, OptionQuery>;
    #[pallet::storage]
    pub type ReviewCaseHeads<T: Config> = StorageMap<_, Blake2_128Concat, Id32, u32, OptionQuery>;
    #[pallet::storage]
    pub type ReviewCaseVersions<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        Id32,
        Blake2_128Concat,
        u32,
        ReviewCaseRevision<BlockNumberFor<T>>,
        OptionQuery,
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        OracleSignalReported {
            signal_id: Id32,
            target_id: Id32,
            risk_basis_points: u16,
            recommended_action: SignalAction,
            autonomous_legal_effect: bool,
        },
        ReviewCaseOpened {
            case_id: Id32,
            signal_id: Id32,
            authority_required: AuthorityClass,
            consequential_action_taken: bool,
        },
        ReviewDecisionRecorded {
            case_id: Id32,
            state: CaseState,
            decision_hash: Id32,
            consequential_action_taken: bool,
        },
        ReviewCaseVersionRecorded {
            case_id: Id32,
            version: u32,
            previous_record_hash: Option<Id32>,
            record_hash: Id32,
        },
    }

    #[pallet::error]
    pub enum Error<T> {
        InvalidIdentifier,
        InvalidScore,
        RecordAlreadyExists,
        SignalMissing,
        CaseMissing,
        DecisionRequired,
        InsufficientReviewAuthority,
        InvalidRevision,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::report_signal())]
        pub fn report_signal(
            origin: OriginFor<T>,
            signal_id: Id32,
            oracle_subject_id: Id32,
            target_type: Id32,
            target_id: Id32,
            signal_type: Id32,
            risk_basis_points: u16,
            confidence_basis_points: u16,
            recommended_action: SignalAction,
            evidence_hash: Id32,
            record_hash: Id32,
            review_case: Option<(Id32, AuthorityClass)>,
        ) -> DispatchResult {
            T::OracleOrigin::ensure_origin(origin)?;
            ensure!(
                signal_id != ZERO_ID
                    && oracle_subject_id != ZERO_ID
                    && target_type != ZERO_ID
                    && target_id != ZERO_ID
                    && signal_type != ZERO_ID
                    && evidence_hash != ZERO_ID
                    && record_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(
                risk_basis_points <= 10_000 && confidence_basis_points <= 10_000,
                Error::<T>::InvalidScore
            );
            ensure!(
                !OracleSignals::<T>::contains_key(signal_id),
                Error::<T>::RecordAlreadyExists
            );
            // Check every condition before persisting a signal or event. A
            // rejected review-case identifier must not leave a partial signal.
            if let Some((case_id, _)) = review_case {
                ensure!(case_id != ZERO_ID, Error::<T>::InvalidIdentifier);
                ensure!(
                    !ReviewCases::<T>::contains_key(case_id)
                        && !ReviewCaseHeads::<T>::contains_key(case_id),
                    Error::<T>::RecordAlreadyExists
                );
            }
            OracleSignals::<T>::insert(
                signal_id,
                OracleSignal {
                    oracle_subject_id,
                    target_type,
                    target_id,
                    signal_type,
                    risk_basis_points,
                    confidence_basis_points,
                    recommended_action,
                    state: SignalState::Reported,
                    autonomous_legal_effect: false,
                    evidence_hash,
                    record_hash,
                },
            );
            Self::deposit_event(Event::OracleSignalReported {
                signal_id,
                target_id,
                risk_basis_points,
                recommended_action,
                autonomous_legal_effect: false,
            });
            if let Some((case_id, authority_required)) = review_case {
                let case = ReviewCase {
                    signal_id,
                    target_type,
                    target_id,
                    state: CaseState::Open,
                    authority_required,
                    consequential_action_taken: false,
                    decision_hash: None,
                    record_hash,
                };
                Self::append_case_revision(case_id, 1, None, case);
                Self::deposit_event(Event::ReviewCaseOpened {
                    case_id,
                    signal_id,
                    authority_required,
                    consequential_action_taken: false,
                });
            }
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::record_review_decision())]
        pub fn record_review_decision(
            origin: OriginFor<T>,
            case_id: Id32,
            reviewer_authority: AuthorityClass,
            state: CaseState,
            decision_hash: Id32,
            consequential_action_taken: bool,
            record_hash: Id32,
        ) -> DispatchResult {
            T::ReviewOrigin::ensure_origin(origin)?;
            ensure!(
                case_id != ZERO_ID && decision_hash != ZERO_ID && record_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            let prior = ReviewCases::<T>::get(case_id).ok_or(Error::<T>::CaseMissing)?;
            ensure!(
                reviewer_authority.permits(prior.authority_required),
                Error::<T>::InsufficientReviewAuthority
            );
            ensure!(
                matches!(
                    state,
                    CaseState::Resolved
                        | CaseState::Dismissed
                        | CaseState::Appealed
                        | CaseState::EvidenceHold
                        | CaseState::Review
                ),
                Error::<T>::DecisionRequired
            );
            ensure!(
                record_hash != prior.record_hash,
                Error::<T>::InvalidRevision
            );
            // Preserve a pre-upgrade case as revision 1 on its first new decision.
            // Its observed block is custody time, not a fabricated creation date.
            let prior_version = ReviewCaseHeads::<T>::get(case_id).unwrap_or(1);
            let next_version = prior_version
                .checked_add(1)
                .ok_or(Error::<T>::InvalidRevision)?;
            ensure!(
                !ReviewCaseVersions::<T>::contains_key(case_id, next_version),
                Error::<T>::InvalidRevision
            );
            if !ReviewCaseHeads::<T>::contains_key(case_id) {
                ensure!(
                    !ReviewCaseVersions::<T>::contains_key(case_id, 1),
                    Error::<T>::InvalidRevision
                );
                Self::append_case_revision(case_id, 1, None, prior.clone());
            } else {
                let previous = ReviewCaseVersions::<T>::get(case_id, prior_version)
                    .ok_or(Error::<T>::InvalidRevision)?;
                ensure!(
                    previous.case.record_hash == prior.record_hash,
                    Error::<T>::InvalidRevision
                );
            }
            let next = ReviewCase {
                signal_id: prior.signal_id,
                target_type: prior.target_type,
                target_id: prior.target_id,
                state,
                authority_required: prior.authority_required,
                consequential_action_taken,
                decision_hash: Some(decision_hash),
                record_hash,
            };
            Self::append_case_revision(case_id, next_version, Some(prior.record_hash), next);
            Self::deposit_event(Event::ReviewDecisionRecorded {
                case_id,
                state,
                decision_hash,
                consequential_action_taken,
            });
            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        fn append_case_revision(
            case_id: Id32,
            version: u32,
            previous_record_hash: Option<Id32>,
            case: ReviewCase,
        ) {
            let record_hash = case.record_hash;
            ReviewCaseVersions::<T>::insert(
                case_id,
                version,
                ReviewCaseRevision {
                    case: case.clone(),
                    previous_record_hash,
                    recorded_at: frame_system::Pallet::<T>::block_number(),
                },
            );
            ReviewCaseHeads::<T>::insert(case_id, version);
            ReviewCases::<T>::insert(case_id, case);
            Self::deposit_event(Event::ReviewCaseVersionRecorded {
                case_id,
                version,
                previous_record_hash,
                record_hash,
            });
        }
    }
}
