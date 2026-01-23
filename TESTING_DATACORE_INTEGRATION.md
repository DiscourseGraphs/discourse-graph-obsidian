# Testing Datacore NPM Package Integration

This document describes how to test the datacore npm package integration that eliminates the need for users to install datacore as a separate plugin.

## Changes Made

1. **Added datacore npm package** (`@blacksmithgu/datacore@0.1.24`) as a dependency
2. **Refactored QueryEngine.ts** to instantiate datacore directly within the plugin
3. **Removed dependency** on datacore being installed as a separate Community Plugin

## What Was Replaced

### Before
The plugin accessed datacore through Obsidian's plugin registry:
```typescript
const dc = appWithPlugins.plugins?.plugins?.["datacore"]?.api;
```
This required users to:
1. Install datacore from the Community Plugin browser
2. Enable datacore plugin
3. Then use the Discourse Graph plugin

### After
The plugin now:
1. Imports datacore classes from the npm package
2. Instantiates its own Datacore index with proper settings
3. Uses the DatacoreApi to query files
4. Falls back to vault scanning if datacore initialization fails

## Testing Instructions

### Prerequisites
- Clean Obsidian vault (or a test vault)
- Do NOT install datacore from Community Plugins
- Build the plugin with the changes

### Manual Testing Steps

#### 1. Install the Plugin
```bash
# Build the plugin
npm run build

# Copy the built files to your Obsidian vault
cp -r dist/* /path/to/your/vault/.obsidian/plugins/discourse-graphs/
```

#### 2. Test Search Functionality
1. Open Obsidian
2. Create test notes with discourse node frontmatter:
   ```yaml
   ---
   nodeTypeId: "claim"
   ---
   ```
3. Try to search for nodes using the plugin's search feature
4. Verify that:
   - Search works without datacore plugin installed
   - Results are returned correctly
   - No errors in console about missing datacore plugin

#### 3. Test Bulk Import
1. Create multiple files matching discourse node patterns
2. Use the bulk import feature
3. Verify that:
   - Files are discovered correctly
   - No datacore plugin errors appear
   - Import completes successfully

#### 4. Test Node Creation
1. Create a new discourse node
2. Link it to other nodes
3. Verify that:
   - Node relationships work
   - Search for compatible nodes works
   - No errors about missing datacore

#### 5. Test Canvas Integration
1. Open or create a canvas
2. Add discourse nodes to the canvas
3. Create relationships between nodes
4. Verify that:
   - Node search in canvas works
   - Relationships are created correctly
   - No datacore-related errors

### Expected Behavior

✅ **Success Criteria:**
- All search features work without datacore plugin installed
- Query operations complete successfully
- Console shows "Datacore initialized successfully" message
- No warnings about missing datacore plugin API
- Fallback to vault scanning works if datacore fails

❌ **Failure Indicators:**
- "Datacore API not available" warnings persist
- Search returns no results when nodes exist
- Console errors about missing datacore
- Plugin requires separate datacore installation

### Performance Expectations

- Initial datacore indexing may take a few seconds on first load
- Subsequent queries should be fast (datacore caching)
- Large vaults (1000+ files) may take 5-10 seconds to index initially

### Troubleshooting

#### Issue: "Datacore API not available" warning
**Cause:** Datacore initialization failed
**Check:**
- Browser console for initialization errors
- Whether datacore npm package is in bundle (check dist/main.js)
- Settings object is correctly configured

#### Issue: Slow initial performance
**Cause:** Datacore is indexing all vault files
**Expected:** Wait for "Datacore initialized successfully" in console
**Note:** This is normal for first load; subsequent loads use cache

#### Issue: Build fails
**Cause:** Dependencies not installed properly
**Fix:**
```bash
rm -rf node_modules
pnpm install
npm run build
```

### Console Logging

During normal operation, you should see:
```
Datacore initialized successfully
```

If there are issues, you'll see one of:
```
Failed to load datacore package: [error]
Failed to initialize Datacore: [error]
Datacore initialization timeout - proceeding anyway
Datacore API not available. Search functionality is not available.
Datacore API not available. Falling back to vault iteration.
```

### Comparing with Old Behavior

| Feature | Old (with plugin) | New (npm package) |
|---------|-------------------|-------------------|
| Installation | Requires separate datacore plugin | Single plugin install |
| Setup | Enable datacore first | Automatic initialization |
| Dependencies | External dependency | Bundled |
| Updates | Must update both plugins | Single plugin update |
| Conflicts | Potential version conflicts | No conflicts |
| Size | Smaller bundle | Larger bundle (~19MB) |

## Known Limitations

1. **Bundle Size**: The plugin bundle is larger (~19MB) due to including datacore
2. **Initialization Time**: First load requires indexing vault files
3. **Memory Usage**: Slightly higher due to embedded index
4. **Settings**: Uses default datacore settings (not customizable through UI yet)

## Next Steps

After successful testing:
1. Monitor performance in various vault sizes
2. Consider exposing datacore settings in plugin settings
3. Add telemetry to track initialization success rate
4. Document any edge cases discovered during testing
