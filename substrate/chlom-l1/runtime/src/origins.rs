//! CHLOM account-bound authority and development-network call boundaries.
//! All CHLOM additions in this file are governed by the root LICENSE.
use crate::{AccountId, ChlomAuthority, RuntimeCall, RuntimeOrigin};
use chlom_primitives::{AuthorityClass, DlaState, ExternalIssuanceState, Id32, OfferState};
use codec::Encode;
use frame_support::traits::{Contains, EnsureOrigin};
use frame_system::RawOrigin;

/// Domain-separated identity of a cryptographically authenticated runtime account.
/// This binds authority grants to the signer, rather than trusting a call's subject field.
pub fn account_subject(account: &AccountId) -> Id32 {
    sp_io::hashing::blake2_256(&(b"CHLOM:runtime-account:v1", account).encode())
}

/// Stable versioned role identifiers. No authority is granted by knowing a role ID.
pub fn role_id(role: u8) -> Id32 {
    let label: &[u8] = match role {
        1 => b"CHLOM:role:identity:v1",
        2 => b"CHLOM:role:rights:v1",
        3 => b"CHLOM:role:licensing:v1",
        4 => b"CHLOM:role:settlement:v1",
        5 => b"CHLOM:role:tokenization:v1",
        6 => b"CHLOM:role:oracle:v1",
        7 => b"CHLOM:role:checkpoint:v1",
        8 => b"CHLOM:role:utility:v1",
        9 => b"CHLOM:role:policy:v1",
        _ => b"CHLOM:role:invalid:v1",
    };
    sp_io::hashing::blake2_256(label)
}

/// Root administers a local development chain. Other callers must hold a current D3
/// grant for the exact module role. Authority administration itself remains Root-only.
/// Active-class lookup consults only the latest grant and checks revocation/expiry.
pub struct EnsureRootOrRole<const ROLE: u8>;
impl<const ROLE: u8> EnsureOrigin<RuntimeOrigin> for EnsureRootOrRole<ROLE> {
    type Success = ();
    fn try_origin(origin: RuntimeOrigin) -> Result<(), RuntimeOrigin> {
        match origin.clone().into() {
            Ok(RawOrigin::Root) => Ok(()),
            Ok(RawOrigin::Signed(account)) if (1..=9).contains(&ROLE) => {
                if ChlomAuthority::active_class(account_subject(&account), role_id(ROLE))
                    .is_some_and(|class| class.permits(AuthorityClass::D3))
                {
                    Ok(())
                } else {
                    Err(origin)
                }
            }
            _ => Err(origin),
        }
    }
    #[cfg(feature = "runtime-benchmarks")]
    fn try_successful_origin() -> Result<RuntimeOrigin, ()> {
        if !(1..=9).contains(&ROLE) {
            return Err(());
        }
        // Benchmark setup only: synthetic account/record. Returning Signed ensures
        // the measured dispatch includes the same grant reads as an operator call.
        let account = AccountId::new([42; 32]);
        let key = pallet_chlom_authority::GrantKey {
            subject_id: account_subject(&account),
            role_id: role_id(ROLE),
        };
        pallet_chlom_authority::GrantHeads::<crate::Runtime>::insert(&key, 1);
        pallet_chlom_authority::GrantVersions::<crate::Runtime>::insert(
            &key,
            1,
            pallet_chlom_authority::AuthorityGrant {
                version: 1,
                class: AuthorityClass::D3,
                active: true,
                valid_until: None,
                previous_record_hash: None,
                record_hash: [43; 32],
            },
        );
        Ok(RuntimeOrigin::signed(account))
    }
}

/// The shipped development runtime does not permit public commercial activation
/// or production token-certification records. Nested Sudo calls are inspected too.
/// Root can upgrade the runtime, so this is a release boundary, not an immutable
/// guarantee against a deliberately authorized runtime upgrade.
pub struct DevelopmentCallFilter;
impl Contains<RuntimeCall> for DevelopmentCallFilter {
    fn contains(call: &RuntimeCall) -> bool {
        match call {
            RuntimeCall::ChlomLicensing(pallet_chlom_licensing::Call::record_dla_version {
                offerability: DlaState::EligiblePublic,
                ..
            }) => false,
            RuntimeCall::ChlomLicensing(
                pallet_chlom_licensing::Call::record_lex_offer_version {
                    state: OfferState::Published,
                    ..
                },
            ) => false,
            RuntimeCall::ChlomTokenization(
                pallet_chlom_tokenization::Call::record_token_class {
                    legal_approved_public: true,
                    ..
                },
            ) => false,
            RuntimeCall::ChlomTokenization(
                pallet_chlom_tokenization::Call::record_token_class {
                    issuance_state: ExternalIssuanceState::ProductionEligible,
                    ..
                },
            ) => false,
            RuntimeCall::ChlomTokenization(
                pallet_chlom_tokenization::Call::record_chain_adapter {
                    production_certified: true,
                    ..
                },
            ) => false,
            RuntimeCall::ChlomTokenization(
                pallet_chlom_tokenization::Call::record_provider_event {
                    event_type: pallet_chlom_tokenization::TokenEventType::ProductionMintConfirmed,
                    ..
                },
            ) => false,
            RuntimeCall::Sudo(pallet_sudo::Call::sudo { call })
            | RuntimeCall::Sudo(pallet_sudo::Call::sudo_unchecked_weight { call, .. })
            | RuntimeCall::Sudo(pallet_sudo::Call::sudo_as { call, .. }) => Self::contains(call),
            _ => true,
        }
    }
}

/// Resolve licensing rights against the same chain's append-only rights registry.
pub struct RuntimeRightsVerifier;
impl pallet_chlom_licensing::RightsVerifier<crate::BlockNumber> for RuntimeRightsVerifier {
    #[cfg(feature = "runtime-benchmarks")]
    fn benchmark_insert(
        instrument_id: Id32,
        reference: pallet_chlom_licensing::RightsReference<crate::BlockNumber>,
    ) {
        // Public synthetic benchmark data, never production evidence.
        pallet_chlom_rights::RightsInstruments::<crate::Runtime>::insert(
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
            pallet_chlom_rights::RightsSupersededBy::<crate::Runtime>::insert(
                instrument_id,
                [32; 32],
            );
        } else {
            pallet_chlom_rights::RightsSupersededBy::<crate::Runtime>::remove(instrument_id);
        }
    }

    fn instrument(
        instrument_id: Id32,
    ) -> Option<pallet_chlom_licensing::RightsReference<crate::BlockNumber>> {
        let record = pallet_chlom_rights::RightsInstruments::<crate::Runtime>::get(instrument_id)?;
        Some(pallet_chlom_licensing::RightsReference {
            asset_id: record.asset_id,
            asset_version_hash: record.asset_version_hash,
            state: record.state,
            valid_from: record.valid_from,
            valid_until: record.valid_until,
            superseded: pallet_chlom_rights::RightsSupersededBy::<crate::Runtime>::contains_key(
                instrument_id,
            ),
        })
    }
}
