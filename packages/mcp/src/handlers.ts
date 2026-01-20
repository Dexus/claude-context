import * as fs from "fs";
import { Context, COLLECTION_LIMIT_MESSAGE } from "@dexus1985/claude-context-core";
import { SnapshotManager } from "./snapshot.js";
import { ensureAbsolutePath, trackCodebasePath, buildExtensionFilterExpression, formatSearchResult } from "./utils.js";
import { AgentSearch } from "./agent-search.js";
import { ContextMcpConfig } from "./config.js";

export class ToolHandlers {
    private context: Context;
    private snapshotManager: SnapshotManager;
    private indexingStats: { indexedFiles: number; totalChunks: number } | null = null;
    private currentWorkspace: string;
    private config: ContextMcpConfig;

    constructor(context: Context, snapshotManager: SnapshotManager, config: ContextMcpConfig) {
        this.context = context;
        this.snapshotManager = snapshotManager;
        this.config = config;
        this.currentWorkspace = process.cwd();
        console.log(`[WORKSPACE] Current workspace: ${this.currentWorkspace}`);
        console.log(`[WORKSPACE] File watching enabled: ${this.config.enableFileWatcher}`);
        if (this.config.enableFileWatcher) {
            console.log(`[WORKSPACE] File watch debounce: ${this.config.fileWatchDebounceMs}ms`);
        }
    }

