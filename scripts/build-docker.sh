#!/bin/bash

# Build Docker containers for AutoQA Pilot
# This script builds the test runner container with security best practices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"autoqa"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo -e "${GREEN}Building AutoQA Test Runner Docker Image${NC}"
echo "Registry: $DOCKER_REGISTRY"
echo "Tag: $IMAGE_TAG"
echo "Build Date: $BUILD_DATE"
echo "Git Commit: $GIT_COMMIT"

# Build the test runner image
echo -e "${YELLOW}Building test runner image...${NC}"
docker build \
  --file Dockerfile.test-runner \
  --tag "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}" \
  --tag "${DOCKER_REGISTRY}/test-runner:${GIT_COMMIT}" \
  --label "org.opencontainers.image.created=${BUILD_DATE}" \
  --label "org.opencontainers.image.revision=${GIT_COMMIT}" \
  --label "org.opencontainers.image.version=${IMAGE_TAG}" \
  --label "org.opencontainers.image.title=AutoQA Test Runner" \
  --label "org.opencontainers.image.description=Containerized test execution environment for AutoQA Pilot" \
  --label "org.opencontainers.image.vendor=AutoQA" \
  --label "org.opencontainers.image.licenses=MIT" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  .

# Security scan with Trivy (if available)
if command -v trivy &> /dev/null; then
  echo -e "${YELLOW}Running security scan with Trivy...${NC}"
  trivy image --exit-code 1 --severity HIGH,CRITICAL "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}" || {
    echo -e "${RED}Security scan failed! High or critical vulnerabilities found.${NC}"
    exit 1
  }
  echo -e "${GREEN}Security scan passed!${NC}"
else
  echo -e "${YELLOW}Trivy not found, skipping security scan${NC}"
fi

# Test the container
echo -e "${YELLOW}Testing container...${NC}"
docker run --rm --name autoqa-test-runner-test \
  "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}" \
  node -e "console.log('Container test successful')" || {
  echo -e "${RED}Container test failed!${NC}"
  exit 1
}

echo -e "${GREEN}Container test passed!${NC}"

# Push to registry (if PUSH_TO_REGISTRY is set)
if [ "${PUSH_TO_REGISTRY}" = "true" ]; then
  echo -e "${YELLOW}Pushing to registry...${NC}"
  docker push "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}"
  docker push "${DOCKER_REGISTRY}/test-runner:${GIT_COMMIT}"
  echo -e "${GREEN}Push completed!${NC}"
fi

# Clean up intermediate images
echo -e "${YELLOW}Cleaning up...${NC}"
docker image prune -f --filter label=stage=builder

echo -e "${GREEN}Build completed successfully!${NC}"
echo "Image: ${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}"
echo "Size: $(docker images --format "table {{.Size}}" "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}" | tail -n 1)"

# Display image layers for verification
echo -e "${YELLOW}Image layers:${NC}"
docker history --no-trunc "${DOCKER_REGISTRY}/test-runner:${IMAGE_TAG}"