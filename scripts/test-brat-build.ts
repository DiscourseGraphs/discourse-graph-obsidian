import fs from "fs";
import path from "path";

/**
 * Test script to verify that the build output matches what BRAT would install
 * This helps ensure local development accurately reflects the BRAT-installed version
 */

const testBratBuild = () => {
  const projectRoot = path.resolve(__dirname, "..");
  const distDir = path.join(projectRoot, "dist");

  console.log("Testing BRAT build compatibility...");
  console.log(`Project root: ${projectRoot}`);
  console.log(`Dist directory: ${distDir}`);

  // Check if dist directory exists
  if (!fs.existsSync(distDir)) {
    console.error(
      "❌ ERROR: dist directory not found. Run 'npm run build' first.",
    );
    process.exit(1);
  }

  const requiredFiles = ["main.js", "manifest.json"];
  const optionalFiles = ["styles.css"];

  // Check required files
  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: Required file ${file} not found in dist/`);
      process.exit(1);
    } else {
      console.log(`✓ Found required file: ${file}`);
    }
  }

  // Check optional files
  for (const file of optionalFiles) {
    const filePath = path.join(distDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`✓ Found optional file: ${file}`);

      // Special check for styles.css
      if (file === "styles.css") {
        const content = fs.readFileSync(filePath, "utf8");
        const size = content.length;

        console.log(`  - Size: ${size} bytes`);

        // Check for compiled Tailwind content
        if (content.includes("@tailwind") && size < 100) {
          console.warn(
            `⚠️  WARNING: styles.css seems to contain uncompiled Tailwind directives.`,
          );
          console.warn(
            `  This indicates Tailwind compilation may have failed.`,
          );
          console.warn(`  Expected: compiled CSS utilities`);
          console.warn(`  Found: ${content.slice(0, 100)}...`);
        } else if (
          content.includes(".dg-") ||
          content.includes("--text-normal") ||
          size > 500
        ) {
          console.log(`✓ styles.css appears to contain compiled CSS`);
        } else {
          console.warn(
            `⚠️  WARNING: styles.css content seems minimal or incomplete`,
          );
        }

        // Show preview
        console.log(
          `  - Preview (first 200 chars): ${content.slice(0, 200)}...`,
        );
      }
    } else {
      console.warn(`⚠️  Optional file ${file} not found in dist/`);
    }
  }

  // Check manifest.json content
  const manifestPath = path.join(distDir, "manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    console.log(`✓ Manifest validation:`);
    console.log(`  - ID: ${manifest.id}`);
    console.log(`  - Name: ${manifest.name}`);
    console.log(`  - Version: ${manifest.version}`);
    console.log(`  - Min App Version: ${manifest.minAppVersion}`);

    if (!manifest.id || !manifest.name || !manifest.version) {
      console.error(`❌ ERROR: manifest.json is missing required fields`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ ERROR: Invalid manifest.json: ${error}`);
    process.exit(1);
  }

  console.log("\n🎉 Build output looks good for BRAT installation!");
  console.log("\nTo test this build in Obsidian:");
  console.log(
    "1. Copy the entire dist/ folder to your vault's .obsidian/plugins/discourse-graphs/",
  );
  console.log("2. Enable the plugin in Obsidian settings");
  console.log("3. Verify the styling matches your local development version");
};

if (require.main === module) {
  testBratBuild();
}

export default testBratBuild;
