import axios from 'axios'

const BASE_URL = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:4000';

export const axiosi = axios.create({
  withCredentials: true,
  baseURL: BASE_URL,
});
