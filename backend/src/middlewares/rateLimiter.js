import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Auth limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  skipSuccessfulRequests: true
});

// Download limiter
export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 downloads per hour
  message: {
    success: false,
    message: 'Too many download requests, please try again later'
  }
});

// Video limiter
export const videoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 video downloads per hour
  keyGenerator: (req) => req.user?._id || ipKeyGenerator(req), // ✅ Fix for IPv6
  message: {
    success: false,
    message: 'Too many video download requests, please try again later'
  }
});

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});
