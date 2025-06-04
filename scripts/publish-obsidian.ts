import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { Octokit } from "@octokit/core";
import os, { version } from "os";

dotenv.config();

const execPromise = util.promisify(exec);
const TARGET_REPO = "DiscourseGraphs/discourse-graph-obsidian";
const OWNER = "DiscourseGraphs";
const REPO = "discourse-graph-obsidian";

type PublishConfig = {
  version: string;
  createRelease: boolean;
  isPrerelease: boolean;
  releaseName?: string;
};

type ExecOptions = {
  env?: Record<string, string>;
  cwd?: string;
};

const EXCLUDE_PATTERNS = [
  "node_modules",
  "dist",
  ".env*",
  ".turbo",
  ".DS_Store",
  "*.log",
  "coverage",
  ".next",
  "out",
  "build",
  ".git",
  ".vscode",
  ".cursor",
  "*.pem",
  "temp-obsidian-publish",
];

const REQUIRED_BUILD_FILES = [
  "main.js",
  "manifest.json",
  "styles.css",
] as const;

const log = (message: string): void => {
  console.log(`[Obsidian Publisher] ${message}`);
};

const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value || "";
};

const showHelp = (): void => {
  console.log(`
Usage: tsx scripts/publish-obsidian.ts --version <version> [options]

Required:
  --version, -v <version>    Version to publish (see formats below)

Options:
  --create-release, -r      Create a GitHub release
  --target-repo <repo>      Target repository
  --stable                 Mark as stable release (defaults to pre-release if not specified)
  --release-name <name>    Custom release name (defaults to "Discourse Graph v{version}")
  --help, -h               Show this help message

Version Formats:
  x.y.z                    Stable release (e.g., 1.0.0)
  x.y.z-beta.n            Beta release - auto-picked up by BRAT (e.g., 1.0.0-beta.1)
  x.y.z-alpha.n           Alpha release - auto-picked up by BRAT (e.g., 1.0.0-alpha.1)
  x.y.z-feature-name      Internal release - manual install only (e.g., 0.1.0-canvas-integration)

Release Type Auto-Detection:
  - Internal releases (x.y.z-feature-name): Marked as pre-release, not auto-updated by BRAT
  - External releases: Auto-updated by BRAT users if they chose "Latest" as the version

Examples:
  # Internal release with custom name
  tsx scripts/publish-obsidian.ts --version 0.1.0-canvas --release-name "Canvas Integration Feature" --create-release
  
  # Beta release with feature description
  tsx scripts/publish-obsidian.ts --version 1.0.0-beta.1 --release-name "Beta: New Graph View" --create-release
  
  # Stable release (uses default name)
  tsx scripts/publish-obsidian.ts --version 1.0.0 --stable --create-release
`);
};

const validateVersion = (version: string): void => {
  const basicVersionPattern = /^\d+\.\d+\.\d+/;

  if (!basicVersionPattern.test(version)) {
    throw new Error(
      `Invalid version format: ${version}. Expected format: x.y.z, x.y.z-suffix, or x.y.z-custom-name`,
    );
  }
};

const isExternalRelease = (version: string): boolean => {
  // Official SemVer regex from https://semver.org/#semantic-versioning-specification-semver
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
};

const processVersionArgument = (
  args: string[],
  i: number,
): { version: string; nextIndex: number } => {
  const nextArg = args[i + 1];
  if (!nextArg || nextArg.startsWith("-")) {
    throw new Error("Version argument is required after --version");
  }
  return { version: nextArg, nextIndex: i + 1 };
};

const processReleaseNameArgument = (
  args: string[],
  i: number,
): { releaseName: string; nextIndex: number } => {
  const nextArg = args[i + 1];
  if (!nextArg || nextArg.startsWith("-")) {
    throw new Error("Release name argument is required after --release-name");
  }
  return { releaseName: nextArg, nextIndex: i + 1 };
};

