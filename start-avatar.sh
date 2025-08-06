#!/bin/bash

# Script to start the avatar server from the rusty-butter project
cd /home/codingbutter/GitHub/rusty-butter/packages/rustybutter-avatar

echo "Starting avatar server on port 8080..."

# Set environment variables
export AVATAR_SERVER_PORT=8080

# Try multiple ways to start the server
if [ -f "dist/index.js" ]; then
    echo "Starting from built version..."
    node dist/index.js --port 8080
elif [ -f "packages/server/dist/index.js" ]; then
    echo "Starting from server package..."
    cd packages/server
    node dist/index.js --port 8080
elif command -v npm >/dev/null 2>&1; then
    echo "Starting with npm..."
    npm run start:server
else
    echo "Error: Cannot find avatar server or npm"
    exit 1
fi