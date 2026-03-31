import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB(): Promise<void> {
    if (isConnected) return;

    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lti_system';

    try {
        await mongoose.connect(MONGO_URI);
        isConnected = true;
        console.log(`✅ MongoDB connected: ${MONGO_URI}`);
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        throw error;
    }
}
