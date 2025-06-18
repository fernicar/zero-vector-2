import axios from 'axios';
import config from '.__LITERAL_0__tils__LITERAL_1__json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'Zero-Vector-MCP-Clean__LITERAL_2__health'
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
