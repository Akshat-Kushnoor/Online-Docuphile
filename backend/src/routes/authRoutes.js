import express from 'express';
import { 
  signup, 
  login, 
  logout, 
  getProfile 
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { authValidation } from '../utils/validator.js';
import { authLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

router.post('/signup', authValidation.signup, signup);
router.post('/login', authLimiter, authValidation.login, login);
router.post('/logout', protect, logout);
router.get('/profile', protect, getProfile);

export default router;