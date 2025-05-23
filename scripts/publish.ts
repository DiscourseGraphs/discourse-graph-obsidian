import dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import util from "util";
import { Octokit } from "@octokit/core";

dotenv.config();

type PublishOptions = {
  version?: string;
  createRelease?: boolean;
  isPrerelease?: boolean;
};

const getVersion = (root = "."): string => {
  const filename = path.join(root, "package.json");
  const json = fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename).toString())
    : {};
  if (!json?.version) throw new Error(`No version found in ${filename}`);
  return json.version;
};

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

const execPromise = util.promisify(exec);

async function execCommand(
  command: string,
  options: Record<string, any> = {},
): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(command, options);
    console.log(`✓ ${command}`);
    if (stderr && !stderr.includes("warning")) {
      console.log(`  stderr: ${stderr.trim()}`);
    }
    return stdout.trim();
  } catch (error) {
    console.error(`✗ Failed: ${command}`);
    throw error;
  }
}

async function getCurrentCommitHash(): Promise<string> {
  return await execCommand("git rev-parse HEAD");
}

async function buildPlugin(): Promise<void> {
  console.log("🔨 Building Obsidian plugin...");

  // Set production environment
  process.env.NODE_ENV = "production";

  // Run the build
  await execCommand("npm run build", { cwd: path.resolve(__dirname, "..") });

  console.log("✓ Build completed");
}

async function verifyBuildOutput(): Promise<string> {
  const projectRoot = path.resolve(__dirname, "..");
  const distDir = path.join(projectRoot, "dist");

  console.log("🔍 Verifying build output...");

  if (!fs.existsSync(distDir)) {
    throw new Error("dist directory not found. Build may have failed.");
  }

  const requiredFiles = ["main.js", "manifest.json"];
  const optionalFiles = ["styles.css"];

  // Check required files
  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required file ${file} not found in dist/`);
    }
  }

  // Check styles.css
  const stylesPath = path.join(distDir, "styles.css");
  if (fs.existsSync(stylesPath)) {
    const content = fs.readFileSync(stylesPath, "utf8");
    const size = content.length;

    console.log(`  ✓ styles.css found (${size} bytes)`);

    // Verify it contains compiled CSS, not just @tailwind directives
    if (content.includes("@tailwind") && size < 100) {
      console.warn(
        "  ⚠️  styles.css seems to contain uncompiled Tailwind directives",
      );
      console.warn("  This may indicate Tailwind compilation failed");
    } else if (
      content.includes(".dg-") ||
      content.includes("var(--") ||
      size > 500
    ) {
      console.log("  ✓ styles.css appears to contain compiled CSS");
    }
  } else {
    console.warn("  ⚠️  styles.css not found (styling may not work)");
  }

  console.log("✓ Build verification completed");
  return distDir;
}

async function preparePluginFiles(
  distDir: string,
  version?: string,
): Promise<string> {
  const projectRoot = path.resolve(__dirname, "..");
  const tempDir = path.join(projectRoot, "temp-plugin-repo");

  console.log("📦 Preparing plugin files...");

  // Clean temp directory
  if (fs.existsSync(tempDir)) {
    await execCommand(`rm -rf ${tempDir}`);
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Copy source files first (excluding build artifacts and development files)
  const excludePatterns = [
    "node_modules",
    "dist",
    ".env*",
    "tsconfig.json",
    "postcss.config.js",
    "tailwind.config.ts",
    "temp-*",
  ];

  console.log("  📁 Copying source files...");
  const sourceFiles = fs.readdirSync(projectRoot);

  for (const file of sourceFiles) {
    const shouldExclude = excludePatterns.some((pattern) => {
      if (pattern.includes("*")) {
        return file.startsWith(pattern.replace("*", ""));
      }
      return file === pattern;
    });

    if (!shouldExclude) {
      const sourcePath = path.join(projectRoot, file);
      const destPath = path.join(tempDir, file);

      if (fs.statSync(sourcePath).isDirectory()) {
        await execCommand(`cp -r "${sourcePath}" "${destPath}"`);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  // Copy built files (these will overwrite any source files with same names)
  console.log("  🔨 Copying built files...");
  const builtFiles = ["main.js", "manifest.json", "styles.css"];

  for (const file of builtFiles) {
    const sourcePath = path.join(distDir, file);
    const destPath = path.join(tempDir, file);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`    ✓ ${file}`);
    } else if (file !== "styles.css") {
      // styles.css is optional
      throw new Error(`Required built file ${file} not found`);
    }
  }

  // Update version in manifest if provided
  if (version) {
    console.log(`  📝 Updating version to ${version}...`);
    const manifestPath = path.join(tempDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = version;
    manifest.id = "discourse-graphs"; // Ensure consistent plugin ID
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log("✓ Plugin files prepared");
  return tempDir;
}

async function pushToRepository(tempDir: string): Promise<void> {
  const targetRepo = "DiscourseGraphs/discourse-graph-obsidian";
  const token = getRequiredEnvVar("OBSIDIAN_PLUGIN_REPO_TOKEN");

  console.log("🚀 Pushing to repository...");

  // Initialize git in temp directory
  await execCommand("git init", { cwd: tempDir });
  await execCommand("git add .", { cwd: tempDir });

  const commitHash = await getCurrentCommitHash();
  const commitMessage = `Update plugin from discourse-graph@${commitHash.slice(0, 7)}`;

  await execCommand(`git commit -m "${commitMessage}"`, { cwd: tempDir });

  // Set up remote with token
  const remoteUrl = `https://x-access-token:${token}@github.com/${targetRepo}.git`;
  await execCommand(`git remote add origin ${remoteUrl}`, { cwd: tempDir });

  // Push to main branch
  await execCommand("git branch -M main", { cwd: tempDir });
  await execCommand("git push -f origin main", { cwd: tempDir });

  console.log("✓ Pushed to repository");
}

