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
    // Forward any extra own-enumerable fields a call site attached to the
    // error (e.g. flagId, checkInTime, workedMinutes) — generic rather than
    // allow-listing each one by name, so a new field a call site adds later
    // doesn't silently get dropped here. Safe: Error's own `message`/`stack`
    // are non-enumerable, so they're never duplicated or leaked by this
    // spread (verified directly against V8's Error implementation).
    const { status, ...extra } = err;
    return res.status(status).json({ error: err.message, ...extra });
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
