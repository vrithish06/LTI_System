/**
 * Universal LTI 1.3 Controller
 *
 * Handles the OIDC 3-step login flow required by all standard LMSs:
 *
 *   Step 1: GET  /api/lti/login   ← LMS browser redirects user here
 *   Step 2: GET  LMS oidcAuthUrl  ← This controller immediately redirects back to LMS
 *   Step 3: POST /api/lti/launch  ← LMS browser POSTs id_token here (existing endpoint)
 *
 * Also exposes:
 *   GET /api/lti/jwks             ← Your tool's public key (LMSs fetch this)
 *
 * Vibe's existing POST /api/launch path is untouched and continues to work.
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import { connectDB } from '../db/connection.js';
import { LtiPlatformModel } from '../models/ltiPlatform.js';
import { OidcStateModel } from '../models/oidcState.js';
import { getToolPublicJwk } from '../lti/ltiValidator.js';

export class UniversalLtiController {

    /**
     * GET /api/lti/login
     *
     * Step 1 of LTI 1.3 OIDC login flow.
     * The LMS sends the user's browser here with query params.
     * We store a state+nonce and redirect back to the LMS for authentication.
     *
     * Required query params (sent by LMS):
     *   iss              — LMS issuer URL (e.g. https://canvas.instructure.com)
     *   client_id        — your tool's client ID in that LMS
     *   login_hint       — opaque user identifier from LMS
     *   target_link_uri  — final destination URL after auth
     *   lti_message_hint — additional context (optional, LMS-specific)
     */
    public async oidcLogin(req: Request, res: Response): Promise<void> {
        try {
            await connectDB();

            const { iss, client_id, login_hint, target_link_uri, lti_message_hint } = req.query as Record<string, string>;

            if (!iss || !login_hint || !target_link_uri) {
                res.status(400).json({ error: 'Missing required OIDC login params: iss, login_hint, target_link_uri' });
                return;
            }

            // 1. Look up the platform
            const platform = await LtiPlatformModel.findOne({
                issuer: iss,
                ...(client_id ? { client_id } : {}),
                is_active: true,
            });

            if (!platform) {
                console.error(`[OIDC Login] Unknown platform issuer: ${iss}`);
                res.status(400).send(
                    `<h2>Unknown LMS</h2>` +
                    `<p>This LTI tool has not been registered for: <code>${iss}</code></p>` +
                    `<p>Contact the tool administrator to register your platform.</p>`
                );
                return;
            }

            // 2. Generate one-time state + nonce, store with 60s TTL
            const state = crypto.randomUUID();
            const nonce = crypto.randomUUID();
            await OidcStateModel.create({
                state,
                nonce,
                issuer: iss,
                expires_at: new Date(Date.now() + 60_000),
            });

            // 3. Build redirect URL back to LMS
            const toolPublicUrl = process.env.LTI_BACKEND_PUBLIC_URL || 'http://localhost:4000';
            const params = new URLSearchParams({
                scope:         'openid',
                response_type: 'id_token',
                client_id:     platform.client_id,
                redirect_uri:  `${toolPublicUrl}/api/lti/launch`,
                login_hint,
                state,
                nonce,
                response_mode: 'form_post',
                prompt:        'none',
            });
            if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);

            console.log(`[OIDC Login] Redirecting user to ${platform.name} (${platform.oidc_auth_url})`);
            res.redirect(`${platform.oidc_auth_url}?${params.toString()}`);

        } catch (err: any) {
            console.error('[OIDC Login] Error:', err.message);
            res.status(500).json({ error: 'OIDC login initiation failed', detail: err.message });
        }
    }

    /**
     * GET /api/lti/jwks
     *
     * Exposes your tool's RSA public key as a JSON Web Key Set.
     * LMSs fetch this URL automatically to verify any tokens or
     * grade passback requests coming FROM your tool.
     *
     * The key is read from LTI_PUBLIC_KEY_PEM in .env.
     * Generate with: node scripts/generate-lti-keys.mjs
     */
    public async jwks(req: Request, res: Response): Promise<void> {
        try {
            const jwk = await getToolPublicJwk();
            res.json({ keys: [jwk] });
        } catch (err: any) {
            console.error('[JWKS] Error:', err.message);
            // Return an empty JWKS rather than a 500 — keys just aren't configured yet
            res.json({ keys: [], _note: err.message });
        }
    }

    /**
     * Validates OIDC state + nonce during launch (call this from ltiController.launch
     * when the token comes from a universal LMS, not Vibe).
     *
     * Returns the stored nonce so the caller can verify it against the JWT payload.
     * Deletes the state record on use to prevent replay attacks.
     */
    public async consumeOidcState(state: string): Promise<{ nonce: string; issuer: string } | null> {
        await connectDB();
        const record = await OidcStateModel.findOneAndDelete({ state });
        if (!record) return null;
        if (record.expires_at < new Date()) return null; // expired (belt-and-suspenders)
        return { nonce: record.nonce, issuer: record.issuer };
    }
}

export const universalLtiController = new UniversalLtiController();
