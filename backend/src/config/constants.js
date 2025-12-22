export const FILE_TYPES = {
  IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  DOCUMENT: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
  SPREADSHEET: ['xls', 'xlsx', 'csv'],
  PRESENTATION: ['ppt', 'pptx'],
  ARCHIVE: ['zip', 'rar', '7z', 'tar', 'gz'],
  VIDEO: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
  AUDIO: ['mp3', 'wav', 'aac', 'flac']
};

export const MAX_FILE_SIZE = 100 * 1024 * 1024;    // 100MB
export const DOWNLOAD_TIMEOUT = 30000;    // 30 seconds
export const MAX_CONCURRENT_DOWNLOADS = 5;
export const TEMP_FILE_RETENTION_DAYS = 1;
