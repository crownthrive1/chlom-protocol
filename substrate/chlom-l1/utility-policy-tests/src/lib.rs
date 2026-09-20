#![cfg(test)]

use codec::Encode;
use frame_support::{assert_noop, assert_ok, derive_impl, parameter_types};
use pallet_chlom_policy::{Error as PolicyError, PolicyScope};
use pallet_chlom_utility::{Balances, Error as UtilityError, ReceiptCount, Receipts, Reservations};
use sp_runtime::{BuildStorage, DispatchError};

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
    pub type Utility = pallet_chlom_utility::Pallet<Test>;
    #[runtime::pallet_index(2)]
    pub type Policy = pallet_chlom_policy::Pallet<Test>;
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Block = Block;
}
parameter_types! { pub const MaxVersions: u32 = 3; }
impl pallet_chlom_utility::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type UtilityOrigin = frame_system::EnsureRoot<u64>;
    type MaxServiceVersions = MaxVersions;
}
impl pallet_chlom_policy::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type PolicyOrigin = frame_system::EnsureRoot<u64>;
    type MaxVersionsPerScope = MaxVersions;
}
fn ext() -> sp_io::TestExternalities {
    frame_system::GenesisConfig::<Test>::default()
        .build_storage()
        .expect("storage")
        .into()
}
fn id(n: u8) -> [u8; 32] {
    [n; 32]
}
fn scope() -> PolicyScope {
    PolicyScope {
        tenant_id: id(10),
        jurisdiction_id: id(11),
        purpose_id: id(12),
    }
}
fn setup() {
    System::set_block_number(1);
    assert_ok!(Utility::approve_service(
        RuntimeOrigin::root(),
        id(1),
        1,
        id(2),
        7,
        1,
        100,
        id(3)
    ));
    assert_ok!(Utility::allocate(
        RuntimeOrigin::root(),
        id(20),
        1,
        id(2),
        100,
        id(3)
    ));
}
fn assert_conserved(account: u64) {
    let b = Balances::<Test>::get(account, id(2));
    assert_eq!(
        b.allocated,
        b.available
            .checked_add(b.reserved)
            .unwrap()
            .checked_add(b.consumed)
            .unwrap()
    );
}

#[test]
fn reserve_consume_release_conserve_account_units() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            3
        ));
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(22),
            id(1),
            1,
            2
        ));
        assert_eq!(Balances::<Test>::get(1, id(2)).available, 65);
        assert_ok!(Utility::consume(RuntimeOrigin::signed(1), id(23), id(21)));
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(24), id(22)));
        let b = Balances::<Test>::get(1, id(2));
        assert_eq!(
            (b.allocated, b.available, b.reserved, b.consumed),
            (100, 79, 0, 21)
        );
        assert_conserved(1);
        assert_eq!(Reservations::<Test>::get(1, id(21)).unwrap().units, 21);
        assert_eq!(ReceiptCount::<Test>::get(), 5);
    });
}

#[test]
fn exact_replays_do_not_allocate_reserve_consume_or_append_twice() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::allocate(
            RuntimeOrigin::root(),
            id(20),
            1,
            id(2),
            100,
            id(3)
        ));
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            3
        ));
        assert_ok!(Utility::consume(RuntimeOrigin::signed(1), id(22), id(21)));
        System::set_block_number(101);
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            3
        ));
        assert_ok!(Utility::consume(RuntimeOrigin::signed(1), id(22), id(21)));
        assert_eq!(ReceiptCount::<Test>::get(), 3);
        assert_eq!(Balances::<Test>::get(1, id(2)).consumed, 21);
        assert_noop!(
            Utility::allocate(RuntimeOrigin::root(), id(20), 1, id(2), 101, id(3)),
            UtilityError::<Test>::OperationConflict
        );
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(21), id(1), 1, 4),
            UtilityError::<Test>::OperationConflict
        );
    });
}

#[test]
fn privileged_approval_allocation_and_revocation_require_authority() {
    ext().execute_with(|| {
        setup();
        assert_noop!(
            Utility::allocate(RuntimeOrigin::signed(1), id(21), 1, id(2), 1, id(3)),
            DispatchError::BadOrigin
        );
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::signed(1), id(1), 2, id(2), 1, 1, 100, id(3)),
            DispatchError::BadOrigin
        );
        assert_noop!(
            Utility::revoke_service(RuntimeOrigin::signed(1), id(1), 1, id(3), id(4)),
            DispatchError::BadOrigin
        );
        assert_noop!(
            Utility::reserve(RuntimeOrigin::root(), id(21), id(1), 1, 1),
            DispatchError::BadOrigin
        );
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::signed(1),
                scope(),
                1,
                id(3),
                1,
                100,
                id(4),
                id(5)
            ),
            DispatchError::BadOrigin
        );
    });
}

