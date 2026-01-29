const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Test app working!', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'test-app' });
});

app.listen(port, () => {
  console.log(`Test app running on port ${port}`);
});