import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  getBucketById,
  storeReviewBuckets,
  type StoreReviewBucket,
} from "../store-review/buckets";

const obsidianRoot = process.cwd();
const localDir = join(obsidianRoot, "store-review", ".local");
const smokeLogPath = join(localDir, "smoke-log.json");
const baselinePath = join(localDir, "review-baseline.json");

type EslintMessage = {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
};

type EslintResult = {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
  warningCount: number;
};

type SmokeLog = Record<string, Record<string, "pass" | "fail">>;

type BaselineFile = {
  summary?: { errorRefs?: number };
  flatItems?: Array<{
    section: string;
    severity: string;
    category: string;
    file: string;
    line: number;
  }>;
};

const normalizePath = (filePath: string): string =>
  relative(obsidianRoot, filePath).replace(/\\/g, "/");

const matchesBucketFile = (
  filePath: string,
  patterns: readonly string[],
): boolean => {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return normalized === pattern;
  });
};

const readJson = <T>(path: string, fallback: T): T => {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
};

const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const runObsidianLintJson = (): EslintResult[] => {
  const output = execSync(
    'pnpm exec eslint --config eslint.obsidian.config.mjs -f json "src"',
    {
      cwd: obsidianRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  return JSON.parse(trimmed) as EslintResult[];
};

const matchesErrorFilter = (
  message: EslintMessage,
  bucket: StoreReviewBucket,
): boolean => {
  const hasRulePatterns = (bucket.errorRulePatterns?.length ?? 0) > 0;
  const hasMessagePatterns = (bucket.errorMessagePatterns?.length ?? 0) > 0;

  if (!hasRulePatterns && !hasMessagePatterns) {
    return true;
  }

  const ruleMatch = bucket.errorRulePatterns?.some((pattern) =>
    message.ruleId?.includes(pattern),
  );
  const messageMatch = bucket.errorMessagePatterns?.some((pattern) =>
    message.message.includes(pattern),
  );

  if (hasRulePatterns && hasMessagePatterns) {
    return Boolean(ruleMatch || messageMatch);
  }
  if (hasRulePatterns) {
    return Boolean(ruleMatch);
  }
  return Boolean(messageMatch);
};

const getBucketLintSummary = (
  results: EslintResult[],
  bucket: StoreReviewBucket,
): { errors: EslintMessage[]; warnings: EslintMessage[] } => {
  const errors: EslintMessage[] = [];
  const warnings: EslintMessage[] = [];

  for (const result of results) {
    if (!matchesBucketFile(result.filePath, bucket.files)) {
      continue;
    }
    for (const message of result.messages) {
      if (message.severity === 2 && matchesErrorFilter(message, bucket)) {
        errors.push(message);
      } else if (message.severity === 1 && matchesErrorFilter(message, bucket)) {
        warnings.push(message);
      }
    }
  }

  return { errors, warnings };
};

const readSmokeLog = (): SmokeLog => readJson<SmokeLog>(smokeLogPath, {});

const getMissingSmokeCases = (bucket: StoreReviewBucket): string[] => {
  if (!bucket.smokeTest) {
    return [];
  }
  const smokeLog = readSmokeLog();
  const bucketLog = smokeLog[bucket.id] ?? {};
  return bucket.smokeTest.cases
    .filter((testCase) => bucketLog[testCase.name] !== "pass")
    .map((testCase) => testCase.name);
};

const verifyBucket = (bucketId: string): boolean => {
  const bucket = getBucketById(bucketId);
  if (!bucket) {
    console.error(`Unknown bucket: ${bucketId}`);
    return false;
  }

  let results: EslintResult[];
  try {
    results = runObsidianLintJson();
  } catch (error) {
    const execError = error as { stdout?: string; status?: number };
    if (execError.stdout?.trim()) {
      results = JSON.parse(execError.stdout) as EslintResult[];
    } else {
      console.error("Failed to run lint:obsidian", error);
      return false;
    }
  }

  const { errors, warnings } = getBucketLintSummary(results, bucket);
  const missingSmoke = getMissingSmokeCases(bucket);

  console.log(`\n=== ${bucket.title} (${bucket.id}) ===`);
  console.log(`Lint errors in bucket: ${errors.length}`);
  console.log(`Lint warnings in bucket: ${warnings.length}`);

  if (errors.length > 0) {
    for (const error of errors.slice(0, 20)) {
      console.log(`  ERROR ${error.line}:${error.column} ${error.ruleId} — ${error.message}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more errors`);
    }
  }

  if (bucket.smokeTest) {
    console.log(`Smoke cases required: ${bucket.smokeTest.cases.length}`);
    if (missingSmoke.length > 0) {
      console.log(`Missing/failed smoke logs: ${missingSmoke.join(", ")}`);
    } else {
      console.log("Smoke log: all cases pass");
    }
  } else {
    console.log("Smoke log: not required");
  }

  const passed =
    errors.length === 0 &&
    (!bucket.verifyWarnings || warnings.length === 0) &&
    missingSmoke.length === 0;
  console.log(passed ? "VERIFY: PASS" : "VERIFY: FAIL");
  return passed;
};

const verifyAll = (): boolean =>
  storeReviewBuckets.every((bucket) => verifyBucket(bucket.id));

const logSmokeResult = (
  bucketId: string,
  caseName: string,
  result: "pass" | "fail",
): void => {
  const bucket = getBucketById(bucketId);
  if (!bucket?.smokeTest) {
    throw new Error(`Bucket '${bucketId}' has no smoke tests`);
  }
  const validCase = bucket.smokeTest.cases.some(
    (testCase) => testCase.name === caseName,
  );
  if (!validCase) {
    throw new Error(`Unknown smoke case '${caseName}' for bucket '${bucketId}'`);
  }

  const smokeLog = readSmokeLog();
  smokeLog[bucketId] ??= {};
  smokeLog[bucketId][caseName] = result;
  writeJson(smokeLogPath, smokeLog);
  console.log(`Logged ${bucketId} / ${caseName}: ${result}`);
};

const printCoverage = (): void => {
  const baseline = readJson<BaselineFile>(baselinePath, {});
  const baselineErrors =
    baseline.flatItems?.filter((item) => item.severity === "error") ?? [];

  let results: EslintResult[];
  try {
    results = runObsidianLintJson();
  } catch (error) {
    const execError = error as { stdout?: string };
    results = execError.stdout?.trim()
      ? (JSON.parse(execError.stdout) as EslintResult[])
      : [];
  }

  const lintErrorKeys = new Set<string>();
  for (const result of results) {
    const file = normalizePath(result.filePath);
    for (const message of result.messages) {
      if (message.severity === 2) {
        lintErrorKeys.add(`${file}:${message.line}:${message.ruleId ?? message.message}`);
      }
    }
  }

  const baselineKeys = new Set(
    baselineErrors.map(
      (item) => `${item.file}:${item.line}:${item.category}`,
    ),
  );

  const baselineOnly = [...baselineKeys].filter((key) => {
    const [file, line] = key.split(":");
    return ![...lintErrorKeys].some((lintKey) =>
      lintKey.startsWith(`${file}:${line}:`),
    );
  });

  console.log("\n=== Baseline coverage (errors only) ===");
  console.log(`Baseline error refs: ${baselineErrors.length}`);
  console.log(`Current lint errors: ${lintErrorKeys.size}`);
  console.log(`Baseline-only (likely already fixed): ${baselineOnly.length}`);
  if (baselineOnly.length > 0) {
    console.log("\nBaseline items not reproduced by lint (first 15):");
    for (const key of baselineOnly.slice(0, 15)) {
      console.log(`  - ${key}`);
    }
  }
};

const getCommitShaForMessage = (commitMessage: string): string => {
  try {
    const output = execSync(`git log --oneline --grep=${JSON.stringify(commitMessage)} -1 --format=%h`, {
      cwd: obsidianRoot,
      encoding: "utf8",
    }).trim();
    return output || "—";
  } catch {
    return "—";
  }
};

const generatePrBody = (): void => {
  let results: EslintResult[];
  try {
    results = runObsidianLintJson();
  } catch (error) {
    const execError = error as { stdout?: string };
    results = execError.stdout?.trim()
      ? (JSON.parse(execError.stdout) as EslintResult[])
      : [];
  }

  const smokeLog = readSmokeLog();
  const lines: string[] = [
    "## Summary",
    "",
    "Fixes Obsidian community plugin automated review findings (ENG-1749).",
    "",
    "## Progress",
    "",
    "| Bucket | Lint errors | Smoke | Commit |",
    "|--------|-------------|-------|--------|",
  ];

  for (const bucket of storeReviewBuckets) {
    const { errors } = getBucketLintSummary(results, bucket);
    const smokeStatus = bucket.smokeTest
      ? `${bucket.smokeTest.cases.filter((testCase) => smokeLog[bucket.id]?.[testCase.name] === "pass").length}/${bucket.smokeTest.cases.length} pass`
      : "n/a";
    lines.push(
      `| ${bucket.id} | ${errors.length} | ${smokeStatus} | ${getCommitShaForMessage(bucket.commitMessage)} |`,
    );
  }

  lines.push("", "## Smoke tests", "");
  for (const bucket of storeReviewBuckets) {
    if (!bucket.smokeTest) {
      continue;
    }
    lines.push(`### ${bucket.title}`, "");
    for (const testCase of bucket.smokeTest.cases) {
      const status = smokeLog[bucket.id]?.[testCase.name] ?? "pending";
      lines.push(
        `- [${status === "pass" ? "x" : " "}] **${testCase.name}** — ${testCase.steps} _(pass: ${testCase.pass})_`,
      );
    }
    lines.push("");
  }

  lines.push("## Test plan", "");
  lines.push("- [ ] `pnpm --filter @discourse-graphs/obsidian lint:obsidian` exits 0");
  lines.push("- [ ] `pnpm --filter @discourse-graphs/obsidian store-review -- verify --all` exits 0");
  lines.push("- [ ] Manual smoke cases above logged as pass");

  console.log(lines.join("\n"));
};

const printUsage = (): void => {
  console.log(`Usage:
  pnpm store-review -- verify --bucket <id>
  pnpm store-review -- verify --all
  pnpm store-review -- smoke-log --bucket <id> --case "<name>" --result pass|fail
  pnpm store-review -- coverage
  pnpm store-review -- pr-body`);
};

const parseArgs = (argv: string[]): Record<string, string | boolean> => {
  const parsed: Record<string, string | boolean> = { command: argv[0] ?? "" };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i += 1;
      }
    }
  }
  return parsed;
};

const main = (): void => {
  const rawArgs = process.argv.slice(2);
  const argsList = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const args = parseArgs(argsList);
  const command = String(args.command);

  switch (command) {
    case "verify": {
      const success = args.all
        ? verifyAll()
        : verifyBucket(String(args.bucket ?? ""));
      process.exit(success ? 0 : 1);
      break;
    }
    case "smoke-log": {
      logSmokeResult(
        String(args.bucket ?? ""),
        String(args.case ?? ""),
        String(args.result) as "pass" | "fail",
      );
      break;
    }
    case "coverage": {
      printCoverage();
      break;
    }
    case "pr-body": {
      generatePrBody();
      break;
    }
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
};

main();
