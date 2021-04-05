var Stratum = require('stratum-pool');
var redis = require('redis');
var net = require('net');
const functions = require('./functions.js');
var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');
const loggerFactory = require('./logger.js');

module.exports = function() {
	const logger = loggerFactory.getLogger('PoolWorker', 'system');
	var _this = this;
	var poolConfigs = JSON.parse(process.env.pools);
	var portalConfig = JSON.parse(process.env.portalConfig);
	var forkId = process.env.forkId;
	var pools = {};
	var proxySwitch = {};
	var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
	process.on('message', function(message) {
		switch (message.type) {
			case 'banIP':
			onBanIP(message);
			break;
			case 'blocknotify':
			onBlockNotify(message);
			break;
			case 'coinswitch':
			onCoinSwitch(message);
			break;
		}
	});
	var onCoinSwitch = function(message) {
		logger.silly('incoming coinswitch message');
		let componentStr = `Proxy Switch [:${(parseInt(forkId) + 1)}]`;
		let logger = loggerFactory.getLogger(componentStr, coin);
		var switchName = message.switchName;
		var newCoin = message.coin;
		var algo = poolConfigs[newCoin].coin.algorithm;
		var newPool = pools[newCoin];
		var oldCoin = proxySwitch[switchName].currentPool;
		var oldPool = pools[oldCoin];
		var proxyPorts = Object.keys(proxySwitch[switchName].ports);
		if (newCoin == oldCoin) {
			logger.debug('Switch message would have no effect - ignoring %s', newCoin);
			return;
		}
		logger.debug('Proxy message for %s from %s to %s', algo, oldCoin, newCoin);
		if (newPool) {
			oldPool.relinquishMiners(
				function(miner, cback) {
					cback(proxyPorts.indexOf(miner.client.socket.localPort.toString()) !== -1)
				},
				function(clients) {
					newPool.attachMiners(clients);
				}
			);
			proxySwitch[switchName].currentPool = newCoin;
			redisClient.hset('proxyState', algo, newCoin, function(error, obj) {
				if (error) {
					logger.error('Redis error writing proxy config, err = %s', JSON.stringify(err))
				} else {
					logger.debug('Last proxy state saved to redis for %s', algo);
				}
			});
		}
	};
	var onBanIP = function(message) {
		logger.silly('incoming banip message');
		for (var p in pools) {
			if (pools[p].stratumServer)
			pools[p].stratumServer.addBannedIP(message.ip);
		}
	};
	var onBlockNotify = function(message) {
		logger.silly('incoming blocknotify message');
		var messageCoin = message.coin.toLowerCase();
		var poolTarget = Object.keys(pools).filter(function(p) {
			return p.toLowerCase() === messageCoin;
		})[0];
		if (poolTarget)
		pools[poolTarget].processBlockNotify(message.hash, 'blocknotify script');
	};
	Object.keys(poolConfigs).forEach(function(coin) {
		var poolOptions = poolConfigs[coin];
		let componentStr = `Pool [:${(parseInt(forkId) + 1)}]`;
		let logger = loggerFactory.getLogger(componentStr, coin);
		var handlers = {
			auth: function() {},
			share: function() {},
			diff: function() {}
		};
		if (poolOptions.mposMode && poolOptions.mposMode.enabled) {
			var mposCompat = new MposCompatibility(poolOptions);
			handlers.auth = function(port, workerName, password, authCallback) {
				mposCompat.handleAuth(workerName, password, authCallback);
			};
			handlers.share = function(isValidShare, isValidBlock, data) {
				mposCompat.handleShare(isValidShare, isValidBlock, data);
			};
			handlers.diff = function(workerName, diff) {
				mposCompat.handleDifficultyUpdate(workerName, diff);
			}
		} else {
			var shareProcessor = new ShareProcessor(poolOptions);
			handlers.auth = function(port, workerName, password, authCallback) {
				if (!poolOptions.validateWorkerUsername) {
					authCallback(true);
				} else {
					try {
						let re = /^(?:[a-zA-Z0-9]+\.)*[a-zA-Z0-9]+$/;
						if (re.test(workerName)) {
							if (workerName.indexOf('.') !== -1) {
								let tmp = workerName.split('.');
								if (tmp.length !== 2) {
									authCallback(false);
								} else {
									pool.daemon.cmd('validateaddress', [tmp[0]], function(results) {
										var isValid = results.filter(function(r) {
											return r.response.isvalid
										}).length > 0;
										authCallback(isValid);
									});
								}
							} else {
								pool.daemon.cmd('validateaddress', [workerName], function(results) {
									var isValid = results.filter(function(r) {
										return r.response.isvalid
									}).length > 0;
									authCallback(isValid);
								});
							}
						} else {
							authCallback(false);
						}
					} catch (e) {
						authCallback(false);
					}
				}
			};
			handlers.share = function(isValidShare, isValidBlock, data) {
				logger.silly('Handle share, execeuting shareProcessor.handleShare, isValidShare = %s, isValidBlock = %s, data = %s', isValidShare, isValidBlock, JSON.stringify(data))
				shareProcessor.handleShare(isValidShare, isValidBlock, data);
			};
		}
		var authorizeFN = function(ip, port, workerName, password, extraNonce1, version, callback) {
			handlers.auth(port, workerName, password, function(authorized) {
				var authString = authorized ? 'Authorized' : 'Unauthorized ';
				logger.debug('AUTH>TRUE> authstr [%s] worker [%s] passwd [%s] ip [%s]', authString, workerName, password, functions.anonymizeIP(ip));
				callback({
					error: null,
					authorized: authorized,
					disconnect: false
				});
			});
		};
		var pool = Stratum.createPool(poolOptions, authorizeFN, logger);
		pool.on('share', function(isValidShare, isValidBlock, data) {
			let workerStr = data.worker;
			let workerInfo = workerStr.split('.');
			logger.silly('onStratumPoolShare');
			logger.debug("forkId %s", forkId);
			var shareDataJsonStr = JSON.stringify(data);
			if (data.blockHash && !isValidBlock) {
				if (workerInfo.length === 2) {
					logger.info('BLOCK>REJECTED> Found block rejected by the daemon, share data: %s' + shareDataJsonStr);
				} else {
					logger.info('BLOCK>REJECTED> Found block rejected by the daemon, share data: %s' + shareDataJsonStr);
				}
			} else if (isValidBlock) {          
				if (workerInfo.length === 2) {
					logger.info('BLOCK>ACCEPTED> %s by %s worker: %s', data.blockHash, workerInfo[0], workerInfo[1]);
					logger.info('BLOCK>ACCEPTED>INFO> %s', JSON.stringify(data));
				} else {
					logger.info('BLOCK>ACCEPTED> %s by %s worker: none', data.blockHash, workerStr);
					logger.info('BLOCK>ACCEPTED>INFO> %s', JSON.stringify(data));
				}
			}
			if (workerInfo.length === 2) {
				if (isValidShare) {
					if (data.shareDiff > 1000000000) {
						logger.warn('SHARE>WARN> Share was found with diff higher than 1.000.000.000!');
					} else if (data.shareDiff > 1000000) {
						logger.warn('SHARE>WARN> Share was found with diff higher than 1.000.000!');
					}
					logger.info('SHARE>ACCEPTED> job: %s req: %s res: %s by %s worker: %s [%s]', data.job, data.difficulty, data.shareDiff, workerInfo[0], workerInfo[1], functions.anonymizeIP(data.ip));                
				} 
				else if (!isValidShare) {
					logger.info('SHARE>REJECTED> job: %s diff: %s by %s worker: %s reason: %s [%s]', data.job, data.difficulty, workerInfo[0], workerInfo[1], data.error, functions.anonymizeIP(data.ip));
				}
			} else {
				if (isValidShare) {
					if (data.shareDiff > 1000000000) {
						logger.warn('SHARE>WARN> Share was found with diff higher than 1.000.000.000!');
					} else if (data.shareDiff > 1000000) {
						logger.warn('SHARE>WARN> Share was found with diff higher than 1.000.000!');
					}
					logger.info('SHARE>ACCEPTED> job: %s req: %s res: %s by %s worker: none [%s]', data.job, data.difficulty, data.shareDiff, workerStr, functions.anonymizeIP(data.ip));                
				} else if (!isValidShare) {
					logger.info('SHARE>REJECTED> job: %s diff: %s by %s worker: none reason: %s [%s]', data.job, data.difficulty, workerStr, data.error, functions.anonymizeIP(data.ip));
				}
			}
			handlers.share(isValidShare, isValidBlock, data)
		}).on('difficultyUpdate', function(workerName, diff) {
			let workerStr = workerName;
			let workerInfo = workerStr.split('.');
			if (workerInfo.length === 2) {
				logger.info('DIFFICULTY>UPDATE> diff: %s miner: %s worker: %s', diff, workerInfo[0], workerInfo[1]);
			} else {
				logger.info('DIFFICULTY>UPDATE> diff: %s miner: %s worker: none', diff, workerStr);
			}
			handlers.diff(workerName, diff);
		}).on('log', function(severity, text) {
			logger.info(text);
		}).on('banIP', function(ip, worker) {
			process.send({
				type: 'banIP',
				ip: ip
			});
		}).on('started', function() {
			_this.setDifficultyForProxyPort(pool, poolOptions.coin.name, poolOptions.coin.algorithm);
		});
		pool.start();
		pools[poolOptions.coin.name] = pool;
	});
	if (portalConfig.switching) {
		let logger = loggerFactory.getLogger(`SwitchingSetup[:${(parseInt(forkId) + 1)}]`, 'system');
		var proxyState = {};
		logger.debug('Loading last proxy state from redis');
		redisClient.hgetall("proxyState", function(error, obj) {
			if (!error && obj) {
				proxyState = obj;
				logger.debug('Last proxy state loaded from redis');
			}
			Object.keys(portalConfig.switching).forEach(function(switchName) {
				var algorithm = portalConfig.switching[switchName].algorithm;
				if (!portalConfig.switching[switchName].enabled) return;
				var initalPool = proxyState.hasOwnProperty(algorithm) ? proxyState[algorithm] : _this.getFirstPoolForAlgorithm(algorithm);
				proxySwitch[switchName] = {
					algorithm: algorithm,
					ports: portalConfig.switching[switchName].ports,
					currentPool: initalPool,
					servers: []
				};
				Object.keys(proxySwitch[switchName].ports).forEach(function(port) {
					var f = net.createServer(function(socket) {
						var currentPool = proxySwitch[switchName].currentPool;
						logger.debug('Connection to ' + switchName + ' from ' + socket.remoteAddress + ' on ' + port + ' routing to ' + currentPool);
						if (pools[currentPool]) {
							pools[currentPool].getStratumServer().handleNewClient(socket);
						} else {
							pools[initalPool].getStratumServer().handleNewClient(socket);
						}
					}).listen(parseInt(port), function() {
						logger.debug('Switching "' + switchName + '" listening for ' + algorithm + ' on port ' + port + ' into ' + proxySwitch[switchName].currentPool);
					});
					proxySwitch[switchName].servers.push(f);
				});
			});
		});
	}
	this.getFirstPoolForAlgorithm = function(algorithm) {
		var foundCoin = "";
		Object.keys(poolConfigs).forEach(function(coinName) {
			if (poolConfigs[coinName].coin.algorithm == algorithm) {
				if (foundCoin === "")
				foundCoin = coinName;
			}
		});
		return foundCoin;
	};
	this.setDifficultyForProxyPort = function(pool, coin, algo) {
		logger.debug(`[${algo}] Setting proxy difficulties after pool start`);
		Object.keys(portalConfig.switching).forEach(function(switchName) {
			if (!portalConfig.switching[switchName].enabled) {
				return
			}
			var switchAlgo = portalConfig.switching[switchName].algorithm;
			if (pool.options.coin.algorithm !== switchAlgo) {
				return
			}
			for (var port in portalConfig.switching[switchName].ports) {
				if (portalConfig.switching[switchName].ports[port].varDiff) {
					pool.setVarDiff(port, portalConfig.switching[switchName].ports[port].varDiff);
				}
				if (portalConfig.switching[switchName].ports[port].diff) {
					if (!pool.options.ports.hasOwnProperty(port)) {
						pool.options.ports[port] = {};
					}
					pool.options.ports[port].diff = portalConfig.switching[switchName].ports[port].diff;
				}
			}
		});
	};
};