const handleCommandLineArgument = (
  arg: string,
  args: string[],
  i: number,
  config: Partial<PublishConfig>,
): number => {
  switch (arg) {
    case "--version":
    case "-v": {
      const { version, nextIndex } = processVersionArgument(args, i);
      config.version = version;
      return nextIndex;
    }
    case "--create-release":
    case "-r":
      config.createRelease = true;
      return i;
    case "--stable":
      config.isPrerelease = false;
      return i;
    case "--release-name": {
      const { releaseName, nextIndex } = processReleaseNameArgument(args, i);
      config.releaseName = releaseName;
      return nextIndex;
    }
    case "--help":
    case "-h":
      showHelp();
      process.exit(0);
    default:
      return i;
  }
};

const determineReleaseType = (version: string, args: string[]): boolean => {
  // Internal releases are pre-release by default
  if (!args.includes("--stable")) {
    return !isExternalRelease(version);
  }
  return false;
};

const parseArgs = (): PublishConfig => {
  const args = process.argv.slice(2);
  const config: Partial<PublishConfig> = {
    createRelease: false,
    isPrerelease: true,
  };

  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    if (currentArg) {
      i = handleCommandLineArgument(currentArg, args, i, config);
    }
  }

  if (!config.version) {
    throw new Error("Version is required. Use --version <version> or --help");
  }

  validateVersion(config.version);
  config.isPrerelease = determineReleaseType(config.version, args);

  return config as PublishConfig;
};

const execCommand = async (
  command: string,
  options: ExecOptions = {},
): Promise<string> => {
  try {
    const { stdout, stderr } = await execPromise(command, {
      ...options,
      env: {
        ...process.env,
        ...options.env,
        GIT_ASKPASS: "echo",
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    log(`Command: ${command}`);
    log(`stdout: ${stdout.trim()}`);
    if (stderr) log(`stderr: ${stderr.trim()}`);

    return stdout.trim();
  } catch (error) {
    const token = getEnvVar("OBSIDIAN_PLUGIN_REPO_TOKEN");
    if (token) {
      throw new Error((error as Error).message.replace(token, "***"));
    }
    throw error;
  }
};

const shouldExclude = (filePath: string, baseDir: string): boolean => {
  const relativePath = path.relative(baseDir, filePath);
  return EXCLUDE_PATTERNS.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(relativePath) || regex.test(path.basename(filePath));
    }
    return (
      relativePath.includes(pattern) || path.basename(filePath) === pattern
    );
  });
};

const copyDirectory = (src: string, dest: string, baseDir: string): void => {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  fs.readdirSync(src, { withFileTypes: true }).forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (shouldExclude(srcPath, baseDir)) {
      log(`Excluding: ${path.relative(baseDir, srcPath)}`);
      return;
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, baseDir);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (error) {
        throw new Error(`Failed to copy ${srcPath}: ${error}`);
      }
    }
  });
};

const validateBuildFiles = (buildDir: string): void => {
  const missingFiles = REQUIRED_BUILD_FILES.filter(
    (file) => !fs.existsSync(path.join(buildDir, file)),
  );

  if (missingFiles.length > 0) {
    throw new Error(`Required build files missing: ${missingFiles.join(", ")}`);
  }
};

const buildPlugin = async (dir: string): Promise<void> => {
  log("Building plugin...");
  await execCommand("npm run build", { cwd: dir });

  const buildDir = path.join(dir, "dist");
  validateBuildFiles(buildDir);
};

