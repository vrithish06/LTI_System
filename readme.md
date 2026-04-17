# 🎯 LTI Activity & Brownie Points System

A full-stack **LTI 1.3-compatible Tool Provider** that extends any Learning Management System with an automated student engagement and reward engine — built around **Activities**, **Brownie Points (BP)**, and **LMS Milestone tracking**.

Originally integrated with the **Vibe LMS**, the tool is architected to work with any standards-compliant LMS.

---

## ✨ What It Does

When students and instructors launch this tool from within their LMS, they get a dedicated portal for:

### For Students
- 📋 **Browse Course Activities** — View all activities with deadlines, submission status, and BP rewards at a glance
- ✅ **Submit Activities** — Upload proof of completion and submit work directly inside the LTI iframe
- 🏆 **Track Brownie Points** — See their current BP balance, a complete audit trail of gains/losses, and their overall health status
- 📊 **Course Progress Milestones** — Automatically earn BP when they reach a target course completion percentage in the LMS

### For Instructors
- ➕ **Create & Manage Activities** — Full CRUD with deadline, reward BP, penalty rules, grace periods, and submission modes
- 📁 **View Submissions** — See who submitted, their status (on-time / late), and uploaded proof — with student names and emails (not raw user IDs)
- 👥 **Manage Brownie Points** — Bulk approve BP, manually adjust individual student balances, and view historical audit logs
- 🎯 **VIBE Milestone Activities** — Set a course completion threshold (e.g. 50%) and an auto-award value — the system handles the rest

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    LMS  (Vibe / any)                │
│  Teacher clicks "Manage Activity & BP"              │
│  Student clicks "Activities & BP"                   │
└────────────────────┬────────────────────────────────┘
                     │  JWT Launch Token (LTI 1.3 standard)
                     ▼
┌─────────────────────────────────────────────────────┐
│               LTI Backend  (Express + TypeScript)   │
│  • Validates JWT (RS256 / HS256 via JOSE)           │
│  • Routes by role: Instructor vs Learner            │
│  • Activity CRUD, HP ledger, submission engine      │
│  • NRPS roster sync from LMS                        │
│  • Cron: overdue penalties + milestone BP awards    │
└──────────────┬──────────────────────────────────────┘
               │  MongoDB (persistent state)
               │
┌──────────────▼──────────────────────────────────────┐
│             LTI Frontend  (React + Vite)            │
│  • Role-aware dashboard (instructor / student)      │
│  • Activities list, detail, submission form         │
│  • Brownie Points overview & per-student drilldown  │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### Activity Engine
| Feature | Details |
|---|---|
| **Activity Types** | `ASSIGNMENT`, `VIBE_MILESTONE`, `LTI_TOOL`, `EXTERNAL_IMPORT` |
| **Submission Modes** | In-platform upload, External Link, CSV Import |
| **HP Assignment** | Automatic on submit, or Manual (instructor reviews and approves) |
| **Deadline & Grace Period** | Configurable deadline + grace window (hours); late submissions recorded separately |
| **Proof Uploads** | Files uploaded to Google Cloud Storage; instructors can preview proof inline |

### Brownie Points (HP) Engine
| Feature | Details |
|---|---|
| **Immutable Ledger** | Every change (reward, penalty, manual adjustment) is appended — never mutated |
| **Current Balance Cache** | Separate `hp_balance` collection for O(1) reads |
| **Automatic Penalties** | Cron job penalizes students who miss mandatory activities past deadline |
| **Bulk Approval** | Instructor can approve HP for multiple students in one click |
| **Health Status** | Visual `Healthy` / `At Risk` badge based on configurable BP threshold |

### LMS Milestone Tracking
- Teacher creates a `VIBE_MILESTONE` activity with a **target completion %** (e.g. 50%) and a **BP reward**
- Every 5 minutes, a background job fetches each student's course completion % from the LMS
- When a student crosses the threshold → they're **automatically awarded BP, exactly once** (idempotent via `milestone_awards` collection)
- No deadline required — milestones are purely progress-based

