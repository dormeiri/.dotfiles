#!/usr/bin/env bash
# Runs a Fastify server that echoes back a masked idToken.
# POST / { "message": "abc123" } -> { "message": "abc1***" }
# Usage: message-server.sh [port]   (default: 80)
set -euo pipefail

PORT="${1:-80}"
DIR="${HOME}/.cache/echo-server"

mkdir -p "${DIR}"
cd "${DIR}"

if [[ ! -d node_modules/fastify ]]; then
    npm init -y >/dev/null
    npm install fastify --silent
fi

cat > server.mjs <<'EOF'
import Fastify from 'fastify';

const app = Fastify({ logger: false });

app.post('/', async (request) => {
  const message = String(request.body?.message ?? '');
  const masked = `${message.slice(0, 4)}...`;
  console.log(`Redacted message: "${masked}"`);
  return { message: masked };
});

const address = await app.listen({ port: Number(process.env.PORT), host: '0.0.0.0' });

console.log(`Internal API is listening on ${address}`);
EOF

PORT="${PORT}" exec node server.mjs
