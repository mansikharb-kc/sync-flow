import axios from 'axios';

// Get base URL from environment variable
const envBase = import.meta.env.VITE_API_BASE_URL;

// If env variable is missing, we assume "All-in-One" mode (serving from the same domain)
// In production, we use the current domain. In development, we use localhost:5000.
// In production, we default to the Render backend if no VITE_API_BASE_URL is provided
const RENDER_BACKEND = 'https://sf-backend-y4it.onrender.com';
export const apiBase = envBase || (import.meta.env.PROD
    ? (window.location.hostname.includes('vercel.app') ? RENDER_BACKEND : window.location.origin)
    : 'http://localhost:5000');

const API = axios.create({
    baseURL: apiBase,
    timeout: 150000, // 150 seconds for large syncs
});

// Log the final base URL being used for debugging in Vercel/Render
console.log("🌐 Initializing API with base URL:", apiBase);

/**
 * All routes below are prefixed with /api to match server/index.js
 */

export const syncSheet = async (spreadsheetId) => {
    // Corrected to use /api/sync as per user best practice
    const response = await API.post('/api/sync', { spreadsheetId });
    return response.data;
};

export const getHistory = async (filters = {}) => {
    const response = await API.get('/api/history', { params: filters });
    return response.data;
};

export const getData = async (tableName, batchId, syncLogId = null) => {
    const response = await API.get(`/api/data/${tableName}`, {
        params: { batchId, syncLogId }
    });
    return response.data;
};

export const deleteRecord = async (tableName, id) => {
    const response = await API.delete(`/api/data/${tableName}/${id}`);
    return response.data;
};

export const getLeads = async (search = '', category = 'all', limit = 50, offset = 0) => {
    const response = await API.get('/api/leads', {
        params: { search, category, limit, offset }
    });
    return response.data;
};

export const loginUser = async (email, password) => {
    const response = await API.post('/api/login', { email, password });
    return response.data;
};

// Step 1: Request OTP
export const requestOTP = async (email, password, confirmPassword) => {
    const response = await API.post('/api/request-otp', { email, password, confirmPassword });
    return response.data;
};

// Step 2: Verify OTP
export const verifyOTP = async (email, otp) => {
    const response = await API.post('/api/verify-otp', { email, otp });
    return response.data;
};

// Step 3: Final Register
export const registerUser = async (email, password) => {
    const response = await API.post('/api/register', { email, password });
    return response.data;
};

export const getConfig = async () => {
    const response = await API.get('/api/config');
    return response.data;
};

export const getStats = async () => {
    const response = await API.get('/api/stats');
    return response.data;
};