async function createRelease(
  version: string,
  isPrerelease: boolean = true,
): Promise<void> {
  console.log("🏷️  Creating GitHub release...");

  const octokit = new Octokit({
    auth: getRequiredEnvVar("OBSIDIAN_PLUGIN_REPO_TOKEN"),
  });

  const tagName = `v${version}`;
  const releaseName = `Discourse Graph v${version}`;

  try {
    const response = await octokit.request(
      "POST /repos/{owner}/{repo}/releases",
      {
        owner: "DiscourseGraphs",
        repo: "discourse-graph-obsidian",
        tag_name: tagName,
        name: releaseName,
        draft: false,
        prerelease: isPrerelease,
        generate_release_notes: true,
      },
    );

    console.log(`✓ Release created: ${response.data.html_url}`);
  } catch (error: any) {
    if (error.status === 422 && error.message.includes("already_exists")) {
      console.log(`ℹ️  Release ${tagName} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function cleanup(tempDir: string): Promise<void> {
  console.log("🧹 Cleaning up...");
  if (fs.existsSync(tempDir)) {
    await execCommand(`rm -rf ${tempDir}`);
  }
  console.log("✓ Cleanup completed");
}

const publish = async (options: PublishOptions = {}) => {
  const startTime = Date.now();
  let tempDir = "";

  try {
    console.log("🚀 Starting Obsidian plugin publish process...\n");

    // Step 1: Build the plugin
    await buildPlugin();

    // Step 2: Verify build output
    const distDir = await verifyBuildOutput();

    // Step 3: Prepare plugin files
    tempDir = await preparePluginFiles(distDir, options.version);

    // Step 4: Push to repository
    await pushToRepository(tempDir);

    // Step 5: Create release if requested
    if (options.createRelease) {
      const version = options.version || getVersion();
      await createRelease(version, options.isPrerelease ?? true);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n🎉 Publish completed successfully in ${duration}s!`);
  } catch (error) {
    console.error("\n❌ Publish failed:", error);
    throw error;
  } finally {
    if (tempDir) {
      await cleanup(tempDir);
    }
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const options: PublishOptions = {
    version: args.find((arg) => arg.startsWith("--version="))?.split("=")[1],
    createRelease: args.includes("--create-release"),
    isPrerelease: !args.includes("--stable"),
  };

  try {
    await publish(options);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

export default publish;
