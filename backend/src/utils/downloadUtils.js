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

// Helper function to get file extension from URL or content type
const getFileExtension = (url, contentType = '') => {
  try {
    // Try to get extension from URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extensionMatch = pathname.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
    
    if (extensionMatch) {
      const ext = extensionMatch[1].toLowerCase();
      // Check if extension is reasonable length
      if (ext.length <= 10) {
        return ext;
      }
    }
    
    // Fallback to content type mapping
    if (contentType) {
      const mimeMap = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/zip': 'zip',
        'application/x-rar-compressed': 'rar',
        'application/x-7z-compressed': '7z',
        'application/x-tar': 'tar',
        'application/gzip': 'gz',
        'video/mp4': 'mp4',
        'video/x-msvideo': 'avi',
        'video/quicktime': 'mov',
        'video/x-ms-wmv': 'wmv',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/aac': 'aac',
        'audio/flac': 'flac'
      };
      
      const cleanContentType = contentType.split(';')[0].trim();
      return mimeMap[cleanContentType] || 'bin';
    }
    
    return 'bin'; // Default binary extension
  } catch {
    return 'bin';
  }
};

const isSupportedFileType = (contentType, url) => {
  if (!contentType) return true; // Allow unknown types
  
  const mainType = contentType.split(';')[0].split('/')[0];
  const allowedTypes = ['image', 'application', 'text', 'video', 'audio'];
  
  return allowedTypes.includes(mainType);
};

const sanitizeFileName = (fileName) => {
  // Remove any path traversal attempts and invalid characters
  return fileName
    .replace(/\.\./g, '_') // Prevent directory traversal
    .replace(/[\/\\:*?"<>|]/g, '_') // Replace invalid file characters
    .substring(0, 255);
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
        'User-Agent': 'File-Downloader/1.0 (+https://github.com/filedownloader)'
      },
      validateStatus: (status) => status === 200
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
    
    // Get original filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        originalFileName = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Fallback to extracting from URL
    if (!originalFileName) {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const urlFileName = path.basename(pathname);
        if (urlFileName && urlFileName.includes('.')) {
          originalFileName = urlFileName;
        }
      } catch (error) {
        // URL parsing failed, use default
      }
    }
    
    // Final fallback
    if (!originalFileName) {
      originalFileName = 'downloaded_file';
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
    
    // Generate final filename
    let finalFileName;
    
    if (customFileName) {
      finalFileName = customFileName;
    } else {
      finalFileName = sanitizeFileName(originalFileName);
    }
    
    // Ensure file has an extension
    const hasExtension = path.extname(finalFileName);
    if (!hasExtension) {
      const extension = getFileExtension(url, contentType);
      if (extension !== 'bin') {
        finalFileName = `${finalFileName}.${extension}`;
      }
    }
    
    // Rename temp file with final name
    const finalPath = path.join(tempDir, `${tempFileName}_${finalFileName}`);
    await fs.rename(tempPath, finalPath);
    
    return {
      success: true,
      filePath: finalPath,
      fileName: finalFileName,
      fileSize,
      contentType,
      originalUrl: url
    };
    
  } catch (error) {
    // Clean up temp file if exists
    try {
      await fs.unlink(tempPath).catch(() => {});
    } catch (cleanupError) {
      logger.error(`Failed to cleanup temp file: ${cleanupError.message}`);
    }
    
    // Enhance error messages
    let errorMessage = error.message;
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Download timeout';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot resolve URL';
    } else if (error.response) {
      errorMessage = `Server responded with ${error.response.status}`;
    }
    
    throw new Error(errorMessage);
  }
};

export const downloadMultipleFiles = async (urls, options = {}) => {
  const maxConcurrent = options.maxConcurrent || 5;
  const results = [];
  const errors = [];
  
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(url => 
      downloadFile(url, options)
        .then(result => {
          results.push({ url, ...result });
          return result;
        })
        .catch(error => {
          errors.push({ url, error: error.message });
          return null;
        })
    );
    
    await Promise.all(batchPromises);
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
      try {
        const stats = await fs.stat(filePath);
        
        if (stats.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          logger.info(`Cleaned up old temp file: ${file}`);
        }
      } catch (error) {
        logger.error(`Failed to stat/cleanup file ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to read temp directory: ${error.message}`);
  }
};

// Scheduled cleanup (run daily at 2 AM)
import cron from 'node-cron';
cron.schedule('0 2 * * *', () => {
  logger.info('Running scheduled temp file cleanup');
  cleanupTempFiles(1);
});

// Export helper functions if needed
export { getFileExtension, sanitizeFileName, isSupportedFileType };