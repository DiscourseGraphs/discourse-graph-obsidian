# 🧪 Obsidian Plugin Testing Strategy

This document outlines the comprehensive testing strategy for the Discourse Graph Obsidian plugin, covering everything from local development to BRAT installation simulation.

## 📋 Quick Start

```bash
# Run the full test pipeline
npm test

# Run individual test components
npm run test-brat      # Just BRAT compatibility check
npm run test-pipeline  # Full pipeline test
```

## 🏗️ Testing Architecture

Our testing system has **5 main test suites** that mirror the development → production pipeline:

```
Development → Build → BRAT → Installation → Runtime
     ↓         ↓       ↓         ↓           ↓
 [Dev Tests][Build][BRAT][Install Sim][Style Test]
```

## 🧪 Test Suites Overview

### 1. **Development Environment** 
Tests your local development setup

**What it checks:**
- ✅ Required files exist (`package.json`, `manifest.json`, `styles.css`, etc.)
- ✅ Dependencies installed (`obsidian`, `tailwindcss`, `typescript`)
- ✅ TypeScript compilation (no type errors)

**Why it matters:** Catches setup issues before you waste time building

### 2. **Build Process**
Tests the compilation and bundling

**What it checks:**
- ✅ Build completes successfully
- ✅ Required outputs generated (`main.js`, `manifest.json`)  
- ✅ CSS compilation worked (Tailwind → actual CSS)
- ✅ File sizes reasonable
- ✅ Custom classes present in CSS

**Why it matters:** This is where most styling issues occur

### 3. **BRAT Compatibility**
Tests whether your plugin will work with BRAT

**What it checks:**
- ✅ Manifest has required fields (`id`, `name`, `version`, etc.)
- ✅ Version format is valid (`1.0.0` not `v1.0.0`)
- ✅ Bundle is minified for production
- ✅ No source maps in production build
- ✅ Bundle size reasonable
- ✅ Release assets ready (`main.js`, `manifest.json`, `styles.css`)
- ✅ Asset file sizes appropriate for GitHub releases

**Why it matters:** BRAT downloads files directly from GitHub release assets

### 4. **Installation Simulation**
Simulates what BRAT actually does

**What it checks:**
- ✅ Creates proper plugin directory structure
- ✅ Copies all required files
- ✅ Manifest loads correctly
- ✅ File permissions correct

**Why it matters:** Tests the exact installation process users will experience

### 5. **Style Integration**
Tests CSS integration with Obsidian

**What it checks:**
- ✅ Uses Obsidian CSS variables (`--background-primary`, etc.)
- ✅ Has `!important` declarations (needed to override Obsidian)
- ✅ Custom class prefixes present (`.dg-`, `.discourse-graph`)
- ✅ CSS size reasonable

**Why it matters:** Style conflicts are the #1 issue with BRAT vs local

## 🎯 Testing Workflow

### **Pre-Development**
```bash
npm run test-pipeline  # Verify environment setup
```

### **During Development**
```bash
# Quick checks
npm run test-brat

# Full validation
npm test
```

### **Pre-Publish**
```bash
npm test               # Full pipeline must pass
npm run publish        # Only if tests pass
```

## 📊 Understanding Test Output

### **Successful Test Run**
```
🧪 Development Environment
  ✅ Required file: package.json: Found
  ✅ Required file: manifest.json: Found
  ✅ Dependency: obsidian: Found (^1.7.2)
  ✅ TypeScript compilation: No type errors
✅ Development Environment: 8/8 tests passed (145ms)

🧪 Build Process
  ✅ Clean previous build: Cleaned
  ✅ Build execution: Build completed
  ✅ Build output: main.js: Generated
  ✅ CSS compilation: Tailwind compiled
✅ Build Process: 6/6 tests passed (2340ms)

📊 TEST REPORT
════════════════════════════════════════════════════════════
✅ Development Environment: 8/8 (145ms)
✅ Build Process: 6/6 (2340ms)  
✅ BRAT Compatibility: 5/5 (89ms)
✅ Installation Simulation: 6/6 (156ms)
✅ Style Integration: 5/5 (23ms)
────────────────────────────────────────────────────────────
🎉 OVERALL: 30/30 tests passed (2753ms)
```

### **Failed Test Run**
```
🧪 Build Process
  ✅ Clean previous build: Cleaned
  ✅ Build execution: Build completed
  ❌ CSS compilation: Contains uncompiled directives
     Found: @tailwind components; @tailwind utilities; .accent...

❌ FAILED TESTS:

Build Process:
  • CSS compilation: Contains uncompiled directives
    This indicates Tailwind compilation may have failed
```

## 🔧 Troubleshooting Common Issues

### **"CSS compilation: Contains uncompiled directives"**
**Problem:** Tailwind CSS isn't compiling properly

**Solutions:**
1. Check `tailwind.config.ts` exists and is valid
2. Verify `postcss.config.js` includes Tailwind
3. Ensure Tailwind dependencies installed: `npm install`
4. Check build script processes CSS correctly

### **"TypeScript compilation: Type errors found"**
**Problem:** TypeScript errors preventing build

**Solutions:**
1. Run `npx tsc --noEmit` to see detailed errors
2. Fix type errors in your source code
3. Check `tsconfig.json` configuration
4. Verify Obsidian types are installed

### **"Bundle size: [X]KB" (too large)**
**Problem:** Plugin bundle is too large

**Solutions:**
1. Check for accidentally included dependencies
2. Verify tree shaking is working
3. Remove unnecessary imports
4. Use dynamic imports for large features

### **"Obsidian variable: --text-normal: Not used"**
**Problem:** Not using Obsidian's CSS variables

**Solutions:**
1. Use `var(--text-normal)` instead of hardcoded colors
2. Check `tailwind.config.ts` maps Obsidian variables
3. Update your CSS to use Obsidian's theme system

## 🚀 Advanced Testing

### **Testing with Different Obsidian Versions**
```bash
# Test with specific Obsidian version
OBSIDIAN_VERSION=1.4.0 npm test
```

### **Testing with Different Themes**
The style integration tests check for proper CSS variable usage, which ensures compatibility with different Obsidian themes.

### **Performance Testing**
```bash
# Check build performance
time npm run build

# Check test performance  
time npm test
```

## 🔄 CI/CD Integration

### **Pre-commit Hook**
```bash
# Add to .git/hooks/pre-commit
#!/bin/sh
cd apps/obsidian && npm test
```

### **GitHub Actions** (if you want automated testing)
```yaml
- name: Test Plugin
  run: |
    cd apps/obsidian
    npm test
```

## 🎯 Testing Checklist

Before publishing, ensure:

- [ ] `npm test` passes with 100% success rate
- [ ] CSS compilation working (no `@tailwind` directives in output)
- [ ] Bundle size reasonable (< 1MB for most plugins)
- [ ] All Obsidian CSS variables used correctly
- [ ] Plugin ID consistent (`discourse-graphs`)
- [ ] Version format valid (`1.0.0`)

## 🔍 Manual Testing Recommendations

While automated tests catch most issues, also manually test:

1. **Install via BRAT** in a real vault
2. **Test with different themes** (dark/light)
3. **Test with other plugins** installed
4. **Test on different platforms** (Windows/Mac/Linux)
5. **Test plugin disable/enable** functionality

This comprehensive testing strategy ensures your local development experience accurately reflects what users will get when installing via BRAT! 🎉 