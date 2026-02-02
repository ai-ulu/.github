/**
 * Comprehensive Security Middleware
 * **Validates: Requirements 9.1, 9.4, 9.5**
 * 
 * Implements comprehensive input validation, sanitization, security headers,
 * SQL injection prevention, XSS prevention, and SSRF protection.
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../utils/logger';

// Security configuration
const SECURITY_CONFIG = {
  // Content Security Policy
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'se