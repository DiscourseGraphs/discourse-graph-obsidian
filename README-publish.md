# Obsidian Plugin Publishing

This script replaces the GitHub Actions workflow for publishing the Obsidian plugin to ensure proper handling of compiled assets and avoid styling issues.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in `apps/obsidian/` with:
   ```env
   OBSIDIAN_PLUGIN_REPO_TOKEN=your_github_personal_access_token_here
   ```

3. **GitHub Token Setup:**
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Create a token with `repo` permissions
   - Add access to the `DiscourseGraphs/discourse-graph-obsidian` repository

## Usage

### Basic publish (just push files)
```bash
npm run publish
```

### Publish with version update
```bash
npm run publish -- --version=1.0.0
```

### Publish with release creation
```bash
npm run publish -- --version=1.0.0 --create-release
```

### Publish stable release (non-prerelease)
```bash
npm run publish -- --version=1.0.0 --create-release --stable
```

## What the script does

1. **Builds the plugin** (`npm run build`)
2. **Verifies build output** (checks for compiled CSS, proper file sizes, etc.)
3. **Prepares plugin files** in correct order:
   - Copies source files (excluding development files)
   - Overwrites with built files (`main.js`, `styles.css`, `manifest.json`)
   - Updates version in manifest
4. **Pushes to repository** (`DiscourseGraphs/discourse-graph-obsidian`)
5. **Creates GitHub release** (if requested)
6. **Cleans up** temporary files

## Benefits over GitHub Actions

- ✅ **No file overwriting issues** - proper order of operations
- ✅ **Build verification** - catches CSS compilation failures early
- ✅ **Local testability** - run the exact same process locally
- ✅ **Better error handling** - clearer error messages
- ✅ **Faster execution** - no CI/CD overhead
- ✅ **More control** - easier to debug and modify

## Testing locally

Before publishing, you can test the build:

```bash
npm run test-brat
```

This will verify your build output matches what BRAT would install.

## Troubleshooting

### "styles.css seems to contain uncompiled Tailwind directives"
- This means Tailwind compilation failed
- Check your `tailwind.config.ts` and PostCSS setup
- Ensure all Tailwind dependencies are installed

### "OBSIDIAN_PLUGIN_REPO_TOKEN environment variable is required"
- Create a `.env` file with your GitHub token
- Ensure the token has proper repository permissions

### Build failures
- Run `npm run build` separately to debug build issues
- Check the TypeScript compilation errors
- Verify all dependencies are installed 