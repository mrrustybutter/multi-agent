#!/bin/bash

# Check if MongoDB is installed
if ! command -v mongod &> /dev/null; then
    echo "MongoDB not found. Installing MongoDB..."
    
    # Import MongoDB public GPG key
    curl -fsSL https://pgp.mongodb.com/server-6.0.asc | \
        sudo gpg -o /usr/share/keyrings/mongodb-server-6.0.gpg \
        --dearmor
    
    # Create list file for MongoDB
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | \
        sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    
    # Update package list
    sudo apt-get update
    
    # Install MongoDB
    sudo apt-get install -y mongodb-org
    
    # Start MongoDB service
    sudo systemctl start mongod
    
    # Enable MongoDB service on startup
    sudo systemctl enable mongod
    
    echo "MongoDB installed successfully!"
else
    echo "MongoDB is already installed."
fi

# Wait for MongoDB to start
echo "Waiting for MongoDB to start..."
sleep 5

# Create database and user
echo "Setting up database and user..."
mongosh --eval '
    db = db.getSiblingDB("rusty-butter");
    
    // Create user if it doesn't exist
    if (!db.getUser("rusty")) {
        db.createUser({
            user: "rusty",
            pwd: "butter",
            roles: [
                { role: "readWrite", db: "rusty-butter" }
            ]
        });
        print("Created database user");
    } else {
        print("Database user already exists");
    }
    
    // Create collections with indexes
    db.createCollection("configs");
    db.createCollection("events");
    db.configs.createIndex({ "updatedAt": -1 });
    db.events.createIndex({ "timestamp": -1 });
    db.events.createIndex({ "type": 1, "timestamp": -1 });
    db.events.createIndex({ "source": 1, "timestamp": -1 });
    db.events.createIndex({ "status": 1, "timestamp": -1 });
    db.events.createIndex({ "correlationId": 1, "timestamp": -1 });
    
    print("Database setup complete!");
'

# Create env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file with MongoDB connection string..."
    echo "MONGODB_URL=mongodb://rusty:butter@localhost:27017/rusty-butter" > .env
fi

echo "MongoDB setup complete! Run 'npm run seed-config' to import your configuration."