//! Regenerate the exact pinned SDK linker allowlist from its actual host providers.
//! Run: cargo run --release -p chlom-runtime --example export_host_imports
use sp_wasm_interface::HostFunctions;
fn main() {
    let mut names: Vec<&str> = <(
        sp_io::SubstrateHostFunctions,
        frame_benchmarking::benchmarking::HostFunctions,
    )>::host_functions()
    .into_iter()
    .map(|function| function.name())
    .collect();
    names.sort_unstable();
    names.dedup();
    for name in names {
        println!("{name}");
    }
}
