import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ytdlp from 'yt-dlp-exec';
import logger from '../utils/logger.js';
import { sanitizeFileName } from '../utils/downloadUtils.js';
import { MAX_FILE_SIZE } from '../config/constants.js';

const execAsync = promisify(exec);

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

class VideoDownloader {
  constructor() {
    this.supportedPlatforms = {
      youtube: [
        'youtube.com',
        'youtu.be',
        'youtube-nocookie.com',
        'm.youtube.com'
      ],
      instagram: [
        'instagram.com',
        'www.instagram.com',
        'instagr.am'
      ],
      twitter: [
        'twitter.com',
        'x.com',
        't.co'
      ],
      tiktok: [
        'tiktok.com',
        'www.tiktok.com',
        'vm.tiktok.com'
      ],
      facebook: [
        'facebook.com',
        'fb.com',
        'fb.watch'
      ],
      linkedin: [
        'linkedin.com'
      ],
      reddit: [
        'reddit.com',
        'v.redd.it'
      ],
      twitch: [
        'twitch.tv',
        'clips.twitch.tv'
      ],
      vimeo: [
        'vimeo.com'
      ],
      dailymotion: [
        'dailymotion.com',
        'dai.ly'
      ]
    };
  }

  isSocialMediaUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      for (const [platform, domains] of Object.entries(this.supportedPlatforms)) {
        if (domains.some(domain => hostname.includes(domain))) {
          return { isSocialMedia: true, platform };
        }
      }
      
