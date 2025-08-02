import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));

// Serve static files from src directory
app.use('/src', express.static(join(__dirname, 'src')));

// Main route - redirect to /plan-build-test
app.get('/', (req, res) => {
  res.redirect('/plan-build-test');
});

// Plan-build-test route - this is where the current feature will be served
app.get('/plan-build-test', (req, res) => {
  res.sendFile(join(__dirname, 'src', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Test your feature at http://localhost:${PORT}/plan-build-test`);
});