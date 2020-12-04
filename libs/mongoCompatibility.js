var MongoClient = require('mongodb').MongoClient,
    f = require('util').format;

const loggerFactory = require('./logger.js');

module.exports = function (poolConfig) {

    var mongoConfig = poolConfig.mongoMode;
    var coin = poolConfig.coin.name;

    var mongoConfig = {
        host: poolConfig.mongoMode.host,
        database: poolConfig.mongoMode.database,
        user: encodeURIComponent(poolConfig.mongoMode.user),
        pass: encodeURIComponent(poolConfig.mongoMode.pass),
        authMechanism: poolConfig.mongoMode.authMechanism ? poolConfig.mongoMode.authMechanism : "DEFAULT"
    };

    let logger = loggerFactory.getLogger('MongoCompatibility', coin);

    var logIdentify = 'MongoDB';
    var logComponent = coin;

    var connectionURL = "";

    if (mongoConfig.user && mongoConfig.pass) {
        connectionURL = f('mongodb://%s:%s@%s:27017/myproject?authMechanism=%s', mongoConfig.user, mongoConfig.pass, mongoConfig.host, mongoConfig.database, mongoConfig.authMechanism);
    } else {
        connectionURL = f('mongodb://%s:27017/%s', mongoConfig.host, mongoConfig.database);
    }

    //TODO: PRIORITY: Check to see if collection exists and create it if not

    var mongoInsert = function (collectionName, data, errCallback, successCallback) {
        MongoClient.connect(connectionURL, function (err, db) {

            var collection = db.collection(collectionName);

            collection.insert(data, function (err, result) {
                if (err) {
                    errCallback(err);
                    //TODO: do we stop it from moving on here?
                }

                successCallback(result);
                db.close(); //TODO: does this work? does it get called before the above callback can do whatever with result?
            });

        });
    };

    this.handleShare = function (isValidShare, isValidBlock, shareData) {

        var dbData = {
            rem_host: shareData.ip,
            worker: shareData.worker,
            valid_share: isValidShare ? 'Y' : 'N',
            valid_block: isValidBlock ? 'Y' : 'N',
            difficulty: shareData.difficulty * (poolConfig.coin.mposDiffMultiplier || 1),
            reason: typeof(shareData.error) === 'undefined' ? null : shareData.error,
            solution: shareData.blockHash ? shareData.blockHash : (shareData.blockHashInvalid ? shareData.blockHashInvalid : '')
        };

        mongoInsert('shares', dbData,
            function (err) {
                logger.error('Insert error when adding share: %s', JSON.stringify(err));
            },
            function (result) {
                logger.debug('Share inserted, result = %s', JSON.stringify(result));
            });

    };

    this.handleDifficultyUpdate = function (workerName, diff) {
        //TODO:
    };

    this.handleAuth = function (workerName, password, authCallback) {
        //TODO:
    };


};