### Role-Based Access
- **Instructors** see: Manage BP, Add Activity, full Activities manager with edit/delete/submissions
- **Students** see: Activity list with submission forms, personal BP dashboard
- Role is resolved from the LTI JWT **and** verified against the LMS enrollment database

---

## 🛠️ Tech Stack

### Backend
- **Node.js + TypeScript** (ESM)
- **Express.js** — REST API with structured routing
- **MongoDB + Mongoose** — Persistent storage (activities, submissions, HP ledger, roster)
- **JOSE** — JWT validation (RS256 via JWKS endpoint + HS256 shared secret fallback)
- **node-cron** — Scheduled overdue penalties and milestone checks
- **Multer + Google Cloud Storage** — Proof file uploads

### Frontend
- **React 18 + TypeScript** (Vite)
- **Vanilla CSS** — Custom design system matching the LMS theme (no Tailwind dependency)
- Role-aware routing inside a single-page app launched within the LMS iframe

---

## 📁 Project Structure

```
LTI_System/
├── backend/
│   └── src/
│       ├── activity/          # Activity CRUD + submission logic
│       ├── controllers/       # Express route handlers
│       ├── cron/              # Overdue penalty + milestone cron jobs
│       ├── hp/                # HP reward/penalty service + ledger writes
│       ├── lti/               # JWT validation (ltiValidator.ts)
│       ├── milestone/         # Vibe progress fetch + BP auto-award
│       ├── models/            # Mongoose schemas (Activity, Submission, HP, Roster…)
│       ├── routes/            # API router (all endpoints)
│       └── utils/             # Cloud storage, helpers
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.tsx              # Entry point — routes by role
        │   ├── BrowniePointsDashboard.tsx # Instructor BP overview
        │   ├── StudentBPDashboard.tsx     # Student BP view
        │   ├── InstructorActivitiesManager.tsx  # Full activity CRUD
        │   ├── ActivitiesList.tsx         # Student activity list
        │   ├── ActivityDetail.tsx         # Student submission form
        │   └── SubmissionsViewer.tsx      # Instructor submission modal
        ├── ActivityCreator.tsx            # Create activity form
        └── App.tsx                        # JWT parse + context provider
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)
```env
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/lti_system

# LMS connection
VIBE_BASE_URL=http://localhost:3141
VIBE_JWKS_URL=http://localhost:3141/api/lti/jwks
LTI_SHARED_SECRET=your-secret-here

# File uploads
GCS_BUCKET_NAME=your-bucket
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:4000
```

---

## 🏃 Running Locally

```bash
# Backend
cd backend
npm install
npm run dev          # Starts on http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # Starts on http://localhost:5174
```

---

## 🔌 LMS Integration

The LMS launches the LTI tool by:
1. Generating a signed JWT containing: `userId`, `userEmail`, `courseId`, `role`, `courseName`
2. POSTing it to `POST /api/launch`
3. The LTI tool validates the JWT, extracts the context, and renders the appropriate role-based UI

The LTI backend communicates back to the LMS via two server-to-server endpoints (protected by `x-lti-secret`):
- `GET /api/lti/nrps/:courseId` — Fetch enrolled students (roster sync)
- `GET /api/lti/progress/:courseId` — Fetch per-student completion percentages (for milestones)

---

## 🗺️ Roadmap to Universal LTI 1.3

Currently the integration is customised for Vibe LMS. To make this tool plug-and-play with any LMS (Canvas, Moodle, Blackboard):
- [ ] Implement OIDC 3-step login flow (`GET /login` redirect)
- [ ] Multi-tenant platform registry (store per-LMS JWKS/token URLs in DB)
- [ ] Replace `x-lti-secret` calls with standard OAuth2 Bearer token flow
- [ ] Use standard NRPS claim URL from launch token instead of hardcoded Vibe endpoint
- [ ] Use standard AGS (Assignment & Grade Services) for grade passback
- [ ] Consider adopting [`ltijs`](https://cvmcosta.me/ltijs) to handle the above automatically

---

## 📄 License

MIT