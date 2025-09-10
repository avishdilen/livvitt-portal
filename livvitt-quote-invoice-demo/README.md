# Livvitt Quote • Invoice • Install Tracker (Demo)

A minimal, fast Vite + React + Tailwind app that lets you:
- Create **Quotes** and **Invoices**
- Track **installation** details (site address, crew, hours, hourly rate)
- Manage a **pipeline** (Draft → Quoted → Approved → Scheduled → Installed → Invoiced → Paid)
- Edit a **price book** (per‑ft² and per‑unit)
- Print a customer‑facing preview, and **export/import JSON**
- Auto numbering: `LVQ-YYYY-####` / `LVI-YYYY-####`
- Local‑only demo (no backend)

## Quickstart

```bash
# 1) Clone or download this repo
# 2) Install deps (Node 18+ recommended)
npm install

# 3) Run the dev server
npm run dev

# 4) Open the URL it prints (usually http://localhost:5173)
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages (optional)

1. In `vite.config.js`, set `base` to `'/YOUR_REPO_NAME/'` (uncomment the line).
2. Push to GitHub as a public repo.
3. Enable **Pages**: Settings → Pages → Source: “GitHub Actions”
4. Keep the provided workflow at `.github/workflows/deploy.yml`.

> If your repo is named `livvitt-quote-invoice-demo`, set `base: '/livvitt-quote-invoice-demo/'`.

## Netlify / Vercel

- Netlify: framework = Vite, build `npm run build`, publish dir `dist`.
- Vercel: auto-detects Vite. No extra config needed.

## Notes

- Data is saved to `localStorage` in your browser.
- Update pricing in the **Settings** tab.
- Convert a Quote to Invoice with the “Convert → Invoice” button.
