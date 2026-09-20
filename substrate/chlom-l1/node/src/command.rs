use crate::{
    chain_spec,
    cli::{Cli, Subcommand},
    service,
};
use chlom_runtime::opaque::Block;
use frame_benchmarking_cli::BenchmarkCmd;
use sc_cli::SubstrateCli;
use sc_service::PartialComponents;

impl SubstrateCli for Cli {
    fn impl_name() -> String {
        "CHLOM Native Node".into()
    }

    fn impl_version() -> String {
        env!("SUBSTRATE_CLI_IMPL_VERSION").into()
    }

    fn description() -> String {
        env!("CARGO_PKG_DESCRIPTION").into()
    }

    fn author() -> String {
        env!("CARGO_PKG_AUTHORS").into()
    }

    fn support_url() -> String {
        "https://github.com/crownthrive1/chlom-protocol/issues".into()
    }

    fn copyright_start_year() -> i32 {
        2026
    }

    fn load_spec(&self, id: &str) -> Result<Box<dyn sc_service::ChainSpec>, String> {
        Ok(match id {
			"dev" => Box::new(chain_spec::development_chain_spec()?),
			"local" | "local_testnet" => Box::new(chain_spec::local_chain_spec()?),
			"" => return Err("Select --dev, --chain local, or an explicit chain specification file; no production network is configured.".into()),
			path =>
				Box::new(chain_spec::ChainSpec::from_json_file(std::path::PathBuf::from(path))?),
		})
    }
}

/// Public development identities must never become validators on a live spec.
fn validate_development_keys(cli: &Cli, chain_type: sc_service::ChainType) -> Result<(), String> {
    let development_key_selected = cli.run.shared_params.dev
        || cli.run.alice
        || cli.run.bob
        || cli.run.charlie
        || cli.run.dave
        || cli.run.eve
        || cli.run.ferdie
        || cli.run.one
        || cli.run.two;
    if development_key_selected
        && !matches!(
            chain_type,
            sc_service::ChainType::Development | sc_service::ChainType::Local
        )
    {
        return Err(
            "Public development keys are restricted to Development or Local chain specs.".into(),
        );
    }
    Ok(())
}

