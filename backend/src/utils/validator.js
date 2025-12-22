import { body, param, validationResult } from 'express-validator';
import { FILE_TYPES, MAX_FILE_SIZE } from '../config/constants.js';

export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    res.status(400).json({ errors: errors.array() });
  };
};

export const authValidation = {
  signup: validate([
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3-30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores'),
    
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter and one number')
  ]),
  
  login: validate([
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ])
};

export const downloadValidation = {
  single: validate([
    body('url')
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid URL with http/https protocol'),
    
    body('fileName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('File name too long'),
    
    body('timeout')
      .optional()
      .isInt({ min: 1000, max: 120000 })
      .withMessage('Timeout must be between 1 and 120 seconds')
  ]),
  
  multiple: validate([
    body('urls')
      .isArray({ min: 1, max: 10 })
      .withMessage('Please provide 1-10 URLs'),
    
    body('urls.*')
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true
      })
  ])
};

export const validateUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

export const getFileExtension = (url, contentType) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop().toLowerCase();
    
    if (extension && extension.length <= 6) {
      return extension;
    }
    
    // Fallback to content type
    if (contentType) {
      const mimeExtensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'application/pdf': 'pdf',
        'application/zip': 'zip',
        'text/plain': 'txt'
      };
      return mimeExtensions[contentType] || 'bin';
    }
    
    return 'bin';
  } catch {
    return 'bin';
  }
};