//! Uho Backfill Sidecar
//!
//! Streams historical Solana transactions from Old Faithful via Jetstreamer,
//! filters by program ID, and emits NDJSON to stdout for the Node.js consumer.
//!
//! Usage:
//!   uho-backfill --program <PROGRAM_ID> --start-slot <SLOT> --end-slot <SLOT> [--threads N]
//!
//! Each stdout line is a JSON object:
//!   {"signature":"...","slot":123,"blockTime":456,"logs":["Program log: ..."]}
//!
//! Progress stats are written to stderr.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use clap::Parser;
use futures_util::FutureExt;
use jetstreamer::firehose::TransactionData;
use jetstreamer::plugin::{Plugin, PluginFuture};
use jetstreamer::JetstreamerRunner;
use serde::Serialize;

/// CLI arguments
#[derive(Parser, Debug)]
#[command(name = "uho-backfill", about = "Stream historical Solana transactions filtered by program ID")]
struct Args {
    /// Solana program ID (base58) to filter transactions by
    #[arg(long)]
    program: String,

    /// Starting slot (inclusive)
    #[arg(long)]
    start_slot: u64,

    /// Ending slot (inclusive)
    #[arg(long)]
    end_slot: u64,

    /// Number of firehose threads (auto-detected if omitted)
    #[arg(long, default_value = "4")]
    threads: usize,
}

/// NDJSON output record written to stdout
#[derive(Serialize)]
struct OutputRecord {
    signature: String,
    slot: u64,
    #[serde(rename = "blockTime")]
    block_time: Option<i64>,
    logs: Vec<String>,
}

/// Plugin that filters transactions by program ID and emits matching ones as NDJSON
struct ProgramFilterPlugin {
    program_id_bytes: [u8; 32],
    tx_count: AtomicU64,
    match_count: AtomicU64,
    last_slot: AtomicU64,
}

impl ProgramFilterPlugin {
    fn new(program_id: &str) -> Self {
        let bytes = bs58::decode(program_id)
            .into_vec()
            .expect("Invalid base58 program ID");
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes[..32]);
        Self {
            program_id_bytes: arr,
            tx_count: AtomicU64::new(0),
            match_count: AtomicU64::new(0),
            last_slot: AtomicU64::new(0),
        }
    }
}

impl Plugin for ProgramFilterPlugin {
    fn name(&self) -> &'static str {
        "uho-program-filter"
    }

    fn on_transaction<'a>(
        &'a self,
        _thread_id: usize,
        _db: Option<Arc<clickhouse::Client>>,
        transaction: &'a TransactionData,
    ) -> PluginFuture<'a> {
        async move {
            let count = self.tx_count.fetch_add(1, Ordering::Relaxed);
            self.last_slot.store(transaction.slot, Ordering::Relaxed);

            // Print progress to stderr every 100k transactions
            if count > 0 && count % 100_000 == 0 {
                let matches = self.match_count.load(Ordering::Relaxed);
                let slot = self.last_slot.load(Ordering::Relaxed);
                eprintln!(
                    "PROGRESS:{{\"processed\":{},\"matched\":{},\"currentSlot\":{}}}",
                    count, matches, slot
                );
            }

            // Skip vote transactions
            if transaction.is_vote {
                return Ok(());
            }

            // Check if this transaction involves our program
            let msg = &transaction.transaction.message;
            let account_keys = msg.static_account_keys();
            let program_involved = account_keys.iter().any(|key| {
                key.to_bytes() == self.program_id_bytes
            });

            if !program_involved {
                return Ok(());
            }

            // Extract log messages
            let logs: Vec<String> = transaction
                .transaction_status_meta
                .log_messages
                .as_ref()
                .map(|msgs| msgs.clone())
                .unwrap_or_default();

            // Only emit if there are logs (events come from logs)
            if logs.is_empty() {
                return Ok(());
            }

            // Check if any log references our program (additional filter)
            let program_b58 = bs58::encode(&self.program_id_bytes).into_string();
            let has_program_log = logs.iter().any(|log| log.contains(&program_b58));
            if !has_program_log {
                return Ok(());
            }

            self.match_count.fetch_add(1, Ordering::Relaxed);

            let record = OutputRecord {
                signature: transaction.signature.to_string(),
                slot: transaction.slot,
                block_time: transaction.block_time,
                logs,
            };

            // Write NDJSON to stdout (thread-safe via println!)
            let json = serde_json::to_string(&record).unwrap();
            println!("{}", json);

            Ok(())
        }
        .boxed()
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    // SAFETY: set env vars before any threads are spawned (before tokio runtime)
    unsafe {
        std::env::set_var("JETSTREAMER_THREADS", args.threads.to_string());
        std::env::set_var("JETSTREAMER_CLICKHOUSE_MODE", "off");
    }

    eprintln!(
        "Starting uho-backfill: program={}, slots={}..{}, threads={}",
        args.program, args.start_slot, args.end_slot, args.threads
    );

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(async_main(args))
}

async fn async_main(args: Args) -> Result<(), Box<dyn std::error::Error>> {

    let plugin = ProgramFilterPlugin::new(&args.program);

    // Build the runner with our slot range
    let slot_range = format!("{}:{}", args.start_slot, args.end_slot);

    let mut runner = JetstreamerRunner::new();
    runner.register_plugin(Box::new(plugin));
    runner.run_range(&slot_range).await?;

    // Final stats
    eprintln!("DONE:{{\"status\":\"completed\"}}");

    Ok(())
}
