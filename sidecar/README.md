# uho-backfill — Rust Sidecar

Thin Rust binary wrapping [Jetstreamer](https://github.com/anza-xyz/jetstreamer) to stream historical Solana transactions from the Old Faithful archive, filtered by program ID.

## Build

```bash
# Requires Rust 1.75+
cargo build --release
# Binary at: target/release/uho-backfill
```

## Usage

```bash
./uho-backfill \
  --program SV2EYYJyRz2YhfXwXnhNAevDEui5Q6yrfyo13WtupPF \
  --start-slot 398736000 \
  --end-slot 398736999 \
  --threads 4
```

## Output

**stdout**: NDJSON, one line per matching transaction:
```json
{"signature":"5abc...","slot":398736000,"blockTime":1720000000,"logs":["Program log: ..."]}
```

**stderr**: Progress reports:
```
PROGRESS:{"processed":100000,"matched":42,"currentSlot":280500000}
DONE:{"status":"completed"}
```

## How It Works

1. Uses Jetstreamer to stream epochs from Old Faithful (free, no API keys)
2. Implements a Jetstreamer Plugin that filters by program ID
3. Matching transactions' log messages are emitted as NDJSON
4. Node.js consumer reads stdout, decodes events via Anchor, writes to Postgres
