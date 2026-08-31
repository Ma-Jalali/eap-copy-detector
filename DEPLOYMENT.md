# GitHub Pages Deployment Checklist

## Pre-Deployment (Do This Once)

- [ ] Update `homepage` in `package.json`
  ```json
  "homepage": "https://YOUR-USERNAME.github.io/eap-copy-detector"
  ```

- [ ] Create a new GitHub repository named `eap-copy-detector`

- [ ] Initialize git and push:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin https://github.com/YOUR-USERNAME/eap-copy-detector.git
  git push -u origin main
  ```

- [ ] Enable GitHub Pages in repository settings:
  - Go to **Settings** → **Pages**
  - Source: Select "GitHub Actions"

- [ ] Enable Actions:
  - Go to **Settings** → **Actions** → **General**
  - Select "Read and write permissions"
  - Save

## Deployment (Do This Every Time You Update)

- [ ] Make your changes locally
- [ ] Test with `npm start`
- [ ] Commit and push:
  ```bash
  git add .
  git commit -m "Your message"
  git push
  ```

- [ ] Check build progress:
  - Go to **Actions** tab on GitHub
  - Wait for the workflow to complete (usually 1-2 minutes)

## After Deployment

- [ ] Visit your live site: `https://YOUR-USERNAME.github.io/eap-copy-detector`
- [ ] Test all features work correctly
- [ ] Clear browser cache if you see old version

## Troubleshooting

### "Build failed" in Actions
1. Check the workflow log for errors
2. Verify `package.json` syntax
3. Ensure all dependencies are listed

### Site shows 404
1. Verify `homepage` field in `package.json` is correct
2. Wait a few minutes after successful build
3. Try clearing browser cache
4. Check that Pages is set to "GitHub Actions" source

### Old version still showing
1. Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
2. Try incognito/private browsing
3. Check the workflow completed successfully

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm start` | Run locally (http://localhost:3000) |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| `git push` | Deploy to GitHub Pages (auto-triggers workflow) |

## File Structure

```
eap-copy-detector/
├── .github/workflows/
│   └── deploy.yml          # Auto-deploy on push to main
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── App.jsx             # Main component
│   └── index.js            # React entry point
├── package.json            # Dependencies & scripts
├── .gitignore              # Git ignore rules
├── README.md               # Full documentation
└── DEPLOYMENT.md           # This file
```

## Quick Start (TL;DR)

```bash
# 1. Clone/setup locally
npm install
npm start  # Test at http://localhost:3000

# 2. Update package.json homepage with your username

# 3. Push to GitHub
git add .
git commit -m "Initial commit"
git push -u origin main

# 4. Enable Pages in Settings → Pages (source: GitHub Actions)

# 5. Done! Site deploys automatically
```

Visit: `https://YOUR-USERNAME.github.io/eap-copy-detector`
