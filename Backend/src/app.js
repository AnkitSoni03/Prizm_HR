'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { HttpError } = require('./utils/errors');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(routes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const message = err.errors?.map((e) => e.message).join(', ') || err.message;
    return res.status(400).json({ error: message });
  }

  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10MB).' : err.message;
    return res.status(400).json({ error: message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
