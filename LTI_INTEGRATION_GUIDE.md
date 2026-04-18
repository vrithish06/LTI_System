# 🔗 LTI Integration Guide
### How to Connect Any LMS with the Vibe LTI Tool

---

## The Big Picture

```
┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│           LMS (Platform)         │       │        LTI Tool (Provider)       │
│  e.g. Vibe, Canvas, Moodle       │       │  Our Activity & BP System        │
│                                  │       │                                  │
│  ┌──────────┐  ┌──────────────┐  │       │  ┌──────────┐  ┌─────────────┐  │
│  │  JWKS    │  │  OIDC Login  │  │──────▶│  │ /launch  │  │  /lti/jwks  │  │
│  │ endpoint │  │  Redirect    │  │       │  │ endpoint │  │  endpoint   │  │
│  └──────────┘  └──────────────┘  │       │  └──────────┘  └─────────────┘  │
│  ┌──────────┐  ┌──────────────┐  │       │  ┌──────────┐  ┌─────────────┐  │
│  │  Token   │  │  NRPS Roster │  │◀──────│  │ /token   │  │  /nrps/sync │  │
│  │ endpoint │  │  endpoint    │  │       │  │  call    │  │   trigger   │  │
│  └──────────┘  └──────────────┘  │       │  └──────────┘  └─────────────┘  │
└──────────────────────────────────┘       └──────────────────────────────────┘
```

---

## What Does Each Side Need To Do?

### 🏫 LMS Side ("Platform") — Must Provide

| What | Endpoint | Used For |
|---|---|---|
| **RSA Public Key** | `GET /api/lti/jwks` | LTI tool verifies JWTs issued by LMS |
| **OIDC Login** | `GET /api/lti/authorize_redirect` | Step 2 of login: LMS authenticates user, returns id_token |
| **OAuth2 Token** | `POST /api/lti/token` | LTI tool exchanges JWT assertion for Bearer token |
| **Roster (NRPS)** | `GET /api/lti/nrps/:courseId` | LTI tool fetches enrolled students for BP sync |

**The LMS must also:**
- Include an **NRPS claim** in every launch JWT pointing to the roster URL
- Include an **AGS claim** pointing to the grade passback URL *(optional but recommended)*
- Have a **registered RSA key pair** and expose the public key at the JWKS endpoint

---

### 🔧 LTI Tool Side ("Provider") — Must Provide

| What | Endpoint | Used For |
|---|---|---|
| **OIDC Login Initiator** | `GET /api/lti/login` | Step 1 of login: store nonce/state, redirect user to LMS |
| **Launch Receiver** | `POST /api/launch` | Step 3: receives id_token from LMS, validates JWT, starts session |
| **JWKS** | `GET /api/lti/jwks` | LMS verifies OAuth2 assertions signed by LTI tool |
| **Admin Platform API** | `POST /api/admin/platforms` | Register new LMS platforms (run by tool admin, one-time) |

---

## Step-by-Step: How a Launch Works

```
1. User clicks "Open Activity" in LMS
        │
        ▼
2. LMS browser → GET  /api/lti/login (on LTI Tool)
   Params: iss, client_id, login_hint, redirect_uri
        │
        ▼
3. LTI Tool stores nonce+state (60s TTL) → redirects to:
   LMS GET /api/lti/authorize_redirect
        │
        ▼
4. LMS authenticates user session, builds signed RS256 id_token JWT
   → Returns HTML form that auto-POSTs to redirect_uri
        │
        ▼
5. Browser auto-submits → POST /api/launch (on LTI Tool)
   Body: { id_token, state }
        │
        ▼
6. LTI Tool validates JWT:
   - Fetches LMS public keys from JWKS endpoint
   - Verifies RS256 signature + issuer + nonce
   - Extracts user role, course, NRPS URL
        │
        ▼
7. LTI Tool fires background roster sync (NRPS):
   - POST /api/lti/token → gets Bearer token from LMS
   - GET  /api/lti/nrps/:courseId (Bearer auth) → gets student list
   - Upserts students into BP database
        │
        ▼
8. LTI React app loads for the right role (Instructor / Student)
```

