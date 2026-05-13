import axios from 'axios'

const BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : 'http://localhost:8000';

export const axiosi = axios.create({
  withCredentials: true,
  baseURL: BASE_URL,
});
