#!/bin/bash

# MongoDB Installation and Setup Script for Rusty Butter Multi-Agent System
# Run with: sudo bash install-mongodb.sh

set -e  # Exit on error

echo "============================================"
echo "MongoDB Installation for Rusty Butter System"
echo "============================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run this script with sudo: sudo bash install-mongodb.sh"
   exit 1
fi

echo "Step 1: Installing dependencies..."
apt-get update
apt-get install -y gnupg curl

echo "Step 2: Importing MongoDB GPG key..."
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "Step 3: Adding MongoDB repository..."
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

echo "Step 4: Updating package database..."
apt-get update

echo "Step 5: Installing MongoDB..."
apt-get install -y mongodb-org

echo "Step 6: Starting MongoDB service..."
systemctl start mongod
systemctl enable mongod

echo "Step 7: Waiting for MongoDB to start..."
sleep 5

# Check if MongoDB is running
if systemctl is-active --quiet mongod; then
    echo "✓ MongoDB is running"
else
    echo "✗ MongoDB failed to start. Checking logs..."
    journalctl -u mongod -n 50
    exit 1
fi

echo "Step 8: Creating database and user..."
mongosh --eval "
use('rusty-butter');

// Check if user already exists
var userExists = db.getUsers().users.some(u => u.user === 'rusty');

if (!userExists) {
    db.createUser({
        user: 'rusty',
        pwd: 'butter',
        roles: [{role: 'readWrite', db: 'rusty-butter'}]
    });
    print('✓ User created successfully');
} else {
    print('✓ User already exists');
}

// Create collections
db.createCollection('configs');
db.createCollection('events');
db.createCollection('memories');
print('✓ Collections created');

// Create indexes
db.configs.createIndex({ 'updatedAt': -1 });
db.events.createIndex({ 'timestamp': -1 });
db.events.createIndex({ 'type': 1, 'timestamp': -1 });
db.events.createIndex({ 'source': 1, 'timestamp': -1 });
db.events.createIndex({ 'status': 1, 'timestamp': -1 });
db.memories.createIndex({ 'bank': 1, 'timestamp': -1 });
db.memories.createIndex({ 'content': 'text' });
print('✓ Indexes created');

print('Database initialization complete!');
"

echo ""
echo "============================================"
echo "MongoDB Installation Complete!"
echo "============================================"
echo ""
echo "MongoDB Status:"
systemctl status mongod --no-pager | head -10
echo ""
echo "Connection Details:"
echo "  URL: mongodb://rusty:butter@localhost:27017/rusty-butter"
echo "  Database: rusty-butter"
echo "  Username: rusty"
echo "  Password: butter"
echo ""
echo "Test connection with:"
echo "  mongosh 'mongodb://rusty:butter@localhost:27017/rusty-butter'"
echo ""
echo "Next steps:"
echo "1. The .env file already has MONGODB_URL configured"
echo "2. Run: cd /home/codingbutter/GitHub/multi-agent && npm run seed:config"
echo "3. Restart all services: pm2 restart all"
echo ""