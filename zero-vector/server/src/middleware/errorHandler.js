const { logError, logger } = require('../utils/logger');
const config = require('../config');

const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';

  logError(err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
    code = 'UNAUTHORIZED';
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  } else if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON format';
    code = 'INVALID_JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request entity too large';
    code = 'PAYLOAD_TOO_LARGE';
  } else if (err.code === 'ENOTFOUND') {
    status = 503;
    message = 'Service unavailable';
    code = 'SERVICE_UNAVAILABLE';
  } else if (err.code === 'ECONNREFUSED') {
    status = 503;
    message = 'Service connection refused';
    code = 'CONNECTION_REFUSED';
  } else if (err.code === 'ETIMEDOUT') {
    status = 504;
    message = 'Request timeout';
    code = 'TIMEOUT';
  }

  const errorResponse = {
    error: {
      code,
      message,
      status,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method
    }
  };

  if (config.server.nodeEnv === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = {
      name: err.name,
      originalMessage: err.message
    };
  }

  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  if (err.details && Array.isArray(err.details)) {
    errorResponse.error.validationErrors = err.details.map(detail => ({
      field: detail.path ? detail.path.join('.') : 'unknown',
      message: detail.message,
      value: detail.context?.value
    }));
  }

  res.status(status).json(errorResponse);

  if (status >= 500) {
    logger.error('Critical error occurred', {
      error: err.message,
      stack: err.stack,
      status,
      method: req.method,
      url: req.url
    });
  }
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const notFoundHandler = (req, res) => {
  const error = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      status: 404,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method
    }
  };

  res.status(404).json(error);
};

const rateLimitHandler = (req, res) => {
  const error = {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      status: 429,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
      retryAfter: req.rateLimit?.resetTime
    }
  };

  logError(new Error('Rate limit exceeded'), {
    ip: req.ip,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent')
  });

  res.status(429).json(error);
};

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.status = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.status = 401;
    this.code = 'UNAUTHORIZED';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.status = 403;
    this.code = 'FORBIDDEN';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  rateLimitHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError
};
