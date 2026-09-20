#![cfg_attr(not(feature = "std"), no_std)]

//! Approved policy commitments. This registry does not interpret law or execute policy DSL.
pub use pallet::*;

#[frame_support::pallet]
pub mod pallet {
    use chlom_primitives::{Id32, ZERO_ID};
    use codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
    use frame_support::{pallet_prelude::*, traits::EnsureOrigin, BoundedVec};
    use frame_system::pallet_prelude::*;
    use scale_info::TypeInfo;
    use sp_runtime::RuntimeDebug;

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
    pub struct PolicyScope {
        pub tenant_id: Id32,
        pub jurisdiction_id: Id32,
        pub purpose_id: Id32,
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
    pub struct PolicyVersion<BlockNumber> {
        pub scope: PolicyScope,
        pub version: u32,
        pub policy_hash: Id32,
        pub effective_from: BlockNumber,
        pub effective_until: BlockNumber,
        pub approval_hash: Id32,
        pub evidence_hash: Id32,
        pub recorded_at: BlockNumber,
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
    pub struct Revocation<BlockNumber> {
        pub approval_hash: Id32,
        pub reason_hash: Id32,
        pub revoked_at: BlockNumber,
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        #[allow(deprecated)]
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type PolicyOrigin: EnsureOrigin<Self::RuntimeOrigin>;
        #[pallet::constant]
        type MaxVersionsPerScope: Get<u32>;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::storage]
    pub type Versions<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        Id32,
        Blake2_128Concat,
        u32,
        PolicyVersion<BlockNumberFor<T>>,
        OptionQuery,
    >;
    #[pallet::storage]
    pub type VersionIndex<T: Config> =
        StorageMap<_, Blake2_128Concat, Id32, BoundedVec<u32, T::MaxVersionsPerScope>, ValueQuery>;
    #[pallet::storage]
    pub type Revocations<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        Id32,
        Blake2_128Concat,
        u32,
        Revocation<BlockNumberFor<T>>,
        OptionQuery,
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        PolicyApproved {
            scope_id: Id32,
            version: u32,
            policy_hash: Id32,
            approval_hash: Id32,
        },
        PolicyRevoked {
            scope_id: Id32,
            version: u32,
            reason_hash: Id32,
        },
    }

    #[pallet::error]
    pub enum Error<T> {
        InvalidIdentifier,
        InvalidInterval,
        VersionOutOfSequence,
        VersionConflict,
        VersionLimit,
        EffectiveTimeRegression,
        PolicyMissing,
        AlreadyRevoked,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::from_parts(80_000_000, 16_384))]
        #[frame_support::transactional]
        pub fn approve_version(
            origin: OriginFor<T>,
            scope: PolicyScope,
            version: u32,
            policy_hash: Id32,
            effective_from: BlockNumberFor<T>,
            effective_until: BlockNumberFor<T>,
            approval_hash: Id32,
            evidence_hash: Id32,
        ) -> DispatchResult {
            T::PolicyOrigin::ensure_origin(origin)?;
            ensure!(
                scope.tenant_id != ZERO_ID
                    && scope.jurisdiction_id != ZERO_ID
                    && scope.purpose_id != ZERO_ID
                    && policy_hash != ZERO_ID
                    && approval_hash != ZERO_ID
                    && evidence_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            let scope_id = Self::scope_id(&scope);
            // An exact retry is harmless even after its effective date; it cannot rewrite approval.
            if let Some(existing) = Versions::<T>::get(scope_id, version) {
                ensure!(
                    existing.scope == scope
                        && existing.policy_hash == policy_hash
                        && existing.effective_from == effective_from
                        && existing.effective_until == effective_until
                        && existing.approval_hash == approval_hash
                        && existing.evidence_hash == evidence_hash,
                    Error::<T>::VersionConflict
                );
                return Ok(());
            }
            let now = frame_system::Pallet::<T>::block_number();
            ensure!(
                effective_from >= now && effective_until > effective_from,
                Error::<T>::InvalidInterval
            );
            let mut index = VersionIndex::<T>::get(scope_id);
            let previous = index.last().copied().unwrap_or(0);
            ensure!(
                previous.checked_add(1) == Some(version),
                Error::<T>::VersionOutOfSequence
            );
            if previous != 0 {
                let prior =
                    Versions::<T>::get(scope_id, previous).ok_or(Error::<T>::PolicyMissing)?;
                ensure!(
                    effective_from >= prior.effective_from,
                    Error::<T>::EffectiveTimeRegression
                );
            }
            index
                .try_push(version)
                .map_err(|_| Error::<T>::VersionLimit)?;
            Versions::<T>::insert(
                scope_id,
                version,
                PolicyVersion {
                    scope,
                    version,
                    policy_hash,
                    effective_from,
                    effective_until,
                    approval_hash,
                    evidence_hash,
                    recorded_at: now,
                },
            );
            VersionIndex::<T>::insert(scope_id, index);
            Self::deposit_event(Event::PolicyApproved {
                scope_id,
                version,
                policy_hash,
                approval_hash,
            });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(Weight::from_parts(55_000_000, 8_192))]
        pub fn revoke_version(
            origin: OriginFor<T>,
            scope_id: Id32,
            version: u32,
            approval_hash: Id32,
            reason_hash: Id32,
        ) -> DispatchResult {
            T::PolicyOrigin::ensure_origin(origin)?;
            ensure!(
                approval_hash != ZERO_ID && reason_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(
                Versions::<T>::contains_key(scope_id, version),
                Error::<T>::PolicyMissing
            );
            if let Some(prior) = Revocations::<T>::get(scope_id, version) {
                ensure!(
                    prior.approval_hash == approval_hash && prior.reason_hash == reason_hash,
                    Error::<T>::AlreadyRevoked
                );
                return Ok(());
            }
            Revocations::<T>::insert(
                scope_id,
                version,
                Revocation {
                    approval_hash,
                    reason_hash,
                    revoked_at: frame_system::Pallet::<T>::block_number(),
                },
            );
            Self::deposit_event(Event::PolicyRevoked {
                scope_id,
                version,
                reason_hash,
            });
            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        pub fn scope_id(scope: &PolicyScope) -> Id32 {
            sp_io::hashing::blake2_256(&(b"CHLOM:policy-scope:v1", scope).encode())
        }

        /// Inclusive start, exclusive end. Never revives an older version when the
        /// newest applicable version expires or is revoked. Query cost is bounded.
        pub fn active_policy(
            scope: &PolicyScope,
            at: BlockNumberFor<T>,
        ) -> Option<PolicyVersion<BlockNumberFor<T>>> {
            let scope_id = Self::scope_id(scope);
            for version in VersionIndex::<T>::get(scope_id).iter().rev() {
                let policy = Versions::<T>::get(scope_id, version)?;
                if policy.effective_from > at || policy.recorded_at > at {
                    continue;
                }
                if policy.effective_until <= at {
                    return None;
                }
                if Revocations::<T>::get(scope_id, version).is_some_and(|r| r.revoked_at <= at) {
                    return None;
                }
                return Some(policy);
            }
            None
        }
    }
}
