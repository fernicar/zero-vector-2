import axios from 'axios';
import config from './config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('APIClient');

class ZeroVectorAPIClient {
  constructor() {
    this.baseURL = config.zeroVector.baseUrl;
    this.apiKey = config.zeroVector.apiKey;
    this.timeout = config.zeroVector.timeout;
    this.retryAttempts = config.zeroVector.retryAttempts;
    this.retryDelay = config.zeroVector.retryDelay;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'Zero-Vector-MCP-Clean/1.0.0'
      }
    });

    this.client.interceptors.request.use(
      (config) => {
        logger.debug('API Request', {
          method: config.method.toUpperCase(),
          url: config.url,
          hasData: !!config.data
        });
        return config;
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('API Response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        if (error.response) {
          logger.warn('API Error', {
            status: error.response.status,
            url: error.config?.url,
            error: error.response.data?.message || error.message
          });
        } else {
          logger.error('Network Error', {
            url: error.config?.url,
            message: error.message
          });
        }
        return Promise.reject(error);
      }
    );
  }

  async executeRequest(requestConfig, attempt = 1) {
    try {
      const response = await this.client(requestConfig);
      return this.handleSuccessResponse(response);
    } catch (error) {
      return this.handleErrorResponse(error, requestConfig, attempt);
    }
  }

  handleSuccessResponse(response) {
    const { status, data } = response;

    if (data && typeof data === 'object') {
      if (data.status === 'success') {
        return {
          success: true,
          data: data.data || data,
          meta: data.meta,
          message: data.message
        };
      }
    }

    return {
      success: true,
      data: data
    };
  }

  async handleErrorResponse(error, requestConfig, attempt) {
    const { response } = error;

    if (this.shouldRetry(error, attempt)) {
      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      logger.info(`Retrying request after ${delay}ms`, {
        attempt,
        maxAttempts: this.retryAttempts,
        url: requestConfig.url
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.executeRequest(requestConfig, attempt + 1);
    }

    if (!response) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Unable to connect to Zero-Vector server',
        suggestion: 'Check if Zero-Vector server is running and accessible'
      };
    }

    const { status, data } = response;
    return this.parseErrorResponse(status, data);
  }

  parseErrorResponse(status, data) {
    const baseError = {
      success: false,
      statusCode: status
    };

    if (data && typeof data === 'object' && data.status === 'error') {
      return {
        ...baseError,
        error: data.error?.code || 'UNKNOWN_ERROR',
        message: data.error?.message || data.message || 'Unknown error occurred',
        suggestion: this.getErrorSuggestion(status, data.error?.code)
      };
    }

    const errorMappings = {
      400: { error: 'BAD_REQUEST', message: 'Invalid request parameters' },
      401: { error: 'UNAUTHORIZED', message: 'Invalid or missing API key' },
      403: { error: 'FORBIDDEN', message: 'Insufficient permissions' },
      404: { error: 'NOT_FOUND', message: 'Resource not found' },
      409: { error: 'CONFLICT', message: 'Resource already exists' },
      429: { error: 'RATE_LIMITED', message: 'Too many requests' },
      500: { error: 'INTERNAL_SERVER_ERROR', message: 'Zero-Vector server error' },
      503: { error: 'SERVICE_UNAVAILABLE', message: 'Zero-Vector server unavailable' }
    };

    const errorInfo = errorMappings[status] || {
      error: 'UNKNOWN_ERROR',
      message: `HTTP ${status} error`
    };

    return {
      ...baseError,
      ...errorInfo,
      suggestion: this.getErrorSuggestion(status)
    };
  }

  getErrorSuggestion(status, errorCode) {
    const suggestions = {
      'PERSONA_NOT_FOUND': 'Check the persona ID is correct',
      'VALIDATION_ERROR': 'Check input parameters match the required schema',
      'API_KEY_NOT_FOUND': 'Verify the API key is active',
      401: 'Check ZERO_VECTOR_API_KEY environment variable',
      404: 'Verify the resource ID is correct',
      500: 'Check Zero-Vector server logs',
      503: 'Check if Zero-Vector server is running'
    };

    return suggestions[errorCode] || suggestions[status] || 'Check request and try again';
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.retryAttempts) {
      return false;
    }

    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    return !error.response || error.response.status >= 500;
  }

  async testConnection() {
    try {
      const result = await this.executeRequest({
        method: 'GET',
        url: '/health'
      });

      if (result.success) {
        return { connected: true, health: result.data };
      } else {
        return { connected: false, error: result };
      }
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async get(url, params = {}) {
    return this.executeRequest({
      method: 'GET',
      url,
      params
    });
  }

  async post(url, data = {}) {
    return this.executeRequest({
      method: 'POST',
      url,
      data
    });
  }

  async put(url, data = {}) {
    return this.executeRequest({
      method: 'PUT',
      url,
      data
    });
  }

  async delete(url) {
    return this.executeRequest({
      method: 'DELETE',
      url
    });
  }
}

const apiClient = new ZeroVectorAPIClient();
export default apiClient;