    /**
     * Helper to handle collection limit errors consistently across handlers.
     * Returns a response object if the error is a collection limit error, null otherwise.
     * @param error The error to check
     * @param asError If true, sets isError: true in the response (used for indexing errors)
     */
    private handleCollectionLimitError(
        error: unknown,
        asError: boolean = false
    ): { content: { type: string; text: string }[]; isError?: boolean } | null {
        const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));

        if (errorMessage === COLLECTION_LIMIT_MESSAGE || errorMessage.includes(COLLECTION_LIMIT_MESSAGE)) {
            const response: { content: { type: string; text: string }[]; isError?: boolean } = {
                content: [{
                    type: "text",
                    text: COLLECTION_LIMIT_MESSAGE
                }]
            };
            if (asError) {
                response.isError = true;
            }
            return response;
        }

        return null;
    }

    /**
     * Sync indexed codebases from Zilliz Cloud collections
     * This method fetches all collections from the vector database,
     * gets the first document from each collection to extract codebasePath from metadata,
     * and updates the snapshot with discovered codebases.
     *
     * Logic: Compare mcp-codebase-snapshot.json with zilliz cloud collections
     * - If local snapshot has extra directories (not in cloud), remove them
     * - If local snapshot is missing directories (exist in cloud), ignore them
     */
    private async syncIndexedCodebasesFromCloud(): Promise<void> {
        try {
            console.log(`[SYNC-CLOUD] 🔄 Syncing indexed codebases from Zilliz Cloud...`);

            // Get all collections using the interface method
            const vectorDb = this.context.getVectorDatabase();

            // Use the new listCollections method from the interface
            const collections = await vectorDb.listCollections();

            console.log(`[SYNC-CLOUD] 📋 Found ${collections.length} collections in Zilliz Cloud`);

            if (collections.length === 0) {
                console.log(`[SYNC-CLOUD] ✅ No collections found in cloud`);
                // If no collections in cloud, remove all local codebases
                const localCodebases = this.snapshotManager.getIndexedCodebases();
                if (localCodebases.length > 0) {
                    console.log(`[SYNC-CLOUD] 🧹 Removing ${localCodebases.length} local codebases as cloud has no collections`);
                    for (const codebasePath of localCodebases) {
                        this.snapshotManager.removeIndexedCodebase(codebasePath);
                        console.log(`[SYNC-CLOUD] ➖ Removed local codebase: ${codebasePath}`);
                    }
                    this.snapshotManager.saveCodebaseSnapshot();
                    console.log(`[SYNC-CLOUD] 💾 Updated snapshot to match empty cloud state`);
                }
                return;
            }

            const cloudCodebases = new Set<string>();

            // Check each collection for codebase path
            for (const collectionName of collections) {
                try {
                    // Skip collections that don't match the code_chunks pattern (support both legacy and new collections)
                    if (!collectionName.startsWith('code_chunks_') && !collectionName.startsWith('hybrid_code_chunks_')) {
                        console.log(`[SYNC-CLOUD] ⏭️  Skipping non-code collection: ${collectionName}`);
                        continue;
                    }

                    console.log(`[SYNC-CLOUD] 🔍 Checking collection: ${collectionName}`);

                    // Query the first document to get metadata
                    const results = await vectorDb.query(
                        collectionName,
                        '', // Empty filter to get all results
                        ['metadata'], // Only fetch metadata field
                        1 // Only need one result to extract codebasePath
                    );

                    if (results && results.length > 0) {
                        const firstResult = results[0];
                        const metadataStr = firstResult.metadata;

                        if (metadataStr) {
                            try {
                                const metadata = JSON.parse(metadataStr);
                                const codebasePath = metadata.codebasePath;

                                if (codebasePath && typeof codebasePath === 'string') {
                                    console.log(`[SYNC-CLOUD] 📍 Found codebase path: ${codebasePath} in collection: ${collectionName}`);
                                    cloudCodebases.add(codebasePath);
                                } else {
                                    console.warn(`[SYNC-CLOUD] ⚠️  No codebasePath found in metadata for collection: ${collectionName}`);
                                }
                            } catch (parseError) {
                                console.warn(`[SYNC-CLOUD] ⚠️  Failed to parse metadata JSON for collection ${collectionName}:`, parseError);
                            }
                        } else {
                            console.warn(`[SYNC-CLOUD] ⚠️  No metadata found in collection: ${collectionName}`);
                        }
                    } else {
                        console.log(`[SYNC-CLOUD] ℹ️  Collection ${collectionName} is empty`);
                    }
                } catch (collectionError: any) {
                    console.warn(`[SYNC-CLOUD] ⚠️  Error checking collection ${collectionName}:`, collectionError.message || collectionError);
                    // Continue with next collection
                }
            }

            console.log(`[SYNC-CLOUD] 📊 Found ${cloudCodebases.size} valid codebases in cloud`);

            // Get current local codebases
            const localCodebases = new Set(this.snapshotManager.getIndexedCodebases());
            console.log(`[SYNC-CLOUD] 📊 Found ${localCodebases.size} local codebases in snapshot`);

            let hasChanges = false;

            // Remove local codebases that don't exist in cloud
            for (const localCodebase of localCodebases) {
                if (!cloudCodebases.has(localCodebase)) {
                    this.snapshotManager.removeIndexedCodebase(localCodebase);
                    hasChanges = true;
                    console.log(`[SYNC-CLOUD] ➖ Removed local codebase (not in cloud): ${localCodebase}`);
                }
            }

            // Note: We don't add cloud codebases that are missing locally (as per user requirement)
            console.log(`[SYNC-CLOUD] ℹ️  Skipping addition of cloud codebases not present locally (per sync policy)`);

            if (hasChanges) {
                this.snapshotManager.saveCodebaseSnapshot();
                console.log(`[SYNC-CLOUD] 💾 Updated snapshot to match cloud state`);
            } else {
                console.log(`[SYNC-CLOUD] ✅ Local snapshot already matches cloud state`);
            }

            console.log(`[SYNC-CLOUD] ✅ Cloud sync completed successfully`);
        } catch (error: any) {
            console.error(`[SYNC-CLOUD] ❌ Error syncing codebases from cloud:`, error.message || error);
            // Don't throw - this is not critical for the main functionality
        }
    }

    /**
     * Shared validation and preparation logic for search handlers.
     * Validates path, checks indexing status, and builds extension filter.
     */
    private async validateAndPrepareSearch(
        codebasePath: string,
        extensionFilter?: any[]
    ): Promise<
        | { success: true; absolutePath: string; isIndexing: boolean; indexingStatusMessage: string; filterExpr?: string }
        | { success: false; response: { content: { type: string; text: string }[]; isError: boolean } }
    > {
        // Sync indexed codebases from cloud first
        await this.syncIndexedCodebasesFromCloud();

        // Force absolute path resolution - warn if relative path provided
        const absolutePath = ensureAbsolutePath(codebasePath);

        // Validate path exists
        if (!fs.existsSync(absolutePath)) {
            return {
                success: false,
                response: {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                }
            };
        }

        // Check if it's a directory
        const stat = fs.statSync(absolutePath);
        if (!stat.isDirectory()) {
            return {
                success: false,
                response: {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                }
            };
        }

        trackCodebasePath(absolutePath);

        // Check if this codebase is indexed or being indexed
        const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
        const isIndexing = this.snapshotManager.getIndexingCodebases().includes(absolutePath);

        if (!isIndexed && !isIndexing) {
            return {
                success: false,
                response: {
                    content: [{
                        type: "text",
                        text: `Error: Codebase '${absolutePath}' is not indexed. Please index it first using the index_codebase tool.`
                    }],
                    isError: true
                }
            };
        }

        // Show indexing status if codebase is being indexed
        const indexingStatusMessage = isIndexing
            ? `\n⚠️  **Indexing in Progress**: This codebase is currently being indexed in the background. Search results may be incomplete until indexing completes.`
            : '';

        // Build filter expression from extensionFilter list using shared utility
        const filterResult = buildExtensionFilterExpression(extensionFilter);
        if (filterResult.error) {
            return {
                success: false,
                response: {
                    content: [{ type: 'text', text: filterResult.error }],
                    isError: true
                }
            };
        }

        return {
            success: true,
            absolutePath,
            isIndexing,
            indexingStatusMessage,
            filterExpr: filterResult.filterExpr
        };
    }

    public async handleIndexCodebase(args: any) {
        const { path: codebasePath, force, splitter, customExtensions, ignorePatterns } = args;
        const forceReindex = force || false;
        const splitterType = splitter || 'ast'; // Default to AST
        const customFileExtensions = customExtensions || [];
        const customIgnorePatterns = ignorePatterns || [];

        try {
            // Sync indexed codebases from cloud first
            await this.syncIndexedCodebasesFromCloud();

            // Validate splitter parameter
            if (splitterType !== 'ast' && splitterType !== 'langchain') {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Invalid splitter type '${splitterType}'. Must be 'ast' or 'langchain'.`
                    }],
                    isError: true
                };
            }
            // Force absolute path resolution - warn if relative path provided
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check if already indexing
            if (this.snapshotManager.getIndexingCodebases().includes(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Codebase '${absolutePath}' is already being indexed in the background. Please wait for completion.`
                    }],
                    isError: true
                };
            }

            //Check if the snapshot and cloud index are in sync
            if (this.snapshotManager.getIndexedCodebases().includes(absolutePath) !== await this.context.hasIndex(absolutePath)) {
                console.warn(`[INDEX-VALIDATION] ❌ Snapshot and cloud index mismatch: ${absolutePath}`);
            }

            // Check if already indexed (unless force is true)
            if (!forceReindex && this.snapshotManager.getIndexedCodebases().includes(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Codebase '${absolutePath}' is already indexed. Use force=true to re-index.`
                    }],
                    isError: true
                };
            }

            // If force reindex and codebase is already indexed, remove it
            if (forceReindex) {
                if (this.snapshotManager.getIndexedCodebases().includes(absolutePath)) {
                    console.log(`[FORCE-REINDEX] 🔄 Removing '${absolutePath}' from indexed list for re-indexing`);
                    this.snapshotManager.removeIndexedCodebase(absolutePath);
                }
                if (await this.context.hasIndex(absolutePath)) {
                    console.log(`[FORCE-REINDEX] 🔄 Clearing index for '${absolutePath}'`);
                    await this.context.clearIndex(absolutePath);
                }
            }

            // CRITICAL: Pre-index collection creation validation
            try {
                console.log(`[INDEX-VALIDATION] 🔍 Validating collection creation capability`);
                //dummy collection name
                const collectionName = `dummy_collection_${Date.now()}`;
                await this.context.getVectorDatabase().createCollection(collectionName, 128);
                if (await this.context.getVectorDatabase().hasCollection(collectionName)) {
                    console.log(`[INDEX-VALIDATION] ℹ️  Dummy collection created successfully`);
                    await this.context.getVectorDatabase().dropCollection(collectionName);
                } else {
                    console.log(`[INDEX-VALIDATION] ❌ Dummy collection creation failed`);
                }
                console.log(`[INDEX-VALIDATION] ✅  Collection creation validation completed`);
            } catch (validationError: any) {
                // Check for collection limit error
                const collectionLimitResponse = this.handleCollectionLimitError(validationError, true);
                if (collectionLimitResponse) {
                    console.error(`[INDEX-VALIDATION] ❌ Collection limit validation failed: ${absolutePath}`);
                    return collectionLimitResponse;
                }

                // Handle other collection creation errors
                console.error(`[INDEX-VALIDATION] ❌ Collection creation validation failed:`, validationError);
                return {
                    content: [{
                        type: "text",
                        text: `Error validating collection creation: ${validationError.message || validationError}`
                    }],
                    isError: true
                };
            }

            // Add custom extensions if provided
            if (customFileExtensions.length > 0) {
                console.log(`[CUSTOM-EXTENSIONS] Adding ${customFileExtensions.length} custom extensions: ${customFileExtensions.join(', ')}`);
                this.context.addCustomExtensions(customFileExtensions);
            }

            // Add custom ignore patterns if provided (before loading file-based patterns)
            if (customIgnorePatterns.length > 0) {
                console.log(`[IGNORE-PATTERNS] Adding ${customIgnorePatterns.length} custom ignore patterns: ${customIgnorePatterns.join(', ')}`);
                this.context.addCustomIgnorePatterns(customIgnorePatterns);
            }

            // Add to indexing list and save snapshot immediately
            this.snapshotManager.addIndexingCodebase(absolutePath);
            this.snapshotManager.saveCodebaseSnapshot();

            // Track the codebase path for syncing
            trackCodebasePath(absolutePath);

            // Start background indexing - now safe to proceed
            this.startBackgroundIndexing(absolutePath, forceReindex, splitterType);

            const pathInfo = codebasePath !== absolutePath
                ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${absolutePath}'`
                : '';

            const extensionInfo = customFileExtensions.length > 0
                ? `\nUsing ${customFileExtensions.length} custom extensions: ${customFileExtensions.join(', ')}`
                : '';

            const ignoreInfo = customIgnorePatterns.length > 0
                ? `\nUsing ${customIgnorePatterns.length} custom ignore patterns: ${customIgnorePatterns.join(', ')}`
                : '';

            return {
                content: [{
                    type: "text",
                    text: `Started background indexing for codebase '${absolutePath}' using ${splitterType.toUpperCase()} splitter.${pathInfo}${extensionInfo}${ignoreInfo}\n\nIndexing is running in the background. You can search the codebase while indexing is in progress, but results may be incomplete until indexing completes.`
                }]
            };

        } catch (error: any) {
            // Enhanced error handling to prevent MCP service crash
            console.error('Error in handleIndexCodebase:', error);

            // Ensure we always return a proper MCP response, never throw
            return {
                content: [{
                    type: "text",
                    text: `Error starting indexing: ${error.message || error}`
                }],
                isError: true
            };
        }
    }

    private async startBackgroundIndexing(codebasePath: string, forceReindex: boolean, splitterType: string) {
        const absolutePath = codebasePath;
        let lastSaveTime = 0; // Track last save timestamp

        try {
            console.log(`[BACKGROUND-INDEX] Starting background indexing for: ${absolutePath}`);

            // Note: If force reindex, collection was already cleared during validation phase
            if (forceReindex) {
                console.log(`[BACKGROUND-INDEX] ℹ️  Force reindex mode - collection was already cleared during validation`);
            }

            // Use the existing Context instance for indexing.
            const contextForThisTask = this.context;
            if (splitterType !== 'ast') {
                console.warn(`[BACKGROUND-INDEX] Non-AST splitter '${splitterType}' requested; falling back to AST splitter`);
            }

            // Load ignore patterns from files first (including .ignore, .gitignore, etc.)
            await this.context.getLoadedIgnorePatterns(absolutePath);

            // Initialize file synchronizer with proper ignore patterns (including project-specific patterns)
            const { FileSynchronizer } = await import("@dexus1985/claude-context-core");
            const ignorePatterns = this.context.getIgnorePatterns() || [];
            console.log(`[BACKGROUND-INDEX] Using ignore patterns: ${ignorePatterns.join(', ')}`);
            const synchronizer = new FileSynchronizer(absolutePath, ignorePatterns);
            await synchronizer.initialize();

            // Store synchronizer in the context (let context manage collection names)
            await this.context.getPreparedCollection(absolutePath);
            const collectionName = this.context.getCollectionName(absolutePath);
            this.context.setSynchronizer(collectionName, synchronizer);
            if (contextForThisTask !== this.context) {
                contextForThisTask.setSynchronizer(collectionName, synchronizer);
            }

            console.log(`[BACKGROUND-INDEX] Starting indexing with ${splitterType} splitter for: ${absolutePath}`);

            // Log embedding provider information before indexing
            const embeddingProvider = this.context.getEmbedding();
            console.log(`[BACKGROUND-INDEX] 🧠 Using embedding provider: ${embeddingProvider.getProvider()} with dimension: ${embeddingProvider.getDimension()}`);

            // Start indexing with the appropriate context and progress tracking
            console.log(`[BACKGROUND-INDEX] 🚀 Beginning codebase indexing process...`);
            const stats = await contextForThisTask.indexCodebase(absolutePath, (progress) => {
                // Update progress in snapshot manager
                this.snapshotManager.updateIndexingProgress(absolutePath, progress.percentage);

                // Save snapshot periodically (every 2 seconds to avoid too frequent saves)
                const currentTime = Date.now();
                if (currentTime - lastSaveTime >= 2000) { // 2 seconds = 2000ms
                    this.snapshotManager.saveCodebaseSnapshot();
                    lastSaveTime = currentTime;
                    console.log(`[BACKGROUND-INDEX] 💾 Saved progress snapshot at ${progress.percentage.toFixed(1)}%`);
                }

                console.log(`[BACKGROUND-INDEX] Progress: ${progress.phase} - ${progress.percentage}% (${progress.current}/${progress.total})`);
            });
            console.log(`[BACKGROUND-INDEX] ✅ Indexing completed successfully! Files: ${stats.indexedFiles}, Chunks: ${stats.totalChunks}`);

            // Move from indexing to indexed list
            this.snapshotManager.moveFromIndexingToIndexed(absolutePath);
            this.indexingStats = { indexedFiles: stats.indexedFiles, totalChunks: stats.totalChunks };

            // Save snapshot after updating codebase lists
            this.snapshotManager.saveCodebaseSnapshot();

            // Start file watcher if enabled in configuration
            if (this.config.enableFileWatcher) {
                try {
                    console.log(`[BACKGROUND-INDEX] 👀 Starting file watcher for indexed codebase: ${absolutePath}`);
                    await this.context.startWatching(
                        absolutePath,
                        undefined, // Use default callback (auto reindex)
                        this.config.fileWatchDebounceMs || 1000
                    );
                    console.log(`[BACKGROUND-INDEX] ✅ File watcher started successfully for: ${absolutePath}`);
                } catch (watcherError: any) {
                    console.error(`[BACKGROUND-INDEX] ⚠️  Failed to start file watcher for ${absolutePath}:`, watcherError.message || watcherError);
                    // Don't fail indexing if file watcher fails to start
                }
            } else {
                console.log(`[BACKGROUND-INDEX] ℹ️  File watching is disabled, skipping file watcher start for: ${absolutePath}`);
            }

            let message = `Background indexing completed for '${absolutePath}' using ${splitterType.toUpperCase()} splitter.\nIndexed ${stats.indexedFiles} files, ${stats.totalChunks} chunks.`;
            if (stats.status === 'limit_reached') {
                message += `\n⚠️  Warning: Indexing stopped because the chunk limit (450,000) was reached. The index may be incomplete.`;
            }

            console.log(`[BACKGROUND-INDEX] ${message}`);

        } catch (error: any) {
            console.error(`[BACKGROUND-INDEX] Error during indexing for ${absolutePath}:`, error);
            // Remove from indexing list on error
            this.snapshotManager.removeIndexingCodebase(absolutePath);
            this.snapshotManager.saveCodebaseSnapshot();

            // Log error but don't crash MCP service - indexing errors are handled gracefully
            console.error(`[BACKGROUND-INDEX] Indexing failed for ${absolutePath}: ${error.message || error}`);
        }
    }

    public async handleSearchCode(args: any) {
        const { path: codebasePath, query, limit = 10, extensionFilter, enableRanking = true } = args;
        const resultLimit = limit || 10;

        try {
            // Use shared validation helper
            const validation = await this.validateAndPrepareSearch(codebasePath, extensionFilter);
            if (!validation.success) {
                return validation.response;
            }

            const { absolutePath, isIndexing, indexingStatusMessage, filterExpr } = validation;

            console.log(`[SEARCH] Searching in codebase: ${absolutePath}`);
            console.log(`[SEARCH] Query: "${query}"`);
            console.log(`[SEARCH] Indexing status: ${isIndexing ? 'In Progress' : 'Completed'}`);

            // Log embedding provider information before search
            const embeddingProvider = this.context.getEmbedding();
            console.log(`[SEARCH] 🧠 Using embedding provider: ${embeddingProvider.getProvider()} for search`);
            console.log(`[SEARCH] 🔍 Generating embeddings for query using ${embeddingProvider.getProvider()}...`);

            // Search in the specified codebase
            const searchResults = await this.context.semanticSearch(
                absolutePath,
                query,
                Math.min(resultLimit, 50),
                0.3,
                filterExpr,
                enableRanking
            );

            console.log(`[SEARCH] ✅ Search completed! Found ${searchResults.length} results using ${embeddingProvider.getProvider()} embeddings`);

            if (searchResults.length === 0) {
                let noResultsMessage = `No results found for query: "${query}" in codebase '${absolutePath}'`;
                if (isIndexing) {
                    noResultsMessage += `\n\nNote: This codebase is still being indexed. Try searching again after indexing completes, or the query may not match any indexed content.`;
                }
                return {
                    content: [{
                        type: "text",
                        text: noResultsMessage
                    }]
                };
            }

            // Format results using shared utility
            const formattedResults = searchResults.map((result: any, index: number) =>
                formatSearchResult(result, index, absolutePath, false)
            ).join('\n');

            let resultMessage = `Found ${searchResults.length} results for query: "${query}" in codebase '${absolutePath}'${indexingStatusMessage}\n\n${formattedResults}`;

            if (isIndexing) {
                resultMessage += `\n\n💡 **Tip**: This codebase is still being indexed. More results may become available as indexing progresses.`;
            }

            return {
                content: [{
                    type: "text",
                    text: resultMessage
                }]
            };
        } catch (error) {
            // Check for collection limit error (returned as successful response so LLM doesn't retry)
            const collectionLimitResponse = this.handleCollectionLimitError(error);
            if (collectionLimitResponse) {
                return collectionLimitResponse;
            }

            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
            return {
                content: [{
                    type: "text",
                    text: `Error searching code: ${errorMessage} Please check if the codebase has been indexed first.`
                }],
                isError: true
            };
        }
    }

    public async handleAgentSearch(args: any) {
        const { path: codebasePath, query, maxIterations = 5, strategy = 'iterative', limit = 10, extensionFilter } = args;

        try {
            // Validate strategy parameter (specific to agent search)
            const validStrategies = ['iterative', 'breadth-first', 'focused'];
            if (!validStrategies.includes(strategy)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Invalid strategy '${strategy}'. Must be one of: ${validStrategies.join(', ')}`
                    }],
                    isError: true
                };
            }

            // Validate maxIterations (specific to agent search)
            const iterations = Math.max(1, Math.min(maxIterations, 10));
            if (iterations !== maxIterations) {
                console.log(`[AGENT-SEARCH] ⚠️  maxIterations clamped from ${maxIterations} to ${iterations}`);
            }

            // Use shared validation helper
            const validation = await this.validateAndPrepareSearch(codebasePath, extensionFilter);
            if (!validation.success) {
                return validation.response;
            }

            const { absolutePath, isIndexing, indexingStatusMessage, filterExpr } = validation;

            console.log(`[AGENT-SEARCH] Starting agent search in codebase: ${absolutePath}`);
            console.log(`[AGENT-SEARCH] Query: "${query}"`);
            console.log(`[AGENT-SEARCH] Strategy: ${strategy}`);
            console.log(`[AGENT-SEARCH] Max iterations: ${iterations}`);
            console.log(`[AGENT-SEARCH] Indexing status: ${isIndexing ? 'In Progress' : 'Completed'}`);

            // Log embedding provider information before search
            const embeddingProvider = this.context.getEmbedding();
            console.log(`[AGENT-SEARCH] 🧠 Using embedding provider: ${embeddingProvider.getProvider()} for search`);

            // Create and execute agent search
            const agentSearch = new AgentSearch(this.context, iterations);
            const result = await agentSearch.execute(
                absolutePath,
                query,
                strategy,
                Math.min(limit, 50),
                filterExpr
            );

            console.log(`[AGENT-SEARCH] ✅ Agent search completed! ${result.combinedResults.length} unique results across ${result.steps.length} steps`);

            if (result.combinedResults.length === 0) {
                let noResultsMessage = `No results found for query: "${query}" in codebase '${absolutePath}'\n\n${result.summary}`;
                if (isIndexing) {
                    noResultsMessage += `\n\nNote: This codebase is still being indexed. Try searching again after indexing completes, or the query may not match any indexed content.`;
                }
                return {
                    content: [{
                        type: "text",
                        text: noResultsMessage
                    }]
                };
            }

            // Format results using shared utility (show score for agent search)
            const formattedResults = result.combinedResults.map((searchResult: any, index: number) =>
                formatSearchResult(searchResult, index, absolutePath, true)
            ).join('\n');

            let resultMessage = `${result.summary}${indexingStatusMessage}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nFound ${result.combinedResults.length} unique results:\n\n${formattedResults}`;

            if (isIndexing) {
                resultMessage += `\n\n💡 **Tip**: This codebase is still being indexed. More results may become available as indexing progresses.`;
            }

            return {
                content: [{
                    type: "text",
                    text: resultMessage
                }]
            };
        } catch (error) {
            // Check for collection limit error (returned as successful response so LLM doesn't retry)
            const collectionLimitResponse = this.handleCollectionLimitError(error);
            if (collectionLimitResponse) {
                return collectionLimitResponse;
            }

            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
            return {
                content: [{
                    type: "text",
                    text: `Error in agent search: ${errorMessage} Please check if the codebase has been indexed first.`
                }],
                isError: true
            };
        }
    }

    public async handleClearIndex(args: any) {
        const { path: codebasePath } = args;

        if (this.snapshotManager.getIndexedCodebases().length === 0 && this.snapshotManager.getIndexingCodebases().length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "No codebases are currently indexed or being indexed."
                }]
            };
        }

        try {
            // Force absolute path resolution - warn if relative path provided
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check if this codebase is indexed or being indexed
            const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
            const isIndexing = this.snapshotManager.getIndexingCodebases().includes(absolutePath);

            if (!isIndexed && !isIndexing) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Codebase '${absolutePath}' is not indexed or being indexed.`
                    }],
                    isError: true
                };
            }

            console.log(`[CLEAR] Clearing codebase: ${absolutePath}`);

            // Stop file watcher if it's running
            try {
                await this.context.stopWatching();
                console.log(`[CLEAR] Stopped file watcher for: ${absolutePath}`);
            } catch (watcherError: any) {
                console.warn(`[CLEAR] Failed to stop file watcher for ${absolutePath}:`, watcherError.message || watcherError);
                // Continue with clearing even if stopping watcher fails
            }

            try {
                await this.context.clearIndex(absolutePath);
                console.log(`[CLEAR] Successfully cleared index for: ${absolutePath}`);
            } catch (error: any) {
                const errorMsg = `Failed to clear ${absolutePath}: ${error.message}`;
                console.error(`[CLEAR] ${errorMsg}`);
                return {
                    content: [{
                        type: "text",
                        text: errorMsg
                    }],
                    isError: true
                };
            }

            // Remove the cleared codebase from both lists
            this.snapshotManager.removeIndexedCodebase(absolutePath);
            this.snapshotManager.removeIndexingCodebase(absolutePath);

            // Reset indexing stats if this was the active codebase
            this.indexingStats = null;

            // Save snapshot after clearing index
            this.snapshotManager.saveCodebaseSnapshot();

            let resultText = `Successfully cleared codebase '${absolutePath}'`;

            const remainingIndexed = this.snapshotManager.getIndexedCodebases().length;
            const remainingIndexing = this.snapshotManager.getIndexingCodebases().length;

            if (remainingIndexed > 0 || remainingIndexing > 0) {
                resultText += `\n${remainingIndexed} other indexed codebase(s) and ${remainingIndexing} indexing codebase(s) remain`;
            }

            return {
                content: [{
                    type: "text",
                    text: resultText
                }]
            };
        } catch (error) {
            // Check for collection limit error (returned as successful response so LLM doesn't retry)
            const collectionLimitResponse = this.handleCollectionLimitError(error);
            if (collectionLimitResponse) {
                return collectionLimitResponse;
            }

            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
            return {
                content: [{
                    type: "text",
                    text: `Error clearing index: ${errorMessage}`
                }],
                isError: true
            };
        }
    }

    public async handleGetIndexingStatus(args: any) {
        const { path: codebasePath } = args;

        try {
            // Force absolute path resolution
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check indexing status
            const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
            const isIndexing = this.snapshotManager.getIndexingCodebases().includes(absolutePath);
            const indexingProgress = this.snapshotManager.getIndexingProgress(absolutePath);

            let statusMessage = '';

            if (isIndexed) {
                statusMessage = `✅ Codebase '${absolutePath}' is fully indexed and ready for search.`;
            } else if (isIndexing) {
                const progressPercentage = indexingProgress !== undefined ? indexingProgress : 0;
                statusMessage = `🔄 Codebase '${absolutePath}' is currently being indexed. Progress: ${progressPercentage.toFixed(1)}%`;

                // Add more detailed status based on progress
                if (progressPercentage < 10) {
                    statusMessage += ' (Preparing and scanning files...)';
                } else if (progressPercentage < 100) {
                    statusMessage += ' (Processing files and generating embeddings...)';
                }
            } else {
                statusMessage = `❌ Codebase '${absolutePath}' is not indexed. Please use the index_codebase tool to index it first.`;
            }

            const pathInfo = codebasePath !== absolutePath
                ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${absolutePath}'`
                : '';

            return {
                content: [{
                    type: "text",
                    text: statusMessage + pathInfo
                }]
            };

        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting indexing status: ${error.message || error}`
                }],
                isError: true
            };
        }
    }
}
