import express from 'express';
import { 
  checkVideoUrl,
  downloadVideo,
  batchDownloadVideos,
  getVideoFormats
} from '../controllers/videoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { videoValidation } from '../utils/validator.js';
import { videoLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Rate limiting for video routes
router.use(videoLimiter);

// Check if URL is a social media video
router.post('/check', checkVideoUrl);

// Get available formats for a video
router.get('/formats', getVideoFormats);

// Download single video
router.post('/download', videoValidation.download, downloadVideo);

// Batch download videos
router.post('/batch', videoValidation.batch, batchDownloadVideos);

export default router;