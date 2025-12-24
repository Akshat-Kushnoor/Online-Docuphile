import app from './app.js';
import connectDB from './src/config/db.js';
import logger from './src/utils/logger.js';

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
    
    // Handle unhandled rejections
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
      logger.error(err.name, err.message);
      server.close(() => {
        process.exit(1);
      });
    });
    
    // Handle SIGTERM
    process.on('SIGTERM', () => {
      logger.info('SIGTERM RECEIVED. Shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
      });
    });
    
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();