#[test]
fn reservation_owner_and_exactly_one_terminal_operation_are_enforced() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            2
        ));
        assert_noop!(
            Utility::consume(RuntimeOrigin::signed(2), id(22), id(21)),
            UtilityError::<Test>::ReservationMissing
        );
        assert_noop!(
            Utility::release(RuntimeOrigin::signed(2), id(22), id(21)),
            UtilityError::<Test>::ReservationMissing
        );
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(22), id(21)));
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(22), id(21)));
        assert_noop!(
            Utility::consume(RuntimeOrigin::signed(1), id(23), id(21)),
            UtilityError::<Test>::ReservationClosed
        );
        assert_noop!(
            Utility::release(RuntimeOrigin::signed(1), id(24), id(21)),
            UtilityError::<Test>::ReservationClosed
        );
        assert_eq!(Balances::<Test>::get(1, id(2)).available, 100);
        assert_conserved(1);
    });
}

#[test]
fn insufficient_units_and_zero_requests_do_not_change_state() {
    ext().execute_with(|| {
        setup();
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(21), id(1), 1, 15),
            UtilityError::<Test>::InsufficientUnits
        );
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(21), id(1), 1, 0),
            UtilityError::<Test>::ZeroUnits
        );
        assert_noop!(
            Utility::allocate(RuntimeOrigin::root(), id(21), 1, id(2), 0, id(3)),
            UtilityError::<Test>::ZeroUnits
        );
        assert!(!Reservations::<Test>::contains_key(1, id(21)));
        assert_eq!(ReceiptCount::<Test>::get(), 1);
    });
}

#[test]
fn arithmetic_and_receipt_sequence_overflow_fail_atomically() {
    ext().execute_with(|| {
        setup();
        assert_noop!(
            Utility::allocate(RuntimeOrigin::root(), id(21), 1, id(2), u128::MAX, id(3)),
            UtilityError::<Test>::ArithmeticFailure
        );
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(21), id(1), 1, u128::MAX),
            UtilityError::<Test>::ArithmeticFailure
        );
        ReceiptCount::<Test>::put(u64::MAX);
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(21), id(1), 1, 1),
            UtilityError::<Test>::ArithmeticFailure
        );
        assert_eq!(Balances::<Test>::get(1, id(2)).available, 100);
        assert!(!Reservations::<Test>::contains_key(1, id(21)));
        assert!(!Receipts::<Test>::contains_key(1, id(21)));
    });
}

#[test]
fn receipts_bind_operation_order_account_amount_and_final_balance() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            2
        ));
        let first = Receipts::<Test>::get(1, id(20)).unwrap();
        let mut second = Receipts::<Test>::get(1, id(21)).unwrap();
        assert_eq!(second.previous_hash, first.receipt_hash);
        assert_eq!(second.sequence, 2);
        let hash = second.receipt_hash;
        second.receipt_hash = [0; 32];
        assert_eq!(
            hash,
            sp_io::hashing::blake2_256(&(b"CHLOM:resource-receipt:v1", id(21), &second).encode())
        );
        assert_eq!(pallet_chlom_utility::ReceiptHead::<Test>::get(), hash);
        assert_eq!(
            pallet_chlom_utility::ReceiptIndex::<Test>::get(2),
            Some((1, id(21)))
        );
    });
}

#[test]
fn revoked_and_expired_reservations_can_release_but_cannot_consume() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            2
        ));
        assert_ok!(Utility::revoke_service(
            RuntimeOrigin::root(),
            id(1),
            1,
            id(3),
            id(4)
        ));
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(22), id(1), 1, 1),
            UtilityError::<Test>::ServiceInactive
        );
        assert_noop!(
            Utility::consume(RuntimeOrigin::signed(1), id(22), id(21)),
            UtilityError::<Test>::ServiceInactive
        );
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(22), id(21)));
        assert_conserved(1);
    });
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            2
        ));
        System::set_block_number(100);
        assert_noop!(
            Utility::consume(RuntimeOrigin::signed(1), id(22), id(21)),
            UtilityError::<Test>::ServiceInactive
        );
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(22), id(21)));
    });
}

