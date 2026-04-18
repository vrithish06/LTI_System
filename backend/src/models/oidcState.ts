/**
 * OIDC State Store
 *
 * During the LTI 1.3 OIDC login flow (step 1), we generate a `state` and `nonce`
 * and store them here with a 60-second TTL. When the LMS redirects back to
 * POST /launch (step 3), we validate the returned `state` and `nonce` against
 * this collection and delete the record on use (one-time use, anti-replay).
 *
 * MongoDB TTL index (`expires_at`) automatically cleans up expired records.
 */
import mongoose, { Schema, model, Document } from 'mongoose';

export interface IOidcState extends Document {
    state:      string;
    nonce:      string;
    issuer:     string; // Which LMS initiated this flow
    expires_at: Date;
}

const OidcStateSchema = new Schema<IOidcState>(
    {
        state:      { type: String, required: true, unique: true },
        nonce:      { type: String, required: true },
        issuer:     { type: String, required: true },
        expires_at: { type: Date,   required: true },
    },
    { collection: 'oidc_states' }
);

// MongoDB TTL index: automatically deletes documents after `expires_at`
OidcStateSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const OidcStateModel =
    mongoose.models.OidcState || model<IOidcState>('OidcState', OidcStateSchema);