const updateManifest = (tempDir: string, version: string): void => {
  const manifestPath = path.join(tempDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("manifest.json not found in temp directory");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  manifest.id = "discourse-graphs";

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Updated manifest version to ${version}`);
};

const copyBuildFiles = (buildDir: string, tempDir: string): void => {
  REQUIRED_BUILD_FILES.forEach((file) => {
    const srcPath = path.join(buildDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(tempDir, file));
      log(`Copied ${file}`);
    }
  });
};

const createOctokitClient = (): Octokit => {
  const token = getEnvVar("OBSIDIAN_PLUGIN_REPO_TOKEN");
  return new Octokit({ auth: token });
};

const getCurrentBranchReference = async (octokit: Octokit): Promise<string> => {
  const { data: ref } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/refs/{ref}",
    {
      owner: OWNER,
      repo: REPO,
      ref: "heads/main",
    },
  );

  if (!ref?.object?.sha) {
    throw new Error("Failed to get main branch reference");
  }
  return ref.object.sha;
};

const getCurrentCommitTreeSha = async (
  octokit: Octokit,
  commitSha: string,
): Promise<string> => {
  const { data: currentCommit } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    {
      owner: OWNER,
      repo: REPO,
      commit_sha: commitSha,
    },
  );

  if (!currentCommit?.tree?.sha) {
    throw new Error("Failed to get current commit tree");
  }
  return currentCommit.tree.sha;
};

const getAllFilesRecursively = (
  dir: string,
  baseDir: string = dir,
): string[] => {
  const files: string[] = [];

  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldExclude(fullPath, baseDir)) {
      log(`Excluding: ${relativePath}`);
      return;
    }

    if (entry.isDirectory()) {
      files.push(...getAllFilesRecursively(fullPath, baseDir));
    } else {
      files.push(relativePath);
    }
  });

  return files;
};

const createGitBlob = async (
  octokit: Octokit,
  filePath: string,
  tempDir: string,
) => {
  const fullPath = path.join(tempDir, filePath);
  const content = fs.readFileSync(fullPath);

  const { data: blob } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/blobs",
    {
      owner: OWNER,
      repo: REPO,
      content: content.toString("base64"),
      encoding: "base64",
    },
  );

  if (!blob?.sha) {
    throw new Error(`Failed to create blob for ${filePath}`);
  }

  return {
    path: filePath.replace(/\\/g, "/"), // Normalize path separators for GitHub
    sha: blob.sha,
  };
};

const createAllGitBlobs = async (
  octokit: Octokit,
  files: string[],
  tempDir: string,
) => {
  const blobPromises = files.map((filePath) =>
    createGitBlob(octokit, filePath, tempDir),
  );
  return Promise.all(blobPromises);
};

const createNewGitTree = async (
  octokit: Octokit,
  blobs: Array<{ path: string; sha: string }>,
  baseTreeSha: string,
) => {
  const { data: newTree } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/trees",
    {
      owner: OWNER,
      repo: REPO,
      base_tree: baseTreeSha,
      tree: blobs.map((blob) => ({
        path: blob.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      })),
    },
  );

  if (!newTree?.sha) {
    throw new Error("Failed to create new tree");
  }
  return newTree.sha;
};

const createCommitFromTree = async (
  octokit: Octokit,
  treeSha: string,
  parentSha: string,
  version: string,
) => {
  const { data: newCommit } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner: OWNER,
      repo: REPO,
      message: `Release v${version}`,
      tree: treeSha,
      parents: [parentSha],
    },
  );

  if (!newCommit?.sha) {
    throw new Error("Failed to create new commit");
  }
  return newCommit.sha;
};

const updateMainBranchReference = async (
  octokit: Octokit,
  newCommitSha: string,
) => {
  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner: OWNER,
    repo: REPO,
    ref: "heads/main",
    sha: newCommitSha,
  });
};

const updateMainBranch = async (
  tempDir: string,
  version: string,
): Promise<void> => {
  log(`Updating main branch of repository: ${TARGET_REPO}...`);

  const octokit = createOctokitClient();

  try {
    const currentSha = await getCurrentBranchReference(octokit);
    const currentTreeSha = await getCurrentCommitTreeSha(octokit, currentSha);

    const allFiles = getAllFilesRecursively(tempDir);
    log(`Found ${allFiles.length} files to update`);

    const blobs = await createAllGitBlobs(octokit, allFiles, tempDir);
    const newTreeSha = await createNewGitTree(octokit, blobs, currentTreeSha);
    const newCommitSha = await createCommitFromTree(
      octokit,
      newTreeSha,
      currentSha,
      version,
    );

    await updateMainBranchReference(octokit, newCommitSha);

    log(`Successfully updated main branch with commit: ${newCommitSha}`);
    log(`Updated ${blobs.length} files`);
  } catch (error) {
    log(`Failed to update main branch: ${error}`);
    throw error;
  }
};

const determineContentType = (file: string): string => {
  const contentTypes = {
    ".js": "application/javascript",
    ".json": "application/json",
    ".css": "text/css",
  };
  return (
    contentTypes[path.extname(file) as keyof typeof contentTypes] ||
    "application/octet-stream"
  );
};

const uploadReleaseAsset = async (
  octokit: Octokit,
  uploadUrl: string,
  filePath: string,
  fileName: string,
): Promise<void> => {
  const contentType = determineContentType(fileName);
  const fileContent = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);
  const formattedUploadUrl = uploadUrl.replace(
    "{?name,label}",
    `?name=${fileName}`,
  );

  await octokit.request(`POST ${formattedUploadUrl}`, {
    headers: {
      "content-type": contentType,
      "content-length": String(stats.size),
    },
    data: fileContent,
    name: fileName,
  });

  log(`Uploaded ${fileName}`);
};

const uploadAllReleaseAssets = async (
  octokit: Octokit,
  uploadUrl: string,
  tempDir: string,
): Promise<void> => {
  for (const file of REQUIRED_BUILD_FILES) {
    const filePath = path.join(tempDir, file);
    if (!fs.existsSync(filePath)) continue;

    await uploadReleaseAsset(octokit, uploadUrl, filePath, file);
  }
};

const createGithubRelease = async ({
  tempDir,
  version,
  isPrerelease,
  releaseName,
}: {
  tempDir: string;
  version: string;
  isPrerelease: boolean;
  releaseName?: string;
}): Promise<void> => {
  log("Creating GitHub release...");

  const octokit = createOctokitClient();
  const tagName = `v${version}`;
  const releaseTitle = releaseName || `Discourse Graph v${version}`;

  const release = await octokit.request("POST /repos/{owner}/{repo}/releases", {
    owner: OWNER,
    repo: REPO,
    tag_name: tagName,
    name: releaseTitle,
    prerelease: isPrerelease,
    generate_release_notes: true,
  });

  if (!release.data.upload_url) {
    throw new Error("Failed to get upload URL from release response");
  }

  await uploadAllReleaseAssets(octokit, release.data.upload_url, tempDir);
};

const ensureCleanTempDirectory = (tempDir: string): void => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
};

const shouldUpdateMainBranch = (
  isExternal: boolean,
  isPrerelease: boolean,
): boolean => {
  return isExternal && !isPrerelease;
};

const prepareReleaseAssets = (
  buildDir: string,
  obsidianDir: string,
  version: string,
): string => {
  const releaseTempDir = path.join(os.tmpdir(), "temp-obsidian-release-assets");

  ensureCleanTempDirectory(releaseTempDir);
  fs.mkdirSync(releaseTempDir, { recursive: true });

  copyBuildFiles(buildDir, releaseTempDir);

  const manifestSrc = path.join(obsidianDir, "manifest.json");
  const manifestDest = path.join(releaseTempDir, "manifest.json");
  fs.copyFileSync(manifestSrc, manifestDest);
  updateManifest(releaseTempDir, version);

  return releaseTempDir;
};

const cleanupTempDirectories = (...dirs: string[]): void => {
  dirs.forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  });
};

const publish = async (config: PublishConfig): Promise<void> => {
  const { version, createRelease, isPrerelease } = config;
  const obsidianDir = path.resolve(".");
  const buildDir = path.join(obsidianDir, "dist");
  const tempDir = path.join(os.tmpdir(), "temp-obsidian-publish");

  try {
    const isExternal = isExternalRelease(version);
    const releaseType = isExternal ? "external" : "internal";
    log(`Publishing Obsidian plugin v${version} (${releaseType} release)`);

    await buildPlugin(obsidianDir);

    ensureCleanTempDirectory(tempDir);
    copyDirectory(obsidianDir, tempDir, obsidianDir);
    copyBuildFiles(buildDir, tempDir);

    if (shouldUpdateMainBranch(isExternal, isPrerelease)) {
      updateManifest(tempDir, version);
      await updateMainBranch(tempDir, version);
    } else {
      log("Skipping main branch update for internal or pre-release");
    }

    if (createRelease) {
      const releaseTempDir = prepareReleaseAssets(
        buildDir,
        obsidianDir,
        version,
      );

      await createGithubRelease({
        tempDir: releaseTempDir,
        version,
        isPrerelease,
        releaseName: config.releaseName,
      });

      cleanupTempDirectories(releaseTempDir);
    }

    log("Publication completed successfully!");
  } catch (error) {
    log(`Publication failed: ${error}`);
    throw error;
  } finally {
    cleanupTempDirectories(tempDir);
  }
};

if (require.main === module) {
  publish(parseArgs()).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
