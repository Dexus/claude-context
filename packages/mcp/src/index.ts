#!/usr/bin/env node

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY to avoid interfering with MCP JSON protocol
// Only MCP protocol messages should go to stdout
// Preserving original console methods for potential future restoration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _originalConsoleLog = console.log;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

// console.error already goes to stderr by default

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@dexus1985/claude-context-core";
import { LanceDBVectorDatabase } from "@dexus1985/claude-context-core";

// Import our modular components
import { createMcpConfig, logConfigurationSummary, showHelpMessage, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { SyncManager } from "./sync.js";
import { ToolHandlers } from "./handlers.js";

class ContextMcpServer {
    private server: Server;
    private context: Context;
    private snapshotManager: SnapshotManager;
    private syncManager: SyncManager;
    private toolHandlers: ToolHandlers;
    private config: ContextMcpConfig;

    constructor(config: ContextMcpConfig) {
        // Store config for later use
        this.config = config;
        // Initialize MCP server
        this.server = new Server(
            {
                name: config.name,
                version: config.version
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        // Initialize embedding provider
        console.log(`[EMBEDDING] Initializing embedding provider: ${config.embeddingProvider}`);
        console.log(`[EMBEDDING] Using model: ${config.embeddingModel}`);

        const embedding = createEmbeddingInstance(config);
        logEmbeddingProviderInfo(config, embedding);

        // Initialize vector database (LanceDB as default)
        console.log('[VECTORDB] Using LanceDB for local vector storage');
        const vectorDatabase = new LanceDBVectorDatabase({
            uri: process.env.LANCEDB_URI || '~/.claude-context/lancedb'
        });

        // Initialize Claude Context
        this.context = new Context({
            embedding,
            vectorDatabase
        });

        // Initialize managers
        this.snapshotManager = new SnapshotManager();
        this.syncManager = new SyncManager(this.context, this.snapshotManager);
        this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager, config);

        // Load existing codebase snapshot on startup
        this.snapshotManager.loadCodebaseSnapshot();

        this.setupTools();
    }

    private async initializeFileWatchers(): Promise<void> {
        // Only initialize file watcher if enabled in config
        if (!this.config.enableFileWatcher) {
            console.log('[FILEWATCHER] File watching is disabled in configuration');
            return;
        }

        console.log('[FILEWATCHER] Initializing file watchers for indexed codebases...');

        // Get list of indexed codebases from snapshot
        const indexedCodebases = this.snapshotManager.getIndexedCodebases();

        if (indexedCodebases.length === 0) {
            console.log('[FILEWATCHER] No indexed codebases found, skipping file watcher initialization');
            return;
        }

        console.log(`[FILEWATCHER] Found ${indexedCodebases.length} indexed codebase(s)`);

        // Start file watcher for each indexed codebase
        for (const codebasePath of indexedCodebases) {
            try {
                console.log(`[FILEWATCHER] Starting file watcher for: ${codebasePath}`);
                await this.context.startWatching(
                    codebasePath,
                    undefined, // Use default callback (auto reindex)
                    this.config.fileWatchDebounceMs || 1000
                );
                console.log(`[FILEWATCHER] ✓ File watcher started for: ${codebasePath}`);
            } catch (error) {
                console.error(`[FILEWATCHER] ✗ Failed to start file watcher for ${codebasePath}:`, error);
                // Continue with other codebases even if one fails
            }
        }

        console.log('[FILEWATCHER] File watcher initialization complete');
    }

    private setupTools() {
        const index_description = `
Index a codebase directory to enable semantic search using a configurable code splitter.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path to the target codebase.

✨ **Usage Guidance**:
- This tool is typically used when search fails due to an unindexed codebase.
- If indexing is attempted on an already indexed path, and a conflict is detected, you MUST prompt the user to confirm whether to proceed with a force index (i.e., re-indexing and overwriting the previous index).
`;


        const search_description = `
Search the indexed codebase using natural language queries within a specified absolute path.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.

🎯 **When to Use**:
This tool is versatile and can be used before completing various tasks to retrieve relevant context:
- **Code search**: Find specific functions, classes, or implementations
- **Context-aware assistance**: Gather relevant code context before making changes
- **Issue identification**: Locate problematic code sections or bugs
- **Code review**: Understand existing implementations and patterns
- **Refactoring**: Find all related code pieces that need to be updated
- **Feature development**: Understand existing architecture and similar implementations
- **Duplicate detection**: Identify redundant or duplicated code patterns across the codebase

✨ **Usage Guidance**:
- If the codebase is not indexed, this tool will return a clear error message indicating that indexing is required first.
- You can then use the index_codebase tool to index the codebase before searching again.
`;

        const agent_search_description = `
Perform multi-step, iterative code searches using an intelligent agent that can refine queries and combine results.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.

🎯 **When to Use agent_search vs search_code**:
Use **agent_search** for complex, exploratory tasks that benefit from multiple search iterations:
- **Multi-step discovery**: "Find all authentication code and related middleware"
- **Tracing dependencies**: "Find where UserService is implemented and all its callers"
- **Feature exploration**: "Show me the entire payment processing flow"
- **Related code discovery**: "Find error handling patterns across the codebase"
- **Cross-cutting concerns**: "Find all logging implementations and configuration"

Use **search_code** for simple, direct queries with known terminology:
- **Single function lookup**: "Find the calculateTotal function"
- **Specific class search**: "Find the UserController class"
- **Known patterns**: "Find React components using useState"

🔍 **Search Strategies**:
- **iterative** (default): Refines the query based on initial results, best for focused exploration
- **breadth-first**: Tries multiple related queries in parallel, best for comprehensive discovery
- **focused**: Identifies hotspots and searches within those areas, best for tracing code paths

✨ **Usage Guidance**:
- The agent will explain its search strategy and show all search steps taken
- Results are automatically deduplicated and combined across multiple searches
- If the codebase is not indexed, this tool will return a clear error message indicating that indexing is required first.
- Maximum iterations are clamped between 1-10 to prevent infinite loops
`;

        const get_watching_status_description = `
Get the current file watching status of an indexed codebase.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.
- File watching must be enabled in the MCP server configuration (ENABLE_FILE_WATCHER=true).

🎯 **When to Use**:
- **Check watcher status**: Verify if a codebase is being watched for file changes
- **View statistics**: See how many files are being watched and how many change events have been detected
- **Troubleshooting**: Diagnose why auto-reindexing may not be working

✨ **Usage Guidance**:
- This tool only works for indexed codebases
- Returns detailed statistics including watched file count, events processed, and watcher start time
- If file watching is disabled, this tool will return a message explaining how to enable it
`;

        const start_watching_description = `
Start watching an indexed codebase for file changes and enable automatic re-indexing.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.
- File watching must be enabled in the MCP server configuration (ENABLE_FILE_WATCHER=true).
- The codebase must be indexed first.

🎯 **When to Use**:
- **Enable auto-reindexing**: Automatically re-index when files change
- **Active development**: Keep the index up-to-date during coding sessions
- **Manual control**: Start watching when you need it, stop when you don't

✨ **Usage Guidance**:
- File changes are debounced (default 2000ms) to batch rapid edits
- Only changed files are re-indexed (incremental, not full rebuild)
- Re-indexing runs in background without blocking searches
- If already watching, you must stop first using stop_watching
`;

        // Define available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_codebase",
                        description: index_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to index.`
                                },
                                force: {
                                    type: "boolean",
                                    description: "Force re-indexing even if already indexed",
                                    default: false
                                },
                                splitter: {
                                    type: "string",
                                    description: "Code splitter to use: 'ast' for syntax-aware splitting with automatic fallback, 'langchain' for character-based splitting",
                                    enum: ["ast", "langchain"],
                                    default: "ast"
                                },
                                customExtensions: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional file extensions to include beyond defaults (e.g., ['.vue', '.svelte', '.astro']). Extensions should include the dot prefix or will be automatically added",
                                    default: []
                                },
                                ignorePatterns: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional ignore patterns to exclude specific files/directories beyond defaults. Only include this parameter if the user explicitly requests custom ignore patterns (e.g., ['static/**', '*.tmp', 'private/**'])",
                                    default: []
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "search_code",
                        description: search_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to search in.`
                                },
                                query: {
                                    type: "string",
                                    description: "Natural language query to search for in the codebase"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 10,
                                    maximum: 50
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: List of file extensions to filter results. (e.g., ['.ts','.py']).",
                                    default: []
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "agent_search",
                        description: agent_search_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to search in.`
                                },
                                query: {
                                    type: "string",
                                    description: "Natural language query describing what code you're looking for"
                                },
                                maxIterations: {
                                    type: "number",
                                    description: "Maximum number of search iterations the agent can perform (1-10)",
                                    default: 5,
                                    minimum: 1,
                                    maximum: 10
                                },
                                strategy: {
                                    type: "string",
                                    description: "Search strategy to use: 'iterative' (refines based on results), 'breadth-first' (tries multiple related queries), 'focused' (searches within hotspots)",
                                    enum: ["iterative", "breadth-first", "focused"],
                                    default: "iterative"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return per search",
                                    default: 10,
                                    maximum: 50
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: List of file extensions to filter results. (e.g., ['.ts','.py']).",
                                    default: []
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "clear_index",
                        description: `Clear the search index. IMPORTANT: You MUST provide an absolute path.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to clear.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: `Get the current indexing status of a codebase. Shows progress percentage for actively indexing codebases and completion status for indexed codebases.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to check status for.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "get_watching_status",
                        description: get_watching_status_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to check watching status for.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "start_watching",
                        description: start_watching_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the indexed codebase directory to start watching.`
                                },
                                debounceMs: {
                                    type: "number",
                                    description: "Optional debounce delay in milliseconds to batch rapid file changes. Default: 2000",
                                    default: 2000
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "stop_watching",
                        description: `Stop watching for file changes. Disables automatic re-indexing for the currently watched codebase.`,
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    },
                ]
            };
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "index_codebase":
                    return await this.toolHandlers.handleIndexCodebase(args);
                case "search_code":
                    return await this.toolHandlers.handleSearchCode(args);
                case "agent_search":
                    return await this.toolHandlers.handleAgentSearch(args);
                case "clear_index":
                    return await this.toolHandlers.handleClearIndex(args);
                case "get_indexing_status":
                    return await this.toolHandlers.handleGetIndexingStatus(args);
                case "get_watching_status":
                    return await this.toolHandlers.handleGetWatchingStatus(args);
                case "start_watching":
                    return await this.toolHandlers.handleStartWatching(args);
                case "stop_watching":
                    return await this.toolHandlers.handleStopWatching(args);

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    async start() {
        console.log('[SYNC-DEBUG] MCP server start() method called');
        console.log('Starting Context MCP server...');

        const transport = new StdioServerTransport();
        console.log('[SYNC-DEBUG] StdioServerTransport created, attempting server connection...');

        await this.server.connect(transport);
        console.log("MCP server started and listening on stdio.");
        console.log('[SYNC-DEBUG] Server connection established successfully');

        // Start background sync after server is connected
        console.log('[SYNC-DEBUG] Initializing background sync...');
        this.syncManager.startBackgroundSync();

        // Initialize file watchers for indexed codebases
        await this.initializeFileWatchers();

        console.log('[SYNC-DEBUG] MCP server initialization complete');
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        process.exit(0);
    }

    // Create configuration
    const config = createMcpConfig();
    logConfigurationSummary(config);

    const server = new ContextMcpServer(config);
    await server.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

// Always start the server - this is designed to be the main entry point
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});