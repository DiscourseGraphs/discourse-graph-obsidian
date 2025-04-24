import { TFile, Notice } from "obsidian";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { QueryEngine } from "~/services/QueryEngine";
import SearchBar from "./SearchBar";
import { DiscourseNode } from "~/types";
import DropdownSelect from "./DropdownSelect";
import { usePlugin } from "./PluginContext";

type RelationTypeOption = {
  id: string;
  label: string;
  isSource: boolean;
};

type RelationshipSectionProps = {
  activeFile: TFile;
};

const AddRelationship = ({ activeFile }: RelationshipSectionProps) => {
  const plugin = usePlugin();

  const [selectedRelationType, setSelectedRelationType] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<TFile | null>(null);
  const [isAddingRelation, setIsAddingRelation] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [compatibleNodeTypes, setCompatibleNodeTypes] = useState<
    DiscourseNode[]
  >([]);

  const queryEngineRef = useRef<QueryEngine | null>(null);

  const activeNodeTypeId = (() => {
    const fileCache = plugin.app.metadataCache.getFileCache(activeFile);
    return fileCache?.frontmatter?.nodeTypeId;
  })();

  useEffect(() => {
    if (!queryEngineRef.current) {
      queryEngineRef.current = new QueryEngine(plugin.app);
    }
  }, [plugin.app]);

  useEffect(() => {
    if (!selectedRelationType || !activeNodeTypeId) {
      setCompatibleNodeTypes([]);
      return;
    }

    const relations = plugin.settings.discourseRelations.filter(
      (relation) =>
        relation.relationshipTypeId === selectedRelationType &&
        (relation.sourceId === activeNodeTypeId ||
          relation.destinationId === activeNodeTypeId),
    );

    const compatibleNodeTypeIds = relations.map((relation) =>
      relation.sourceId === activeNodeTypeId
        ? relation.destinationId
        : relation.sourceId,
    );

    const compatibleNodeTypes = compatibleNodeTypeIds
      .map((id) => {
        const nodeType = plugin.settings.nodeTypes.find(
          (type) => type.id === id,
        );
        return nodeType;
      })
      .filter(Boolean) as DiscourseNode[];

    setCompatibleNodeTypes(compatibleNodeTypes);
  }, [selectedRelationType, activeNodeTypeId, plugin.settings]);

  const getAvailableRelationTypes = useCallback(() => {
    if (!activeNodeTypeId) return [];

    const options: RelationTypeOption[] = [];

    const relevantRelations = plugin.settings.discourseRelations.filter(
      (relation) =>
        relation.sourceId === activeNodeTypeId ||
        relation.destinationId === activeNodeTypeId,
    );

    relevantRelations.forEach((relation) => {
      const relationType = plugin.settings.relationTypes.find(
        (type) => type.id === relation.relationshipTypeId,
      );

      if (!relationType) return;

      const isSource = relation.sourceId === activeNodeTypeId;

      const existingOption = options.find(
        (opt) => opt.id === relationType.id && opt.isSource === isSource,
      );

      if (!existingOption) {
        options.push({
          id: relationType.id,
          label: isSource ? relationType.label : relationType.complement,
          isSource,
        });
      }
    });

    return options;
  }, [activeNodeTypeId, plugin.settings]);

  const availableRelationTypes = useMemo(
    () => getAvailableRelationTypes(),
    [getAvailableRelationTypes],
  );

  // Auto-select the relation type if there's only one option
  useEffect(() => {
    if (
      availableRelationTypes.length === 1 &&
      !selectedRelationType &&
      availableRelationTypes[0]
    ) {
      setSelectedRelationType(availableRelationTypes[0].id);
    }
  }, [availableRelationTypes, selectedRelationType]);

  const searchNodes = useCallback(
    async (query: string): Promise<TFile[]> => {
      if (!queryEngineRef.current) {
        setSearchError("Search engine not initialized");
        return [];
      }

      setSearchError(null);
      try {
        if (!activeNodeTypeId) {
          setSearchError("Active file does not have a node type");
          return [];
        }

        if (!selectedRelationType) {
          setSearchError("Please select a relationship type first");
          return [];
        }

        if (compatibleNodeTypes.length === 0) {
          setSearchError(
            "No compatible node types available for the selected relation type",
          );
          return [];
        }

        const nodeTypeIdsToSearch = compatibleNodeTypes.map((type) => type.id);

        const results =
          await queryEngineRef.current?.searchCompatibleNodeByTitle(
            query,
            nodeTypeIdsToSearch,
            activeFile,
            selectedRelationType,
          );

        if (results.length === 0 && query.length >= 2) {
          setSearchError(
            "No matching nodes found. Try a different search term.",
          );
        }

        return results;
      } catch (error) {
        setSearchError(
          error instanceof Error ? error.message : "Unknown search error",
        );
        return [];
      }
    },
    [activeFile, activeNodeTypeId, compatibleNodeTypes, selectedRelationType],
  );

  const renderNodeItem = (file: TFile, el: HTMLElement) => {
    const suggestionEl = el.createEl("div", {
      cls: "file-suggestion",
      attr: { style: "display: flex; align-items: center;" },
    });

    suggestionEl.createEl("div", {
      text: "📄",
      attr: { style: "margin-right: 8px;" },
    });

    suggestionEl.createEl("div", { text: file.basename });
  };

  const addRelationship = useCallback(async () => {
    if (!selectedRelationType || !selectedNode) return;

    const relationType = plugin.settings.relationTypes.find(
      (r) => r.id === selectedRelationType,
    );
    if (!relationType) return;

    try {
      const appendLinkToFrontmatter = async (file: TFile, link: string) => {
        await plugin.app.fileManager.processFrontMatter(file, (fm) => {
          const existingLinks = Array.isArray(fm[relationType.id])
            ? fm[relationType.id]
            : [];
          fm[relationType.id] = [...existingLinks, link];
        });
      };

      await appendLinkToFrontmatter(
        activeFile,
        `"[[${selectedNode.name}]]"`.replace(/^['"]+|['"]+$/g, ""),
      );
      await appendLinkToFrontmatter(
        selectedNode,
        `"[[${activeFile.name}]]"`.replace(/^['"]+|['"]+$/g, ""),
      );

      new Notice(
        `Successfully added ${relationType.label} with ${selectedNode.name}`,
      );

      resetState();
    } catch (error) {
      console.error("Failed to add relationship:", error);
      new Notice(
        `Failed to add relationship: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [
    activeFile,
    plugin.app.fileManager,
    plugin.settings.relationTypes,
    selectedNode,
    selectedRelationType,
  ]);

  const resetState = () => {
    setIsAddingRelation(false);
    setSelectedRelationType("");
    setSelectedNode(null);
    setSearchError(null);
  };

  if (!isAddingRelation) {
    return (
      <button
        className="!bg-accent !text-on-accent mt-4 w-full cursor-pointer rounded border-0 px-3 py-2"
        onClick={() => setIsAddingRelation(true)}
      >
        Add a new relation
      </button>
    );
  }

  return (
    <div className="relationship-manager">
      <div className="relationship-type-selector mb-4">
        <label className="mb-2 block">Relationship Type:</label>
        <DropdownSelect<RelationTypeOption>
          options={availableRelationTypes}
          onSelect={(option) => option && setSelectedRelationType(option.id)}
          placeholder="Select relation type"
          getItemText={(option) => option.label}
        />
      </div>

      {compatibleNodeTypes.length > 0 && (
        <div className="mb-3">
          <div className="text-muted flex items-center gap-2 rounded bg-secondary p-2 text-sm">
            <span className="mr-2">💡</span>
            <span>
              You can link with:{" "}
              {compatibleNodeTypes.map((type) => (
                <span
                  key={type.id}
                  className="bg-modifier-border mr-1 rounded px-2 py-1 text-sm"
                >
                  {type.name}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="mb-2 block">Node to link with:</label>
        <SearchBar<TFile>
          asyncSearch={searchNodes}
          onSelect={setSelectedNode}
          placeholder={
            selectedRelationType
              ? "Search nodes (type at least 2 characters)..."
              : "Select a relationship type first"
          }
          getItemText={(node) => node.basename}
          renderItem={renderNodeItem}
          disabled={!selectedRelationType}
        />
        {searchError && (
          <div className="text-error mt-2 text-sm">
            Search error: {searchError}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          disabled={!selectedNode || !selectedRelationType}
          className={`flex-1 rounded border-0 px-3 py-2 ${
            selectedNode && selectedRelationType
              ? "!bg-accent !text-on-accent cursor-pointer"
              : "!bg-modifier-border !text-normal cursor-not-allowed"
          }`}
          onClick={addRelationship}
        >
          Confirm
        </button>

        <button
          className="!bg-modifier-border !text-normal cursor-pointer rounded border-0 px-3 py-2"
          onClick={resetState}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

type GroupedRelation = {
  relationTypeOptions: RelationTypeOption;
  linkedFiles: TFile[];
};

const CurrentRelationships = ({ activeFile }: RelationshipSectionProps) => {
  const plugin = usePlugin();
  const [groupedRelationships, setGroupedRelationships] = useState<
    GroupedRelation[]
  >([]);

  useEffect(() => {
    loadCurrentRelationships();

    const onMetadataChange = (file: TFile) => {
      if (file && file.path === activeFile.path) {
        loadCurrentRelationships();
      }
    };

    plugin.app.metadataCache.on("changed", onMetadataChange);

    return () => {
      plugin.app.metadataCache.off(
        "changed",
        onMetadataChange as (...data: unknown[]) => unknown,
      );
    };
  }, [activeFile, plugin]);

  const loadCurrentRelationships = async () => {
    const fileCache = plugin.app.metadataCache.getFileCache(activeFile);
    if (!fileCache?.frontmatter) return;

    const tempRelationships = new Map<string, GroupedRelation>();
    const activeNodeTypeId = fileCache.frontmatter.nodeTypeId;

    if (!activeNodeTypeId) return;

    for (const relationType of plugin.settings.relationTypes) {
      const frontmatterLinks = fileCache.frontmatter[relationType.id];
      if (!frontmatterLinks) continue;

      const links = Array.isArray(frontmatterLinks)
        ? frontmatterLinks
        : [frontmatterLinks];

      const relation = plugin.settings.discourseRelations.find(
        (rel) =>
          (rel.sourceId === activeNodeTypeId ||
            rel.destinationId === activeNodeTypeId) &&
          rel.relationshipTypeId === relationType.id,
      );

      if (!relation) continue;

      const isSource = relation.sourceId === activeNodeTypeId;
      const relationLabel = isSource
        ? relationType.label
        : relationType.complement;

      const relationKey = `${relationType.id}-${isSource}`;

      if (!tempRelationships.has(relationKey)) {
        tempRelationships.set(relationKey, {
          relationTypeOptions: {
            id: relationType.id,
            label: relationLabel,
            isSource,
          },
          linkedFiles: [],
        });
      }

      for (const link of links) {
        const match = link.match(/\[\[(.*?)\]\]/);
        if (!match) continue;

        const linkedFileName = match[1];
        const linkedFile = plugin.app.metadataCache.getFirstLinkpathDest(
          linkedFileName,
          activeFile.path,
        );

        if (!linkedFile) continue;

        const group = tempRelationships.get(relationKey);
        if (
          group &&
          !group.linkedFiles.some((file) => file.path === linkedFile.path)
        ) {
          group.linkedFiles.push(linkedFile);
        }
      }
    }

    setGroupedRelationships(Array.from(tempRelationships.values()));
  };

  if (groupedRelationships.length === 0) return null;

  return (
    <div className="current-relationships mb-6">
      <h4 className="mb-2 text-base font-medium">Current Relationships</h4>
      <ul className="border-modifier-border m-0 list-none rounded border p-0">
        {groupedRelationships.map((group) => (
          <li
            key={`${group.relationTypeOptions.id}-${group.relationTypeOptions.isSource}`}
            className="border-modifier-border border-b px-3 py-2"
          >
            <div className="mb-1 flex items-center">
              <div className="mr-2">
                {group.relationTypeOptions.isSource ? "→" : "←"}
              </div>
              <div className="font-bold">{group.relationTypeOptions.label}</div>
            </div>

            <ul className="m-0 ml-6 list-none p-0">
              {group.linkedFiles.map((file) => (
                <li key={file.path} className="mt-1">
                  <a
                    href="#"
                    className="text-accent-text"
                    onClick={(e) => {
                      e.preventDefault();
                      plugin.app.workspace.openLinkText(
                        file.path,
                        activeFile.path,
                      );
                    }}
                  >
                    {file.basename}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const RelationshipSection = ({
  activeFile,
}: RelationshipSectionProps) => {
  return (
    <div className="relationship-manager">
      <CurrentRelationships activeFile={activeFile} />
      <AddRelationship activeFile={activeFile} />
    </div>
  );
};
