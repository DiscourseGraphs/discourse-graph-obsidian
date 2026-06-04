export type SmokeCase = {
  name: string;
  steps: string;
  pass: string;
};

export type StoreReviewBucket = {
  id: string;
  title: string;
  commitMessage: string;
  /** File paths or directory prefixes ending with `/**`. */
  files: readonly string[];
  /** When set, only lint errors matching these message substrings count toward verify. */
  errorMessagePatterns?: readonly string[];
  /** When set, only lint errors matching these rule IDs count toward verify. */
  errorRulePatterns?: readonly string[];
  /** When true, matching warnings also fail verify (for high-signal warning buckets). */
  verifyWarnings?: boolean;
  smokeTest: { cases: readonly SmokeCase[] } | null;
};

export const storeReviewBuckets = [
  {
    id: "eslint-directives",
    title: "ESLint directive hygiene",
    commitMessage: "fix(obsidian): normalize eslint directive comments",
    files: [
      "src/index.ts",
      "src/types/obsidian-unofficial.d.ts",
      "src/services/QueryEngine.ts",
      "src/utils/conceptConversion.ts",
      "src/utils/registerCommands.ts",
      "src/utils/publishNode.ts",
      "src/utils/tagNodeHandler.ts",
      "src/utils/importNodes.ts",
      "src/utils/importPreview.ts",
      "src/utils/importRelations.ts",
      "src/utils/syncDgNodesToSupabase.ts",
      "src/utils/tldrawColors.ts",
      "src/utils/upsertNodesAsContentWithEmbeddings.ts",
      "src/components/canvas/DiscourseNodeTool.ts",
      "src/components/canvas/stores/assetStore.ts",
      "src/components/canvas/shapes/discourseNodeMigrations.ts",
      "src/components/canvas/utils/tldraw.ts",
    ],
    errorMessagePatterns: [
      "eslint-disable",
      "eslint-enable",
      "directive comment",
      "Disabling '",
      "Disabling \"",
      "Unused eslint-disable",
    ],
    smokeTest: null,
  },
  {
    id: "lifecycle-css",
    title: "Plugin lifecycle and CSS architecture",
    commitMessage:
      "fix(obsidian): frontmatter CSS via styles.css and remove onunload leaf detach",
    files: ["src/index.ts"],
    errorRulePatterns: [
      "obsidianmd/no-forbidden-elements",
      "obsidianmd/detach-leaves",
    ],
    smokeTest: {
      cases: [
        {
          name: "Frontmatter key hiding",
          steps:
            'Open settings → toggle "Show IDs in frontmatter" off and on while viewing a discourse node',
          pass: "Frontmatter keys hide/show correctly; no console errors",
        },
        {
          name: "Context panel layout persistence",
          steps:
            "Open discourse context panel, move it, disable plugin in settings, re-enable plugin",
          pass: "Panel restores to the user's last position (not reset to default)",
        },
      ],
    },
  },
  {
    id: "inline-styles",
    title: "Inline styles → CSS classes / setCssProps",
    commitMessage:
      "fix(obsidian): replace inline styles with CSS classes and setCssProps",
    files: [
      "src/utils/tagNodeHandler.ts",
      "src/utils/wikilinkDragHandler.ts",
      "src/utils/measureNodeText.ts",
      "src/utils/createNode.ts",
      "src/utils/createNodeFromSelectedText.ts",
    ],
    errorRulePatterns: ["obsidianmd/no-static-styles-assignment"],
    smokeTest: {
      cases: [
        {
          name: "Tag colors and cursor",
          steps: "View discourse tags in the editor; hover and click a tag",
          pass: "Tag colors and pointer cursor look unchanged",
        },
        {
          name: "Wikilink drag handle opacity",
          steps: "On a canvas, hover and drag a wikilink embed handle",
          pass: "Drag handle visibility/opacity behaves as before",
        },
        {
          name: "Canvas node text measurement",
          steps: "Create a discourse node on canvas with a long title",
          pass: "Node width/sizing matches previous behavior",
        },
      ],
    },
  },
  {
    id: "dom-helpers",
    title: "Obsidian DOM helpers and activeDocument",
    commitMessage: "fix(obsidian): use Obsidian DOM helpers and activeDocument",
    files: [
      "src/components/InlineNodeTypePicker.ts",
      "src/utils/wikilinkDragHandler.ts",
      "src/utils/createNode.ts",
      "src/utils/createNodeFromSelectedText.ts",
      "src/utils/measureNodeText.ts",
      "src/utils/tagNodeHandler.ts",
      "src/utils/imageEmbedHoverIcon.ts",
      "src/index.ts",
    ],
    errorRulePatterns: [
      "obsidianmd/prefer-active-doc",
    ],
    errorMessagePatterns: [
      "createSpan",
      "createDiv",
      "createEl",
      "document.createElement",
    ],
    verifyWarnings: true,
    smokeTest: {
      cases: [
        {
          name: "Inline node type picker",
          steps:
            "Select text in editor and trigger inline node type picker (Cmd/Ctrl+Shift+N flow)",
          pass: "Picker renders and selects a node type correctly",
        },
        {
          name: "Create-node notice link",
          steps: "Create a discourse node and click the link in the success notice",
          pass: "Notice link opens the new node file",
        },
      ],
    },
  },
] as const satisfies readonly StoreReviewBucket[];

export type StoreReviewBucketId = (typeof storeReviewBuckets)[number]["id"];

export const getBucketById = (
  id: string,
): StoreReviewBucket | undefined =>
  storeReviewBuckets.find((bucket) => bucket.id === id);
