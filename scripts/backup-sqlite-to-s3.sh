#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Creating LifeShack IQ SQLite backup..."
npm run db:migrate >/dev/null
npx tsx -e "import { runSqliteBackup } from './src/services/backups'; runSqliteBackup().then((r) => { console.log(JSON.stringify({ id: r.id, localPath: r.backup.gzipPath, checksumPath: r.backup.checksumPath, s3Uri: r.upload?.s3Uri ?? null, sha256: r.backup.sha256 }, null, 2)); }).catch((err) => { console.error(err); process.exit(1); });"
