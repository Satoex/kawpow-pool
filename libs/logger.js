const {createLogger, format, transports} = require('winston');
const {splat, combine, timestamp, label, printf} = format;

const config = require('../config.json');
if(!config)  {
    throw  new Error("Config file config.json does not exist")
}

const logLevel = config.logger ? config.logger.level || 'debug' : config.logLevel || 'debug';
require('winston-daily-rotate-file');

module.exports = {
    getLogger: function (loggerName, coin) {
        let transportz = [new transports.Console()];
        if (config.logger && config.logger.file) {
            transportz.push(
                new transports.DailyRotateFile({
                    filename: config.logger.file,
                    datePattern: 'YYYY-MM-DD',
                    prepend: false,
                    localTime: false,
                    level: logLevel
                })
            );
        }
        return createLogger({
            format: combine(
                splat(),
                label({label: {loggerName: loggerName, coin: coin}}),
                timestamp(),
                printf(info => {
                    return `[${info.timestamp}] [${info.level}] [${info.label.coin}] [${info.label.loggerName}] : ${info.message}`;
                })
            ),
            level: logLevel,
            transports: transportz,
        });
    }
};
