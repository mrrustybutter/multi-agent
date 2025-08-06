#!/bin/bash

echo "Migrating orchestrator to new modular structure..."

# Backup old index.ts
if [ -f "src/index.ts" ]; then
    echo "Backing up old index.ts to index.ts.old"
    mv src/index.ts src/index.ts.old
fi

# Rename new index to main index
if [ -f "src/index-new.ts" ]; then
    echo "Activating new modular index.ts"
    mv src/index-new.ts src/index.ts
fi

# Build the project
echo "Building orchestrator..."
pnpm build

echo "Migration complete!"
echo ""
echo "The orchestrator now has a professional structure:"
echo "  src/"
echo "    ├── index.ts          (minimal entry point)"
echo "    ├── Orchestrator.ts   (main application class)"
echo "    ├── config/           (configuration)"
echo "    ├── services/         (business logic)"
echo "    ├── routes/           (API endpoints)"
echo "    ├── middleware/       (Express middleware)"
echo "    ├── types/            (TypeScript types)"
echo "    └── utils/            (utilities)"
echo ""
echo "Restart the orchestrator with: pm2 restart orchestrator"