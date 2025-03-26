import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

class Database {
static instance = null;
static dbName = 'locations.db';

static async getInstance() {
if (!Database.instance) {
Database.instance = await SQLite.openDatabase({
name: Database.dbName,
location: 'default',
});
}
return Database.instance;
}
}

const DB_VERSION = 1;

const initializeDatabase = async () => {
try {
const db = await Database.getInstance();
console.log('Database opened successfully');

await db.executeSql(
'CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)',
);
console.log('Metadata table created or already exists');

let currentVersion = 0;
try {
const [versionResult] = await db.executeSql(
'SELECT value FROM metadata WHERE key = "version"',
);
if (versionResult.rows.length > 0) {
currentVersion = parseInt(versionResult.rows.item(0).value, 10) || 0;
}
} catch (error) {
console.log('Metadata table is empty or not yet initialized:', error);
}
console.log('Current database version:', currentVersion);

if (currentVersion < DB_VERSION) {
await db.executeSql('DROP TABLE IF EXISTS locations');
console.log('Dropped old locations table');

await db.executeSql(
'CREATE TABLE locations (id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL, longitude REAL, timestamp TEXT, name TEXT)',
);
console.log('New locations table created');

await db.executeSql(
'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
['version', DB_VERSION],
);
console.log('Database version updated to:', DB_VERSION);
} else {
console.log('Database is already at version:', currentVersion);
}

const [checkResult] = await db.executeSql(
'SELECT name FROM sqlite_master WHERE type="table" AND name="locations"',
);
if (checkResult.rows.length === 0)
throw new Error('locations table was not created');
console.log('Confirmed: locations table exists');

console.log('Database initialized successfully');
} catch (error) {
console.error('Failed to initialize database:', error);
throw error;
}
};

const addLocation = async (latitude, longitude, timestamp, name) => {
if (!latitude || !longitude || !timestamp || !name) {
throw new Error('All location fields are required');
}
if (typeof latitude !== 'number' || typeof longitude !== 'number') {
throw new Error('Latitude and longitude must be numbers');
}

try {
const db = await Database.getInstance();
const [result] = await db.executeSql(
'INSERT INTO locations (latitude, longitude, timestamp, name) VALUES (?, ?, ?, ?)',
[latitude, longitude, timestamp, name],
);
console.log('Location added with ID:', result.insertId);
return result.insertId;
} catch (error) {
console.error('Failed to add location:', error);
throw error;
}
};

const fetchLocations = async () => {
try {
const db = await Database.getInstance();
const [result] = await db.executeSql('SELECT * FROM locations');
const locations = result.rows.raw();
console.log('Fetched locations:', locations);
return locations;
} catch (error) {
console.error('Failed to fetch locations:', error);
throw error;
}
};

const deleteLocation = async id => {
if (!id || typeof id !== 'number')
throw new Error('Valid location ID is required');

try {
const db = await Database.getInstance();
const [result] = await db.executeSql('DELETE FROM locations WHERE id = ?', [
id,
]);
console.log(
'Deleted location with ID:',
id,
'Rows affected:',
result.rowsAffected,
);
return result.rowsAffected > 0;
} catch (error) {
console.error('Failed to delete location:', error);
throw error;
}
};

export {initializeDatabase, addLocation, fetchLocations, deleteLocation};
