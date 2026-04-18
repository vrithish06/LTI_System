/**
 * Admin Platform Registration Controller
 *
 * Allows administrators to register, view, update, and deactivate LMS platforms.
 * All endpoints require an ADMIN_SECRET header for security.
 *
 * Usage:
 *   POST   /api/admin/platforms          Register a new LMS
 *   GET    /api/admin/platforms          List all registered platforms
 *   GET    /api/admin/platforms/:id      Get a single platform
 *   PUT    /api/admin/platforms/:id      Update platform credentials
 *   DELETE /api/admin/platforms/:id      Deactivate (soft delete) a platform
 *
 * Security:
 *   All requests must include: x-admin-secret: <ADMIN_SECRET from .env>
 *
 * Example — registering Canvas:
 *   POST /api/admin/platforms
 *   x-admin-secret: your-admin-secret
 *   {
 *     "issuer":        "https://canvas.instructure.com",
 *     "client_id":     "145230000000000001",
 *     "name":          "Canvas - MIT",
 *     "jwks_url":      "https://canvas.instructure.com/api/lti/security/jwks",
 *     "oidc_auth_url": "https://canvas.instructure.com/api/lti/authorize_redirect",
 *     "token_url":     "https://canvas.instructure.com/login/oauth2/token"
 *   }
 */
import { Request, Response } from 'express';
import { connectDB } from '../db/connection.js';
import { LtiPlatformModel } from '../models/ltiPlatform.js';

function checkAdminSecret(req: Request, res: Response): boolean {
    const secret = req.headers['x-admin-secret'] as string | undefined;
    const expected = process.env.ADMIN_SECRET;
    if (!expected) {
        res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
        return false;
    }
    if (!secret || secret !== expected) {
        res.status(401).json({ error: 'Unauthorized — invalid x-admin-secret' });
        return false;
    }
    return true;
}

export class AdminPlatformController {

    /** POST /api/admin/platforms — register a new LMS */
    public async create(req: Request, res: Response): Promise<void> {
        if (!checkAdminSecret(req, res)) return;
        try {
            await connectDB();
            const { issuer, client_id, name, jwks_url, oidc_auth_url, token_url } = req.body;
            const missing = ['issuer','client_id','name','jwks_url','oidc_auth_url','token_url']
                .filter(k => !req.body[k]);
            if (missing.length) {
                res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
                return;
            }
            const platform = await LtiPlatformModel.create({
                issuer, client_id, name, jwks_url, oidc_auth_url, token_url,
            });
            console.log(`[Admin] Registered new LMS platform: ${name} (${issuer})`);
            res.status(201).json({ success: true, data: platform });
        } catch (err: any) {
            if (err.code === 11000) {
                res.status(409).json({ error: `Platform with issuer "${req.body.issuer}" already exists` });
            } else {
                res.status(500).json({ error: err.message });
            }
        }
    }

    /** GET /api/admin/platforms — list all platforms */
    public async list(req: Request, res: Response): Promise<void> {
        if (!checkAdminSecret(req, res)) return;
        try {
            await connectDB();
            const platforms = await LtiPlatformModel.find().sort({ created_at: -1 }).lean();
            res.json({ success: true, data: platforms, count: platforms.length });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    }

    /** GET /api/admin/platforms/:id — get one platform */
    public async getOne(req: Request, res: Response): Promise<void> {
        if (!checkAdminSecret(req, res)) return;
        try {
            await connectDB();
            const platform = await LtiPlatformModel.findById(req.params.id).lean();
            if (!platform) { res.status(404).json({ error: 'Platform not found' }); return; }
            res.json({ success: true, data: platform });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    }

    /** PUT /api/admin/platforms/:id — update platform credentials */
    public async update(req: Request, res: Response): Promise<void> {
        if (!checkAdminSecret(req, res)) return;
        try {
            await connectDB();
            const allowed = ['client_id','name','jwks_url','oidc_auth_url','token_url','is_active'];
            const updates: Record<string, any> = {};
            for (const key of allowed) {
                if (req.body[key] !== undefined) updates[key] = req.body[key];
            }
            const platform = await LtiPlatformModel.findByIdAndUpdate(
                req.params.id, { $set: updates }, { new: true }
            );
            if (!platform) { res.status(404).json({ error: 'Platform not found' }); return; }
            console.log(`[Admin] Updated platform: ${platform.name}`);
            res.json({ success: true, data: platform });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    }

    /** DELETE /api/admin/platforms/:id — soft-deactivate a platform */
    public async deactivate(req: Request, res: Response): Promise<void> {
        if (!checkAdminSecret(req, res)) return;
        try {
            await connectDB();
            const platform = await LtiPlatformModel.findByIdAndUpdate(
                req.params.id, { $set: { is_active: false } }, { new: true }
            );
            if (!platform) { res.status(404).json({ error: 'Platform not found' }); return; }
            console.log(`[Admin] Deactivated platform: ${platform.name}`);
            res.json({ success: true, message: `Platform "${platform.name}" deactivated`, data: platform });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    }
}

export const adminPlatformController = new AdminPlatformController();
