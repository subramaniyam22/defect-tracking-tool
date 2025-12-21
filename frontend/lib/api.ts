import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add access token
apiClient.interceptors.request.use(
  (config) => {
    // Only access localStorage if we're in the browser and the request needs auth
    if (typeof window !== 'undefined' && !config.headers.Authorization) {
      try {
        const accessToken = localStorage.getItem('accessToken');
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      } catch (e) {
        // localStorage might not be available (e.g., in incognito mode with restrictions)
        // Silently continue without token
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper function to handle session timeout and redirect
const handleSessionTimeout = () => {
  if (typeof window === 'undefined') return;
  
  // Clear all authentication data
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Only redirect if not already on login page
  if (window.location.pathname !== '/login') {
    // Use window.location.href for a hard redirect to ensure state is cleared
    window.location.href = '/login';
  }
};

// Response interceptor to handle token refresh and session timeout
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't retry login/refresh endpoints - these should fail normally
    if (originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized (session expired or invalid token)
    if (error.response?.status === 401) {
      // If this request already retried, don't retry again
      if (originalRequest._retry) {
        // Already tried to refresh, session is definitely expired
        handleSessionTimeout();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        let refreshToken: string | null = null;
        try {
          refreshToken = localStorage.getItem('refreshToken');
        } catch (e) {
          // localStorage might not be available
        }
        
        if (!refreshToken) {
          // No refresh token available, session expired
          handleSessionTimeout();
          return Promise.reject(error);
        }

        // Try to refresh the token
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          { refreshToken },
          { withCredentials: true }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        try {
          localStorage.setItem('accessToken', accessToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }
        } catch (e) {
          // localStorage might not be available, continue anyway
        }

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        // Refresh failed - token expired or invalid
        // Check if it's a 401 (refresh token expired) or other error
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          // Refresh token is also expired/invalid
          handleSessionTimeout();
        } else {
          // Other error (network, server error, etc.)
          // Still redirect to login as we can't authenticate
          handleSessionTimeout();
        }
        return Promise.reject(refreshError);
      }
    }

    // Handle network errors that might indicate backend is down
    // But only if we have a token (meaning we were authenticated)
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      const hasToken = typeof window !== 'undefined' && localStorage.getItem('accessToken');
      if (hasToken && originalRequest?.url && !originalRequest.url.includes('/auth/')) {
        // Network error on authenticated request - might be temporary
        // Don't redirect immediately, let the error propagate
        // The component can handle this appropriately
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

