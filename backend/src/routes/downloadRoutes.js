import express from 'express';
import { 
  downloadSingle, 
  downloadMultiple, 
  getDownloadHistory,
  getDownloadStats,
  deleteDownloadRecord 
} from '../controllers/downloadController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { downloadValidation } from '../utils/validator.js';
import { downloadLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Rate limiting for download routes
router.use(downloadLimiter);

// Single file download
router.post('/single', downloadValidation.single, downloadSingle);

// Multiple files download
router.post('/multiple', downloadValidation.multiple, downloadMultiple);

// Download history
router.get('/history', getDownloadHistory);
router.get('/stats', getDownloadStats);

// Delete download record
router.delete('/:id', deleteDownloadRecord);

export default router;