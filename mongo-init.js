// MongoDB initialization script
// This runs when the container is first created

db = db.getSiblingDB('ohmguard');

// Create application user
db.createUser({
  user: 'ohmguard_app',
  pwd: 'ohmguard_app_password',
  roles: [
    { role: 'readWrite', db: 'ohmguard' }
  ]
});

// Create indexes for better performance
db.events.createIndex({ "timestamp": -1 });
db.events.createIndex({ "sensor_id": 1, "timestamp": -1 });
db.events.createIndex({ "type": 1, "timestamp": -1 });
db.events.createIndex({ "tenant_id": 1, "timestamp": -1 });

db.sensors.createIndex({ "device_id": 1 }, { unique: true });
db.sensors.createIndex({ "client_id": 1 });
db.sensors.createIndex({ "status": 1 });

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "tenant_id": 1 });

db.clients.createIndex({ "id": 1 }, { unique: true });
db.buildings.createIndex({ "client_id": 1 });
db.floors.createIndex({ "building_id": 1 });
db.rooms.createIndex({ "floor_id": 1 });

db.client_users.createIndex({ "user_id": 1 });
db.client_users.createIndex({ "client_id": 1 });

db.sessions.createIndex({ "user_id": 1, "is_active": 1 });
db.sessions.createIndex({ "refresh_token_jti": 1 }, { unique: true });
db.sessions.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 2592000 });

print('MongoDB initialization completed!');