---

## One-Time Setup Checklist

### LMS Admin Does (in their LMS admin panel):
- [ ] Register the LTI tool with these URLs:
  - **Tool Launch URL:** `https://your-lti-tool.com/api/launch`
  - **OIDC Login URL:** `https://your-lti-tool.com/api/lti/login`
  - **JWKS URL:** `https://your-lti-tool.com/api/lti/jwks`
- [ ] Copy the generated **Client ID** and send it to the tool admin

### Tool Admin Does (one curl call):
```bash
curl -X POST https://your-lti-tool.com/api/admin/platforms \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "issuer":        "https://their-lms.edu",
    "client_id":     "<from LMS admin>",
    "name":          "University XYZ Canvas",
    "jwks_url":      "https://their-lms.edu/api/lti/jwks",
    "oidc_auth_url": "https://their-lms.edu/api/lti/authorize_redirect",
    "token_url":     "https://their-lms.edu/api/lti/token"
  }'
```

Done. Both sides have each other's info. Any course on that LMS can now launch.

---

## Vibe-Specific Details

Vibe acts as the LMS (Platform). Here's what it exposes:

| Endpoint | URL | Notes |
|---|---|---|
| JWKS | `GET /api/lti/jwks` | RSA public key (persisted to lti-keys.json) |
| OIDC Login | `GET /api/lti/authorize_redirect` | Authenticates Vibe user session, returns id_token |
| OAuth2 Token | `POST /api/lti/token` | Issues Bearer tokens for NRPS access |
| NRPS Roster | `GET /api/lti/nrps/:courseId` | Returns enrolled students (accepts x-lti-secret OR Bearer) |
| Launch trigger | `POST /api/lti/launch/:toolId/:activityId` | Vibe frontend calls this when user opens an LTI activity |

Registering Vibe as a platform in the LTI tool:
```bash
curl -X POST http://localhost:4000/api/admin/platforms \
  -H "x-admin-secret: change-this-admin-secret-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "issuer":        "http://localhost:3141",
    "client_id":     "vibe-lti-client",
    "name":          "Vibe LMS (Local)",
    "jwks_url":      "http://localhost:3141/api/lti/jwks",
    "oidc_auth_url": "http://localhost:3141/api/lti/authorize_redirect",
    "token_url":     "http://localhost:3141/api/lti/token"
  }'
```

---

## Security Model

| Token Type | Who signs it | Who verifies it | Used for |
|---|---|---|---|
| **id_token (Launch JWT)** | LMS private key | LTI tool (via LMS JWKS) | Proving user identity on launch |
| **OAuth2 Assertion** | LTI tool private key | LMS (via Tool JWKS) | Getting Bearer token |
| **Bearer token** | LMS issues | LMS validates | Accessing NRPS / AGS |
| **x-lti-secret** | Shared secret | Both sides | Vibe legacy (still supported) |

---

## Quick Test Commands

```bash
# 1. Check LTI tool is up
curl http://localhost:4000/api/health

# 2. Check Vibe JWKS is working
curl http://localhost:3141/api/lti/jwks

# 3. Check LTI tool JWKS is working
curl http://localhost:4000/api/lti/jwks

# 4. Register Vibe as a platform
curl -X POST http://localhost:4000/api/admin/platforms \
  -H "x-admin-secret: change-this-admin-secret-in-production" \
  -H "Content-Type: application/json" \
  -d '{"issuer":"http://localhost:3141","client_id":"vibe-lti-client","name":"Vibe Local","jwks_url":"http://localhost:3141/api/lti/jwks","oidc_auth_url":"http://localhost:3141/api/lti/authorize_redirect","token_url":"http://localhost:3141/api/lti/token"}'

# 5. List registered platforms
curl -H "x-admin-secret: change-this-admin-secret-in-production" \
  http://localhost:4000/api/admin/platforms
```
