//! Conservative fallback weights for CHLOM oracle.
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
    fn report_signal() -> Weight;
    fn record_review_decision() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn report_signal() -> Weight {
        Weight::from_parts(130_000_000, 98_304)
            .saturating_add(T::DbWeight::get().reads(12))
            .saturating_add(T::DbWeight::get().writes(10))
    }
    fn record_review_decision() -> Weight {
        Weight::from_parts(160_000_000, 114_688)
            .saturating_add(T::DbWeight::get().reads(14))
            .saturating_add(T::DbWeight::get().writes(12))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn report_signal() -> Weight {
        Weight::from_parts(130_000_000, 98_304)
            .saturating_add(RocksDbWeight::get().reads(12))
            .saturating_add(RocksDbWeight::get().writes(10))
    }
    fn record_review_decision() -> Weight {
        Weight::from_parts(160_000_000, 114_688)
            .saturating_add(RocksDbWeight::get().reads(14))
            .saturating_add(RocksDbWeight::get().writes(12))
    }
}
