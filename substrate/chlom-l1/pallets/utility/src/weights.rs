//! Conservative fallback weights for CHLOM utility.
//!
//! These are reviewed accounting estimates, NOT generated benchmark measurements.
//! Ref-time budgets retain margin over the former placeholders. Proof budgets use
//! 8 KiB per counted read plus bounded encoded payload growth; they are estimates,
//! not a measured trie-proof upper bound. DB counts include two authority reads,
//! system block/event overhead, and the most expensive supported successful path.
//! Runtime integrators must benchmark their exact origin implementation and bounds
//! on deployment hardware before admitting a production economic network.

use core::marker::PhantomData;
use frame_support::{
    traits::Get,
    weights::{constants::RocksDbWeight, Weight},
};

pub trait WeightInfo {
    fn approve_service(versions: u32) -> Weight;
    fn revoke_service() -> Weight;
    fn allocate() -> Weight;
    fn reserve(versions: u32) -> Weight;
    fn consume() -> Weight;
    fn release() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn approve_service(versions: u32) -> Weight {
        Weight::from_parts(100_000_000, 65_536)
            .saturating_add(Weight::from_parts(1_000_000, 4).saturating_mul(versions.into()))
            .saturating_add(T::DbWeight::get().reads(8))
            .saturating_add(T::DbWeight::get().writes(4))
    }
    fn revoke_service() -> Weight {
        Weight::from_parts(70_000_000, 57_344)
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn allocate() -> Weight {
        Weight::from_parts(120_000_000, 73_728)
            .saturating_add(T::DbWeight::get().reads(9))
            .saturating_add(T::DbWeight::get().writes(7))
    }
    fn reserve(versions: u32) -> Weight {
        Weight::from_parts(120_000_000, 65_536)
            .saturating_add(Weight::from_parts(15_000_000, 8_192).saturating_mul(versions.into()))
            .saturating_add(
                T::DbWeight::get()
                    .reads(8_u64.saturating_add(u64::from(versions).saturating_mul(1))),
            )
            .saturating_add(T::DbWeight::get().writes(8))
    }
    fn consume() -> Weight {
        Weight::from_parts(140_000_000, 90_112)
            .saturating_add(T::DbWeight::get().reads(11))
            .saturating_add(T::DbWeight::get().writes(8))
    }
    fn release() -> Weight {
        Weight::from_parts(130_000_000, 73_728)
            .saturating_add(T::DbWeight::get().reads(9))
            .saturating_add(T::DbWeight::get().writes(8))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn approve_service(versions: u32) -> Weight {
        Weight::from_parts(100_000_000, 65_536)
            .saturating_add(Weight::from_parts(1_000_000, 4).saturating_mul(versions.into()))
            .saturating_add(RocksDbWeight::get().reads(8))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
    fn revoke_service() -> Weight {
        Weight::from_parts(70_000_000, 57_344)
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn allocate() -> Weight {
        Weight::from_parts(120_000_000, 73_728)
            .saturating_add(RocksDbWeight::get().reads(9))
            .saturating_add(RocksDbWeight::get().writes(7))
    }
    fn reserve(versions: u32) -> Weight {
        Weight::from_parts(120_000_000, 65_536)
            .saturating_add(Weight::from_parts(15_000_000, 8_192).saturating_mul(versions.into()))
            .saturating_add(
                RocksDbWeight::get()
                    .reads(8_u64.saturating_add(u64::from(versions).saturating_mul(1))),
            )
            .saturating_add(RocksDbWeight::get().writes(8))
    }
    fn consume() -> Weight {
        Weight::from_parts(140_000_000, 90_112)
            .saturating_add(RocksDbWeight::get().reads(11))
            .saturating_add(RocksDbWeight::get().writes(8))
    }
    fn release() -> Weight {
        Weight::from_parts(130_000_000, 73_728)
            .saturating_add(RocksDbWeight::get().reads(9))
            .saturating_add(RocksDbWeight::get().writes(8))
    }
}
