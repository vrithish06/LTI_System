/**
 * LTI Platform Registry
 *
 * One document per connected LMS. Replaces the hardcoded VIBE_BASE_URL / VIBE_JWKS_URL
 * approach with a dynamic, multi-tenant registry.
 *
 * An admin registers a new LMS by POSTing to /api/admin/platforms.
 * The validator then looks up the platform by `iss` claim on every launch.
 */
import mongoose, { Schema, model, Document } from 'mongoose';

export interface ILtiPlatform extends Document {
    /** LMS domain — must match the `iss` claim in their JWTs. e.g. "https://canvas.instructure.com" */
    issuer: string;
    /** Client ID assigned to your tool when you registered it in the LMS */
    client_id: string;
    /** Human-readable label e.g. "Canvas - MIT", "Moodle - Stanford" */
    name: string;
    /** URL where your tool fetches the LMS's public RSA keys for JWT verification */
    jwks_url: string;
    /** LMS OIDC login URL — where you redirect users in step 1 of the login flow */
    oidc_auth_url: string;
    /** LMS OAuth2 token URL — where you request Bearer tokens for NRPS / AGS calls */
    token_url: string;
    /** Whether this platform is currently accepting launches */
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const LtiPlatformSchema = new Schema<ILtiPlatform>(
    {
        issuer:        { type: String, required: true, unique: true, trim: true },
        client_id:     { type: String, required: true, trim: true },
        name:          { type: String, required: true, trim: true },
        jwks_url:      { type: String, required: true, trim: true },
        oidc_auth_url: { type: String, required: true, trim: true },
        token_url:     { type: String, required: true, trim: true },
        is_active:     { type: Boolean, default: true },
    },
    {
        collection: 'lms_platforms',
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

export const LtiPlatformModel =
    mongoose.models.LtiPlatform || model<ILtiPlatform>('LtiPlatform', LtiPlatformSchema);