#[test]
fn approved_version_cost_is_locked_for_existing_reservations() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            2
        ));
        assert_ok!(Utility::approve_service(
            RuntimeOrigin::root(),
            id(1),
            2,
            id(2),
            10,
            5,
            50,
            id(3)
        ));
        assert_eq!(Utility::active_service(id(1), 1).unwrap().0, 1);
        System::set_block_number(5);
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(1), id(22), id(1), 1, 1),
            UtilityError::<Test>::ServiceInactive
        );
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(22),
            id(1),
            2,
            1
        ));
        assert_ok!(Utility::consume(RuntimeOrigin::signed(1), id(23), id(21)));
        assert_eq!(Balances::<Test>::get(1, id(2)).consumed, 14);
        assert_eq!(Reservations::<Test>::get(1, id(22)).unwrap().units, 10);
        assert!(Utility::active_service(id(1), 50).is_none());
    });
}

#[test]
fn service_versions_are_immutable_sequential_bounded_and_not_backdated() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::approve_service(
            RuntimeOrigin::root(),
            id(1),
            1,
            id(2),
            7,
            1,
            100,
            id(3)
        ));
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::root(), id(1), 1, id(2), 8, 1, 100, id(3)),
            UtilityError::<Test>::VersionConflict
        );
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::root(), id(1), 3, id(2), 8, 1, 100, id(3)),
            UtilityError::<Test>::VersionOutOfSequence
        );
        assert_ok!(Utility::approve_service(
            RuntimeOrigin::root(),
            id(1),
            2,
            id(2),
            8,
            10,
            100,
            id(3)
        ));
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::root(), id(1), 3, id(2), 8, 9, 100, id(3)),
            UtilityError::<Test>::EffectiveTimeRegression
        );
        assert_ok!(Utility::approve_service(
            RuntimeOrigin::root(),
            id(1),
            3,
            id(2),
            8,
            10,
            100,
            id(3)
        ));
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::root(), id(1), 4, id(2), 8, 10, 100, id(3)),
            UtilityError::<Test>::VersionLimit
        );
        System::set_block_number(10);
        assert_noop!(
            Utility::approve_service(RuntimeOrigin::root(), id(8), 1, id(2), 8, 9, 100, id(3)),
            UtilityError::<Test>::InvalidInterval
        );
    });
}

#[test]
fn policies_are_scope_bound_with_deterministic_effective_intervals() {
    ext().execute_with(|| {
        System::set_block_number(1);
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            1,
            id(1),
            5,
            100,
            id(3),
            id(4)
        ));
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            2,
            id(2),
            10,
            20,
            id(3),
            id(4)
        ));
        assert!(Policy::active_policy(&scope(), 4).is_none());
        assert_eq!(Policy::active_policy(&scope(), 5).unwrap().version, 1);
        assert_eq!(Policy::active_policy(&scope(), 9).unwrap().version, 1);
        assert_eq!(Policy::active_policy(&scope(), 10).unwrap().version, 2);
        assert!(Policy::active_policy(&scope(), 20).is_none());
        let mut other = scope();
        other.tenant_id = id(90);
        assert!(Policy::active_policy(&other, 10).is_none());
        other = scope();
        other.jurisdiction_id = id(90);
        assert!(Policy::active_policy(&other, 10).is_none());
        other = scope();
        other.purpose_id = id(90);
        assert!(Policy::active_policy(&other, 10).is_none());
    });
}

#[test]
fn revoking_new_policy_does_not_silently_reactivate_old_policy() {
    ext().execute_with(|| {
        System::set_block_number(1);
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            1,
            id(1),
            1,
            100,
            id(3),
            id(4)
        ));
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            2,
            id(2),
            5,
            100,
            id(3),
            id(4)
        ));
        System::set_block_number(7);
        let scope_id = Policy::scope_id(&scope());
        assert_noop!(
            Policy::revoke_version(RuntimeOrigin::signed(1), scope_id, 2, id(3), id(4)),
            DispatchError::BadOrigin
        );
        assert_ok!(Policy::revoke_version(
            RuntimeOrigin::root(),
            scope_id,
            2,
            id(3),
            id(4)
        ));
        assert_ok!(Policy::revoke_version(
            RuntimeOrigin::root(),
            scope_id,
            2,
            id(3),
            id(4)
        ));
        assert_eq!(Policy::active_policy(&scope(), 6).unwrap().version, 2);
        assert!(Policy::active_policy(&scope(), 7).is_none());
        assert!(pallet_chlom_policy::Versions::<Test>::contains_key(
            scope_id, 2
        ));
        assert_noop!(
            Policy::revoke_version(RuntimeOrigin::root(), scope_id, 2, id(3), id(5)),
            PolicyError::<Test>::AlreadyRevoked
        );
    });
}

