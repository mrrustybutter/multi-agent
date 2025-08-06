#!/bin/bash

# Create data directory for MongoDB
mkdir -p ~/mongodb-data

# Download MongoDB if not installed
if ! command -v mongod &> /dev/null; then
    echo "Downloading MongoDB..."
    wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor > mongodb-server-7.0.gpg
    sudo mv mongodb-server-7.0.gpg /usr/share/keyrings/
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
fi

# Start MongoDB
mongod --dbpath ~/mongodb-data --port 27017 --bind_ip 127.0.0.1 &
MONGO_PID=$!

echo "MongoDB started with PID: $MONGO_PID"
echo "MongoDB is running on port 27017"

# Wait for MongoDB to start
sleep 5

# Initialize database
mongosh --eval "
use('rusty-butter');
db.createUser({
  user: 'rusty',
  pwd: 'butter',
  roles: [{role: 'readWrite', db: 'rusty-butter'}]
});
db.createCollection('configs');
db.createCollection('events');
db.createCollection('memories');
print('Database initialized!');
"

echo "MongoDB setup complete!"
echo "Connection string: mongodb://rusty:butter@localhost:27017/rusty-butter"