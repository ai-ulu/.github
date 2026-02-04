# AutoQA Interactive Test Runner

A Cypress-like interactive test runner for Playwright tests, providing real-time test execution, debugging, and visualization.

## Features

### 🎬 Real-time Test Execution

- Watch tests run live in the browser
- Step-by-step execution tracking
- Real-time status updates via WebSocket

### 🐛 Interactive Debugging

- Time-travel debugging - go back to any test step
- DOM snapshots at each step
- Visual element highlighting
- Breakpoint support

### 📹 Video Recording

- Automatic video recording of test runs
- Playback with step synchronization
- Screenshot capture at each step

### 🎯 Selector Playground

- Interactive element selection
- Optimal selector generation
- Selector testing and validation

### 📁 File Management

- Automatic test file discovery
- Real-time file watching
- Test organization and filtering

## Quick Start

### Development Mode

```bash
# Start both server and client in development
npm run dev

# Or start separately
npm run dev:server  # Backend on :3333
npm run dev:client  # Frontend on :3000
```

### Production Build

```bash
npm run build
npm start
```

## Architecture

### Server (Node.js + Express + Socket.IO)

- **Test Executor**: Manages Playwright test execution
- **File Watcher**: Monitors test files for changes
- **WebSocket Server**: Real-time communication with client
- **API Routes**: REST endpoints for test management

### Client (React + TypeScript + Tailwind)

- **Test Runner UI**: Main interface for running tests
- **Real-time Updates**: Live test execution feedback
- **Selector Playground**: Interactive selector tools
- **Video Player**: Test recording playback

## API Endpoints

### Test Management

- `GET /api/files` - Get all test files
- `POST /api/run-test` - Run a specific test
- `POST /api/debug-test` - Debug a test
- `POST /api/stop-test` - Stop test execution

### Execution Data

- `GET /api/executions` - Get all test executions
- `GET /api/executions/:id` - Get specific execution
- `GET /api/screenshots/:executionId/:filename` - Get screenshot
- `GET /api/videos/:executionId/:filename` - Get video

## WebSocket Events

### Client → Server

- `run-test` - Start test execution
- `stop-test` - Stop running test
- `debug-test` - Start debug session
- `watch-files` - Start file watching

### Server → Client

- `test-started` - Test execution began
- `test-step` - New test step executed
- `test-completed` - Test finished successfully
- `test-failed` - Test failed
- `file-added` - New test file detected
- `file-changed` - Test file modified

## Configuration

### Environment Variables

```bash
PORT=3333                    # Server port
NODE_ENV=development         # Environment
PLAYWRIGHT_BROWSERS_PATH=... # Browser path
```

### Test File Patterns

The runner automatically detects files matching:

- `**/*.spec.ts`
- `**/*.test.ts`
- `**/*.spec.js`
- `**/*.test.js`

## Usage Examples

### Running Tests

1. Open http://localhost:3333
2. Select test files from sidebar
3. Click play button to run
4. Watch real-time execution

### Debugging Tests

1. Click debug button on any test
2. Browser opens with DevTools
3. Step through test execution
4. Inspect DOM at each step

### Selector Playground

1. Navigate to Selector Playground
2. Enter URL to test
3. Click elements to generate selectors
4. Test selector reliability

## Development

### Project Structure

```
src/
├── server/           # Backend code
│   ├── index.ts     # Server entry point
│   ├── testExecutor.ts
│   ├── fileWatcher.ts
│   └── routes/
└── client/          # Frontend code
    ├── src/
    │   ├── components/
    │   ├── contexts/
    │   ├── pages/
    │   └── utils/
    └── index.html
```

### Adding Features

1. **Server-side**: Add to `testExecutor.ts` or create new service
2. **Client-side**: Add React components in appropriate folders
3. **Real-time**: Use Socket.IO events for live updates
4. **API**: Add REST endpoints in `routes/api.ts`

### Testing

```bash
npm test              # Run all tests
npm run test:server   # Server tests only
npm run test:client   # Client tests only
```

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## Performance

### Optimizations

- WebSocket connection pooling
- Efficient DOM snapshot compression
- Video streaming optimization
- File watching debouncing

### Limits

- Max concurrent test executions: 5
- Video retention: 24 hours
- Screenshot retention: 7 days
- Max file watch depth: 10 levels

## Troubleshooting

### Common Issues

**Tests not appearing**

- Check file patterns match `*.spec.ts` or `*.test.ts`
- Verify directory permissions
- Check console for file watching errors

**WebSocket connection failed**

- Ensure server is running on correct port
- Check firewall settings
- Verify proxy configuration

**Video recording issues**

- Install required Playwright browsers
- Check disk space for recordings
- Verify video codec support

**Performance issues**

- Limit concurrent test executions
- Reduce video quality settings
- Clear old test artifacts

### Debug Mode

```bash
DEBUG=autoqa:* npm run dev
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## License

MIT License - see LICENSE file for details.

---

**Happy Testing!** 🚀

Built with ❤️ by the AutoQA team
