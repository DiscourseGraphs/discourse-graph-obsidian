import { TFile, App } from "obsidian";
import { BulkImportPattern, BulkImportCandidate, DiscourseNode } from "~/types";
import { getDiscourseNodeFormatExpression } from "~/utils/getDiscourseNodeFormatExpression";
import { extractContentFromTitle } from "~/utils/extractContentFromTitle";

// Import datacore types and classes
type DatacorePage = {
  $name: string;
  $path?: string;
};

type DatacoreSettings = {
  importerNumThreads: number;
  importerUtilization: number;
  enableJs: boolean;
  defaultPagingEnabled: boolean;
  defaultPageSize: number;
  scrollOnPageChange: boolean;
  maxRecursiveRenderDepth: number;
  defaultDateFormat: string;
  defaultDateTimeFormat: string;
  renderNullAs: string;
  indexInlineFields: boolean;
};

// We'll dynamically import datacore at runtime to handle initialization properly
let Datacore: any;
let DatacoreApi: any;

// Try to load datacore classes
async function loadDatacore() {
  if (Datacore && DatacoreApi) return true;
  
  try {
    const dc = await import("@blacksmithgu/datacore");
    Datacore = (dc as any).Datacore;
    DatacoreApi = (dc as any).DatacoreApi;
    return true;
  } catch (error) {
    console.error("Failed to load datacore package:", error);
    return false;
  }
}

export class QueryEngine {
  private app: App;
  private datacoreInstance: any | undefined;
  private api: any | undefined;
  private readonly MIN_QUERY_LENGTH = 2;
  private initializationPromise: Promise<void> | undefined;
  private initializationAttempted = false;

  constructor(app: App) {
    this.app = app;
    // Don't initialize immediately - wait until first use
  }

  private async initializeDatacore() {
    if (this.initializationAttempted) return;
    this.initializationAttempted = true;

    try {
      // Load datacore classes
      const loaded = await loadDatacore();
      if (!loaded) {
        console.warn("Datacore package could not be loaded");
        return;
      }

      // Create default settings for datacore
      const settings: DatacoreSettings = {
        importerNumThreads: 4,
        importerUtilization: 0.5,
        enableJs: false,
        defaultPagingEnabled: true,
        defaultPageSize: 50,
        scrollOnPageChange: false,
        maxRecursiveRenderDepth: 4,
        defaultDateFormat: "MMMM dd, yyyy",
        defaultDateTimeFormat: "h:mm a - MMMM dd, yyyy",
        renderNullAs: "-",
        indexInlineFields: true,
      };

      // Initialize datacore with the Obsidian app
      this.datacoreInstance = new Datacore(this.app, "0.1.24", settings);
      
      // Create the API wrapper
      this.api = new DatacoreApi(this.datacoreInstance);
      
      // Initialize the datacore index
      this.initializationPromise = new Promise((resolve, reject) => {
        try {
          // Start initialization
          this.datacoreInstance.initialize();
          
          // Wait for initialized event
          this.datacoreInstance.on("initialized", () => {
            console.log("Datacore initialized successfully");
            resolve();
          });
          
          // If already initialized, resolve immediately
          if (this.datacoreInstance.initialized) {
            resolve();
          }
          
          // Add timeout to prevent hanging
          setTimeout(() => {
            if (!this.datacoreInstance.initialized) {
              console.warn("Datacore initialization timeout - proceeding anyway");
              resolve();
            }
          }, 10000);
        } catch (error) {
          console.error("Error during datacore initialization:", error);
          reject(error);
        }
      });
      
      await this.initializationPromise;
    } catch (error) {
      console.error("Failed to initialize Datacore:", error);
      this.api = undefined;
      this.datacoreInstance = undefined;
    }
  }

  private async ensureInitialized(): Promise<boolean> {
    if (!this.initializationAttempted) {
      await this.initializeDatacore();
    }
    
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch (error) {
        console.error("Datacore initialization failed:", error);
        return false;
      }
    }
    
