//! Conservative fallback weights for CHLOM licensing.
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
    fn record_dla_version() -> Weight;
    fn record_license_version() -> Weight;
    fn record_lex_offer_version() -> Weight;
    fn record_entitlement_version() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn record_dla_version() -> Weight {
        Weight::from_parts(100_000_000, 131_072)
            .saturating_add(T::DbWeight::get().reads(16))
            .saturating_add(T::DbWeight::get().writes(4))
    }
    fn record_license_version() -> Weight {
        Weight::from_parts(110_000_000, 163_840)
            .saturating_add(T::DbWeight::get().reads(20))
            .saturating_add(T::DbWeight::get().writes(4))
    }
    fn record_lex_offer_version() -> Weight {
        Weight::from_parts(100_000_000, 147_456)
            .saturating_add(T::DbWeight::get().reads(18))
            .saturating_add(T::DbWeight::get().writes(4))
    }
    fn record_entitlement_version() -> Weight {
        Weight::from_parts(90_000_000, 180_224)
            .saturating_add(T::DbWeight::get().reads(22))
            .saturating_add(T::DbWeight::get().writes(4))
    }
}

/// Reference fallback for isolated tests; carries the same nonzero DB/proof costs.
impl WeightInfo for () {
    fn record_dla_version() -> Weight {
        Weight::from_parts(100_000_000, 131_072)
            .saturating_add(RocksDbWeight::get().reads(16))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
    fn record_license_version() -> Weight {
        Weight::from_parts(110_000_000, 163_840)
            .saturating_add(RocksDbWeight::get().reads(20))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
    fn record_lex_offer_version() -> Weight {
        Weight::from_parts(100_000_000, 147_456)
            .saturating_add(RocksDbWeight::get().reads(18))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
    fn record_entitlement_version() -> Weight {
        Weight::from_parts(90_000_000, 180_224)
            .saturating_add(RocksDbWeight::get().reads(22))
            .saturating_add(RocksDbWeight::get().writes(4))
    }
}
