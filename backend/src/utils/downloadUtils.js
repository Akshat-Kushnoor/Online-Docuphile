import axios from 'axios';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  DOWNLOAD_TIMEOUT, 
  MAX_FILE_SIZE, 
  FILE_TYPES 
} from '../config/constants.js';
import logger from './logger.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '../temp');

// Ensure temp directory exists
try {
  await fs.mkdir(tempDir, { recursive: true });
} catch (error) {
  logger.error(`Failed to create temp directory: ${error.message}`);
}

const isSupportedFileType = (contentType, url) => {
  if (!contentType) return true; // Allow unknown types
  
  const mainType = contentType.split(';')[0].split('/')[0];
  const allowedTypes = ['image', 'application', 'text', 'video', 'audio'];
  
  return allowedTypes.includes(mainType);
};

const sanitizeFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
};

export const downloadFile = async (url, options = {}) => {
  const {
    timeout = DOWNLOAD_TIMEOUT,
    maxSize = MAX_FILE_SIZE,
    customFileName,
    userId
  } = options;
  
  const tempFileName = randomBytes(16).toString('hex');
  const tempPath = path.join(tempDir, tempFileName);
  
  let fileSize = 0;
  let contentType = '';
  let originalFileName = '';
  
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout,
      maxContentLength: maxSize,
      headers: {
        'User-Agent': 'File-Downloader/1.0'
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    contentType = response.headers['content-type'] || '';
    const contentLength = parseInt(response.headers['content-length']);
    
    if (!isSupportedFileType(contentType, url)) {
      throw new Error('Unsupported file type');
    }
    
    if (contentLength && contentLength > maxSize) {
      throw new Error(`File size exceeds limit of ${maxSize / (1024 * 1024)}MB`);
    }
    
    // Get original filename
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition && contentDisposition.includes('filename=')) {
      const matches = contentDisposition.match(/filename="?([^"]+)"?/i);
      if (matches) {
        originalFileName = matches[1];
      }
    }
    
    if (!originalFileName) {
      const urlPath = new URL(url).pathname;
      originalFileName = path.basename(urlPath) || 'downloaded_file';
    }
    
    // Write stream with progress tracking
    const writer = createWriteStream(tempPath);
    
    response.data.on('data', (chunk) => {
      fileSize += chunk.length;
      if (fileSize > maxSize) {
        response.data.destroy();
        writer.destroy();
        throw new Error('File size exceeded during download');
      }
    });
    
    await pipeline(response.data, writer);
    
    // Final filename
    const finalFileName = customFileName || 
      sanitizeFileName(originalFileName) ||
      `download_${Date.now()}`;
    
    const finalExtension = path.extname(finalFileName) || 
      `.${getFileExtension(url, contentType)}`;
    
    const finalName = path.extname(finalFileName) ? 
      finalFileName : `${finalFileName}${finalExtension}`;
    
    const finalPath = path.join(tempDir, `${tempFileName}_${finalName}`);
    await fs.rename(tempPath, finalPath);
    
    return {
      success: true,
      filePath: finalPath,
      fileName: finalName,
      fileSize,
      contentType,
      originalUrl: url
    };
    
  } catch (error) {
    // Clean up temp file if exists
    try {
      await fs.unlink(tempPath);
    } catch (cleanupError) {
      logger.error(`Failed to cleanup temp file: ${cleanupError.message}`);
    }
    
    throw error;
  }
};

export const downloadMultipleFiles = async (urls, options = {}) => {
  const maxConcurrent = options.maxConcurrent || 5;
  const results = [];
  const errors = [];
  
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const promises = batch.map(url => 
      downloadFile(url, options)
        .then(result => results.push(result))
        .catch(error => errors.push({ url, error: error.message }))
    );
    
    await Promise.all(promises);
  }
  
  return { results, errors };
};

export const cleanupTempFiles = async (olderThanDays = 1) => {
  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const cutoff = now - (olderThanDays * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        logger.info(`Cleaned up old temp file: ${file}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to cleanup temp files: ${error.message}`);
  }
};

// Scheduled cleanup (run daily at 2 AM)
import cron from 'node-cron';
cron.schedule('0 2 * * *', () => {
  logger.info('Running scheduled temp file cleanup');
  cleanupTempFiles(1);
});