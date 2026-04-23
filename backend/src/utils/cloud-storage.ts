import mongoose from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { connectDB } from '../db/connection.js';

export class CloudStorageService {
    private bucket: GridFSBucket | null = null;
    private docBucket: GridFSBucket | null = null;

    private async getBucket(): Promise<GridFSBucket> {
        if (this.bucket) return this.bucket;
        await connectDB();
        const db = mongoose.connection.db;
        if (!db) throw new Error('Database is not connected');
        this.bucket = new GridFSBucket(db, { bucketName: 'activityProofs' });
        return this.bucket;
    }

    private async getDocBucket(): Promise<GridFSBucket> {
        if (this.docBucket) return this.docBucket;
        await connectDB();
        const db = mongoose.connection.db;
        if (!db) throw new Error('Database is not connected');
        this.docBucket = new GridFSBucket(db, { bucketName: 'activityDocuments' });
        return this.docBucket;
    }

    async uploadActivityProof(
        fileBuffer: Buffer,
        originalName: string,
        mimetype: string,
        userId: string,
        activityId: string,
        timestamp: Date
    ): Promise<string> {
        const bucket = await this.getBucket();
        const ext = originalName.split('.').pop() || mimetype.split('/')[1] || 'bin';
        const filename = `activity-proofs/${activityId}/${userId}/${timestamp.getTime()}.${ext}`;
        return new Promise((resolve, reject) => {
            const readStream = Readable.from(fileBuffer);
            const uploadStream = bucket.openUploadStream(filename, {
                metadata: { userId, activityId, originalName, mimetype, uploadedAt: timestamp.toISOString() },
            });
            readStream.pipe(uploadStream);
            uploadStream.on('finish', () => resolve(uploadStream.id.toString()));
            uploadStream.on('error', (err) => reject(new Error(`Failed to upload proof to GridFS: ${err.message}`)));
        });
    }

    async uploadActivityDocument(
        fileBuffer: Buffer,
        originalName: string,
        mimetype: string,
        activityId: string
    ): Promise<string> {
        const bucket = await this.getDocBucket();
        const ext = originalName.split('.').pop() || mimetype.split('/')[1] || 'bin';
        const filename = `activity-docs/${activityId}/${Date.now()}.${ext}`;
        return new Promise((resolve, reject) => {
            const readStream = Readable.from(fileBuffer);
            const uploadStream = bucket.openUploadStream(filename, {
                metadata: { activityId, originalName, mimetype, uploadedAt: new Date().toISOString() },
            });
            readStream.pipe(uploadStream);
            uploadStream.on('finish', () => resolve(uploadStream.id.toString()));
            uploadStream.on('error', (err) => reject(new Error(`Failed to upload document: ${err.message}`)));
        });
    }

    async downloadProof(fileId: string): Promise<{ stream: Readable; metadata: any }> {
        const bucket = await this.getBucket();
        const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
        if (!files.length) throw new Error(`Proof file not found: ${fileId}`);
        const fileDoc = files[0];
        const stream = bucket.openDownloadStream(new ObjectId(fileId));
        return {
            stream,
            metadata: {
                filename: fileDoc.filename,
                contentType: (fileDoc.metadata as any)?.mimetype || 'application/octet-stream',
                originalName: (fileDoc.metadata as any)?.originalName || fileDoc.filename,
                length: fileDoc.length,
            },
        };
    }

    async downloadDocument(fileId: string): Promise<{ stream: Readable; metadata: any }> {
        const bucket = await this.getDocBucket();
        const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
        if (!files.length) throw new Error(`Document file not found: ${fileId}`);
        const fileDoc = files[0];
        const stream = bucket.openDownloadStream(new ObjectId(fileId));
        return {
            stream,
            metadata: {
                filename: fileDoc.filename,
                contentType: (fileDoc.metadata as any)?.mimetype || 'application/octet-stream',
                originalName: (fileDoc.metadata as any)?.originalName || fileDoc.filename,
                length: fileDoc.length,
            },
        };
    }
}

export const cloudStorageService = new CloudStorageService();
