import { toast } from 'react-toastify';
import { CHUNK_LOAD_REFRESH_MESSAGE, hasChunkLoadError } from './chunkLoadError';
import { getAiProviderErrorMessage } from './aiProviderErrors';
import { requestAppUpdateDialog } from '../components/AppUpdateRequiredDialog';

/**
 * Extracts a clear, user-friendly error message from an error object.
 * Messages follow UX best practices: answer "What went wrong?" + "How to fix it?"
 * @param {Error|Object} error - The error object from API or catch block
 * @param {string} defaultMessage - Default message if error extraction fails
 * @returns {string} - Clear error message for the user
 */
export const getErrorMessage = (error, defaultMessage = 'Something went wrong. Please try again.') => {
  const aiProviderMessage = getAiProviderErrorMessage(error);
  if (aiProviderMessage) {
    return aiProviderMessage;
  }

  // If error is already a string, return it
  if (typeof error === 'string') {
    return error;
  }

  // Check for API response error (axios error structure)
  if (error?.response?.data) {
    const data = error.response.data;
    
    // Check for message in different possible locations
    if (data.message) {
      return data.message;
    }
    
    if (data.error) {
      return data.error;
    }
    
    // Check for validation errors
    if (data.errors && Array.isArray(data.errors)) {
      return data.errors.join(', ');
    }
    
    // Check for Sequelize validation errors
    if (data.errors && typeof data.errors === 'object') {
      const errorMessages = Object.values(data.errors)
        .map(err => (typeof err === 'string' ? err : err.message || err))
        .filter(Boolean);
      if (errorMessages.length > 0) {
        return errorMessages.join(', ');
      }
    }
    
    // Check for success: false with error message
    if (data.success === false && data.error) {
      return data.error;
    }
  }

  // Check for error message directly (including wrapped/cause chain from PDF chunk loads)
  if (hasChunkLoadError(error)) {
    return CHUNK_LOAD_REFRESH_MESSAGE;
  }

  // Axios/proxy timeouts: do this before substring checks. "timeout of 30000ms exceeded"
  // used to match "timeout" and look like the user went offline.
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
    return 'Taking longer than expected. Try again or check your connection.';
  }

  if (error?.message) {
    // Don't show technical error messages to users - use friendly versions
    const technicalErrors = ['Network Error', 'Request failed'];
    if (technicalErrors.some(te => error.message.includes(te))) {
      return 'Connection lost. Check your internet and try again.';
    }
    return error.message;
  }

  // Check for error.error (some APIs use this)
  if (error?.error) {
    return error.error;
  }

  // Check for network errors
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'Connection lost. Check your internet and try again.';
  }

  // Return default message
  return defaultMessage;
};

/**
 * Shows a success toast (react-toastify, bottom-right, green icon + progress bar)
 * @param {string} msg - Success message
 * @param {number} duration - Duration in seconds (default: 3)
 */
export const showSuccess = (msg, duration = 3) => {
  toast.success(msg, {
    autoClose: duration > 0 ? duration * 1000 : 5000,
    hideProgressBar: false,
    closeButton: true,
  });
};

/**
 * Shows an error toast with clear error extraction (react-toastify, red icon + progress bar)
 * @param {Error|string} error - Error object or error message
 * @param {string} defaultMessage - Default message if error extraction fails
 * @param {number} duration - Duration in seconds (default: 5)
 */
export const showError = (error, defaultMessage = 'Something went wrong. Please try again.', duration = 5) => {
  const errorMessage = getErrorMessage(error, defaultMessage);
  const isChunkRefresh =
    hasChunkLoadError(error) || errorMessage === CHUNK_LOAD_REFRESH_MESSAGE;

  if (isChunkRefresh) {
    // Friendly compulsory update dialog — not an error toast.
    requestAppUpdateDialog();
    return;
  }

  toast.error(errorMessage, {
    autoClose: duration > 0 ? duration * 1000 : 5000,
    hideProgressBar: false,
    closeButton: true,
  });
};

/**
 * Shows a warning toast (react-toastify, yellow/amber icon + progress bar)
 * @param {string} msg - Warning message
 * @param {number} duration - Duration in seconds (default: 4)
 */
export const showWarning = (msg, duration = 4) => {
  toast.warn(msg, {
    autoClose: duration > 0 ? duration * 1000 : 5000,
    hideProgressBar: false,
    closeButton: true,
  });
};

/**
 * Shows an info toast (react-toastify, blue icon + progress bar)
 * @param {string} msg - Info message
 * @param {number} duration - Duration in seconds (default: 3)
 */
export const showInfo = (msg, duration = 3) => {
  toast.info(msg, {
    autoClose: duration > 0 ? duration * 1000 : 5000,
    hideProgressBar: false,
    closeButton: true,
  });
};

/**
 * Shows a loading toast (react-toastify). Returns a function to dismiss it.
 * @param {string} msg - Loading message
 * @param {number} duration - Duration in seconds (default: 0 = infinite)
 * @returns {Function} - Function to hide the loading toast
 */
export const showLoading = (msg = 'Loading...', duration = 0) => {
  const toastId = toast.loading(msg, { autoClose: false, closeButton: true });
  if (duration > 0) {
    setTimeout(() => toast.dismiss(toastId), duration * 1000);
  }
  return () => toast.dismiss(toastId);
};

/**
 * Handles API errors with appropriate user-friendly messages.
 * Messages follow UX pattern: "Couldn't {action}. Please try again."
 * @param {Error} error - The error from API call
 * @param {Object} options - Options for error handling
 * @param {string} options.defaultMessage - Default error message
 * @param {string} options.context - Context of the error (e.g., 'create user', 'load data')
 * @param {boolean} options.logError - Whether to log error to console (default: true)
 */
export const handleApiError = (error, options = {}) => {
  const { defaultMessage, context, logError = true } = options;
  
  // Log error for debugging
  if (logError) {
    console.error('API Error:', error);
  }

  // Build context-aware default message
  let message = defaultMessage;
  if (context && !defaultMessage) {
    message = `Couldn't ${context}. Please try again.`;
  } else if (!defaultMessage) {
    message = 'Something went wrong. Please try again.';
  }

  // Show error toast
  showError(error, message);
};

export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  loading: showLoading,
  handleApiError,
  getErrorMessage,
};





