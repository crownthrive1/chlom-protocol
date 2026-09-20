// Adapted from Polkadot SDK solochain runtime (Unlicense).
// CHLOM additions are governed by the repository LICENSE.
#[cfg(feature = "std")]
fn main() {
    // The pinned SDK generates plain extern host functions. Newer Wasm linkers
    // need these exact known ABI names admitted as imports. Unknown unresolved
    // symbols remain errors; do not use --allow-undefined or ignore-all.
    let imports = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .join("sdk-host-imports.txt");
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