#[test]
fn policy_approvals_reject_rewrites_gaps_regression_and_overflowed_capacity() {
    ext().execute_with(|| {
        System::set_block_number(1);
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::root(),
                scope(),
                1,
                id(1),
                0,
                100,
                id(3),
                id(4)
            ),
            PolicyError::<Test>::InvalidInterval
        );
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            1,
            id(1),
            5,
            100,
            id(3),
            id(4)
        ));
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            1,
            id(1),
            5,
            100,
            id(3),
            id(4)
        ));
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::root(),
                scope(),
                1,
                id(2),
                5,
                100,
                id(3),
                id(4)
            ),
            PolicyError::<Test>::VersionConflict
        );
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::root(),
                scope(),
                3,
                id(2),
                5,
                100,
                id(3),
                id(4)
            ),
            PolicyError::<Test>::VersionOutOfSequence
        );
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::root(),
                scope(),
                2,
                id(2),
                4,
                100,
                id(3),
                id(4)
            ),
            PolicyError::<Test>::EffectiveTimeRegression
        );
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            2,
            id(2),
            5,
            100,
            id(3),
            id(4)
        ));
        assert_ok!(Policy::approve_version(
            RuntimeOrigin::root(),
            scope(),
            3,
            id(2),
            5,
            100,
            id(3),
            id(4)
        ));
        assert_noop!(
            Policy::approve_version(
                RuntimeOrigin::root(),
                scope(),
                4,
                id(2),
                5,
                100,
                id(3),
                id(4)
            ),
            PolicyError::<Test>::VersionLimit
        );
        assert_eq!(Policy::active_policy(&scope(), 5).unwrap().version, 3);
    });
}

#[test]
fn independent_accounts_and_resources_cannot_spend_each_others_allocations() {
    ext().execute_with(|| {
        setup();
        assert_ok!(Utility::allocate(
            RuntimeOrigin::root(),
            id(21),
            2,
            id(9),
            100,
            id(3)
        ));
        assert_noop!(
            Utility::reserve(RuntimeOrigin::signed(2), id(22), id(1), 1, 1),
            UtilityError::<Test>::InsufficientUnits
        );
        assert_ok!(Utility::allocate(
            RuntimeOrigin::root(),
            id(23),
            2,
            id(2),
            7,
            id(3)
        ));
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(2),
            id(22),
            id(1),
            1,
            1
        ));
        assert_eq!(Balances::<Test>::get(1, id(2)).available, 100);
        assert_eq!(Balances::<Test>::get(2, id(9)).available, 100);
        assert_conserved(2);
    });
}

#[test]
fn copied_operation_ids_cannot_preempt_another_accounts_reservation() {
    ext().execute_with(|| {
        setup();
        // Both allocations may use the same ID in different account namespaces.
        assert_ok!(Utility::allocate(
            RuntimeOrigin::root(),
            id(20),
            2,
            id(2),
            100,
            id(3)
        ));
        // A funded caller front-runs a pending operation ID; the victim still succeeds.
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(2),
            id(21),
            id(1),
            1,
            1
        ));
        assert_ok!(Utility::reserve(
            RuntimeOrigin::signed(1),
            id(21),
            id(1),
            1,
            3
        ));
        assert_eq!(Reservations::<Test>::get(2, id(21)).unwrap().units, 7);
        assert_eq!(Reservations::<Test>::get(1, id(21)).unwrap().units, 21);
        assert_ok!(Utility::consume(RuntimeOrigin::signed(2), id(22), id(21)));
        assert!(!pallet_chlom_utility::ReservationClosures::<Test>::contains_key(1, id(21)));
        assert_ok!(Utility::release(RuntimeOrigin::signed(1), id(22), id(21)));
        assert_eq!(Balances::<Test>::get(2, id(2)).consumed, 7);
        assert_eq!(Balances::<Test>::get(1, id(2)).available, 100);
        assert_eq!(Balances::<Test>::get(1, id(2)).consumed, 0);
        assert_eq!(
            pallet_chlom_utility::ReceiptIndex::<Test>::get(3),
            Some((2, id(21)))
        );
        assert_eq!(
            pallet_chlom_utility::ReceiptIndex::<Test>::get(4),
            Some((1, id(21)))
        );
        assert_ne!(
            Receipts::<Test>::get(1, id(21)).unwrap().receipt_hash,
            Receipts::<Test>::get(2, id(21)).unwrap().receipt_hash
        );
        assert_eq!(ReceiptCount::<Test>::get(), 6);
        assert_conserved(1);
        assert_conserved(2);
    });
}
