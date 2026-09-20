//! Conservative fallback weights for CHLOM settlement.
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
    fn record_revenue_policy(legs: u32) -> Weight;
    fn preview_settlement(legs: u32) -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn record_revenue_policy(legs: u32) -> Weight {
        Weight::from_parts(110_000_000, 49_152)
            .saturating_add(Weight::from_parts(1_000_000, 132).saturating_mul(legs.into()))
            .saturating_add(T::DbWeight::get().reads(6))
            .saturating_add(T::DbWeight::get().writes(3))
    }
    fn preview_settlement(legs: u32) -> Weight {
        Weight::from_parts(120_000_000, 57_344)
            .saturating_add(Weight::from_parts(2_000_000, 132).saturating_mul(legs.into()))
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(3))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn record_revenue_policy(legs: u32) -> Weight {
        Weight::from_parts(110_000_000, 49_152)
            .saturating_add(Weight::from_parts(1_000_000, 132).saturating_mul(legs.into()))
            .saturating_add(RocksDbWeight::get().reads(6))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
    fn preview_settlement(legs: u32) -> Weight {
        Weight::from_parts(120_000_000, 57_344)
            .saturating_add(Weight::from_parts(2_000_000, 132).saturating_mul(legs.into()))
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(3))
    }
}
