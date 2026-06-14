require('dotenv').config();
const cron = require('node-cron');
const logger = require('./logger');
const RepostBot = require('./bot');

// ========================================
// Startup Validation
// ========================================
const required = ['SOURCE_PAGE_ID', 'DEST_PAGE_ID', 'DEST_PAGE_ACCESS_TOKEN'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}`);
  console.error('\n   Please copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

// ========================================
// Initialize Bot
// ========================================
const bot = new RepostBot();
const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15;

logger.info('==========================================');
logger.info('   Facebook Repost Bot — Starting Up');
logger.info('==========================================');
logger.info(`Source Page  : ${process.env.SOURCE_PAGE_ID}`);
logger.info(`Dest Page    : ${process.env.DEST_PAGE_ID}`);
logger.info(`Check every  : ${intervalMinutes} minutes`);
logger.info(`Posts/fetch  : ${process.env.POSTS_PER_FETCH || 10}`);
logger.info('==========================================');

// ========================================
// Run immediately on startup
// ========================================
logger.info('Running initial check on startup...');
bot.run().catch(err => logger.error(`Startup run error: ${err.message}`));

// ========================================
// Schedule recurring runs
// ========================================
// cron format: */15 * * * * = every 15 minutes
const cronExpr = `*/${intervalMinutes} * * * *`;
logger.info(`Scheduler active: ${cronExpr}`);

cron.schedule(cronExpr, async () => {
  try {
    await bot.run();
  } catch (err) {
    logger.error(`Scheduled run error: ${err.message}`);
  }
});

// ========================================
// Status log every hour
// ========================================
cron.schedule('0 * * * *', () => {
  const stats = bot.getStats();
  logger.info(`📊 Hourly stats | Total processed: ${stats.total} | Success: ${stats.success} | Skipped: ${stats.skipped} | Failed: ${stats.failed} | Tracked IDs: ${stats.trackedPosts}`);
});

// ========================================
// Graceful shutdown
// ========================================
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down...');
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

// ========================================
// Dummy HTTP Server for cPanel Compatibility
// ========================================
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Facebook Repost Bot is active.\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Dummy HTTP server listening on port ${PORT}`);
});

logger.info('Bot is running. Press Ctrl+C to stop.');