      return { isSocialMedia: false, platform: null };
    } catch (error) {
      return { isSocialMedia: false, platform: null };
    }
  }

  async getVideoInfo(url) {
    try {
      const info = await ytdlp(url, {
        dumpJson: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        referer: url
      });

      return {
        title: info.title || 'Untitled',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || null,
        uploader: info.uploader || null,
        viewCount: info.view_count || 0,
        likeCount: info.like_count || 0,
        formats: info.formats || [],
        categories: info.categories || [],
        tags: info.tags || [],
        description: info.description || '',
        webpageUrl: info.webpage_url || url,
        extractor: info.extractor || 'generic'
      };
    } catch (error) {
      logger.error(`Failed to get video info: ${error.message}`);
      throw new Error(`Could not fetch video information: ${error.message}`);
    }
  }

  async downloadWithYtdlp(url, options = {}) {
    const {
      quality = 'best',
      format = 'mp4',
      outputPath,
      fileName,
      maxFileSize = MAX_FILE_SIZE
    } = options;

    const tempDir = path.join(process.cwd(), 'temp');
    const tempId = randomBytes(8).toString('hex');
    const outputTemplate = fileName 
      ? path.join(tempDir, `${tempId}_${fileName}`)
      : path.join(tempDir, `${tempId}_%(title)s.%(ext)s`);

    try {
      const args = [
        url,
        '--no-check-certificates',
        '--prefer-free-formats',
        '--youtube-skip-dash-manifest',
        '--referer', url,
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ];

      // Add quality/format options
      if (quality === 'audio') {
        args.push('--extract-audio', '--audio-format', 'mp3');
      } else {
        args.push('--format', `bestvideo[height<=${this.parseQuality(quality)}]+bestaudio/best[height<=${this.parseQuality(quality)}]`);
      }

      // Add output options
      args.push(
        '--output', outputTemplate,
        '--no-part',
        '--no-mtime',
        '--console-title',
        '--progress'
      );

      // Execute yt-dlp
      const result = await ytdlp.exec(args);

      // Find the downloaded file
      const files = await fs.readdir(tempDir);
      const downloadedFile = files.find(file => file.startsWith(tempId));
      
      if (!downloadedFile) {
        throw new Error('Downloaded file not found');
      }

      const filePath = path.join(tempDir, downloadedFile);
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > maxFileSize) {
        await fs.unlink(filePath);
        throw new Error(`File size (${stats.size} bytes) exceeds limit`);
      }

      // Get file info
      const info = await this.getVideoInfo(url);
      const finalFileName = fileName || sanitizeFileName(info.title) + `.${format}`;
      const finalPath = path.join(tempDir, `${tempId}_${finalFileName}`);

      // Rename if needed
      if (filePath !== finalPath) {
        await fs.rename(filePath, finalPath);
      }

      return {
        success: true,
        filePath: finalPath,
        fileName: finalFileName,
        fileSize: stats.size,
        duration: info.duration,
        thumbnail: info.thumbnail,
        metadata: info
      };

    } catch (error) {
      logger.error(`yt-dlp download failed: ${error.message}`);
      throw new Error(`Video download failed: ${error.message}`);
    }
  }

  async downloadVideo(url, options = {}) {
    const { platform } = this.isSocialMediaUrl(url);
    
    if (!platform) {
      throw new Error('URL is not from a supported social media platform');
    }

    // Use yt-dlp for all platforms except YouTube (where we can use ytdl-core as fallback)
    if (platform === 'youtube') {
      try {
        return await this.downloadYouTubeVideo(url, options);
      } catch (error) {
        logger.warn(`YouTube download failed, falling back to yt-dlp: ${error.message}`);
        return await this.downloadWithYtdlp(url, options);
      }
    }

    // Use yt-dlp for other platforms
    return await this.downloadWithYtdlp(url, options);
  }

  async downloadYouTubeVideo(url, options = {}) {
    const {
      quality = 'highest',
      format = 'mp4',
      outputPath,
      fileName
    } = options;

    try {
      // Get video info
      const info = await ytdl.getInfo(url);
      const videoDetails = info.videoDetails;
      
      // Choose format
      let chosenFormat;
      if (quality === 'audio') {
        chosenFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
      } else {
        chosenFormat = ytdl.chooseFormat(info.formats, { 
          quality: quality === 'highest' ? 'highest' : 'highestvideo'
        });
      }

      if (!chosenFormat) {
        throw new Error('No suitable format found');
      }

      // Generate file name
      const safeTitle = sanitizeFileName(videoDetails.title);
      const finalFileName = fileName || `${safeTitle}.${format}`;
      const tempDir = path.join(process.cwd(), 'temp');
      const tempId = randomBytes(8).toString('hex');
      const filePath = path.join(tempDir, `${tempId}_${finalFileName}`);

      // Create write stream
      const writeStream = createWriteStream(filePath);
      
      // Download video
      const videoStream = ytdl(url, { 
        format: chosenFormat,
        highWaterMark: 1024 * 1024 * 10 // 10MB buffer
      });

      await pipeline(videoStream, writeStream);

      // Get file size
      const stats = await fs.stat(filePath);

      return {
        success: true,
        filePath,
        fileName: finalFileName,
        fileSize: stats.size,
        duration: parseInt(videoDetails.lengthSeconds) || 0,
        thumbnail: videoDetails.thumbnails[0]?.url || null,
        metadata: {
          title: videoDetails.title,
          author: videoDetails.author?.name,
          viewCount: videoDetails.viewCount,
          likeCount: videoDetails.likes,
          uploadDate: videoDetails.uploadDate
        }
      };

    } catch (error) {
      logger.error(`YouTube download failed: ${error.message}`);
      throw new Error(`YouTube video download failed: ${error.message}`);
    }
  }

  parseQuality(quality) {
    const qualityMap = {
      '144p': 144,
      '240p': 240,
      '360p': 360,
      '480p': 480,
      '720p': 720,
      '1080p': 1080,
      '1440p': 1440,
      '2160p': 2160,
      'best': 9999,
      'lowest': 144
    };
    
    return qualityMap[quality] || 720;
  }

  async extractAudio(videoPath, outputFormat = 'mp3') {
    const tempDir = path.join(process.cwd(), 'temp');
    const tempId = randomBytes(8).toString('hex');
    const outputPath = path.join(tempDir, `${tempId}_audio.${outputFormat}`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioBitrate(128)
        .toFormat(outputFormat)
        .on('end', () => {
          resolve({
            success: true,
            filePath: outputPath,
            fileName: `audio.${outputFormat}`
          });
        })
        .on('error', (error) => {
          reject(new Error(`Audio extraction failed: ${error.message}`));
        })
        .save(outputPath);
    });
  }

  async getAvailableFormats(url) {
    try {
      const info = await this.getVideoInfo(url);
      
      const formats = info.formats.map(format => ({
        formatId: format.format_id,
        ext: format.ext,
        resolution: format.height ? `${format.height}p` : 'audio',
        filesize: format.filesize,
        videoCodec: format.vcodec,
        audioCodec: format.acodec,
        quality: format.quality,
        hasVideo: !!format.vcodec && format.vcodec !== 'none',
        hasAudio: !!format.acodec && format.acodec !== 'none'
      }));

      // Group by quality
      const groupedFormats = {};
      formats.forEach(format => {
        if (format.hasVideo) {
          const key = format.resolution;
          if (!groupedFormats[key]) {
            groupedFormats[key] = [];
          }
          groupedFormats[key].push(format);
        }
      });

      return {
        formats: groupedFormats,
        audioOnly: formats.filter(f => !f.hasVideo && f.hasAudio),
        bestVideo: formats.find(f => f.hasVideo && f.hasAudio && f.quality >= 5),
        thumbnail: info.thumbnail,
        duration: info.duration,
        title: info.title
      };

    } catch (error) {
      logger.error(`Failed to get formats: ${error.message}`);
      throw new Error(`Could not fetch available formats: ${error.message}`);
    }
  }

  async cleanupFiles(filePaths) {
    try {
      const deletePromises = filePaths.map(filePath => 
        fs.unlink(filePath).catch(error => {
          logger.warn(`Failed to delete file ${filePath}: ${error.message}`);
        })
      );
      
      await Promise.all(deletePromises);
      return { success: true, deleted: filePaths.length };
    } catch (error) {
      logger.error(`Cleanup failed: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instance
export default new VideoDownloader();