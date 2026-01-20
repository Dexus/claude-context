#!/bin/bash

# Manual Verification Test for File Change Detection & Auto Re-indexing
# This script creates a test repository, indexes it, modifies files, and verifies auto-reindex works

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="/tmp/claude-context-file-watch-test-$$"
MCP_SERVER_PID=""
TEST_PASSED=true

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    TEST_PASSED=false
}

cleanup() {
    log_info "Cleaning up..."

    # Stop MCP server if running
    if [ -n "$MCP_SERVER_PID" ]; then
        log_info "Stopping MCP server (PID: $MCP_SERVER_PID)..."
        kill $MCP_SERVER_PID 2>/dev/null || true
        wait $MCP_SERVER_PID 2>/dev/null || true
    fi

    # Remove test directory
    if [ -d "$TEST_DIR" ]; then
        log_info "Removing test directory: $TEST_DIR"
        rm -rf "$TEST_DIR"
    fi

    log_info "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if we're in the right directory
if [ ! -f "packages/mcp/package.json" ]; then
    log_error "Must be run from the workspace root (where packages/mcp/package.json exists)"
    exit 1
fi

# Parse command line arguments
SKIP_MCP_START=${SKIP_MCP_START:-false}

log_info "=========================================="
log_info "File Watcher Manual Verification Test"
log_info "=========================================="
log_info ""

# Step 1: Create temporary test directory with sample TypeScript files
log_info "Step 1: Creating test repository..."
mkdir -p "$TEST_DIR/src"
cd "$TEST_DIR"

# Initialize as a TypeScript project
cat > package.json << 'EOF'
{
  "name": "test-codebase",
  "version": "1.0.0",
  "description": "Test repository for file watching",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
  },
  "include": ["src/**/*"]
}
EOF

# Create sample TypeScript files
cat > src/index.ts << 'EOF'
/**
 * Main entry point for the test application
 */
export class Application {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    start(): void {
        console.log(`Starting ${this.name}...`);
    }

    stop(): void {
        console.log(`Stopping ${this.name}...`);
    }
}

const app = new Application("TestApp");
app.start();
EOF

cat > src/utils.ts << 'EOF'
/**
 * Utility functions for the test application
 */
export function greet(name: string): string {
    return `Hello, ${name}!`;
}

export function farewell(name: string): string {
    return `Goodbye, ${name}!`;
}

export function add(a: number, b: number): number {
    return a + b;
}
EOF

cat > src/config.ts << 'EOF'
/**
 * Configuration management
 */
export interface Config {
    port: number;
    host: string;
    debug: boolean;
}

export const defaultConfig: Config = {
    port: 3000,
    host: 'localhost',
    debug: false
};
EOF

log_success "Test repository created at: $TEST_DIR"
log_info "Created files:"
log_info "  - package.json"
log_info "  - tsconfig.json"
log_info "  - src/index.ts"
log_info "  - src/utils.ts"
log_info "  - src/config.ts"
log_info ""

# Step 2: Instructions for starting MCP server
log_info "Step 2: MCP Server Setup"
log_info "========================================"

cd - > /dev/null  # Return to workspace root

if [ "$SKIP_MCP_START" = "true" ]; then
    log_warning "SKIP_MCP_START is set - assuming MCP server is already running"
    log_info "Please ensure:"
    log_info "  1. MCP server is running with ENABLE_FILE_WATCHER=true"
    log_info "  2. Server is accessible and ready to accept requests"
else
    log_info "To test file watching, you need to start the MCP server in a separate terminal:"
    log_info ""
    log_info "  cd $(pwd)"
    log_info "  ENABLE_FILE_WATCHER=true FILE_WATCH_DEBOUNCE_MS=2000 pnpm --filter @dannyboy2042/claude-context-mcp dev"
    log_info ""
    log_warning "Press Enter when you have started the MCP server..."
    read -r
fi

log_info ""

# Step 3: Create a test script to interact with MCP
log_info "Step 3: Creating MCP interaction script..."
cat > /tmp/test-filewatch-mcp.js << 'EOFSCRIPT'
#!/usr/bin/env node

/**
 * Test script to verify file watching functionality
 * This script simulates MCP tool calls to index and search
 */

const fs = require('fs');
const path = require('path');

// This would normally be done through MCP protocol
// For manual testing, we're providing instructions

const TEST_DIR = process.argv[2];
if (!TEST_DIR) {
    console.error('Usage: node test-filewatch-mcp.js <test-dir>');
    process.exit(1);
}

