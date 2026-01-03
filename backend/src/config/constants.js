export const FILE_TYPES = {
  IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  DOCUMENT: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
  SPREADSHEET: ['xls', 'xlsx', 'csv'],
  PRESENTATION: ['ppt', 'pptx'],
  ARCHIVE: ['zip', 'rar', '7z', 'tar', 'gz'],
  VIDEO: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
  AUDIO: ['mp3', 'wav', 'aac', 'flac']
};


export const VIDEO_QUALITIES = {
  '144p': 144,
  '240p': 240,
  '360p': 360,
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160
};

export const VIDEO_FORMATS = ['mp4', 'webm', 'mkv', 'avi', 'mov'];
export const AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'flac', 'ogg'];

export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_VIDEO_DURATION = 3600; // 1 hour in seconds

export const SUPPORTED_PLATFORMS = [
  'youtube',
  'instagram',
  'twitter',
  'tiktok',
  'facebook',
  'linkedin',
  'reddit',
  'twitch',
  'vimeo',
  'dailymotion'
];

export const MAX_FILE_SIZE = 100 * 1024 * 1024;    // 100MB
export const DOWNLOAD_TIMEOUT = 30000;    // 30 seconds
export const MAX_CONCURRENT_DOWNLOADS = 5;
export const TEMP_FILE_RETENTION_DAYS = 1;
