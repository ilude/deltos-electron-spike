# Deltos Electron Spike

# Build all bundles
build:
    bun run build

# Build and launch the app
dev:
    bun run dev

# Run Biome linting and format checks
lint:
    bun run lint

# Auto-fix lint and formatting issues
lint-fix:
    bun run lint:fix

# Run TypeScript type checking (no emit)
typecheck:
    ./node_modules/.bin/tsc --noEmit

# Run all checks (lint + typecheck)
check: lint typecheck

# Install dependencies
install:
    bun install

# Clean build output
clean:
    rm -rf dist