console.log('==========================================');
console.log('Manual File Watching Verification Steps');
console.log('==========================================');
console.log('');
console.log('Test Directory:', TEST_DIR);
console.log('');
console.log('STEP 1: Index the test directory');
console.log('  Use the index_codebase MCP tool with:');
console.log('  {');
console.log('    "codebasePath": "' + TEST_DIR + '"');
console.log('  }');
console.log('');
console.log('  Expected output:');
console.log('    - "[FILEWATCHER] Starting file watcher for codebase: ..."');
console.log('    - "[FILEWATCHER] File watcher started with debounce interval: 2000ms"');
console.log('    - Indexing should complete successfully');
console.log('');
console.log('STEP 2: Modify a file in the test directory');
console.log('  Edit one of these files:');
console.log('    - ' + path.join(TEST_DIR, 'src', 'utils.ts'));
console.log('    - ' + path.join(TEST_DIR, 'src', 'config.ts'));
console.log('');
console.log('  Add a new function or modify an existing one, for example:');
console.log('');
console.log('  export function multiply(a: number, b: number): number {');
console.log('      return a * b;');
console.log('  }');
console.log('');
console.log('STEP 3: Wait for debounce period');
console.log('  Wait at least 2-3 seconds for the debounce to trigger');
console.log('');
console.log('STEP 4: Verify re-indexing occurred');
console.log('  Expected log output:');
console.log('    - "[FILEWATCHER] Detected file changes: [\\"path/to/file\\"]"');
console.log('    - "[FILEWATCHER] Debouncing changes for 2000ms..."');
console.log('    - "[FILEWATCHER] Processing 1 pending changes"');
console.log('    - "📢 NOTIFICATION: Auto-reindexing completed - Added: X, Removed: Y, Modified: Z"');
console.log('');
console.log('STEP 5: Search for the modified content');
console.log('  Use the search_codebase MCP tool with:');
console.log('  {');
console.log('    "query": "multiply function"');
console.log('  }');
console.log('');
console.log('  Expected: The newly added function should appear in search results');
console.log('');
console.log('STEP 6: Test multiple rapid changes (debounce verification)');
console.log('  1. Quickly modify 2-3 files');
console.log('  2. Wait 3 seconds');
console.log('  3. Verify only ONE re-indexing occurred (all changes batched)');
console.log('');
console.log('  Expected log output:');
console.log('    - "[FILEWATCHER] Detected file changes: [\\"file1.ts\\", \\"file2.ts\\", \\"file3.ts\\"]"');
console.log('    - "[FILEWATCHER] Debouncing changes for 2000ms..."');
console.log('    - "[FILEWATCHER] Processing 3 pending changes"');
console.log('    - Single "NOTIFICATION: Auto-reindexing completed" message');
console.log('');
console.log('STEP 7: Test file deletion');
console.log('  1. Create a new file: ' + path.join(TEST_DIR, 'src', 'temp.ts'));
console.log('  2. Wait for re-indexing');
console.log('  3. Delete the file');
console.log('  4. Wait for re-indexing');
console.log('  5. Search for content from the deleted file');
console.log('');
console.log('  Expected: Deleted file content should not appear in search results');
console.log('');
console.log('==========================================');
console.log('Verification Checklist');
console.log('==========================================');
console.log('');
console.log('After completing the steps above, verify:');
console.log('');
console.log('[ ] File watcher started successfully on indexing');
console.log('[ ] File changes are detected within 1 second');
console.log('[ ] Re-indexing triggers after 2-second debounce');
console.log('[ ] Log shows correct file change counts (Added/Removed/Modified)');
console.log('[ ] Modified content appears in search results');
console.log('[ ] Deleted content is removed from search results');
console.log('[ ] Multiple rapid changes are batched into single re-index');
console.log('[ ] No duplicate re-indexing occurs for the same changes');
console.log('[ ] File watcher does not block search operations');
console.log('');
EOFSCRIPT

chmod +x /tmp/test-filewatch-mcp.js
log_success "Test script created: /tmp/test-filewatch-mcp.js"
log_info ""

# Step 4: Run the instructions
log_info "Step 4: Manual Verification Instructions"
log_info "========================================"
node /tmp/test-filewatch-mcp.js "$TEST_DIR"
log_info ""

# Step 5: Create a helper script to automate file modifications
log_info "Step 5: Creating file modification helper..."
cat > /tmp/modify-test-files.sh << 'EOFSCRIPT'
#!/bin/bash

TEST_DIR="$1"
ACTION="$2"