/// Parse and run command line arguments
pub fn run() -> sc_cli::Result<()> {
    let cli = Cli::from_args();

    match &cli.subcommand {
        Some(Subcommand::Key(cmd)) => cmd.run(&cli),
        #[allow(deprecated)]
        Some(Subcommand::BuildSpec(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.sync_run(|config| cmd.run(config.chain_spec, config.network))
        }
        Some(Subcommand::CheckBlock(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.async_run(|config| {
                let PartialComponents {
                    client,
                    task_manager,
                    import_queue,
                    ..
                } = service::new_partial(&config)?;
                Ok((cmd.run(client, import_queue), task_manager))
            })
        }
        Some(Subcommand::ExportChainSpec(cmd)) => {
            let chain_spec = cli.load_spec(&cmd.chain)?;
            cmd.run(chain_spec)
        }
        Some(Subcommand::ExportBlocks(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.async_run(|config| {
                let PartialComponents {
                    client,
                    task_manager,
                    ..
                } = service::new_partial(&config)?;
                Ok((cmd.run(client, config.database), task_manager))
            })
        }
        Some(Subcommand::ExportState(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.async_run(|config| {
                let PartialComponents {
                    client,
                    task_manager,
                    ..
                } = service::new_partial(&config)?;
                Ok((cmd.run(client, config.chain_spec), task_manager))
            })
        }
        Some(Subcommand::ImportBlocks(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.async_run(|config| {
                let PartialComponents {
                    client,
                    task_manager,
                    import_queue,
                    ..
                } = service::new_partial(&config)?;
                Ok((cmd.run(client, import_queue), task_manager))
            })
        }
        Some(Subcommand::PurgeChain(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.sync_run(|config| cmd.run(config.database))
        }
        Some(Subcommand::Revert(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.async_run(|config| {
                let PartialComponents {
                    client,
                    task_manager,
                    backend,
                    ..
                } = service::new_partial(&config)?;
                let aux_revert = Box::new(|client, _, blocks| {
                    sc_consensus_grandpa::revert(client, blocks)?;
                    Ok(())
                });
                Ok((cmd.run(client, backend, Some(aux_revert)), task_manager))
            })
        }
        Some(Subcommand::Benchmark(cmd)) => {
            let runner = cli.create_runner(cmd)?;

            runner.sync_run(|config| {
				// This switch needs to be in the client, since the client decides
				// which sub-commands it wants to support.
				match cmd {
					BenchmarkCmd::Pallet(cmd) => {
						if !cfg!(feature = "runtime-benchmarks") {
							return Err(
								"Runtime benchmarking wasn't enabled when building the node. \
							You can enable it with `--features runtime-benchmarks`."
									.into(),
							);
						}

						cmd.run_with_spec::<sp_runtime::traits::HashingFor<Block>, ()>(Some(
							config.chain_spec,
						))
					},
					_ => Err("This CHLOM release supports benchmark pallet only; use the pinned SDK tooling for other benchmark modes.".into()),
				}
			})
        }
        Some(Subcommand::ChainInfo(cmd)) => {
            let runner = cli.create_runner(cmd)?;
            runner.sync_run(|config| cmd.run::<Block>(&config))
        }
        None => {
            let runner = cli.create_runner(&cli.run)?;
            runner.run_node_until_exit(|config| async move {
                validate_development_keys(&cli, config.chain_spec.chain_type())
                    .map_err(sc_cli::Error::Input)?;
                match config.network.network_backend {
                    sc_network::config::NetworkBackendType::Libp2p => service::new_full::<
                        sc_network::NetworkWorker<
                            chlom_runtime::opaque::Block,
                            <chlom_runtime::opaque::Block as sp_runtime::traits::Block>::Hash,
                        >,
                    >(config)
                    .map_err(sc_cli::Error::Service),
                    sc_network::config::NetworkBackendType::Litep2p => {
                        service::new_full::<sc_network::Litep2pNetworkBackend>(config)
                            .map_err(sc_cli::Error::Service)
                    }
                }
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn node_requires_explicit_network_selection() {
        let cli = Cli::try_parse_from(["chlom-node"]).unwrap();
        assert!(cli.load_spec("").is_err());
    }

    #[test]
    fn public_development_keys_cannot_start_on_live_specs() {
        for flag in [
            "--dev",
            "--alice",
            "--bob",
            "--charlie",
            "--dave",
            "--eve",
            "--ferdie",
            "--one",
            "--two",
        ] {
            let cli = Cli::try_parse_from(["chlom-node", flag]).unwrap();
            assert!(validate_development_keys(&cli, sc_service::ChainType::Live).is_err());
            assert!(validate_development_keys(&cli, sc_service::ChainType::Local).is_ok());
            assert!(validate_development_keys(&cli, sc_service::ChainType::Development).is_ok());
        }
    }

    #[test]
    fn user_managed_keys_are_not_replaced_by_development_keys() {
        let cli = Cli::try_parse_from(["chlom-node", "--validator"]).unwrap();
        assert!(validate_development_keys(&cli, sc_service::ChainType::Live).is_ok());
    }

    #[test]
    fn default_rpc_endpoints_are_loopback_and_external_requires_selection() {
        let cli = Cli::try_parse_from(["chlom-node", "--dev"]).unwrap();
        let endpoints = cli
            .run
            .rpc_params
            .rpc_addr(true, true, 9944)
            .unwrap()
            .unwrap();
        assert!(endpoints
            .iter()
            .all(|endpoint| endpoint.listen_addr.ip().is_loopback()));
        let external =
            Cli::try_parse_from(["chlom-node", "--dev", "--unsafe-rpc-external"]).unwrap();
        let endpoints = external
            .run
            .rpc_params
            .rpc_addr(true, true, 9944)
            .unwrap()
            .unwrap();
        assert!(endpoints
            .iter()
            .all(|endpoint| endpoint.listen_addr.ip().is_unspecified()));
    }
}
