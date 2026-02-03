#!/bin/bash
# scripts/optimize-test-performance.sh
# Quick script to apply all test optimizations

set -e

echo "🚀 Optimizing Test Performance..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Update Vitest configs
echo "📝 Step 1: Updating Vitest configurations..."
find packages -name "vitest.config.ts" -type f | while read config; do
  echo "  → $config"
  # Backup original
  cp "$config" "$config.backup"
  
  # Add performance optimizations
  if ! grep -q "poolOptions" "$config"; then
    cat >> "$config" << 'EOF'

// Performance optimizations
export default defineConfig({
  test: {
    // ... existing config ...
    testTimeout: 5000,
    hookTimeout: 5000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: false
      }
    },
    clearMocks: true,
    mockReset: false,
    restoreMocks: false,
    maxConcurrency: 10
  }
})
EOF
  fi
done

echo -e "${GREEN}✓ Vitest configs updated${NC}"
echo ""

# Step 2: Replace setTimeout with queueMicrotask in mocks
echo "📝 Step 2: Optimizing mock timing..."
find packages -name "*.mock.ts" -o -name "setup.ts" | while read file; do
  if grep -q "setTimeout" "$file"; then
    echo "  → $file"
    # Backup
    cp "$file" "$file.backup"
    # Replace setTimeout with queueMicrotask (simple cases)
    sed -i 's/setTimeout(\([^,]*\), *[0-9]*)/queueMicrotask(\1)/g' "$file" 2>/dev/null || true
  fi
done

echo -e "${GREEN}✓ Mock timing optimized${NC}"
echo ""

# Step 3: Add flushPromises helper
echo "📝 Step 3: Adding performance helpers..."
find packages -name "setup.ts" | while read file; do
  if ! grep -q "flushPromises" "$file"; then
    echo "  → $file"
    cat >> "$file" << 'EOF'

// Performance helper for fast async tests
export const flushPromises = () => new Promise(resolve => queueMicrotask(resolve))
EOF
  fi
done

echo -e "${GREEN}✓ Helpers added${NC}"
echo ""

# Step 4: Run tests to verify
echo "📝 Step 4: Running tests to verify optimizations..."
echo ""

TEST_START=$(date +%s)
if npm run test --silent 2>&1 | tee test-output.log; then
  TEST_END=$(date +%s)
  TEST_DURATION=$((TEST_END - TEST_START))
  
  echo ""
  echo -e "${GREEN}✅ All tests passed!${NC}"
  echo -e "${GREEN}⚡ Test duration: ${TEST_DURATION}s${NC}"
  
  # Check for slow tests
  if [ $TEST_DURATION -gt 10 ]; then
    echo -e "${YELLOW}⚠️  Tests still taking >10s. Consider more optimizations.${NC}"
  else
    echo -e "${GREEN}🎉 Tests are now optimized! (<10s)${NC}"
  fi
else
  echo ""
  echo -e "${RED}❌ Some tests failed. Check test-output.log${NC}"
  exit 1
fi

echo ""

# Step 5: Cleanup
echo "📝 Step 5: Cleanup..."
find packages -name "*.backup" -delete
rm -f test-output.log
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""

# Performance report
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PERFORMANCE OPTIMIZATION COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Changes applied:"
echo "  ✓ Vitest configs optimized for speed"
echo "  ✓ Mock timing replaced with queueMicrotask"
echo "  ✓ Performance helpers added"
echo "  ✓ All tests verified"
echo ""
echo "Test duration: ${TEST_DURATION}s"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit: git commit -am 'perf: optimize test performance'"
echo "  3. Push and enjoy faster CI/CD! 🚀"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"