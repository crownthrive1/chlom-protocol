//! Explicit development/local network specifications. No public network is implied.

use chlom_runtime::WASM_BINARY;
use sc_service::{ChainType, Properties};

/// The runtime provides its genesis presets through the GenesisBuilder API.
pub type ChainSpec = sc_service::GenericChainSpec;

fn development_properties() -> Properties {
    serde_json::json!({
        "tokenSymbol": "UNIT",
        "tokenDecimals": 12,
        "ss58Format": 42,
        "chlomNetwork": "development",
        "economicValue": false
    })
    .as_object()
    .expect("literal object")
    .clone()
}

/// One-authority development chain using public development identities.
pub fn development_chain_spec() -> Result<ChainSpec, String> {
    Ok(ChainSpec::builder(
        WASM_BINARY.ok_or_else(|| {
            "CHLOM runtime Wasm is missing; rebuild without SKIP_WASM_BUILD".to_string()
        })?,
        None,
    )
    .with_name("CHLOM Development")
    .with_id("chlom_dev")
    .with_chain_type(ChainType::Development)
    .with_protocol_id("chlom-dev-v1")
    .with_properties(development_properties())
    .with_genesis_config_preset_name(sp_genesis_builder::DEV_RUNTIME_PRESET)
    .build())
}

/// Two-authority local chain; all funded identities and keys are public test fixtures.
pub fn local_chain_spec() -> Result<ChainSpec, String> {
    Ok(ChainSpec::builder(
        WASM_BINARY.ok_or_else(|| {
            "CHLOM runtime Wasm is missing; rebuild without SKIP_WASM_BUILD".to_string()
        })?,
        None,
    )
    .with_name("CHLOM Local Testnet")
    .with_id("chlom_local")
    .with_chain_type(ChainType::Local)
    .with_protocol_id("chlom-local-v1")
    .with_properties(development_properties())
    .with_genesis_config_preset_name(sp_genesis_builder::LOCAL_TESTNET_RUNTIME_PRESET)
    .build())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sc_service::ChainSpec as _;
    use sp_runtime::BuildStorage;

    #[test]
    fn built_in_specs_have_separate_network_identity_and_no_public_bootnodes() {
        let dev = development_chain_spec().expect("embedded Wasm required");
        let local = local_chain_spec().expect("embedded Wasm required");
        assert_ne!(dev.id(), local.id());
        assert_ne!(dev.protocol_id(), local.protocol_id());
        assert_eq!(dev.chain_type(), ChainType::Development);
        assert_eq!(local.chain_type(), ChainType::Local);
        for spec in [dev, local] {
            assert!(spec.boot_nodes().is_empty());
            assert!(spec.telemetry_endpoints().is_none());
            assert_eq!(spec.properties()["tokenSymbol"], "UNIT");
            assert_eq!(spec.properties()["economicValue"], false);
        }
    }

    #[test]
    fn both_presets_build_distinct_genesis_storage_with_embedded_wasm() {
        let dev = development_chain_spec()
            .unwrap()
            .build_storage()
            .expect("dev genesis");
        let local = local_chain_spec()
            .unwrap()
            .build_storage()
            .expect("local genesis");
        assert_eq!(dev.top.get(&b":code"[..]).map(Vec::as_slice), WASM_BINARY);
        assert_eq!(local.top.get(&b":code"[..]).map(Vec::as_slice), WASM_BINARY);
        assert_ne!(dev.top, local.top, "local authorities must differ from dev");
    }

    #[test]
    fn exported_raw_spec_round_trips_without_altering_genesis() {
        let spec = development_chain_spec().unwrap();
        let json = spec.as_json(true).expect("raw spec export");
        let restored = ChainSpec::from_json_bytes(json.into_bytes()).expect("raw spec import");
        assert_eq!(
            spec.build_storage().unwrap().top,
            restored.build_storage().unwrap().top
        );
    }
}
