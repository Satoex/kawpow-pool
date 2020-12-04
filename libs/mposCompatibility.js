var mysql = require('mysql');
var cluster = require('cluster');

const logger = require('./logger.js').getLogger('MPOSCompatibility', 'system');
module.exports = function (poolConfig) {

    var mposConfig = poolConfig.mposMode;
    var coin = poolConfig.coin.name;

    var connection = mysql.createPool({
        host: mposConfig.host,
        port: mposConfig.port,
        user: mposConfig.user,
        password: mposConfig.password,
        database: mposConfig.database
    });


    var logIdentify = 'MySQL';
    var logComponent = coin;


    this.handleAuth = function (workerName, password, authCallback) {

        if (poolConfig.validateWorkerUsername !== true && mposConfig.autoCreateWorker !== true) {
            authCallback(true);
            return;
        }

        connection.query(
            'SELECT password FROM pool_worker WHERE username = LOWER(?)',
            [workerName.toLowerCase()],
            function (err, result) {
                if (err) {
                    logger.error('Database error when authenticating worker, err = %s', JSON.stringify(err));
                    authCallback(false);
                }
                else if (!result[0]) {
                    if (mposConfig.autoCreateWorker) {
                        var account = workerName.split('.')[0];
                        connection.query(
                            'SELECT id,username FROM accounts WHERE username = LOWER(?)',
                            [account.toLowerCase()],
                            function (err, result) {
                                if (err) {
                                    logger.error('Database error when authenticating account, err = %s', JSON.stringify(err));
                                    authCallback(false);
                                } else if (!result[0]) {
                                    authCallback(false);
                                } else {
                                    connection.query(
                                        "INSERT INTO `pool_worker` (`account_id`, `username`, `password`) VALUES (?, ?, ?);",
                                        [result[0].id, workerName.toLowerCase(), password],
                                        function (err, result) {
                                            if (err) {
                                                logger.error('Database error when insert worker, err = %s', JSON.stringify(err));
                                                authCallback(false);
                                            } else {
                                                authCallback(true);
                                            }
                                        })
                                }
                            }
                        );
                    }
                    else {
                        authCallback(false);
                    }
                }
                else if (mposConfig.checkPassword && result[0].password !== password) {
                    authCallback(false);
                }
                else {
                    authCallback(true);
                }
            }
        );

    };

    this.handleShare = function (isValidShare, isValidBlock, shareData) {

        var dbData = [
            shareData.ip,
            shareData.worker,
            isValidShare ? 'Y' : 'N',
            isValidBlock ? 'Y' : 'N',
            shareData.difficulty * (poolConfig.coin.mposDiffMultiplier || 1),
            typeof(shareData.error) === 'undefined' ? null : shareData.error,
            shareData.blockHash ? shareData.blockHash : (shareData.blockHashInvalid ? shareData.blockHashInvalid : '')
        ];
        connection.query(
            'INSERT INTO `shares` SET time = NOW(), rem_host = ?, username = ?, our_result = ?, upstream_result = ?, difficulty = ?, reason = ?, solution = ?',
            dbData,
            function (err, result) {
                if (err) {
                    logger.error('Insert error when adding share, err = %s', JSON.stringify(err));
                }
                else {
                    logger.debug('Share inserted');
                }
            }
        );
    };

    this.handleDifficultyUpdate = function (workerName, diff) {

        connection.query(
            'UPDATE `pool_worker` SET `difficulty` = ' + diff + ' WHERE `username` = ' + connection.escape(workerName),
            function (err, result) {
                if (err) {
                    logger.error('Error when updating worker diff, err = %s', JSON.stringify(err));
                }
                else if (result.affectedRows === 0) {
                    connection.query('INSERT INTO `pool_worker` SET ?', {username: workerName, difficulty: diff});
                }
                else {
                    logger.debug('Updated difficulty successfully, result = %s', result);
                }
            }
        );
    };


};
