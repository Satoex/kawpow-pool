var fs = require('fs');
var redis = require('redis');
var async = require('async');
var Stratum = require('stratum-pool');
var util = require('stratum-pool/lib/util.js');
const BigNumber = require('bignumber.js');
const loggerFactory = require('./logger.js');
JSON.minify = JSON.minify || require("node-json-minify");
var portalConfig = JSON.parse(fs.readFileSync("config.json", {encoding: 'utf8'}));
var poolConfigs = [];

module.exports = function() {  
	var logger = loggerFactory.getLogger('PaymentProcessing', 'system');
	logger.info("PP> Payment processor worker started");
	poolConfigs = JSON.parse(process.env.pools);
	var enabledPools = [];
	Object.keys(poolConfigs).forEach(function(coin) {
		var poolOptions = poolConfigs[coin];
		if (poolOptions.paymentProcessing &&
		poolOptions.paymentProcessing.enabled) {
			enabledPools.push(coin);
			logger.info("PP> Enabled %s for payment processing", coin);
		}
	});
	async.filter(enabledPools, function(coin, callback) {
		SetupForPool(poolConfigs[coin], function(setupResults) {
			logger.debug("PP> Payment processor initialized. Setup results %s", setupResults);
			callback(null, setupResults);
		});
	},
	function(err, coins) {
		if (err) {
			logger.error('PP>ERROR> Error processing enabled pools in the config')
		} else {
			coins.forEach(function(coin) {
				var poolOptions = poolConfigs[coin];
				var processingConfig = poolOptions.paymentProcessing;
				var tmpInterval = getCoinPayInterval(coin);
				logger.info('PP> Payment processing setup to run every %s second(s) with daemon (%s@%s:%s) and redis (%s:%s)',
				tmpInterval,
				processingConfig.daemon.user,
				processingConfig.daemon.host,
				processingConfig.daemon.port,
				poolOptions.redis.host,
				poolOptions.redis.port);
			});
		}
	});
};
function getCoinPayInterval(coin) {
	const logger = loggerFactory.getLogger('PaymentProcessor-gCPI', coin);
	var poolOptions = poolConfigs[coin];
	var processingConfig = poolOptions.paymentProcessing;
	if (portalConfig.devmode) {
		var payInterval = portalConfig.devmodePayInterval || 0;
	} else {			
		var payInterval = Math.max((processingConfig.paymentInterval || 120), 30);
		if (parseInt(processingConfig.paymentInterval) < 120) {       
			logger.warning('WARN>PP>GCPI> minimum paymentInterval of 120 seconds recommended.');
		}
	}
	return payInterval;   
};
function getCoinPayMinimum(coin) {
	const logger = loggerFactory.getLogger('PaymentProcessor-GCPM', coin);  
	var poolOptions = poolConfigs[coin];
	var processingConfig = poolOptions.paymentProcessing;

	if (portalConfig.devmode) {
		var minimumPayment = new BigNumber(portalConfig.devmodePayMinimim) || 0.25;
	} else {
		var minimumPayment = new BigNumber(processingConfig.minimumPayment) || 0.25;
	}
	return minimumPayment;
};
function getCoinPrecision(coin) {
	const logger = loggerFactory.getLogger('PaymentProcessor-GCPR', coin);
	var poolOptions = poolConfigs[coin];
	var processingConfig = poolOptions.paymentProcessing;
	var coinPrecision = processingConfig.coinPrecision || 8;
	return coinPrecision;
};
function getTotalFees(coin) {
	const logger = loggerFactory.getLogger('PaymentProcessor-GTF', coin);
	var poolOptions = poolConfigs[coin];
	var processingConfig = poolOptions.paymentProcessing;
	for(var pool in poolConfigs) {
		var total = 0.0;
		var rewardRecipients = poolOptions.rewardRecipients || {};
		for (var r in rewardRecipients) {
			total += rewardRecipients[r];
		}
	}
	return total;   
};
function SetupForPool(poolOptions, setupFinished) {
	var coin = poolOptions.coin.name;
	const logger = loggerFactory.getLogger('PaymentProcessor', coin);
	var processingConfig = poolOptions.paymentProcessing;
	var daemon = new Stratum.daemon.interface([processingConfig.daemon], loggerFactory.getLogger('CoinDaemon', coin));
	var redisClient = redis.createClient(poolOptions.redis.port, poolOptions.redis.host);
	var totalCoinFees = getTotalFees(coin);
	logger.debug('PP> FEE % = %s', coin.toUpperCase(), totalCoinFees.toString(10)); 
	var coinPrecision = getCoinPrecision(coin);
	var minPayment = getCoinPayMinimum(coin);
	logger.debug('PP> minPayment = %s', coin.toUpperCase(), minPayment.toString(10));
	var paymentInterval = getCoinPayInterval(coin);
	logger.debug('PP> paymentInterval = %s', coin.toUpperCase(), paymentInterval.toString(10));      
	logger.debug('PP> Validating address and balance');
	async.parallel([
		function(callback) {
			daemon.cmd('validateaddress', [poolOptions.address], function(result) {
				logger.silly('PP> Validated %s address with result %s', poolOptions.address, JSON.stringify(result));
				if (result.error) {
					logger.error('PP>ERROR> Error with payment processing daemon %s', JSON.stringify(result.error));
					callback(true);
				} else if (!result.response || !result.response.ismine) {
					logger.error('PP>ERROR> Daemon does not own pool address - payment processing can not be done with this daemon, %s', JSON.stringify(result.response));
					callback(true);
				} else {
					callback()
				}
			}, true);
		},
		function(callback) {
			daemon.cmd('getbalance', [], function(result) {
				var wasICaught = false;
				if (result.error) {
					callback(true);
					return;
				}
				try {
					var resBal = result.response;
					logger.debug("PP>WARN> getbalance RPC reply is being tested for validity", resBal.toString());
					if (resBal >= 0.0) {
						logger.debug("PP>WARN> daemon wallet balance >= 0.0 PASSED - JSON: %s", resBal.toString());
					} else {
						logger.debug("PP>WARN> daemon wallet balance >= 0.0 FAILED - JSON: %s", resBal.toString());
						wasICaught = true;
					}
				} catch (e) {
					console.log(e);
					logger.error('PP>ERROR> Error detecting number of satoshis in a coin, cannot do payment processing. Tried parsing: %s', JSON.stringify(result.data));
					wasICaught = true;
				} 
				finally {
					if (wasICaught) {
						callback(true);
					} else {
						callback();
					}
				}
			}, true, true);
		}
		], function(err) {
			if (err) {
				logger.error("PP>ERROR> There was error during payment processor setup %s", JSON.stringify(err));
				setupFinished(false);
				return;
			}
			setInterval(function() {
				try {
					processPayments();
					logger.info("PP> Set up to process payments every %s seconds", paymentInterval);
				} catch (e) {
					logger.error("PP>ERROR> There was error during payment processor setup %s", JSON.stringify(e));
					throw e;
				}
			}, paymentInterval * 1000);
			setTimeout(processPayments, 100);
			setupFinished(true);
		});
		var cacheNetworkStats = function() {
			var params = null;
			daemon.cmd('getmininginfo', params,
			function(result) {
				if (!result || result.error || result[0].error || !result[0].response) {
					logger.error('PP>ERROR> Error with RPC call getmininginfo ' + JSON.stringify(result[0].error));
					return;
				}
				var coin = poolOptions.coin.name;
				var finalRedisCommands = [];
				if (result[0].response.blocks !== null) {
					finalRedisCommands.push(['hset', coin + ':stats', 'networkBlocks', result[0].response.blocks]);
				}
				if (result[0].response.difficulty !== null) {
					finalRedisCommands.push(['hset', coin + ':stats', 'networkDiff', result[0].response.difficulty]);
				}
				if (result[0].response.networkhashps !== null) {
					finalRedisCommands.push(['hset', coin + ':stats', 'networkSols', result[0].response.networkhashps]);
				}
				daemon.cmd('getnetworkinfo', params,
				function(result) {
					if (!result || result.error || result[0].error || !result[0].response) {
						logger.error('PP>ERROR> Error with RPC call getnetworkinfo ' + JSON.stringify(result[0].error));
						return;
					}
					if (result[0].response.connections !== null) {
						finalRedisCommands.push(['hset', coin + ':stats', 'networkConnections', result[0].response.connections]);
					}
					if (result[0].response.version !== null) {
						finalRedisCommands.push(['hset', coin + ':stats', 'networkVersion', result[0].response.version]);
					}
					if (result[0].response.subversion !== null) {
						finalRedisCommands.push(['hset', coin + ':stats', 'networkSubVersion', result[0].response.subversion]);
					}
					if (result[0].response.protocolversion !== null) {
						finalRedisCommands.push(['hset', coin + ':stats', 'networkProtocolVersion', result[0].response.protocolversion]);
					}
					if (finalRedisCommands.length <= 0)
					return;
					redisClient.multi(finalRedisCommands).exec(function(error, results) {
						if (error) {
							logger.error('PP>ERROR> Error with redis during call to cacheNetworkStats() ' + JSON.stringify(error));
							return;
						}
					});
				}
			);
		}
	);
}    
var stats_interval = 58 * 1000;
var statsInterval = setInterval(function() {
	cacheNetworkStats();
}, stats_interval);
var processPayments = function() {
	var startPaymentProcess = Date.now();
	var timeSpentRPC = 0;
	var timeSpentRedis = 0;
	var startTimeRedis;
	var startTimeRPC;
	var startRedisTimer = function() {
		startTimeRedis = Date.now()
	};
	var endRedisTimer = function() {
		timeSpentRedis += Date.now() - startTimeRedis
	};
	var startRPCTimer = function() {
		startTimeRPC = Date.now();
	};
	var endRPCTimer = function() {
		timeSpentRPC += Date.now() - startTimeRedis
	};
	async.waterfall([
		function(callback) {
			logger.debug("WATERFALL START - Calling redis for array of rounds");
			startRedisTimer();
			redisClient.multi([
				['hgetall', coin + ':balances'],
				['smembers', coin + ':blocksPending']
			]).exec(function(error, results) {
				logger.debug("WATERFALL> Redis responsed: %s", JSON.stringify(results));
				endRedisTimer();
				if (error) {
					logger.error('WATERFALL> Could not get blocks from redis %s', JSON.stringify(error));
					callback('WATERFALL> Could not get blocks from redis %s', JSON.stringify(error));
					return;
				}
				var workers = {};
				for (var w in results[0]) {
					workers[w] = {
					balance: new BigNumber(results[0][w])
				};
			}
			var rounds = results[1].map(function(r) {
				var details = r.split(':');
				return {
					blockHash: details[0],
					txHash: details[1],
					height: details[2],
					duplicate: false,
					serialized: r
				};
			});
			var duplicateFound = false;
			for (var i = 0; i < rounds.length; i++) {
				if (checkForDuplicateBlockHeight(rounds, rounds[i].height) === true) {
					rounds[i].duplicate = true;
					duplicateFound = true;
				}
			}
			if (duplicateFound) {
				var dups = rounds.filter(function(round){ return round.duplicate; });
				logger.debug('WATERFALL> Duplicate pending blocks found: ' + JSON.stringify(dups));
				var rpcDupCheck = dups.map(function(r) {
					return ['getblock', [r.blockHash]];
				});
				startRPCTimer();
				daemon.batchCmd(rpcDupCheck, function(error, blocks) {
					endRPCTimer();
					if (error || !blocks) {
						logger.error('PP>ATTN> Error with duplicate block check rpc call getblock %s', JSON.stringify(error));
						return;
					}
					var validBlocks = {};
					var invalidBlocks = [];
					blocks.forEach(function(block, i) {
						if (block && block.result) {
							if (block.result.confirmations < 0) {
								logger.debug('PP>ATTN> Remove invalid duplicate block %s > %s', block.result.height, block.result.hash);
								invalidBlocks.push(['smove', coin + ':blocksPending', coin + ':blocksDuplicate', dups[i].serialized]);
							} else {
								if (validBlocks.hasOwnProperty(dups[i].blockHash)) {
									logger.debug('PP>ATTN> Remove non-unique duplicate block %s > %s', block.result.height, block.result.hash);
									invalidBlocks.push(['smove', coin + ':blocksPending', coin + ':blocksDuplicate', dups[i].serialized]);
								} else {
									validBlocks[dups[i].blockHash] = dups[i].serialized;
									logger.debug('PP>ATTN> Keep valid duplicate block %s > %s', block.result.height, block.result.hash);
								}
							}
						}
					});
					rounds = rounds.filter(function(round){ return !round.duplicate; });
					if (invalidBlocks.length > 0) {
						startRedisTimer();
						redisClient.multi(invalidBlocks).exec(function(error, kicked) {
							endRedisTimer();
							if (error) {
								logger.error('PP>ATTN> Error could not move invalid duplicate blocks in redis %s', JSON.stringify(error));
							}
						});
					} else {
						logger.error('PP>ATTN> Unable to detect invalid duplicate blocks, duplicate block payments on hold.');
					}
				});
			}
			logger.debug("WATERFALL> Prepared info basic info about payments");
			logger.debug("WATERFALL> workers = %s", JSON.stringify(workers));
			logger.debug("WATERFALL> rounds = %s", JSON.stringify(rounds));
			logger.debug("WATERFALL> Workers count: %s Rounds: %s", Object.keys(workers).length, rounds.length);
			callback(null, workers, rounds);
		});
	},
	function(workers, rounds, callback) {
		logger.debug("WATERFALL> Checking for confirmed rounds (blocks)");
		var batchRPCcommand = rounds.map(function(r) {
			return ['gettransaction', [r.txHash]];
		});
		batchRPCcommand.push(['getaccount', [poolOptions.address]]);
		startRPCTimer();
		daemon.batchCmd(batchRPCcommand, function(error, txDetails) {
			endRPCTimer();
			if (error || !txDetails) {
				logger.error('WATERFALL> Check finished - daemon rpc error with batch gettransactions %s', JSON.stringify(error));
				callback('WATERFALL> Check finished - daemon rpc error with batch gettransactions %s', JSON.stringify(error));
				return;
			}
			var addressAccount = "";
			txDetails.forEach(function(tx, i) {
				if (i === txDetails.length - 1) {
					if (tx.result && tx.result.toString().length > 0) {
						addressAccount = tx.result.toString();
						logger.warn("WATERFALL> Could not retrieve account for %s from RPC (no tx.result or tx.address field) %s", poolOptions.address, JSON.stringify(tx));
					}
					return;
				}
				var round = rounds[i];
				if (tx && tx.result) {
					round.confirmations = parseInt((tx.result.confirmations || 0));
				}
				if (tx.error && tx.error.code === -5) {
					logger.warn('WATERFALL> Daemon reports invalid transaction: %s', round.txHash);
					logger.debug('WATERFALL> Filtering out round %s as kicked cause of invalid tx', round.height);
					round.category = 'kicked';
					return;
				} else if (!tx.result.details || (tx.result.details && tx.result.details.length === 0)) {
					logger.warn('WATERFALL> Daemon reports no details for transaction: %s');
					logger.debug('WATERFALL> Filtering out round %s as kicked cause of no details for transaction', round.height);
					round.category = 'kicked';
					return;
				} else if (tx.error || !tx.result) {
					logger.error('WATERFALL> Odd error with gettransaction %s. tx = %s', round.txHash, JSON.stringify(tx));
					round.category = 'kicked';
					return;
				}
				var generationTx = tx.result.details.filter(function(tx) {
					return tx.address === poolOptions.address;
				})[0];
				if (!generationTx && tx.result.details.length === 1) {
					generationTx = tx.result.details[0];
				}
				if (!generationTx) {
					logger.error('WATERFALL> Missing output details to pool address for transaction %s', round.txHash);
					return;
				}
				round.category = generationTx.category;
				if (round.category === 'generate') {
					round.reward = generationTx.amount || generationTx.value;
				}
			});
			var canDeleteShares = function(r) {
				for (var i = 0; i < rounds.length; i++) {
					var compareR = rounds[i];
					if ((compareR.height === r.height) &&
					(compareR.category !== 'kicked') &&
					(compareR.category !== 'orphan') &&
					(compareR.serialized !== r.serialized)) {
						return false;
					}
				}
				return true;
			};
			rounds = rounds.filter(function(r) {
				switch (r.category) {
					case 'orphan':
					case 'kicked':
					r.canDeleteShares = canDeleteShares(r);
					case 'generate':
					return true;
					default:
					return false;
				}
			});
			logger.debug("WATERFALL> Wokers and rounds after filtering orphans etc.");
			logger.debug("WATERFALL> workers = %s", JSON.stringify(workers));
			logger.debug("WATERFALL> rounds = %s", JSON.stringify(rounds));
			callback(null, workers, rounds, addressAccount);
		});
	},
	function(workers, rounds, addressAccount, callback) {
		logger.debug("WATERFALL> Getting all shares for rounds and calculating rewards for miners");
		var shareLookups = rounds.map(function(r) {
			return ['hgetall', coin + ':shares:round' + r.height]
		});
		logger.silly('WATERFALL> Calling redis for %s', JSON.stringify(shareLookups));
		startRedisTimer();
		redisClient.multi(shareLookups).exec(function(error, allWorkerShares) {
			endRedisTimer();
			logger.silly('WATERFALL> Response from redis allWorkerShares = %s', JSON.stringify(allWorkerShares));
			if (error) {
				logger.error('WATERFALL> Check finished - redis error with multi get rounds share');
				callback('WATERFALL> Check finished - redis error with multi get rounds share');
				return;
			}
			logger.silly('WATERFALL> allWorkerShares before merging %s', JSON.stringify(allWorkerShares));
			logger.debug("WATERFALL> Mapping workers into payout addresses");
			allWorkerShares = allWorkerShares.map((roundShare) => {
				let resultForRound = {};
				logger.debug("WATERFALL> roundShare = %s", roundShare);
				Object.keys(roundShare).forEach((workerStr) => {
					logger.debug("WATERFALL> Iterating worker %s", workerStr);
					if (workerStr) {
						if (workerStr.indexOf(".") !== -1) {
							logger.debug("WATERFALL> %s worker have both payout address and worker, merging", workerStr);
							let workerInfo = workerStr.split('.');
							if (workerInfo.length === 2) {
								let address = workerInfo[0];
								if (resultForRound[address]) {
									logger.debug("WATERFALL> Already have balance for address %s : %s", address, resultForRound[address].toString(10));
									resultForRound[address] = resultForRound[address].plus(roundShare[workerStr]);
									logger.debug("WATERFALL> New balance %s ", resultForRound[address].toString(10));
								} else {
									resultForRound[address] = new BigNumber(roundShare[workerStr]);
								}
							}
						} else {
							let address = workerStr;      
							daemon.cmd('validateaddress', [address], function(result) {
								if (result.error) {
									logger.debug('WATERFALL>ERROR> Error with payment processing daemon ' + JSON.stringify(result.error));
								}
							}, true);
							if (resultForRound[address]) {
								logger.debug("WATERFALL> Already have balance for address %s : %s", address, resultForRound[address].toString(10));
								resultForRound[address] = resultForRound[address].plus(roundShare[workerStr]);
								logger.debug("WATERFALL> New balance %s ", resultForRound[address].toString(10));
							} else {
								resultForRound[address] = new BigNumber(roundShare[workerStr]);
							}
						}
					} else {
						logger.debug('PP>WARN> Look around! We have anonymous shares, null worker');
					}
				});
				return resultForRound;
			});
			logger.debug('PP> Merged workers into payout addresses');
			logger.silly('PP> allWorkerShares after merging %s', JSON.stringify(allWorkerShares));
			rounds.forEach(function(round, i) {
				logger.silly('PP> iterating round #%s from allWorkerShares', i);
				logger.silly('PP> round = %s', JSON.stringify(round));
				var workerSharesForRound = allWorkerShares[i];
				logger.silly('PP> workerSharesForRound = %s', JSON.stringify(workerSharesForRound));
				if (!workerSharesForRound) {
					logger.error('PP> No worker shares for round: %s, blockHash %s', round.height, round.blockHash);
					return;
				}
				switch (round.category) {
					case 'kicked':
					case 'orphan':
					logger.warn("PP> Round with height %s and tx %s is orphan", round.height, round.txHash);
					round.workerShares = workerSharesForRound;
					break;
					case 'generate':
					logger.info("PP> We have found confirmed block #%s ready for payout", round.height);
					logger.silly("PP> round.reward = %s", round.reward);
					var reward = new BigNumber(round.reward);
					logger.silly("PP> reward = %s", reward.toString(10));
					var totalShares = Object.keys(workerSharesForRound).reduce(function(p, c) {
						if (p === 0) {
							p = new BigNumber(0)
						}
						return p.plus(workerSharesForRound[c])
					}, 0);
					logger.silly('PP> totalShares = %s', totalShares.toString(10));
					Object.keys(workerSharesForRound).forEach((workerAddress) => {
						logger.debug("PP> Calculating reward for workerAddress %s", workerAddress);
						let percent = workerSharesForRound[workerAddress].dividedBy(totalShares);
						logger.silly("PP> percent = %s", percent.toString(10));
						let workerRewardTotal = reward.multipliedBy(percent);
						logger.silly("PP> workerRewardTotal = %s", workerRewardTotal.toString(10));
						let worker = workers[workerAddress] = (workers[workerAddress] || {});
						logger.silly("PP> worker = %s", JSON.stringify(worker));
						worker.reward = (worker.reward || new BigNumber(0)).plus(workerRewardTotal);
						worker.roundShares = workerSharesForRound[workerAddress] || new BigNumber(0);
						worker.totalShares = (worker.totalShares || new BigNumber(0)).plus(worker.roundShares);
						logger.silly('PP> worker.reward = %s', worker.reward.toString(10));
					});
					break;
				}
			});
			callback(null, workers, rounds, addressAccount);
		});
	},
	function(workers, rounds, addressAccount, callback) {
		logger.debug("PP> Almost ready to send funds, calculating against existing balances");
		var trySend = function(withholdPercent) {
			logger.debug('PP> Trying to send');
			logger.debug('PP> withholdPercent = %s', withholdPercent.toString(10));
			var addressAmounts = {};
			var totalSent = new BigNumber(0);
			var totalShares = new BigNumber(0);
			var shareAmounts = {};
			var balanceAmounts = {};
			logger.debug('PP> totalSent = %s', totalSent);
			for (var w in workers) {
				logger.debug('PP> w = %s', w);
				var worker = workers[w];
				logger.debug('PP> worker = %s', JSON.stringify(worker));
				totalShares = totalShares.plus(worker.totalShares || new BigNumber(0));            
				logger.debug('PP> worker.totalShares = %s', (worker.totalShares || new BigNumber(0)).toString(10));
				worker.balance = worker.balance || new BigNumber(0);            
				logger.debug('PP> worker.balance = %s', worker.balance.toString(10));
				worker.reward = worker.reward || new BigNumber(0);
				logger.debug('PP> worker.reward = %s', worker.reward.toString(10));
				var toSend = (worker.balance.plus(worker.reward)).multipliedBy(new BigNumber(1).minus(withholdPercent));
				logger.debug('PP> toSend = %s', toSend.toString(10));
				if (toSend.isGreaterThanOrEqualTo(minPayment)) {
				logger.debug('PP> Worker %s have reached minimum payout threshold (%s above minimum %s)', w, toSend.toString(10), minPayment.toString(10));
				totalSent = totalSent.plus(toSend);              
				logger.debug('PP> totalSent = %s', totalSent.toString(10));
				var address = worker.address = (worker.address || getProperAddress(w));              
				logger.debug('PP> address = %s', address);
				worker.sent = addressAmounts[address] = toSend;
				logger.debug('PP> worker.sent = %s', worker.sent.toString(10));
				worker.balanceChange = BigNumber.min(worker.balance, worker.sent).multipliedBy(new BigNumber(-1));
				logger.debug('PP> worker.balanceChange = %s', worker.balanceChange.toString(10));
			} else {
				logger.debug('PP> Worker %s have not reached minimum payout threshold %s', w, minPayment.toString(10));
				worker.balanceChange = BigNumber.max(toSend.minus(worker.balance), new BigNumber(0));
				logger.debug('PP> worker.balanceChange = %s', worker.balanceChange.toString(10));
				worker.sent = new BigNumber(0);
				logger.debug('PP> worker.sent = %s', worker.sent.toString(10));
				if (worker.balanceChange > 0) {
					if (balanceAmounts[address] != null && balanceAmounts[address].isGreaterThan(0)) {
						balanceAmounts[address] = balanceAmounts[address].plus(worker.balanceChange);
					} else {
						balanceAmounts[address] = worker.balanceChange;
					}
				}
			}
			if (worker.totalShares && worker.totalShares.isGreaterThan(0)) {
				if (shareAmounts[address] && shareAmounts[address].isGreaterThan(0)) {
					shareAmounts[address] = shareAmounts[address].plus(worker.totalShares);
				} else {
					shareAmounts[address] = worker.totalShares;
				}
			}
		}
		if (Object.keys(addressAmounts).length === 0) {
			logger.info('PP> No workers was chosen for paying out');
			callback(null, workers, rounds, []);
			return;
		}
		logger.info('PP> Payments to miners: %s', JSON.stringify(addressAmounts));
		var feeAddresses = [];
		var rewardAddresses = poolOptions.rewardRecipients;
		Object.keys(addressAmounts).forEach((address) => {
			addressAmounts[address] = new BigNumber(addressAmounts[address].toFixed(coinPrecision, 1)).toNumber();
		});
		logger.info('PP> Ok, going to pay from "%s" address with final amounts: %s', addressAccount, JSON.stringify(addressAmounts));
		logger.info('PP> Ok, going to pay FEES from "%s" addresses: %s', feeAddresses, JSON.stringify(feeAddresses));
		daemon.cmd('sendmany', [addressAccount || '', addressAmounts, 1, ""], function(result) {
			if (result.error && result.error.code === -6) {
				var higherPercent = withholdPercent.plus(new BigNumber(0.01));
				logger.warn('PP> Not enough funds to cover the tx fees for sending out payments, decreasing rewards by %s% and retrying');
				trySend(higherPercent);
			} else if (result.error) {
				logger.error('PP> Error trying to send payments with RPC sendmany %s', JSON.stringify(result.error));
				callback('PP> Error trying to send payments with RPC sendmany %s', JSON.stringify(result.error));
			} else {
				var txid = null;
				if (result.response) {
					txid = result.response;
				}
				if (!txid || txid == null) {
					logger.warn('PP> We didn\'t get a txid from \'sendmany\'... This could be a problem! Tried parsing: %s', JSON.stringify(result));
				}
				logger.debug('PP> Sent out a total of ' + (totalSent) + ' to ' + Object.keys(addressAmounts).length + ' workers');
				if (withholdPercent.isGreaterThan(new BigNumber(0))) {
					logger.warn('PP> Had to withhold ' + (withholdPercent * new BigNumber(100)).toString(10) + '% of reward from miners to cover transaction fees. ' + 'Fund pool wallet with coins to prevent this from happening');
				}
				var paymentBlocks = rounds.filter(r => r.category == 'generate').map(r => parseInt(r.height));
				var paymentBlockID = rounds.filter(r => r.category == 'generate').map(r => r.blockHash);
				var paymentsUpdate = [];
				var paymentsData = {
					time: Date.now(),
					txid: txid,
					txidd: txid,
					shares: totalShares,
					paid: totalSent,
					miners: Object.keys(addressAmounts).length,
					blocks: paymentBlocks,
					blkid: paymentBlockID,
					amounts: addressAmounts,
					balances: balanceAmounts,
					work: shareAmounts
				};
				paymentsUpdate.push(['zadd', poolOptions.coin.name + ':payments', Date.now(), JSON.stringify(paymentsData)]);
				callback(null, workers, rounds, paymentsUpdate);
			}
		}, true, true);
	};
	trySend(new BigNumber(0));
},
function(workers, rounds, paymentsUpdate, callback) {
	var totalPaid = new BigNumber(0);
	var balanceUpdateCommands = [];
	var workerPayoutsCommand = [];
	for (var w in workers) {
		var worker = workers[w];
		if (!worker.balanceChange.eq(new BigNumber(0))) {
			balanceUpdateCommands.push([
				'hincrbyfloat',
				coin + ':balances',
				w,
				worker.balanceChange.toFixed(coinPrecision).toString(10)
			]);
		}
		if (worker.sent !== 0) {
			workerPayoutsCommand.push(['hincrbyfloat', coin + ':payouts', w, worker.sent.toString(10)]);
			totalPaid = totalPaid.plus(worker.sent);
		}
	}
	var movePendingCommands = [];
	var roundsToDelete = [];
	var orphanMergeCommands = [];
	var confirmsUpdate = [];
	var confirmsToDelete = [];
	var moveSharesToCurrent = function(r) {
		var workerShares = r.workerShares;
		Object.keys(workerShares).forEach(function(worker) {
			orphanMergeCommands.push(['hincrby', coin + ':shares:roundCurrent',
				worker, workerShares[worker].toFixed(coinPrecision).toString()
			]);
		});
	};
	rounds.forEach(function(r) {
		switch (r.category) {
			case 'kicked':
			movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksKicked', r.serialized]);
			case 'orphan':
			confirmsToDelete.push(['hdel', coin + ':blocksPendingConfirms', r.blockHash]);
			movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksOrphaned', r.serialized]);
			if (r.canDeleteShares) {
				moveSharesToCurrent(r);
				roundsToDelete.push(coin + ':shares:round' + r.height);
			}
			return;
			case 'immature':
			confirmsUpdate.push(['hset', coin + ':blocksPendingConfirms', r.blockHash, (r.confirmations || 0)]);
			return;
			case 'generate':
			movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksConfirmed', r.serialized]);
			roundsToDelete.push(coin + ':shares:round' + r.height);
			return;
		}
	});
	var finalRedisCommands = [];
	logger.silly("PP> finalRedisCommands %s", finalRedisCommands);
	if (movePendingCommands.length > 0) {
		logger.silly("PP> movePendingCommands goes in redis");
		logger.silly("PP> movePendingCommands = %s", movePendingCommands);
		finalRedisCommands = finalRedisCommands.concat(movePendingCommands);
	}
	if (orphanMergeCommands.length > 0) {
		logger.silly("PP> orphanMergeCommands goes in redis");
		logger.silly("PP> orphanMergeCommands = %s", orphanMergeCommands);
		finalRedisCommands = finalRedisCommands.concat(orphanMergeCommands);
	}
	if (balanceUpdateCommands.length > 0) {
		logger.silly("PP> balanceUpdateCommands goes in redis");
		logger.silly("PP> balanceUpdateCommands = %s", balanceUpdateCommands);
		finalRedisCommands = finalRedisCommands.concat(balanceUpdateCommands);
	}
	if (workerPayoutsCommand.length > 0) {
		logger.silly("PP> workerPayoutsCommand goes in redis");
		logger.silly("PP> workerPayoutsCommand = %s", workerPayoutsCommand);
		finalRedisCommands = finalRedisCommands.concat(workerPayoutsCommand);
	}
	if (roundsToDelete.length > 0) {
		logger.silly("PP> roundsToDelete goes in redis");
		logger.silly("PP> roundsToDelete = %s", roundsToDelete);
		finalRedisCommands.push(['del'].concat(roundsToDelete));
	}
	if (paymentsUpdate.length > 0) {
		logger.silly("PP> paymentsUpdate goes in redis");
		logger.silly("PP> paymentsUpdate = %s", roundsToDelete);
		finalRedisCommands = finalRedisCommands.concat(paymentsUpdate);
	}
	if (confirmsUpdate.length > 0) {
		logger.silly("PP> confirmsUpdate goes in redis");
		logger.silly("PP> confirmsUpdate = %s", confirmsUpdate);
		finalRedisCommands = finalRedisCommands.concat(confirmsUpdate);
	}
	if (confirmsToDelete.length > 0) {
		logger.silly("PP> confirmsToDelete goes in redis");
		logger.silly("PP> confirmsToDelete = %s", confirmsToDelete);
		finalRedisCommands = finalRedisCommands.concat(confirmsToDelete);
	}
	if (!totalPaid.eq(new BigNumber(0))) {
		logger.silly("PP> totalPaid goes in redis");
		logger.silly("PP> totalPaid = %s", totalPaid);
		finalRedisCommands.push(['hincrbyfloat', coin + ':stats', 'totalPaid', totalPaid.toFixed(coinPrecision).toString()]);
	}
	if (finalRedisCommands.length === 0) {
		logger.silly("PP> Nothing to write to redis");
		callback("PP> Nothing to write to redis");
		return;
	}
	logger.silly("PP> finalRedisCommands %s", finalRedisCommands);
	startRedisTimer();
	redisClient.multi(finalRedisCommands).exec(function(error, results) {
		endRedisTimer();
		if (error) {
			clearInterval(paymentInterval);
			logger.error('PP> Payments sent but could not update redis. Disabling payment processing to prevent possible double-payouts.' +
			' %s The redis commands in %s_finalRedisCommands.txt must be ran manually', JSON.stringify(error), coin);
			fs.writeFile(coin + '_finalRedisCommands_' + new Date().getTime() + '.txt`', JSON.stringify(finalRedisCommands), function(err) {
				logger.error('PP> Could not write finalRedisCommands.txt, you are fucked.');
			});
		}
		logger.debug("PP> Redis have sucessfully updated after payouts");
		callback("PP> Redis updated successfully after payouts");
	});
}],
function(wfresult) {
	logger.debug('PP> WATERFALL RESULT: %s', wfresult);
	var paymentProcessTime = Date.now() - startPaymentProcess;
	logger.debug('PP> FINISHED PAYMENT INTERVAL - time spent: %s ms total, %s ms redis, %s ms daemon RPC',
	paymentProcessTime,
	timeSpentRedis,
	timeSpentRPC);
	});
};
function checkForDuplicateBlockHeight(rounds, height) {
	var count = 0;
	for (var i = 0; i < rounds.length; i++) {
		if (rounds[i].height == height)
		count++;
	}
	return count > 1;
}
var getProperAddress = function(address) {
	if (address.length === 40) {
		var res = address.split(".")
		return util.addressFromEx(poolOptions.address, res[0]);
	}
	else return address;
	return address;
};
}