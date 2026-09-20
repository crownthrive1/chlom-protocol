//! Conservative fallback weights for CHLOM tokenization.
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
    fn record_token_class() -> Weight;
    fn record_chain_adapter() -> Weight;
    fn register_tokenized_object() -> Weight;
    fn record_provider_event() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn record_token_class() -> Weight {
        Weight::from_parts(70_000_000, 49_152)
            .saturating_add(T::DbWeight::get().reads(6))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn record_chain_adapter() -> Weight {
        Weight::from_parts(70_000_000, 49_152)
            .saturating_add(T::DbWeight::get().reads(6))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn register_tokenized_object() -> Weight {
        Weight::from_parts(90_000_000, 57_344)
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn record_provider_event() -> Weight {
        Weight::from_parts(110_000_000, 81_920)
            .saturating_add(T::DbWeight::get().reads(10))
            .saturating_add(T::DbWeight::get().writes(4))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn record_token_class() -> Weight {
        Weight::from_parts(70_000_000, 49_152)
            .saturating_add(RocksDbWeight::get().reads(6))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn record_chain_adapter() -> Weight {
        Weight::from_parts(70_000_000, 49_152)
            .saturating_add(RocksDbWeight::get().reads(6))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn register_tokenized_object() -> Weight {
        Weight::from_parts(90_000_000, 57_344)
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn record_provider_event() -> Weight {
        Weight::from_parts(110_000_000, 81_920)
            .saturating_add(RocksDbWeight::get().reads(10))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
}
