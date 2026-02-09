#!/bin/bash
set -e

# Uho MVP Demo
# Walks through the full user experience: init → schema → start → query

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEMO_DIR="/tmp/uho-demo-$$"

echo ""
echo "═══════════════════════════════════════════"
echo "  🔊 Uho MVP Demo"
echo "═══════════════════════════════════════════"
echo ""

# 1. Init
echo ">>> Step 1: Initialize a new Uho project"
echo "    Directory: $DEMO_DIR"
mkdir -p "$DEMO_DIR"
cd "$DEMO_DIR"

npx --prefix "$PROJECT_DIR" tsx "$PROJECT_DIR/src/cli/index.ts" init --name demo-indexer
echo ""

# 2. Show generated config
echo ">>> Step 2: Generated uho.yaml:"
echo "──────────────────────────────"
cat uho.yaml
echo ""
echo "──────────────────────────────"
echo ""

# 3. Apply schema
echo ">>> Step 3: Apply database schema"
npx --prefix "$PROJECT_DIR" tsx "$PROJECT_DIR/src/cli/index.ts" schema --apply
echo ""

# 4. Start indexer (run for 10 seconds)
echo ">>> Step 4: Start indexer (running for 10s...)"
npx --prefix "$PROJECT_DIR" tsx "$PROJECT_DIR/src/cli/index.ts" start &
INDEXER_PID=$!
sleep 6

# 5. Query API
echo ""
echo ">>> Step 5: Query the auto-generated REST API"
echo ""
echo "--- GET /api/v1/health ---"
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/v1/health
echo ""

echo "--- GET /api/v1/status ---"
curl -s http://localhost:3000/api/v1/status | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/v1/status
echo ""

echo "--- GET /api/v1/sample_dex/swap_event?limit=5 ---"
curl -s "http://localhost:3000/api/v1/sample_dex/swap_event?limit=5" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:3000/api/v1/sample_dex/swap_event?limit=5"
echo ""

# 6. Cleanup
echo ">>> Step 6: Stopping indexer..."
kill $INDEXER_PID 2>/dev/null || true
wait $INDEXER_PID 2>/dev/null || true
sleep 1

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Demo Complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Project was created in: $DEMO_DIR"
echo "  To clean up: rm -rf $DEMO_DIR"
echo ""
