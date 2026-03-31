import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { connectDB } from './db/connection.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
    origin: process.env.VIBE_BASE_URL || 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json());

// Mount all routes
app.use('/api', router);

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lTI_System', timestamp: new Date().toISOString() });
});

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 LTI_System backend running on http://localhost:${PORT}`);
        console.log(`📡 Connected to Vibe LMS at: ${process.env.VIBE_BASE_URL}`);
        console.log(`🔑 JWKS fetched from: ${process.env.VIBE_JWKS_URL}\n`);
    });
}).catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
