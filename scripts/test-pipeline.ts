import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

type TestResult = {
  passed: boolean;
  message: string;
  details?: string;
};

type TestSuite = {
  name: string;
  tests: TestResult[];
  passed: boolean;
  duration: number;
};

class ObsidianPluginTester {
  private projectRoot: string;
  private distDir: string;
  private testResults: TestSuite[] = [];

  constructor() {
    this.projectRoot = path.resolve(__dirname, "..");
    this.distDir = path.join(this.projectRoot, "dist");
  }

  private async execCommand(
    command: string,
    options: Record<string, any> = {},
  ): Promise<string> {
    try {
      const { stdout } = await execPromise(command, options);
      return stdout.trim();
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error}`);
    }
  }

  private logTest(
    suite: string,
    test: string,
    passed: boolean,
    message: string,
    details?: string,
  ) {
    const icon = passed ? "✅" : "❌";
    console.log(`  ${icon} ${test}: ${message}`);
    if (details && !passed) {
      console.log(`     ${details}`);
    }

    // Add to current suite
    const currentSuite = this.testResults[this.testResults.length - 1];
    if (currentSuite) {
      currentSuite.tests.push({ passed, message, details });
    }
  }

  private startSuite(name: string) {
    console.log(`\n🧪 ${name}`);
    this.testResults.push({
      name,
      tests: [],
      passed: true,
      duration: Date.now(),
    });
  }

  private endSuite() {
    const suite = this.testResults[this.testResults.length - 1];
    if (suite) {
      suite.duration = Date.now() - suite.duration;
      suite.passed = suite.tests.every((test) => test.passed);
      const passedCount = suite.tests.filter((t) => t.passed).length;
      const icon = suite.passed ? "✅" : "❌";
      console.log(
        `${icon} ${suite.name}: ${passedCount}/${suite.tests.length} tests passed (${suite.duration}ms)`,
      );
    }
  }

  /**
   * Test 1: Development Environment
   */
  async testDevelopmentEnvironment(): Promise<void> {
    this.startSuite("Development Environment");

    // Check if required files exist
    const requiredFiles = [
      "package.json",
      "manifest.json",
      "styles.css",
      "tailwind.config.ts",
      "src/index.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(this.projectRoot, file);
      const exists = fs.existsSync(filePath);
      this.logTest(
        "dev-env",
        `Required file: ${file}`,
        exists,
        exists ? "Found" : "Missing",
        exists ? undefined : `Expected at: ${filePath}`,
      );
    }

    // Check dependencies
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(this.projectRoot, "package.json"), "utf8"),
      );

      const requiredDeps = ["obsidian", "tailwindcss", "typescript"];
      for (const dep of requiredDeps) {
        const hasDevDep = packageJson.devDependencies?.[dep];
        const hasDep = packageJson.dependencies?.[dep];
        const found = hasDevDep || hasDep;

        this.logTest(
          "dev-env",
          `Dependency: ${dep}`,
          !!found,
          found ? `Found (${found})` : "Missing",
        );
      }
    } catch (error) {
      this.logTest(
        "dev-env",
        "package.json parsing",
        false,
        "Failed to parse",
        String(error),
      );
    }

    // Check TypeScript compilation
    try {
      await this.execCommand("npx tsc --noEmit", { cwd: this.projectRoot });
      this.logTest("dev-env", "TypeScript compilation", true, "No type errors");
    } catch (error) {
      this.logTest(
        "dev-env",
        "TypeScript compilation",
        false,
        "Type errors found",
        String(error),
      );
    }

    this.endSuite();
  }

  /**
   * Test 2: Build Process
   */
  async testBuildProcess(): Promise<void> {
    this.startSuite("Build Process");

    // Clean previous build
    try {
      if (fs.existsSync(this.distDir)) {
        await this.execCommand(`rm -rf ${this.distDir}`, {
          cwd: this.projectRoot,
        });
      }
      this.logTest("build", "Clean previous build", true, "Cleaned");
    } catch (error) {
      this.logTest(
        "build",
        "Clean previous build",
        false,
        "Failed",
        String(error),
      );
    }

    // Run build
    try {
      process.env.NODE_ENV = "production";
      await this.execCommand("npm run build", { cwd: this.projectRoot });
      this.logTest("build", "Build execution", true, "Build completed");
    } catch (error) {
      this.logTest(
        "build",
        "Build execution",
        false,
        "Build failed",
        String(error),
      );
      this.endSuite();
      return; // Can't continue without successful build
    }

    // Verify build outputs
    const expectedFiles = ["main.js", "manifest.json"];
    const optionalFiles = ["styles.css"];

    for (const file of expectedFiles) {
      const filePath = path.join(this.distDir, file);
      const exists = fs.existsSync(filePath);
      this.logTest(
        "build",
        `Build output: ${file}`,
        exists,
        exists ? "Generated" : "Missing",
      );

      if (exists) {
        const stats = fs.statSync(filePath);
        const sizeKB = Math.round(stats.size / 1024);
        this.logTest(
          "build",
          `${file} size`,
          stats.size > 0,
          `${sizeKB}KB`,
          stats.size === 0 ? "File is empty" : undefined,
        );
      }
    }

    // Check styles.css specifically
    const stylesPath = path.join(this.distDir, "styles.css");
    if (fs.existsSync(stylesPath)) {
      const content = fs.readFileSync(stylesPath, "utf8");
      const isCompiled =
        !content.includes("@tailwind") || content.length > 1000;
      this.logTest(
        "build",
        "CSS compilation",
        isCompiled,
        isCompiled ? "Tailwind compiled" : "Contains uncompiled directives",
        isCompiled
          ? `${Math.round(content.length / 1024)}KB compiled CSS`
          : `Found: ${content.slice(0, 100)}...`,
      );

      // Check for our custom classes
      const hasCustomClasses =
        content.includes(".dg-") || content.includes("discourse-graph");
      this.logTest(
        "build",
        "Custom CSS classes",
        hasCustomClasses,
        hasCustomClasses ? "Found custom classes" : "No custom classes found",
      );
    } else {
      this.logTest(
        "build",
        "styles.css",
        false,
        "Not generated",
        "CSS won't work in plugin",
      );
    }

    this.endSuite();
  }

  /**
   * Test 3: BRAT Compatibility
   */
  async testBRATCompatibility(): Promise<void> {
    this.startSuite("BRAT Compatibility");

    // Verify manifest structure
    const manifestPath = path.join(this.distDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

        const requiredFields = [
          "id",
          "name",
          "version",
          "minAppVersion",
          "description",
        ];
        for (const field of requiredFields) {
          const hasField = manifest[field] !== undefined;
          this.logTest(
            "brat",
            `Manifest field: ${field}`,
            hasField,
            hasField ? `"${manifest[field]}"` : "Missing",
          );
        }

        // Check version format
        const versionValid = /^\d+\.\d+\.\d+/.test(manifest.version);
        this.logTest(
          "brat",
          "Version format",
          versionValid,
          versionValid
            ? `Valid: ${manifest.version}`
            : `Invalid: ${manifest.version}`,
        );
      } catch (error) {
        this.logTest(
          "brat",
          "Manifest parsing",
          false,
          "Invalid JSON",
          String(error),
        );
      }
    } else {
      this.logTest("brat", "Manifest exists", false, "manifest.json not found");
    }

    // Test main.js bundle
    const mainPath = path.join(this.distDir, "main.js");
    if (fs.existsSync(mainPath)) {
      const content = fs.readFileSync(mainPath, "utf8");

      // Check if it's minified (production build)
      const isMinified = !content.includes("\n  ") && content.length > 1000;
      this.logTest(
        "brat",
        "Bundle minification",
        isMinified,
        isMinified ? "Minified for production" : "Not minified",
      );

      // Check for common issues
      const hasSourceMaps = content.includes("//# sourceMappingURL");
      this.logTest(
        "brat",
        "Source maps",
        !hasSourceMaps,
        hasSourceMaps
          ? "Contains source maps (may increase size)"
          : "No source maps (good for production)",
      );

      // Check bundle size
      const sizeKB = Math.round(content.length / 1024);
      const sizeOk = sizeKB < 5000; // 5MB limit is generous
      this.logTest(
        "brat",
        "Bundle size",
        sizeOk,
        `${sizeKB}KB`,
        sizeOk ? undefined : "Bundle may be too large",
      );
    }

    this.endSuite();
  }

  /**
   * Test 4: Installation Simulation
   */
  async testInstallationSimulation(): Promise<void> {
    this.startSuite("Installation Simulation");

    const testVaultPath = path.join(this.projectRoot, "test-vault");
    const pluginPath = path.join(
      testVaultPath,
      ".obsidian",
      "plugins",
      "discourse-graphs",
    );

    try {
      // Create test vault structure
      await this.execCommand(`mkdir -p "${pluginPath}"`);
      this.logTest("install", "Create test vault", true, "Test vault created");

      // Copy plugin files
      const filesToCopy = ["main.js", "manifest.json", "styles.css"];
      for (const file of filesToCopy) {
        const srcPath = path.join(this.distDir, file);
        const destPath = path.join(pluginPath, file);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          this.logTest("install", `Copy ${file}`, true, "Copied successfully");
        } else if (file !== "styles.css") {
          // styles.css is optional
          this.logTest("install", `Copy ${file}`, false, "Source file missing");
        }
      }

      // Verify installation structure
      const installedFiles = fs.readdirSync(pluginPath);
      const hasRequiredFiles = ["main.js", "manifest.json"].every((file) =>
        installedFiles.includes(file),
      );
      this.logTest(
        "install",
        "Installation structure",
        hasRequiredFiles,
        hasRequiredFiles
          ? "All required files present"
          : "Missing required files",
        `Files: ${installedFiles.join(", ")}`,
      );

      // Test manifest loading
      try {
        const manifestPath = path.join(pluginPath, "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        this.logTest(
          "install",
          "Manifest loading",
          true,
          `Plugin: ${manifest.name} v${manifest.version}`,
        );
      } catch (error) {
        this.logTest(
          "install",
          "Manifest loading",
          false,
          "Failed to parse manifest",
          String(error),
        );
      }
    } catch (error) {
      this.logTest(
        "install",
        "Installation simulation",
        false,
        "Failed",
        String(error),
      );
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(testVaultPath)) {
          await this.execCommand(`rm -rf "${testVaultPath}"`);
        }
        this.logTest("install", "Cleanup", true, "Test vault removed");
      } catch (error) {
        this.logTest(
          "install",
          "Cleanup",
          false,
          "Failed to cleanup",
          String(error),
        );
      }
    }

    this.endSuite();
  }

  /**
   * Test 5: Style Integration
   */
  async testStyleIntegration(): Promise<void> {
    this.startSuite("Style Integration");

    const stylesPath = path.join(this.distDir, "styles.css");
    if (!fs.existsSync(stylesPath)) {
      this.logTest(
        "styles",
        "Styles file exists",
        false,
        "No styles.css found",
      );
      this.endSuite();
      return;
    }

    const content = fs.readFileSync(stylesPath, "utf8");

    // Test for Obsidian CSS variables
    const obsidianVars = [
      "--background-primary",
      "--text-normal",
      "--interactive-accent",
    ];

    for (const cssVar of obsidianVars) {
      const hasVar = content.includes(cssVar);
      this.logTest(
        "styles",
        `Obsidian variable: ${cssVar}`,
        hasVar,
        hasVar ? "Used" : "Not used",
      );
    }

    // Test for important declarations (needed for Obsidian override)
    const hasImportant = content.includes("!important");
    this.logTest(
      "styles",
      "Important declarations",
      hasImportant,
      hasImportant
        ? "Found (good for overriding Obsidian styles)"
        : "None found (may not override Obsidian)",
    );

    // Test for our custom prefixes
    const hasCustomPrefix =
      content.includes(".dg-") || content.includes(".discourse-graph");
    this.logTest(
      "styles",
      "Custom class prefixes",
      hasCustomPrefix,
      hasCustomPrefix ? "Found custom prefixes" : "No custom prefixes",
    );

    // Test CSS size
    const sizeKB = Math.round(content.length / 1024);
    const sizeReasonable = sizeKB < 100; // 100KB is quite large for CSS
    this.logTest(
      "styles",
      "CSS size",
      sizeReasonable,
      `${sizeKB}KB`,
      sizeReasonable ? undefined : "CSS file is quite large",
    );

    this.endSuite();
  }

  /**
   * Generate Test Report
   */
  generateReport(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST REPORT");
    console.log("=".repeat(60));

    let totalTests = 0;
    let passedTests = 0;
    let totalDuration = 0;

    for (const suite of this.testResults) {
      const suitePassed = suite.tests.filter((t) => t.passed).length;
      totalTests += suite.tests.length;
      passedTests += suitePassed;
      totalDuration += suite.duration;

      const icon = suite.passed ? "✅" : "❌";
      console.log(
        `${icon} ${suite.name}: ${suitePassed}/${suite.tests.length} (${suite.duration}ms)`,
      );
    }

    console.log("-".repeat(60));
    const overallPassed = passedTests === totalTests;
    const overallIcon = overallPassed ? "🎉" : "⚠️";
    console.log(
      `${overallIcon} OVERALL: ${passedTests}/${totalTests} tests passed (${totalDuration}ms)`,
    );

    if (!overallPassed) {
      console.log("\n❌ FAILED TESTS:");
      for (const suite of this.testResults) {
        const failedTests = suite.tests.filter((t) => !t.passed);
        if (failedTests.length > 0) {
          console.log(`\n${suite.name}:`);
          for (const test of failedTests) {
            console.log(`  • ${test.message}`);
            if (test.details) {
              console.log(`    ${test.details}`);
            }
          }
        }
      }
    }

    console.log("\n" + "=".repeat(60));
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<boolean> {
    console.log("🚀 Starting Obsidian Plugin Test Pipeline\n");
    const startTime = Date.now();

    try {
      await this.testDevelopmentEnvironment();
      await this.testBuildProcess();
      await this.testBRATCompatibility();
      await this.testInstallationSimulation();
      await this.testStyleIntegration();

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n⏱️ Total testing time: ${duration}s`);

      this.generateReport();

      const allPassed = this.testResults.every((suite) => suite.passed);
      return allPassed;
    } catch (error) {
      console.error("\n💥 Testing pipeline failed:", error);
      return false;
    }
  }
}

const main = async () => {
  const tester = new ObsidianPluginTester();
  const success = await tester.runAllTests();
  process.exit(success ? 0 : 1);
};

if (require.main === module) {
  main();
}

export default ObsidianPluginTester;
