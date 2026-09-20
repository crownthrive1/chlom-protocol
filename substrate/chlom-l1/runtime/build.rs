// Adapted from Polkadot SDK solochain runtime (Unlicense).
// CHLOM additions are governed by the repository LICENSE.
#[cfg(feature = "std")]
fn main() {
    // The pinned SDK generates plain extern host functions. Newer Wasm linkers
    // need these exact known ABI names admitted as imports. Unknown unresolved
    // symbols remain errors; do not use --allow-undefined or ignore-all.
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    println!("cargo:rerun-if-env-changed=WASM_BUILD_WORKSPACE_HINT");
    // Keep the Wasm dependency closure tied to the committed native lockfile even
    // when an external CARGO_TARGET_DIR moves OUT_DIR outside this repository.
    if std::env::var_os("WASM_BUILD_WORKSPACE_HINT").is_none() {
        let workspace = manifest
            .parent()
            .expect("runtime belongs to native workspace");
        assert!(
            workspace.join("Cargo.lock").is_file(),
            "native Cargo.lock is required"
        );
        std::env::set_var("WASM_BUILD_WORKSPACE_HINT", workspace);
    }
    let imports = manifest.join("sdk-host-imports.txt");
    println!("cargo:rerun-if-changed={}", imports.display());
    let builder = substrate_wasm_builder::WasmBuilder::init_with_defaults().append_to_rust_flags(
        format!("-C link-arg=--allow-undefined-file={}", imports.display()),
    );
    #[cfg(feature = "metadata-hash")]
    let builder = builder.enable_metadata_hash("UNIT", 12);
    builder.build();
}

#[cfg(not(feature = "std"))]
fn main() {}
