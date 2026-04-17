const logger = require('./logger');

/**
 * Handle graceful shutdown of the server and database connections
 * @param {import('http').Server} server 
 * @param {import('mongoose')} mongoose 
 */
function setupGracefulShutdown(server, mongoose) {
    const shutdown = (signal) => {
        logger.info(`${signal} received. Shutting down gracefully...`);

        server.close(() => {
            logger.info('HTTP server closed.');

            mongoose.connection.close(false, () => {
                logger.info('Mongoose connection closed.');
                process.exit(0);
            });
        });

        // If shutdown takes too long, force exit
        setTimeout(() => {
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = setupGracefulShutdown;
