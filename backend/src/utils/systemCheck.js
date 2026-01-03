import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';

const execAsync = promisify(exec);

class SystemCheck {
  static async checkYtDlp() {
    try {
      const { stdout } = await execAsync('yt-dlp --version');
      logger.info(`yt-dlp version: ${stdout.trim()}`);
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      logger.warn('yt-dlp not found in system PATH');
      return { installed: false, error: error.message };
    }
  }

  static async checkFFmpeg() {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionMatch = stdout.match(/ffmpeg version (\S+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      logger.info(`FFmpeg version: ${version}`);
      return { installed: true, version };
    } catch (error) {
      logger.warn('FFmpeg not found in system PATH');
      return { installed: false, error: error.message };
    }
  }

  static async checkPython() {
    try {
      const { stdout } = await execAsync('python3 --version');
      logger.info(`Python version: ${stdout.trim()}`);
      return { installed: true, version: stdout.trim() };
    } catch (error) {
      try {
        const { stdout } = await execAsync('python --version');
        logger.info(`Python version: ${stdout.trim()}`);
        return { installed: true, version: stdout.trim() };
      } catch (error2) {
        logger.warn('Python not found in system PATH');
        return { installed: false, error: error2.message };
      }
    }
  }

  static async checkAll() {
    const [ytdlp, ffmpeg, python] = await Promise.all([
      this.checkYtDlp(),
      this.checkFFmpeg(),
      this.checkPython()
    ]);

    const allInstalled = ytdlp.installed && ffmpeg.installed;

    return {
      ytdlp,
      ffmpeg,
      python,
      allInstalled,
      message: allInstalled 
        ? 'All required tools are installed' 
        : 'Some required tools are missing. Video downloads may not work properly.'
    };
  }

  static async installYtDlp() {
    try {
      logger.info('Installing yt-dlp...');
      const { stdout } = await execAsync('pip install yt-dlp --upgrade');
      logger.info('yt-dlp installation successful');
      return { success: true, message: 'yt-dlp installed successfully' };
    } catch (error) {
      logger.error(`Failed to install yt-dlp: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export default SystemCheck;