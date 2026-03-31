import mongoose from 'mongoose';

let isConnected = false;

/**
 * Connects to MongoDB Atlas (idempotent — safe to call multiple times).
 * Uses MONGODB_URI from environment variables.
 */
export async function connectDB(): Promise<void> {
    if (isConnected) return;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not set in environment variables.');
    }

    await mongoose.connect(uri, {
        dbName: process.env.MONGODB_DB_NAME || 'lti_system',
    });

    isConnected = true;
    console.log('[DB] Connected to MongoDB Atlas ✓');

    mongoose.connection.on('error', (err) => {
        console.error('[DB] MongoDB connection error:', err);
        isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('[DB] MongoDB disconnected. Will reconnect on next request.');
        isConnected = false;
    });
}

export { mongoose };
