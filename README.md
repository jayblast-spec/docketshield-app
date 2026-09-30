<div align="center">

# DocketShield App

### The tenant-facing side of DocketShield: from served papers to a reviewable Answer draft and filing guidance.

A mobile-first guided flow for Georgia renters who have just been served a dispossessory warrant. The tenant photographs the papers or types the details, confirms every extracted field against the evidence the model saw, gets the exact 7-day Answer deadline with a day-by-day timeline, answers plain-language questions about their situation, and receives the options the court recognizes plus a draft Answer laid out like the official check-box form, with every rule linked to the court source it came from.

[![Live Demo](https://img.shields.io/badge/Live_Demo-docketshield--app.vercel.app-1D4ED8?style=for-the-badge&logo=vercel)](https://docketshield-app.vercel.app)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repo-181717?style=for-the-badge&logo=github)](https://github.com/jayblast-spec/docketshield-app)

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TanStack Start](https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=reactquery&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Vision-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=18&pause=1000&color=1D4ED8&center=true&vCenter=true&width=760&lines=Snap+the+papers.+Confirm+every+field.;Your+exact+deadline%2C+day+by+day.;Options+the+court+actually+recognizes.;A+draft+Answer+shaped+like+the+real+form.)](https://git.io/typing-svg)

</div>

## What It Does

A Georgia tenant has seven calendar days after service to file an Answer, and most people learn that on day five. The app turns that week into eight short steps. The tenant scans the warrant (Gemini vision extracts the case number, county, parties, and service date, each with a confidence score and the exact text it read) or enters it by hand. Nothing moves forward until the tenant confirms every field. The deadline step shows the filing date, the 5:00 PM cutoff, how many days are left, and a timeline that marks which days were skipped for weekends or named Georgia state holidays. The situation step asks four short groups of yes/no questions, then shows cures, defenses, counterclaims, and checks, each with its source linked. The Answer step renders a draft laid out like the court's check-box form, with every checked box explained and every missing field listed, and the final step routes the tenant to filing and free legal help. The app never files anything. Local office details are shown only for Fulton County; other counties are directed to the court on the summons. Unsupported holiday-calendar years stop calculation.

## How It Works

- `src/routes/index.tsx`: the eight-step wizard (Start, Scan, Confirm, Deadline, Situation, Options, Answer, File and help) with focus management, per-step validation, and a typed timeline driven by the engine's `kind` field.
- `src/lib/docketshield.ts`: the typed client for the DocketShield API; every response is parsed with a Zod schema before the UI touches it, so a changed or broken response fails loudly instead of rendering wrong dates.
- `src/server.ts`: the SSR entry, which adds a strict Content-Security-Policy, HSTS, `nosniff`, frame denial, and a camera-only Permissions-Policy to every response and replaces swallowed server errors with a readable error page.
- `src/routes/__root.tsx`: document head (description, Open Graph and Twitter cards, favicon, theme color), plus the not-found and error screens.
- `src/styles.css`: the design tokens (Inter and Source Serif 4, one brand blue) and the court-paper, timeline, and segmented-control styles.
- Engine and API: [jayblast-spec/docketshield](https://github.com/jayblast-spec/docketshield) at [docketshield.vercel.app](https://docketshield.vercel.app), with the deadline rules, triage, Answer drafting, and Gemini extraction covered by Vitest regression tests.

## Live

[docketshield-app.vercel.app](https://docketshield-app.vercel.app)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19, file-based routing, SSR) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 with shadcn/ui primitives |
| Validation | Zod schemas on every API response |
| Document extraction | Google Gemini vision, server-side via the DocketShield API |
| Rules engine | DocketShield API (TypeScript, Vitest) |
| Hosting | Vercel |

<div align="center">

![Footer](https://capsule-render.vercel.app/api?type=waving&color=0:1D4ED8,55:0B1E3D,100:020617&height=120&section=footer&text=ArkNet%20Digital&fontSize=26&fontColor=ffffff&desc=michael@arknet.digital&descAlignY=75)

</div>

## Verify

Requires Node.js 24 for the built-in TypeScript test runner.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

## Review boundaries

Every scanned or sample field requires explicit checkbox confirmation; editing clears confirmation. Model confidence and quoted evidence must be checked against the source document. Printed-deadline conflicts are recomputed from edited inputs. The source dialog links directly to official materials.

Rules currently use the engine's verified 2026 holiday calendar. Fulton is the only county with local office details. The draft is based on DeKalb form wording and Fulton information; confirm the accepted form with the court named on the summons. Uploaded documents are sent to Google Gemini; provider retention is not established by this application's code.

Automated tests are developer-authored regression checks, not independent legal validation or measured tenant outcomes. See the engine repository's [validation plan](https://github.com/jayblast-spec/docketshield/blob/main/docs/VALIDATION.md).
