#![cfg_attr(not(feature = "std"), no_std)]

//! Nontransferable service-resource accounting; no currency, ownership grant or payment rail.
pub use pallet::*;
pub mod weights;
pub use weights::WeightInfo;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

#[frame_support::pallet]
pub mod pallet {
    use crate::weights::WeightInfo;
    use chlom_primitives::{Id32, ZERO_ID};
    use codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
    use frame_support::{pallet_prelude::*, traits::EnsureOrigin, BoundedVec};
    use frame_system::pallet_prelude::*;
    use scale_info::TypeInfo;
    use sp_runtime::RuntimeDebug;

    #[derive(
        Clone,
        Default,
        Decode,
        DecodeWithMemTracking,
        Encode,
        Eq,
        MaxEncodedLen,
        PartialEq,
        RuntimeDebug,
        TypeInfo,
    )]
    pub struct ResourceBalance {
        pub allocated: u128,
        pub available: u128,
        pub reserved: u128,
        pub consumed: u128,
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
    pub struct ServiceVersion<BlockNumber> {
        pub resource_id: Id32,
        pub units_per_action: u128,
        pub effective_from: BlockNumber,
        pub effective_until: BlockNumber,
        pub approval_hash: Id32,
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
    pub struct ServiceRevocation<BlockNumber> {
        pub approval_hash: Id32,
        pub reason_hash: Id32,
        pub revoked_at: BlockNumber,
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
    pub struct Reservation<AccountId> {
        pub owner: AccountId,
        pub resource_id: Id32,
        pub service_id: Id32,
        pub service_version: u32,
        pub quantity: u128,
        pub units: u128,
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
    pub enum OperationKind {
        Allocate,
        Reserve,
        Consume,
        Release,
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
    pub struct ResourceReceipt<AccountId, BlockNumber> {
        pub sequence: u64,
        pub request_hash: Id32,
        pub kind: OperationKind,
        pub account: AccountId,
        pub resource_id: Id32,
        pub reservation_id: Option<Id32>,
        pub units: u128,
        pub approval_hash: Option<Id32>,
        pub balance_after: ResourceBalance,
        pub recorded_at: BlockNumber,
        pub previous_hash: Id32,
        pub receipt_hash: Id32,
    }

    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// Runtime-specific dispatch costs; defaults are unmeasured conservative estimates.
        type WeightInfo: WeightInfo;
        #[allow(deprecated)]
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type UtilityOrigin: EnsureOrigin<Self::RuntimeOrigin>;
        #[pallet::constant]
        type MaxServiceVersions: Get<u32>;
    }

    #[pallet::pallet]
    pub struct Pallet<T>(_);
    #[pallet::storage]
    pub type Balances<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        Id32,
        ResourceBalance,
        ValueQuery,
    >;
    #[pallet::storage]
    pub type Services<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        Id32,
        Blake2_128Concat,
        u32,
        ServiceVersion<BlockNumberFor<T>>,
        OptionQuery,
    >;
    #[pallet::storage]
    pub type ServiceIndex<T: Config> =
        StorageMap<_, Blake2_128Concat, Id32, BoundedVec<u32, T::MaxServiceVersions>, ValueQuery>;
    #[pallet::storage]
    pub type ServiceRevocations<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        Id32,
        Blake2_128Concat,
        u32,
        ServiceRevocation<BlockNumberFor<T>>,
        OptionQuery,
    >;
    #[pallet::storage]
    pub type Reservations<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        Id32,
        Reservation<T::AccountId>,
        OptionQuery,
    >;
    /// Terminal operation id is separate from the immutable reservation record.
    #[pallet::storage]
    pub type ReservationClosures<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        Id32,
        Id32,
        OptionQuery,
    >;
    #[pallet::storage]
    pub type Receipts<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        Blake2_128Concat,
        Id32,
        ResourceReceipt<T::AccountId, BlockNumberFor<T>>,
        OptionQuery,
    >;
    #[pallet::storage]
    pub type ReceiptIndex<T: Config> =
        StorageMap<_, Twox64Concat, u64, (T::AccountId, Id32), OptionQuery>;
    #[pallet::storage]
    pub type ReceiptCount<T> = StorageValue<_, u64, ValueQuery>;
    #[pallet::storage]
    pub type ReceiptHead<T> = StorageValue<_, Id32, ValueQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        ServiceApproved {
            service_id: Id32,
            version: u32,
            resource_id: Id32,
            units_per_action: u128,
        },
        ServiceRevoked {
            service_id: Id32,
            version: u32,
            reason_hash: Id32,
        },
        ResourceOperation {
            operation_id: Id32,
            sequence: u64,
            account: T::AccountId,
            kind: OperationKind,
            resource_id: Id32,
            units: u128,
            receipt_hash: Id32,
        },
    }
    #[pallet::error]
    pub enum Error<T> {
        InvalidIdentifier,
        ZeroUnits,
        InvalidInterval,
        VersionOutOfSequence,
        VersionConflict,
        VersionLimit,
        EffectiveTimeRegression,
        ServiceMissing,
        ServiceInactive,
        AlreadyRevoked,
        ArithmeticFailure,
        InsufficientUnits,
        OperationConflict,
        ReservationMissing,
        NotReservationOwner,
        ReservationClosed,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::approve_service(T::MaxServiceVersions::get()))]
        #[frame_support::transactional]
        pub fn approve_service(
            origin: OriginFor<T>,
            service_id: Id32,
            version: u32,
            resource_id: Id32,
            units_per_action: u128,
            effective_from: BlockNumberFor<T>,
            effective_until: BlockNumberFor<T>,
            approval_hash: Id32,
        ) -> DispatchResult {
            T::UtilityOrigin::ensure_origin(origin)?;
            ensure!(
                service_id != ZERO_ID && resource_id != ZERO_ID && approval_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(units_per_action > 0, Error::<T>::ZeroUnits);
            if let Some(prior) = Services::<T>::get(service_id, version) {
                ensure!(
                    prior.resource_id == resource_id
                        && prior.units_per_action == units_per_action
                        && prior.effective_from == effective_from
                        && prior.effective_until == effective_until
                        && prior.approval_hash == approval_hash,
                    Error::<T>::VersionConflict
                );
                return Ok(());
            }
            let now = frame_system::Pallet::<T>::block_number();
            ensure!(
                effective_from >= now && effective_until > effective_from,
                Error::<T>::InvalidInterval
            );
            let mut index = ServiceIndex::<T>::get(service_id);
            let previous = index.last().copied().unwrap_or(0);
            ensure!(
                previous.checked_add(1) == Some(version),
                Error::<T>::VersionOutOfSequence
            );
            if previous != 0 {
                let prior =
                    Services::<T>::get(service_id, previous).ok_or(Error::<T>::ServiceMissing)?;
                ensure!(
                    effective_from >= prior.effective_from,
                    Error::<T>::EffectiveTimeRegression
                );
            }
            index
                .try_push(version)
                .map_err(|_| Error::<T>::VersionLimit)?;
            Services::<T>::insert(
                service_id,
                version,
                ServiceVersion {
                    resource_id,
                    units_per_action,
                    effective_from,
                    effective_until,
                    approval_hash,
                    recorded_at: now,
                },
            );
            ServiceIndex::<T>::insert(service_id, index);
            Self::deposit_event(Event::ServiceApproved {
                service_id,
                version,
                resource_id,
                units_per_action,
            });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::revoke_service())]
        pub fn revoke_service(
            origin: OriginFor<T>,
            service_id: Id32,
            version: u32,
            approval_hash: Id32,
            reason_hash: Id32,
        ) -> DispatchResult {
            T::UtilityOrigin::ensure_origin(origin)?;
            ensure!(
                approval_hash != ZERO_ID && reason_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(
                Services::<T>::contains_key(service_id, version),
                Error::<T>::ServiceMissing
            );
            if let Some(prior) = ServiceRevocations::<T>::get(service_id, version) {
                ensure!(
                    prior.approval_hash == approval_hash && prior.reason_hash == reason_hash,
                    Error::<T>::AlreadyRevoked
                );
                return Ok(());
            }
            ServiceRevocations::<T>::insert(
                service_id,
                version,
                ServiceRevocation {
                    approval_hash,
                    reason_hash,
                    revoked_at: frame_system::Pallet::<T>::block_number(),
                },
            );
            Self::deposit_event(Event::ServiceRevoked {
                service_id,
                version,
                reason_hash,
            });
            Ok(())
        }

        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::allocate())]
        #[frame_support::transactional]
        pub fn allocate(
            origin: OriginFor<T>,
            operation_id: Id32,
            account: T::AccountId,
            resource_id: Id32,
            units: u128,
            approval_hash: Id32,
        ) -> DispatchResult {
            T::UtilityOrigin::ensure_origin(origin)?;
            ensure!(
                operation_id != ZERO_ID && resource_id != ZERO_ID && approval_hash != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(units > 0, Error::<T>::ZeroUnits);
            let request_hash = Self::request_hash(&(
                OperationKind::Allocate,
                &account,
                resource_id,
                units,
                approval_hash,
            ));
            if Self::is_replay(&account, operation_id, request_hash)? {
                return Ok(());
            }
            let mut balance = Balances::<T>::get(&account, resource_id);
            balance.allocated = balance
                .allocated
                .checked_add(units)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            balance.available = balance
                .available
                .checked_add(units)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            Self::append_receipt(
                operation_id,
                request_hash,
                OperationKind::Allocate,
                account.clone(),
                resource_id,
                None,
                units,
                Some(approval_hash),
                balance.clone(),
            )?;
            Balances::<T>::insert(&account, resource_id, balance);
            Ok(())
        }

        #[pallet::call_index(3)]
        #[pallet::weight(T::WeightInfo::reserve(T::MaxServiceVersions::get()))]
        #[frame_support::transactional]
        pub fn reserve(
            origin: OriginFor<T>,
            operation_id: Id32,
            service_id: Id32,
            version: u32,
            quantity: u128,
        ) -> DispatchResult {
            let account = ensure_signed(origin)?;
            ensure!(
                operation_id != ZERO_ID && service_id != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            ensure!(quantity > 0, Error::<T>::ZeroUnits);
            let request_hash = Self::request_hash(&(
                OperationKind::Reserve,
                &account,
                service_id,
                version,
                quantity,
            ));
            if Self::is_replay(&account, operation_id, request_hash)? {
                return Ok(());
            }
            let (active_version, service) =
                Self::active_service(service_id, frame_system::Pallet::<T>::block_number())
                    .ok_or(Error::<T>::ServiceInactive)?;
            ensure!(active_version == version, Error::<T>::ServiceInactive);
            let units = service
                .units_per_action
                .checked_mul(quantity)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            let mut balance = Balances::<T>::get(&account, service.resource_id);
            balance.available = balance
                .available
                .checked_sub(units)
                .ok_or(Error::<T>::InsufficientUnits)?;
            balance.reserved = balance
                .reserved
                .checked_add(units)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            Self::append_receipt(
                operation_id,
                request_hash,
                OperationKind::Reserve,
                account.clone(),
                service.resource_id,
                Some(operation_id),
                units,
                Some(service.approval_hash),
                balance.clone(),
            )?;
            Balances::<T>::insert(&account, service.resource_id, balance);
            Reservations::<T>::insert(
                &account,
                operation_id,
                Reservation {
                    owner: account.clone(),
                    resource_id: service.resource_id,
                    service_id,
                    service_version: version,
                    quantity,
                    units,
                },
            );
            Ok(())
        }

        #[pallet::call_index(4)]
        #[pallet::weight(T::WeightInfo::consume())]
        #[frame_support::transactional]
        pub fn consume(
            origin: OriginFor<T>,
            operation_id: Id32,
            reservation_id: Id32,
        ) -> DispatchResult {
            let account = ensure_signed(origin)?;
            Self::close_reservation(
                account,
                operation_id,
                reservation_id,
                OperationKind::Consume,
            )
        }

        #[pallet::call_index(5)]
        #[pallet::weight(T::WeightInfo::release())]
        #[frame_support::transactional]
        pub fn release(
            origin: OriginFor<T>,
            operation_id: Id32,
            reservation_id: Id32,
        ) -> DispatchResult {
            let account = ensure_signed(origin)?;
            Self::close_reservation(
                account,
                operation_id,
                reservation_id,
                OperationKind::Release,
            )
        }
    }

    impl<T: Config> Pallet<T> {
        pub fn active_service(
            service_id: Id32,
            at: BlockNumberFor<T>,
        ) -> Option<(u32, ServiceVersion<BlockNumberFor<T>>)> {
            for version in ServiceIndex::<T>::get(service_id).iter().rev() {
                let service = Services::<T>::get(service_id, version)?;
                if service.effective_from > at || service.recorded_at > at {
                    continue;
                }
                if service.effective_until <= at
                    || ServiceRevocations::<T>::get(service_id, version)
                        .is_some_and(|r| r.revoked_at <= at)
                {
                    return None;
                }
                return Some((*version, service));
            }
            None
        }

        fn request_hash<V: Encode>(request: &V) -> Id32 {
            sp_io::hashing::blake2_256(&(b"CHLOM:resource-request:v1", request).encode())
        }

        fn is_replay(
            account: &T::AccountId,
            operation_id: Id32,
            request_hash: Id32,
        ) -> Result<bool, DispatchError> {
            match Receipts::<T>::get(account, operation_id) {
                None => Ok(false),
                Some(prior) => {
                    ensure!(
                        prior.request_hash == request_hash,
                        Error::<T>::OperationConflict
                    );
                    Ok(true)
                }
            }
        }

        fn close_reservation(
            account: T::AccountId,
            operation_id: Id32,
            reservation_id: Id32,
            kind: OperationKind,
        ) -> DispatchResult {
            ensure!(
                operation_id != ZERO_ID && reservation_id != ZERO_ID,
                Error::<T>::InvalidIdentifier
            );
            let request_hash = Self::request_hash(&(kind, &account, reservation_id));
            if Self::is_replay(&account, operation_id, request_hash)? {
                return Ok(());
            }
            let reservation = Reservations::<T>::get(&account, reservation_id)
                .ok_or(Error::<T>::ReservationMissing)?;
            ensure!(
                reservation.owner == account,
                Error::<T>::NotReservationOwner
            );
            ensure!(
                !ReservationClosures::<T>::contains_key(&account, reservation_id),
                Error::<T>::ReservationClosed
            );
            if kind == OperationKind::Consume {
                let service =
                    Services::<T>::get(reservation.service_id, reservation.service_version)
                        .ok_or(Error::<T>::ServiceMissing)?;
                let now = frame_system::Pallet::<T>::block_number();
                ensure!(
                    service.effective_from <= now
                        && now < service.effective_until
                        && !ServiceRevocations::<T>::contains_key(
                            reservation.service_id,
                            reservation.service_version
                        ),
                    Error::<T>::ServiceInactive
                );
            }
            let mut balance = Balances::<T>::get(&account, reservation.resource_id);
            balance.reserved = balance
                .reserved
                .checked_sub(reservation.units)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            if kind == OperationKind::Consume {
                balance.consumed = balance
                    .consumed
                    .checked_add(reservation.units)
                    .ok_or(Error::<T>::ArithmeticFailure)?;
            } else {
                balance.available = balance
                    .available
                    .checked_add(reservation.units)
                    .ok_or(Error::<T>::ArithmeticFailure)?;
            }
            Self::append_receipt(
                operation_id,
                request_hash,
                kind,
                account.clone(),
                reservation.resource_id,
                Some(reservation_id),
                reservation.units,
                None,
                balance.clone(),
            )?;
            Balances::<T>::insert(&account, reservation.resource_id, balance);
            ReservationClosures::<T>::insert(&account, reservation_id, operation_id);
            Ok(())
        }

        fn append_receipt(
            operation_id: Id32,
            request_hash: Id32,
            kind: OperationKind,
            account: T::AccountId,
            resource_id: Id32,
            reservation_id: Option<Id32>,
            units: u128,
            approval_hash: Option<Id32>,
            balance_after: ResourceBalance,
        ) -> DispatchResult {
            let sequence = ReceiptCount::<T>::get()
                .checked_add(1)
                .ok_or(Error::<T>::ArithmeticFailure)?;
            let previous_hash = ReceiptHead::<T>::get();
            let recorded_at = frame_system::Pallet::<T>::block_number();
            let mut receipt = ResourceReceipt {
                sequence,
                request_hash,
                kind,
                account: account.clone(),
                resource_id,
                reservation_id,
                units,
                approval_hash,
                balance_after,
                recorded_at,
                previous_hash,
                receipt_hash: ZERO_ID,
            };
            // Hash the SCALE tuple with receipt_hash zeroed; domain and operation id bind identity.
            let receipt_hash = sp_io::hashing::blake2_256(
                &(b"CHLOM:resource-receipt:v1", operation_id, &receipt).encode(),
            );
            receipt.receipt_hash = receipt_hash;
            Receipts::<T>::insert(&account, operation_id, receipt);
            ReceiptIndex::<T>::insert(sequence, (account.clone(), operation_id));
            ReceiptHead::<T>::put(receipt_hash);
            ReceiptCount::<T>::put(sequence);
            Self::deposit_event(Event::ResourceOperation {
                operation_id,
                sequence,
                account,
                kind,
                resource_id,
                units,
                receipt_hash,
            });
            Ok(())
        }
    }
}