    return this.api !== undefined;
  }

  /**
   * Search across all Discourse Nodes (files that have frontmatter nodeTypeId)
   */
  searchDiscourseNodesByTitle = async (
    query: string,
    nodeTypeId?: string,
  ): Promise<TFile[]> => {
    if (!query || query.length < this.MIN_QUERY_LENGTH) {
      return [];
    }

    const isReady = await this.ensureInitialized();
    if (!isReady || !this.api) {
      console.warn(
        "Datacore API not available. Search functionality is not available.",
      );
      return [];
    }

    try {
      const dcQuery = nodeTypeId
        ? `@page and exists(nodeTypeId) and nodeTypeId = "${nodeTypeId}"`
        : "@page and exists(nodeTypeId)";
      
      const potentialNodes = this.api.query(dcQuery);

      const searchResults = potentialNodes.filter((p: DatacorePage) =>
        this.fuzzySearch(p.$name, query),
      );

      const files = searchResults
        .map((dcFile: DatacorePage) => {
          if (dcFile && dcFile.$path) {
            const realFile = this.app.vault.getAbstractFileByPath(dcFile.$path);
            if (realFile && realFile instanceof TFile) return realFile;
          }
          return null;
        })
        .filter((f): f is TFile => f instanceof TFile);

      return files.reverse();
    } catch (error) {
      console.error("Error in searchDiscourseNodesByTitle:", error);
      return [];
    }
  };

  searchCompatibleNodeByTitle = async ({
    query,
    compatibleNodeTypeIds,
    activeFile,
    selectedRelationType,
  }: {
    query: string;
    compatibleNodeTypeIds: string[];
    activeFile: TFile;
    selectedRelationType: string;
  }): Promise<TFile[]> => {
    if (!query || query.length < this.MIN_QUERY_LENGTH) {
      return [];
    }

    const isReady = await this.ensureInitialized();
    if (!isReady || !this.api) {
      console.warn(
        "Datacore API not available. Search functionality is not available.",
      );
      return [];
    }

    try {
      const dcQuery = `@page and exists(nodeTypeId) and ${compatibleNodeTypeIds
        .map((id) => `nodeTypeId = "${id}"`)
        .join(" or ")}`;

      const potentialNodes = this.api.query(dcQuery);
      const searchResults = potentialNodes.filter((p: DatacorePage) => {
        return this.fuzzySearch(p.$name, query);
      });

      let existingRelatedFiles: string[] = [];
      if (selectedRelationType) {
        const fileCache = this.app.metadataCache.getFileCache(activeFile);
        const existingRelations: string[] =
          (fileCache?.frontmatter?.[selectedRelationType] as string[]) || [];

        existingRelatedFiles = existingRelations.map((relation: string) => {
          const match = relation.match(/\[\[(.*?)(?:\|.*?)?\]\]/);
          return match?.[1] ?? relation.replace(/^\[\[|\]\]$/g, "");
        });
      }
      const finalResults = searchResults
        .map((dcFile: DatacorePage) => {
          if (dcFile && dcFile.$path) {
            const realFile = this.app.vault.getAbstractFileByPath(dcFile.$path);
            if (realFile && realFile instanceof TFile) {
              return realFile;
            }
          }
          return null;
        })
        .filter((f): f is TFile => f instanceof TFile)
        .filter((file: TFile) => {
          if (file.path === activeFile.path) return false;

          if (
            selectedRelationType &&
            existingRelatedFiles.some((existingFile) => {
              return (
                file.basename === existingFile.replace(/\.md$/, "") ||
                file.name === existingFile
              );
            })
          ) {
            return false;
          }

          return true;
        });

      return finalResults;
    } catch (error) {
      console.error("Error in searchNodeByTitle:", error);
      return [];
    }
  };

  /**
   * Enhanced fuzzy search implementation
   * Returns true if the search term is found within the target string
   * with tolerance for typos and partial matches
   */
  fuzzySearch(target: string, search: string): boolean {
    if (!search || !target) return false;

    const targetLower = target.toLowerCase();
    const searchLower = search.toLowerCase();

    if (targetLower.includes(searchLower)) {
      return true;
    }

    if (searchLower.length > targetLower.length) {
      return false;
    }

    if (targetLower.startsWith(searchLower)) {
      return true;
    }

    let searchIndex = 0;
    let consecutiveMatches = 0;
    const MIN_CONSECUTIVE = Math.min(2, searchLower.length);

    for (
      let i = 0;
      i < targetLower.length && searchIndex < searchLower.length;
      i++
    ) {
      if (targetLower[i] === searchLower[searchIndex]) {
        searchIndex++;
        consecutiveMatches++;

        if (
          consecutiveMatches >= MIN_CONSECUTIVE &&
          searchIndex >= searchLower.length * 0.7
        ) {
          return true;
        }
      } else {
        consecutiveMatches = 0;
      }
    }

    return searchIndex === searchLower.length;
  }

  async scanForBulkImportCandidates(
    patterns: BulkImportPattern[],
    validNodeTypes: DiscourseNode[],
  ): Promise<BulkImportCandidate[]> {
    const candidates: BulkImportCandidate[] = [];

    const isReady = await this.ensureInitialized();
    if (!isReady || !this.api) {
      console.warn(
        "Datacore API not available. Falling back to vault iteration.",
      );
      return this.fallbackScanVault(patterns, validNodeTypes);
    }

    try {
      let dcQuery: string;

      if (validNodeTypes.length === 0) {
        dcQuery = "@page";
      } else {
        const validIdConditions = validNodeTypes
          .map((nt) => `nodeTypeId != "${nt.id}"`)
          .join(" and ");

        dcQuery = `@page and (!exists(nodeTypeId) or (${validIdConditions}))`;
      }

      const potentialPages = this.api.query(dcQuery);

      for (const page of potentialPages) {
        const fileName = page.$name;

        for (const pattern of patterns) {
          if (!pattern.enabled || !pattern.alternativePattern.trim()) continue;

          const regex = getDiscourseNodeFormatExpression(
            pattern.alternativePattern,
          );

          if (regex.test(fileName)) {
            if (!page.$path) continue;
            const file = this.app.vault.getAbstractFileByPath(page.$path);
            if (file && file instanceof TFile) {
              const extractedContent = extractContentFromTitle(
                pattern.alternativePattern,
                fileName,
              );

              const matchedNodeType = validNodeTypes.find(
                (nt) => nt.id === pattern.nodeTypeId,
              );

              if (!matchedNodeType) {
                console.warn(
                  `No matching node type found for pattern with nodeTypeId: ${pattern.nodeTypeId}`,
                );
                continue;
              }

              candidates.push({
                file,
                matchedNodeType,
                alternativePattern: pattern.alternativePattern,
                extractedContent,
                selected: true,
              });
            }
            break; // Stop checking other patterns for this file
          }
        }
      }

      return candidates;
    } catch (error) {
      console.error(
        "Error in datacore bulk scan, falling back to vault iteration:",
        error,
      );
      return this.fallbackScanVault(patterns, validNodeTypes);
    }
  }

  private async fallbackScanVault(
    patterns: BulkImportPattern[],
    validNodeTypes: DiscourseNode[],
  ): Promise<BulkImportCandidate[]> {
    const candidates: BulkImportCandidate[] = [];
    const allFiles = this.app.vault.getMarkdownFiles();

    for (const file of allFiles) {
      const fileName = file.basename;
      const fileCache = this.app.metadataCache.getFileCache(file);
      const currentNodeTypeId = fileCache?.frontmatter?.nodeTypeId;

      if (
        currentNodeTypeId &&
        validNodeTypes.some((nt) => nt.id === currentNodeTypeId)
      ) {
        continue;
      }

      for (const pattern of patterns) {
        if (!pattern.enabled || !pattern.alternativePattern.trim()) continue;

        const regex = getDiscourseNodeFormatExpression(
          pattern.alternativePattern,
        );

        if (regex.test(fileName)) {
          const extractedContent = extractContentFromTitle(
            pattern.alternativePattern,
            fileName,
          );

          const matchedNodeType = validNodeTypes.find(
            (nt) => nt.id === pattern.nodeTypeId,
          );

          if (!matchedNodeType) {
            console.warn(
              `No matching node type found for pattern with nodeTypeId: ${pattern.nodeTypeId}`,
            );
            continue;
          }

          candidates.push({
            file,
            matchedNodeType,
            alternativePattern: pattern.alternativePattern,
            extractedContent,
            selected: true,
          });
          break;
        }
      }
    }

    return candidates;
  }
}
