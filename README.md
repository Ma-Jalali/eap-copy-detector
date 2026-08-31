# Essay Copy Detector

A web-based tool from the University of Sydney to detect copied content in student essays. It analyzes how many words have been copied word-for-word from source texts without paraphrasing.

## Features

- **Verbatim Detection**: Identifies exact word-for-word copying from source texts
- **Paraphrase Detection**: Flags closely paraphrased sentences using content-based overlap
- **Visual Annotation**: Color-coded essay view showing what was copied vs. original work
- **Multi-Source Support**: Compare against up to 5 source documents
- **No Data Upload**: Runs entirely in the browser — your essay text never leaves your computer
- **Export Options**: Download reports, copy stats, or print results

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm installed
- A GitHub account with a repository

### Local Development

1. **Clone or create the repository:**
```bash
git clone https://github.com/YOUR-USERNAME/eap-copy-detector.git
cd eap-copy-detector
```

2. **Install dependencies:**
```bash
npm install
```

3. **Run locally:**
```bash
npm start
```
The app will open at `http://localhost:3000`

4. **Build for production:**
```bash
npm run build
```

### Deploy to GitHub Pages

#### Step 1: Update package.json
Edit the `homepage` field in `package.json`:
```json
"homepage": "https://YOUR-USERNAME.github.io/eap-copy-detector"
```

#### Step 2: Push to GitHub

1. Create a new repository on GitHub named `eap-copy-detector`

2. Initialize git in your project (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/eap-copy-detector.git
git push -u origin main
```

#### Step 3: Configure GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under "Build and deployment":
   - Source: Select "GitHub Actions"
   - The workflow file (`.github/workflows/deploy.yml`) will automatically deploy on push to `main`

#### Step 4: Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select:
   - ✓ "Read and write permissions"
   - ✓ "Allow GitHub Actions to create and approve pull requests"
3. Save

#### Step 5: Deploy

The app will automatically deploy when you push to the `main` branch. Watch the **Actions** tab to see the build progress.

Once complete, your site will be live at: `https://YOUR-USERNAME.github.io/eap-copy-detector`

## How It Works

### Analysis Engine
- **Tokenization**: Breaks text into normalized tokens (lowercase, punctuation removed)
- **N-gram Matching**: Finds exact matches of n-word sequences between essay and sources
- **Sentence Classification**: Categorizes sentences as:
  - **Verbatim** (≥34% word overlap with source)
  - **Paraphrased** (≥62% content word overlap with source)
  - **Original** (student's own work)

### Filtering
- Ignores stop words (a, the, and, or, etc.) when counting
- Can optionally ignore quoted text
- Minimum run length: configurable (default 4 words)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Minimum run length | 4 words | Shortest sequence to flag as copied |
| Ignore quoted text | On | Don't flag text within quotation marks |

## Privacy

This tool processes all text entirely in your web browser. No text is sent to any server or stored online. Your essay and source texts remain completely private.

## Browser Compatibility

- Chrome/Edge 88+
- Firefox 87+
- Safari 14+
- Any modern browser with ES2020+ support

## License

© The University of Sydney

## Support

For questions or issues, open a GitHub issue in this repository.
