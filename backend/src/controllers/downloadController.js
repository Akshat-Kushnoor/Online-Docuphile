import { 
  downloadFile, 
  downloadMultipleFiles,
  cleanupTempFiles 
} from '../utils/downloadUtils.js';
import Download from '../models/Download.js';
import { asyncHandler, AppError } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export const downloadSingle = asyncHandler(async (req, res, next) => {
  const { url, fileName, timeout } = req.body;
  const userId = req.user._id;
  
  // Create download record
  const downloadRecord = await Download.create({
    user: userId,
    fileUrl: url,
    fileName: fileName || 'pending',
    status: 'downloading'
  });
  
  try {
    // Download file
    const result = await downloadFile(url, {
      timeout: timeout || 30000,
      customFileName: fileName,
      userId
    });
    
    // Update download record
    downloadRecord.fileName = result.fileName;
    downloadRecord.fileSize = result.fileSize;
    downloadRecord.status = 'completed';
    downloadRecord.completedAt = new Date();
    await downloadRecord.save();
    
    logger.info(`File downloaded: ${result.fileName} by user ${userId}`);
    
    // Send file
    res.download(result.filePath, result.fileName, async (err) => {
      // Cleanup after sending
      if (err) {
        logger.error(`Error sending file: ${err.message}`);
      }
      
      try {
        await fs.unlink(result.filePath);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup file: ${cleanupError.message}`);
      }
    });
    
  } catch (error) {
    // Update download record with error
    downloadRecord.status = 'failed';
    downloadRecord.error = error.message;
    await downloadRecord.save();
    
    logger.error(`Download failed: ${error.message} for user ${userId}`);
    
    throw new AppError(`Download failed: ${error.message}`, 400);
  }
});

export const downloadMultiple = asyncHandler(async (req, res, next) => {
  const { urls, options } = req.body;
  const userId = req.user._id;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new AppError('Please provide an array of URLs', 400);
  }
  
  // Limit number of concurrent downloads
  const maxDownloads = Math.min(options?.maxConcurrent || 3, 5);
  
  // Create download records
  const downloadRecords = await Promise.all(
    urls.map(url => 
      Download.create({
        user: userId,
        fileUrl: url,
        status: 'pending'
      })
    )
  );
  
  // Process downloads
  const results = [];
  
  for (let i = 0; i < urls.length; i += maxDownloads) {
    const batch = urls.slice(i, i + maxDownloads);
    const recordBatch = downloadRecords.slice(i, i + maxDownloads);
    
    const batchPromises = batch.map(async (url, index) => {
      const record = recordBatch[index];
      
      try {
        record.status = 'downloading';
        await record.save();
        
        const result = await downloadFile(url, {
          ...options,
          userId
        });
        
        record.fileName = result.fileName;
        record.fileSize = result.fileSize;
        record.status = 'completed';
        record.completedAt = new Date();
        await record.save();
        
        return {
          success: true,
          url,
          fileName: result.fileName,
          fileSize: result.fileSize
        };
      } catch (error) {
        record.status = 'failed';
        record.error = error.message;
        await record.save();
        
        return {
          success: false,
          url,
          error: error.message
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  logger.info(`Batch download completed by user ${userId}: ${results.filter(r => r.success).length} successful`);
  
  res.status(200).json({
    success: true,
    results,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  });
});

export const getDownloadHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, startDate, endDate } = req.query;
  const userId = req.user._id;
  
  const query = { user: userId };
  
  // Apply filters
  if (status) {
    query.status = status;
  }
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const [downloads, total] = await Promise.all([
    Download.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v'),
    Download.countDocuments(query)
  ]);
  
  res.status(200).json({
    success: true,
    data: downloads,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

export const getDownloadStats = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  
  const stats = await Download.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSize: { $sum: '$fileSize' }
      }
    }
  ]);
  
  const totalDownloads = await Download.countDocuments({ user: userId });
  const totalSize = await Download.aggregate([
    { $match: { user: userId, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$fileSize' } } }
  ]);
  
  const last7Days = await Download.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  res.status(200).json({
    success: true,
    stats: {
      totalDownloads,
      totalSize: totalSize[0]?.total || 0,
      statusBreakdown: stats,
      last7Days
    }
  });
});

export const deleteDownloadRecord = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id;
  
  const download = await Download.findOne({ _id: id, user: userId });
  
  if (!download) {
    throw new AppError('Download record not found', 404);
  }
  
  await download.deleteOne();
  
  logger.info(`Download record deleted: ${id} by user ${userId}`);
  
  res.status(200).json({
    success: true,
    message: 'Download record deleted successfully'
  });
});