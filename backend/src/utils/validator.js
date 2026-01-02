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
export const videoValidation = {
  check: validate([
    body('url')
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid URL')
  ]),
  
  download: validate([
    body('url')
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid video URL'),
    
    body('quality')
      .optional()
      .isIn(['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', 'best', 'lowest', 'audio'])
      .withMessage('Invalid quality option'),
    
    body('format')
      .optional()
      .isIn(['mp4', 'webm', 'mkv', 'avi', 'mov', 'mp3', 'wav', 'aac', 'flac'])
      .withMessage('Invalid format option'),
    
    body('fileName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('File name too long'),
    
    body('extractAudio')
      .optional()
      .isBoolean()
      .withMessage('extractAudio must be a boolean')
  ]),
  
  batch: validate([
    body('urls')
      .isArray({ min: 1, max: 10 })
      .withMessage('Please provide 1-10 video URLs'),
    
    body('urls.*')
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true
      })
      .withMessage('Invalid URL in array'),
    
    body('options.quality')
      .optional()
      .isIn(['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', 'best', 'lowest'])
      .withMessage('Invalid quality option'),
    
    body('options.format')
      .optional()
      .isIn(['mp4', 'webm', 'mkv', 'avi', 'mov'])
      .withMessage('Invalid format option')
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

