import VideoDownloader from '../services/videoDownloader.js';
import Download from '../models/Download.js';
import { asyncHandler, AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import contentDisposition from 'content-disposition';

export const checkVideoUrl = asyncHandler(async (req, res, next) => {
  const { url } = req.body;
  
  if (!url) {
    throw new AppError('URL is required', 400);
  }
  
  const { isSocialMedia, platform } = VideoDownloader.isSocialMediaUrl(url);
  
  if (!isSocialMedia) {
    return res.status(200).json({
      success: true,
      isSocialMedia: false,
      message: 'URL is not from a social media platform. Use regular download instead.'
    });
  }
  
  try {
    const videoInfo = await VideoDownloader.getVideoInfo(url);
    const formats = await VideoDownloader.getAvailableFormats(url);
    
    res.status(200).json({
      success: true,
      isSocialMedia: true,
      platform,
      info: {
        title: videoInfo.title,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail,
        uploader: videoInfo.uploader,
        viewCount: videoInfo.viewCount,
        categories: videoInfo.categories,
        description: videoInfo.description ? 
          videoInfo.description.substring(0, 500) + '...' : ''
      },
      formats: formats.formats,
      audioOnly: formats.audioOnly,
      bestVideo: formats.bestVideo
    });
    
  } catch (error) {
    throw new AppError(`Could not fetch video information: ${error.message}`, 400);
  }
});

export const downloadVideo = asyncHandler(async (req, res, next) => {
  const { url, quality = 'best', format = 'mp4', fileName, extractAudio = false } = req.body;
  const userId = req.user._id;
  
  if (!url) {
    throw new AppError('URL is required', 400);
  }
  
  const { isSocialMedia } = VideoDownloader.isSocialMediaUrl(url);
  
  if (!isSocialMedia) {
    throw new AppError('URL is not from a supported social media platform', 400);
  }
  
  // Create download record
  const downloadRecord = await Download.create({
    user: userId,
    fileUrl: url,
    fileName: fileName || 'pending_video',
    status: 'downloading',
    metadata: { type: 'video', platform: VideoDownloader.isSocialMediaUrl(url).platform }
  });
  
  try {
    let result;
    
    if (extractAudio) {
      // Download video first, then extract audio
      const videoResult = await VideoDownloader.downloadVideo(url, { quality, format });
      result = await VideoDownloader.extractAudio(videoResult.filePath, format);
      
      // Clean up video file
      await fs.unlink(videoResult.filePath).catch(() => {});
    } else {
      // Download video directly
      result = await VideoDownloader.downloadVideo(url, { 
        quality, 
        format, 
        fileName 
      });
    }
    
    // Update download record
    downloadRecord.fileName = result.fileName;
    downloadRecord.fileSize = result.fileSize;
    downloadRecord.status = 'completed';
    downloadRecord.completedAt = new Date();
    downloadRecord.metadata = {
      ...downloadRecord.metadata,
      duration: result.duration,
      thumbnail: result.thumbnail,
      quality,
      format
    };
    await downloadRecord.save();
    
    logger.info(`Video downloaded: ${result.fileName} by user ${userId}`);
    
    // Set proper headers
    const mimeType = mime.lookup(result.fileName) || 'application/octet-stream';
    const disposition = contentDisposition(result.fileName);
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', result.fileSize);
    
    // Stream file
    const fileStream = fs.createReadStream(result.filePath);
    
    fileStream.pipe(res);
    
    // Cleanup after streaming
    fileStream.on('end', async () => {
      try {
        await fs.unlink(result.filePath);
        logger.info(`Cleaned up video file: ${result.fileName}`);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup file: ${cleanupError.message}`);
      }
    });
    
    fileStream.on('error', async (error) => {
      logger.error(`Stream error: ${error.message}`);
      try {
        await fs.unlink(result.filePath);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup on stream error: ${cleanupError.message}`);
      }
    });
    
  } catch (error) {
    // Update download record with error
    downloadRecord.status = 'failed';
    downloadRecord.error = error.message;
    await downloadRecord.save();
    
    logger.error(`Video download failed: ${error.message} for user ${userId}`);
    
    throw new AppError(`Video download failed: ${error.message}`, 400);
  }
});

export const batchDownloadVideos = asyncHandler(async (req, res, next) => {
  const { urls, options = {} } = req.body;
  const userId = req.user._id;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new AppError('Please provide an array of URLs', 400);
  }
  
  if (urls.length > 10) {
    throw new AppError('Maximum 10 videos per batch', 400);
  }
  
  // Filter social media URLs
  const socialMediaUrls = urls.filter(url => 
    VideoDownloader.isSocialMediaUrl(url).isSocialMedia
  );
  
  if (socialMediaUrls.length === 0) {
    throw new AppError('No valid social media URLs found', 400);
  }
  
  // Create download records
  const downloadRecords = await Promise.all(
    socialMediaUrls.map(url => 
      Download.create({
        user: userId,
        fileUrl: url,
        status: 'pending',
        metadata: { 
          type: 'video', 
          platform: VideoDownloader.isSocialMediaUrl(url).platform 
        }
      })
    )
  );
  
  const results = [];
  
  for (let i = 0; i < socialMediaUrls.length; i++) {
    const url = socialMediaUrls[i];
    const record = downloadRecords[i];
    
    try {
      record.status = 'downloading';
      await record.save();
      
      const result = await VideoDownloader.downloadVideo(url, options);
      
      record.fileName = result.fileName;
      record.fileSize = result.fileSize;
      record.status = 'completed';
      record.completedAt = new Date();
      record.metadata = {
        ...record.metadata,
        duration: result.duration,
        thumbnail: result.thumbnail,
        quality: options.quality || 'best',
        format: options.format || 'mp4'
      };
      await record.save();
      
      // Cleanup file after record is saved
      await fs.unlink(result.filePath).catch(() => {});
      
      results.push({
        success: true,
        url,
        fileName: result.fileName,
        fileSize: result.fileSize,
        duration: result.duration
      });
      
    } catch (error) {
      record.status = 'failed';
      record.error = error.message;
      await record.save();
      
      results.push({
        success: false,
        url,
        error: error.message
      });
    }
  }
  
  logger.info(`Batch video download completed by user ${userId}: ${results.filter(r => r.success).length} successful`);
  
  res.status(200).json({
    success: true,
    results,
    summary: {
      total: socialMediaUrls.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  });
});

export const getVideoFormats = asyncHandler(async (req, res, next) => {
  const { url } = req.query;
  
  if (!url) {
    throw new AppError('URL is required', 400);
  }
  
  const { isSocialMedia, platform } = VideoDownloader.isSocialMediaUrl(url);
  
  if (!isSocialMedia) {
    throw new AppError('URL is not from a supported social media platform', 400);
  }
  
  try {
    const formats = await VideoDownloader.getAvailableFormats(url);
    
    res.status(200).json({
      success: true,
      platform,
      formats: formats.formats,
      audioOnly: formats.audioOnly,
      bestVideo: formats.bestVideo,
      thumbnail: formats.thumbnail,
      duration: formats.duration,
      title: formats.title
    });
    
  } catch (error) {
    throw new AppError(`Could not fetch available formats: ${error.message}`, 400);
  }
});