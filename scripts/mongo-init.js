// Create rusty-butter database and user
db = db.getSiblingDB('rusty-butter');

// Create application user
db.createUser({
  user: 'rusty',
  pwd: 'butter',
  roles: [
    {
      role: 'readWrite',
      db: 'rusty-butter'
    }
  ]
});

// Create collections with indexes
db.createCollection('configs');
db.createCollection('events');
db.createCollection('memories');

// Create indexes
db.configs.createIndex({ 'updatedAt': -1 });
db.events.createIndex({ 'timestamp': -1 });
db.events.createIndex({ 'type': 1, 'timestamp': -1 });
db.events.createIndex({ 'source': 1, 'timestamp': -1 });
db.events.createIndex({ 'status': 1, 'timestamp': -1 });
db.memories.createIndex({ 'bank': 1, 'timestamp': -1 });
db.memories.createIndex({ 'content': 'text' });

print('Database initialized successfully!');