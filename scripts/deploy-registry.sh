#!/usr/bin/env bash
# Deploys VaadaRegistry to the local Anvil chain, unless the deployment on record still has code there.
set -euo pipefail
cd "$(dirname "$0")/../contracts"

RPC=${CHAIN_RPC_URL:-http://127.0.0.1:8545}
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
RECORDER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

if [[ -f deployments/31337.json ]]; then
  address=$(python3 -c 'import json;print(json.load(open("deployments/31337.json"))["registry"])')
  code=$(curl -s -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$address\",\"latest\"]}" "$RPC" |
    python3 -c 'import json,sys;print(json.load(sys.stdin).get("result","0x"))')
  if [[ "$code" != "0x" && -n "$code" ]]; then
    echo "registry already deployed at $address"
    exit 0
  fi
fi

args=(script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$OWNER")
if command -v forge >/dev/null 2>&1; then
  REGISTRY_OWNER=$OWNER REGISTRY_RECORDER=$RECORDER forge "${args[@]}"
else
  docker compose run --rm -e REGISTRY_OWNER=$OWNER -e REGISTRY_RECORDER=$RECORDER forge "${args[@]}"
fi
