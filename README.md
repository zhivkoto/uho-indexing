<p align="center">
  <img src="dashboard/public/logo.svg" alt="Uho" width="80" height="80" />
</p>

<h1 align="center">Uho</h1>

<p align="center">
  <strong>Agent-native Solana indexing for your application</strong>
</p>

<p align="center">
  Feed it an IDL, get a typed API in minutes.<br/>
  Postgres tables, REST endpoints, and WebSocket subscriptions — auto-generated from your program's events.
</p>

<p align="center">
  <a href="https://www.uhoindexing.com">Website</a> ·
  <a href="https://api.uhoindexing.com/api/v1/health">Live API</a> ·
  <a href="https://www.uhoindexing.com/skill.md">SKILL.md</a>
</p>

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/zhivkoto/uho-indexing.git
cd uho-indexing
npm install

# Initialize a project
npm run cli -- init --name my-indexer

# Edit uho.yaml — set your program ID and IDL path

# Generate and apply database tables
npm run cli -- schema --apply

# Start indexing + API
npm run cli -- start
```

Your API is now live. Query events at `http://localhost:3000/api/v1/{program}/{event}`.

## Configuration

```yaml
version: 1
name: "my-indexer"
chain: solana-devnet

database:
  host: localhost
  port: 5432
  name: uho
  user: postgres

programs:
  - name: my_program
    programId: "YourProgramId..."
    idl: ./idls/my_program.json

api:
  port: 3000
  host: 0.0.0.0

ingestion:
  pollIntervalMs: 2000
  batchSize: 25
```

## For Agents

Uho is agent-native. Every endpoint returns typed JSON — no HTML scraping, no guessing. Agents can discover available events, fields, and types via the `/schema` endpoint.

Onboarding file for agents: [uhoindexing.com/skill.md](https://www.uhoindexing.com/skill.md)

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** running locally
- **Anchor IDL** (v0.30+ format) for your Solana program

## License

MIT