if [ -z "$TEST_DIR" ]; then
    echo "Usage: modify-test-files.sh <test-dir> <action>"
    echo "Actions: add, modify, delete, multiple"
    exit 1
fi

case "$ACTION" in
    add)
        echo "Adding new file: $TEST_DIR/src/new-feature.ts"
        cat > "$TEST_DIR/src/new-feature.ts" << 'EOF'
/**
 * New feature added for testing
 */
export function newFeature(): string {
    return "This is a new feature!";
}
EOF
        echo "File added successfully"
        ;;

    modify)
        echo "Modifying file: $TEST_DIR/src/utils.ts"
        # Add a new function to utils.ts
        echo "" >> "$TEST_DIR/src/utils.ts"
        echo "/**" >> "$TEST_DIR/src/utils.ts"
        echo " * Newly added function for testing auto-reindex" >> "$TEST_DIR/src/utils.ts"
        echo " */" >> "$TEST_DIR/src/utils.ts"
        echo "export function multiply(a: number, b: number): number {" >> "$TEST_DIR/src/utils.ts"
        echo "    return a * b;" >> "$TEST_DIR/src/utils.ts"
        echo "}" >> "$TEST_DIR/src/utils.ts"
        echo "File modified successfully"
        ;;

    delete)
        if [ -f "$TEST_DIR/src/new-feature.ts" ]; then
            echo "Deleting file: $TEST_DIR/src/new-feature.ts"
            rm "$TEST_DIR/src/new-feature.ts"
            echo "File deleted successfully"
        else
            echo "File $TEST_DIR/src/new-feature.ts does not exist"
            echo "Run 'add' action first to create it"
        fi
        ;;

    multiple)
        echo "Making multiple rapid changes..."
        echo "1. Modifying utils.ts..."
        echo "" >> "$TEST_DIR/src/utils.ts"
        echo "export function divide(a: number, b: number): number { return a / b; }" >> "$TEST_DIR/src/utils.ts"
        sleep 0.5

        echo "2. Modifying config.ts..."
        echo "" >> "$TEST_DIR/src/config.ts"
        echo "export const environment = 'test';" >> "$TEST_DIR/src/config.ts"
        sleep 0.5

        echo "3. Modifying index.ts..."
        sed -i.bak 's/TestApp/UpdatedTestApp/g' "$TEST_DIR/src/index.ts"
        rm "$TEST_DIR/src/index.ts.bak"
        sleep 0.5

        echo "Multiple changes completed. These should be batched into one re-index."
        ;;

    *)
        echo "Unknown action: $ACTION"
        echo "Available actions: add, modify, delete, multiple"
        exit 1
        ;;
esac
EOFSCRIPT

chmod +x /tmp/modify-test-files.sh
log_success "File modification helper created: /tmp/modify-test-files.sh"
log_info ""
log_info "Usage examples:"
log_info "  /tmp/modify-test-files.sh $TEST_DIR add       # Add a new file"
log_info "  /tmp/modify-test-files.sh $TEST_DIR modify    # Modify existing file"
log_info "  /tmp/modify-test-files.sh $TEST_DIR delete    # Delete file"
log_info "  /tmp/modify-test-files.sh $TEST_DIR multiple  # Multiple rapid changes"
log_info ""

# Step 6: Summary
log_info "=========================================="
log_info "Test Environment Ready"
log_info "=========================================="
log_info ""
log_info "Test Directory: $TEST_DIR"
log_info ""
log_info "Files created:"
find "$TEST_DIR" -type f | sort
log_info ""
log_info "Helper Scripts:"
log_info "  - /tmp/test-filewatch-mcp.js      - Shows testing instructions"
log_info "  - /tmp/modify-test-files.sh       - Modifies test files"
log_info ""
log_info "Next Steps:"
log_info "  1. Start MCP server with file watching enabled"
log_info "  2. Follow the instructions in /tmp/test-filewatch-mcp.js"
log_info "  3. Use /tmp/modify-test-files.sh to make file changes"
log_info "  4. Verify logs show auto-reindexing working"
log_info "  5. Complete the verification checklist"
log_info ""
log_info "When done, press Ctrl+C or just exit - cleanup will happen automatically"
log_info ""

# Keep the script running so test directory persists
log_info "Test environment is ready. Waiting for you to complete manual testing..."
log_info "Test directory will be cleaned up when you exit this script."
log_info ""

# Wait indefinitely (until user interrupts)
sleep 86400  # Sleep for 24 hours (will be killed by trap on exit)
