//! Conservative fallback weights for CHLOM checkpoint.
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
    fn record_checkpoint() -> Weight;
    fn record_anchor_intent() -> Weight;
    fn record_anchor_receipt() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn record_checkpoint() -> Weight {
        Weight::from_parts(90_000_000, 65_536)
            .saturating_add(T::DbWeight::get().reads(8))
            .saturating_add(T::DbWeight::get().writes(4))
    }
    fn record_anchor_intent() -> Weight {
        Weight::from_parts(70_000_000, 57_344)
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn record_anchor_receipt() -> Weight {
        Weight::from_parts(80_000_000, 57_344)
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(3))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn record_checkpoint() -> Weight {
        Weight::from_parts(90_000_000, 65_536)
            .saturating_add(RocksDbWeight::get().reads(8))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
    fn record_anchor_intent() -> Weight {
        Weight::from_parts(70_000_000, 57_344)
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn record_anchor_receipt() -> Weight {
        Weight::from_parts(80_000_000, 57_344)
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
}
