var zlib = require('zlib');

var redis = require('redis');
var async = require('async');


var os = require('os');

var algos = require('stratum-pool/lib/algoProperties.js');

const logger = require('./logger.js').getLogger('Stats', 'system');


module.exports = function(portalConfig, poolConfigs) {
  logger.info("Starting Stats Module...");

  var _this = this;

  var redisClients = [];
  var redisStats;

  this.statHistory = [];
  this.statPoolHistory = [];

  this.stats = {};
  this.statsString = '';


  logger.debug("Initializing Stats Redis...");
  setupStatsRedis();

  logger.debug("Initializing Stats History...");
  gatherStatHistory();

  Object.keys(poolConfigs).forEach(function(coin) {

    var poolConfig = poolConfigs[coin];
    var redisConfig = poolConfig.redis;

    for (var i = 0; i < redisClients.length; i++) {
      var client = redisClients[i];
      if (client.client.port === redisConfig.port && client.client.host === redisConfig.host) {
        client.coins.push(coin);
        return;
      }
    }
    redisClients.push({
      coins: [coin],
      client: redis.createClient(redisConfig.port, redisConfig.host)
    });
  });


  function setupStatsRedis() {
    redisStats = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
    redisStats.on('error', function(err) {
      logger.error('Stats Redis Encountered An Error! Message: %s', JSON.stringify(err));
    });
  }

  function gatherStatHistory() {

    var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();
    redisStats.zrangebyscore(['statHistory', retentionTime, '+inf'], function(err, replies) {
      if (err) {
        logger.error('Error When Trying To Grab Historical Stat Data! Message: %s', JSON.stringify(err));
        return;
      }
      for (var i = 0; i < replies.length; i++) {
        _this.statHistory.push(JSON.parse(replies[i]));
      }
      _this.statHistory = _this.statHistory.sort(function(a, b) {
        return a.time - b.time;
      });
      _this.statHistory.forEach(function(stats) {
        addStatPoolHistory(stats);
      });
    });
  }

  function addStatPoolHistory(stats) {
    var data = {
      time: stats.time,
      pools: {}
    };
    for (var pool in stats.pools) {
      data.pools[pool] = {
        hashrate: stats.pools[pool].hashrate,
        workerCount: stats.pools[pool].workerCount,
        blocks: stats.pools[pool].blocks
      }
    }
    _this.statPoolHistory.push(data);
  }

  var magnitude = 100000000;
  var coinPrecision = magnitude.toString().length - 1;

  function coinsRound(number) {
    return roundTo(number, coinPrecision);
  }

  function roundTo(n, digits) {
    if (digits === undefined) {
      digits = 0;
    }
    var multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    var test = (Math.round(n) / multiplicator);
    return +(test.toFixed(digits));
  }

  var satoshisToCoins = function(satoshis) {
    return roundTo((satoshis / magnitude), coinPrecision);
  };

  var coinsToSatoshies = function(coins) {
    return Math.round(coins * magnitude);
  };

  function readableSeconds(t) {
        var seconds = Math.round(t);
        var minutes = Math.floor(seconds/60);
        var hours = Math.floor(minutes/60);
        var days = Math.floor(hours/24);
        hours = hours-(days*24);
        minutes = minutes-(days*24*60)-(hours*60);
        seconds = seconds-(days*24*60*60)-(hours*60*60)-(minutes*60);
        if (days > 0) { return (days + "d " + hours + "h " + minutes + "m " + seconds + "s"); }
        if (hours > 0) { return (hours + "h " + minutes + "m " + seconds + "s"); }
        if (minutes > 0) {return (minutes + "m " + seconds + "s"); }
        return (seconds + "s");
  }
  
  this.getTotalSharesByAddress = function(address, cback) {
    var a = address.split(".")[0];
    var client = redisClients[0].client,
      coins = redisClients[0].coins,
      shares = [];

    var pindex = parseInt(0);
    var totalShares = parseFloat(0);
    async.each(_this.stats.pools, function(pool, pcb) {
      pindex++;
      var coin = String(_this.stats.pools[pool.name].name);
      client.hscan(coin + ':shares:roundCurrent', 0, "match", a + "*", "count", 1000, function(error, result) {
        if (error) {
          pcb(error);
          return;
        }
        var workerName = "";
        var shares = 0;
        for (var i in result[1]) {
          if (Math.abs(i % 2) != 1) {
            workerName = String(result[1][i]);
          } else {
            shares += parseFloat(result[1][i]);
          }
        }
        if (shares > 0) {
          totalShares = shares;
        }
        pcb();
      });
    }, function(err) {
      if (err) {
        cback(0);
        return;
      }
      if (totalShares > 0 || (pindex >= Object.keys(_this.stats.pools).length)) {
        cback(totalShares);
        return;
      }
    });
  };

  this.getBalanceByAddress = function(address, cback) {

    var a = address.split(".")[0];

    var client = redisClients[0].client,
      coins = redisClients[0].coins,
      balances = [];

    var totalHeld = parseFloat(0);
    var totalPaid = parseFloat(0);
    var totalImmature = parseFloat(0);

//    logger.debug("STATS>BEGIN> STATS BEING CALCULATED...");

    async.each(_this.stats.pools, function(pool, pcb) {
      var coin = String(_this.stats.pools[pool.name].name);
      
//      client.hscan(coin + ':shares:roundCurrent', 0, "match", a + "*", "count", 1000, function(error, result) {pexacoin:blocksPending
          
      // get all immature balances from address
      client.hscan(coin + ':immature', 0, "match", a + "*", "count", 10000, function(pendserr, pends) {
        // get all balances from address
        client.hscan(coin + ':balances', 0, "match", a + "*", "count", 10000, function(balserr, bals) {
          // get all payouts from address
          client.hscan(coin + ':payouts', 0, "match", a + "*", "count", 10000, function(payserr, pays) {

            logger.debug("STATS> pendserr: [%s] balserr: [%s] payserr: [%s]", pendserr, balserr, payserr);

            var workerName = "";
            var balAmount = 0;
            var paidAmount = 0;
            var pendingAmount = 0;

            var workers = {};

            for (var i in pays[1]) {
              if (Math.abs(i % 2) != 1) {
                workerName = String(pays[1][i]);
                workers[workerName] = (workers[workerName] || {});
              } else {
                paidAmount = parseFloat(pays[1][i]);
                workers[workerName].paid = coinsRound(paidAmount);
                totalPaid += paidAmount;
              }
            }
            for (var b in bals[1]) {
              if (Math.abs(b % 2) != 1) {
                workerName = String(bals[1][b]);
                workers[workerName] = (workers[workerName] || {});
              } else {
                balAmount = parseFloat(bals[1][b]);
                workers[workerName].balance = coinsRound(balAmount);
                totalHeld += balAmount;
              }
            }
            
            totalImmature = 0;            
            
//            logger.debug("STATS>PENDS> " + JSON.stringify(pends));            
            
            for (var b in pends[1]) {
              if (Math.abs(b % 2) != 1) {
                workerName = String(pends[1][b]);
                workers[workerName] = (workers[workerName] || {});
              } else {
                pendingAmount = parseFloat(pends[1][b]);
                workers[workerName].immature = coinsRound(pendingAmount);
                totalImmature += pendingAmount;
              }
            }

            for (var w in workers) {
              balances.push({
                worker: String(w),
                balance: workers[w].balance,
                paid: workers[w].paid,
                immature: workers[w].immature
              });
            }

            pcb();

          });

        });

      });
      


    }, function(err) {
      if (err) {
        callback("STATS> There Was An Error Getting Balances!");
        return;
      }

      _this.stats.balances = balances;
      _this.stats.address = address;

      cback({
        totalHeld: coinsRound(totalHeld),
        totalPaid: coinsRound(totalPaid),
        totalImmature: satoshisToCoins(totalImmature),
        balances
      });
    });
  };


  this.getGlobalStats = function(callback) {

    var statGatherTime = Date.now() / 1000 | 0;

    var allCoinStats = {};

    async.each(redisClients, function(client, callback) {
      var windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow) | 0).toString();
      var redisCommands = [];


      var redisCommandTemplates = [
        ['zremrangebyscore', ':hashrate', '-inf', '(' + windowTime],
        ['zrangebyscore', ':hashrate', windowTime, '+inf'],
        ['hgetall', ':stats'],
        ['scard', ':blocksPending'],
        ['scard', ':blocksConfirmed'],
        ['scard', ':blocksOrphaned'],
        ['smembers', ':blocksConfirmed'],
        ['zrange', ':payments', -100, -1],
        ['hgetall', ':shares:roundCurrent'],
        ['smembers', ':blocksConfirmed'],
        ['hgetall', ':blocksPendingConfirms'],
        ['smembers', ':blocksConfirmed']
      ];

      var commandsPerCoin = redisCommandTemplates.length;

      client.coins.map(function(coin) {
        redisCommandTemplates.map(function(t) {
          var clonedTemplates = t.slice(0);
          clonedTemplates[1] = coin + clonedTemplates[1];
          redisCommands.push(clonedTemplates);
        });
      });

      client.client.multi(redisCommands).exec(function(err, replies) {
        if (err) {
          logger.error('STATS> Error with getting global stats, err = %s', JSON.stringify(err));
          callback(err);
        } else {
          for (var i = 0; i < replies.length; i += commandsPerCoin) {
            var coinName = client.coins[i / commandsPerCoin | 0];
            
            var coinStats = {
              name: coinName,
              explorerGetBlock: poolConfigs[coinName].coin.explorerGetBlock,
              
              blockTime: poolConfigs[coinName].coin.blockTime,
              blockChange: poolConfigs[coinName].coin.blockChange,
              
              explorerGetBlockJSON: poolConfigs[coinName].coin.explorerGetBlockJSON,
              explorerGetTX: poolConfigs[coinName].coin.explorerGetTX,
              symbol: poolConfigs[coinName].coin.symbol.toUpperCase(),
              algorithm: poolConfigs[coinName].coin.algorithm,
              hashrates: replies[i + 1],
              rewardRecipients: poolConfigs[coinName].rewardRecipients,
              
              poolStats: {
                validShares: replies[i + 2] ? (replies[i + 2].validShares || 0) : 0,
                validBlocks: replies[i + 2] ? (replies[i + 2].validBlocks || 0) : 0,
                invalidShares: replies[i + 2] ? (replies[i + 2].invalidShares || 0) : 0,
                totalPaid: replies[i + 2] ? (replies[i + 2].totalPaid || 0) : 0,
                networkBlocks: replies[i + 2] ? (replies[i + 2].networkBlocks || 0) : 0,
                networkSols: replies[i + 2] ? (replies[i + 2].networkSols || 0) : 0,
                networkSolsString: _this.getReadableHashRateString(replies[i + 2] ? (replies[i + 2].networkSols || 0) : 0),
                networkDiff: replies[i + 2] ? (replies[i + 2].networkDiff || 0) : 0,
                networkConnections: replies[i + 2] ? (replies[i + 2].networkConnections || 0) : 0,
                networkVersion: replies[i + 2] ? (replies[i + 2].networkSubVersion || 0) : 0,
                networkProtocolVersion: replies[i + 2] ? (replies[i + 2].networkProtocolVersion || 0) : 0
              },
              
              blocks: {
                pending: replies[i + 3],
                confirmed: replies[i + 4],
                orphaned: replies[i + 5]
              },
              
              pending: {
                blocks: replies[i + 9].sort(sortBlocks),
                confirms: (replies[i + 10] || {})
              },
              
              confirmed: {
                blocks: replies[i + 11].sort(sortBlocks).slice(0,50)
              },
              
              payments: [],
              currentRoundShares: (replies[i + 8] || {}),
              currentRoundTimes: (replies[i + 11] || {}),
              maxRoundTime: 0,
              shareCount: 0
            };
            for(var j = replies[i + 7].length; j > 0; j--){
                 var jsonObj;
                 try {
                     jsonObj = JSON.parse(replies[i + 7][j-1]);
                 } catch(e) {
                     jsonObj = null;
                 }
                 if (jsonObj !== null) {
                     coinStats.payments.push(jsonObj);
                 }
             }
            allCoinStats[coinStats.name] = (coinStats);
          }
          callback();
        }
      });
    }, function(err) {
      if (err) {
        logger.error('STATS> Error getting all stats, err = %s', JSON.stringify(err));
        callback();
        return;
      }

      var portalStats = {
                time: statGatherTime,
                global:{
                    workers: 0,
                    hashrate: 0
                },
                algos: {},
                pools: allCoinStats
            };

            Object.keys(allCoinStats).forEach(function(coin){
                var coinStats = allCoinStats[coin];
                coinStats.workers = {};
                coinStats.miners = {};
                coinStats.shares = 0;
                coinStats.hashrates.forEach(function(ins){
                    var parts = ins.split(':');
                    var workerShares = parseFloat(parts[0]);
                    var miner = parts[1].split('.')[0];
                    var worker = parts[1];
                    var diff = Math.round(parts[0] * 8192);
                    var lastShare = parseInt(parts[2]);
                    if (workerShares > 0) {
                        coinStats.shares += workerShares;
                        // build worker stats
                        if (worker in coinStats.workers) {
                            coinStats.workers[worker].shares += workerShares;
                            coinStats.workers[worker].diff = diff;
                            if (lastShare > coinStats.workers[worker].lastShare) {
                                coinStats.workers[worker].lastShare = lastShare;
                            }
                        } else {
                            coinStats.workers[worker] = {
                                lastShare: 0,
                                name: worker,
                                diff: diff,
                                shares: workerShares,
                                invalidshares: 0,
                                currRoundShares: 0,
                                currRoundTime: 0,
                                hashrate: null,
                                hashrateString: null,
                                luckDays: null,
                                luckHours: null,
                                paid: 0,
                                balance: 0
                            };
                        }
                        // build miner stats
                        if (miner in coinStats.miners) {
                            coinStats.miners[miner].shares += workerShares;
                            if (lastShare > coinStats.miners[miner].lastShare) {
                                coinStats.miners[miner].lastShare = lastShare;
                            }
                        } else {
                            coinStats.miners[miner] = {
                                lastShare: 0,
                                name: miner,
                                shares: workerShares,
                                invalidshares: 0,
                                currRoundShares: 0,
                                currRoundTime: 0,
                                hashrate: null,
                                hashrateString: null,
                                luckDays: null,
                                luckHours: null
                            };
                        }
                    }
                    else {
                        // build worker stats
                        if (worker in coinStats.workers) {
                            coinStats.workers[worker].invalidshares -= workerShares; // workerShares is negative number!
                            coinStats.workers[worker].diff = diff;
                        } else {
                            coinStats.workers[worker] = {
                                lastShare: 0,
                                name: worker,
                                diff: diff,
                                shares: 0,
                                invalidshares: -workerShares,
                                currRoundShares: 0,
                                currRoundTime: 0,
                                hashrate: null,
                                hashrateString: null,
                                luckDays: null,
                                luckHours: null,
                                paid: 0,
                                balance: 0
                            };
                        }
                        // build miner stats
                        if (miner in coinStats.miners) {
                            coinStats.miners[miner].invalidshares -= workerShares; // workerShares is negative number!
                        } else {
                            coinStats.miners[miner] = {
                                lastShare: 0,
                                name: miner,
                                shares: 0,
                                invalidshares: -workerShares,
                                currRoundShares: 0,
                                currRoundTime: 0,
                                hashrate: null,
                                hashrateString: null,
                                luckDays: null,
                                luckHours: null
                            };
                        }
                    }
                });
        
                var shareMultiplier = Math.pow(2, 32) / algos[coinStats.algorithm].multiplier;
                coinStats.hashrate = shareMultiplier * coinStats.shares / portalConfig.website.stats.hashrateWindow;
                coinStats.hashrateString = _this.getReadableHashRateString(coinStats.hashrate);
              
                var _blocktime = coinStats.blockTime || 60;
                var _networkHashRate = parseFloat(coinStats.poolStats.networkSols) * 1.2;
                var _myHashRate = (coinStats.hashrate / 1000000) * 2;
                coinStats.luckDays =  ((_networkHashRate / _myHashRate * _blocktime) / (24 * 60 * 60)).toFixed(3);
                coinStats.luckHours = ((_networkHashRate / _myHashRate * _blocktime) / (60 * 60)).toFixed(3);
                coinStats.minerCount = Object.keys(coinStats.miners).length;
                coinStats.workerCount = Object.keys(coinStats.workers).length;
                portalStats.global.workers += coinStats.workerCount;

                /* algorithm specific global stats */
                var algo = coinStats.algorithm;
                if (!portalStats.algos.hasOwnProperty(algo)){
                    portalStats.algos[algo] = {
                        workers: 0,
                        hashrate: 0,
                        hashrateString: null
                    };
                }
                portalStats.algos[algo].hashrate += coinStats.hashrate;
                portalStats.algos[algo].workers += Object.keys(coinStats.workers).length;

                var _shareTotal = parseFloat(0);
                var _maxTimeShare = parseFloat(0);
                for (var worker in coinStats.currentRoundShares) {
                    var miner = worker.split(".")[0];
                    if (miner in coinStats.miners) {
                        coinStats.miners[miner].currRoundShares += parseFloat(coinStats.currentRoundShares[worker]);
                    }
                    if (worker in coinStats.workers) {
                        coinStats.workers[worker].currRoundShares += parseFloat(coinStats.currentRoundShares[worker]);
                    }
                    _shareTotal += parseFloat(coinStats.currentRoundShares[worker]);
                }
                for (var worker in coinStats.currentRoundTimes) {
                    var time = parseFloat(coinStats.currentRoundTimes[worker]);
                    if (_maxTimeShare < time) { _maxTimeShare = time; }
                    var miner = worker.split(".")[0];    // split poolId from minerAddress
                    if (miner in coinStats.miners && coinStats.miners[miner].currRoundTime < time) {
                        coinStats.miners[miner].currRoundTime = time;
                    }
                }

                coinStats.shareCount = _shareTotal;
                coinStats.maxRoundTime = _maxTimeShare;
                coinStats.maxRoundTimeString = readableSeconds(_maxTimeShare);

                for (var worker in coinStats.workers) {
                    var _workerRate = shareMultiplier * coinStats.workers[worker].shares / portalConfig.website.stats.hashrateWindow;
                    var _wHashRate = (_workerRate / 1000000) * 2;
                    coinStats.workers[worker].luckDays = ((_networkHashRate / _wHashRate * _blocktime) / (24 * 60 * 60)).toFixed(3);
                    coinStats.workers[worker].luckHours = ((_networkHashRate / _wHashRate * _blocktime) / (60 * 60)).toFixed(3);
                    coinStats.workers[worker].hashrate = _workerRate;
                    coinStats.workers[worker].hashrateString = _this.getReadableHashRateString(_workerRate);
                    var miner = worker.split('.')[0];
                    if (miner in coinStats.miners) {
                        coinStats.workers[worker].currRoundTime = coinStats.miners[miner].currRoundTime;
                    }
                }
                for (var miner in coinStats.miners) {
                    var _workerRate = shareMultiplier * coinStats.miners[miner].shares / portalConfig.website.stats.hashrateWindow;
                    var _wHashRate = (_workerRate / 1000000) * 2;
                    coinStats.miners[miner].luckDays = ((_networkHashRate / _wHashRate * _blocktime) / (24 * 60 * 60)).toFixed(3);
                    coinStats.miners[miner].luckHours = ((_networkHashRate / _wHashRate * _blocktime) / (60 * 60)).toFixed(3);
                    coinStats.miners[miner].hashrate = _workerRate;
                    coinStats.miners[miner].hashrateString = _this.getReadableHashRateString(_workerRate);
                }

                delete coinStats.hashrates;
                delete coinStats.shares;
            });

      Object.keys(portalStats.algos).forEach(function(algo) {
        var algoStats = portalStats.algos[algo];
        algoStats.hashrateString = _this.getReadableHashRateString(algoStats.hashrate);
      });

      _this.stats = portalStats;
      _this.statsString = JSON.stringify(portalStats);


      _this.statHistory.push(portalStats);
      addStatPoolHistory(portalStats);

      var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0);

      for (var i = 0; i < _this.statHistory.length; i++) {
        if (retentionTime < _this.statHistory[i].time) {
          if (i > 0) {
            _this.statHistory = _this.statHistory.slice(i);
            _this.statPoolHistory = _this.statPoolHistory.slice(i);
          }
          break;
        }
      }

      redisStats.multi([
        ['zadd', 'statHistory', statGatherTime, _this.statsString],
        ['zremrangebyscore', 'statHistory', '-inf', '(' + retentionTime]
      ]).exec(function(err, replies) {
        if (err)
          logger.error('STATS> Error adding stats to historics, err = %s', JSON.stringify(err));
      });
      callback();
    });

  };

    function sortBlocks(a, b) {
        var as = parseInt(a.split(":")[2]);
        var bs = parseInt(b.split(":")[2]);
        if (as > bs) return -1;
        if (as < bs) return 1;
        return 0;
    }


  this.getPoolStats = function(coin, cback) {
    if (coin.length > 0) {
      _this.stats.coin = coin;
      cback({
        name: coin
      });
    }
  };

  this.getReadableHashRateString = function(hashrate) {
    if(hashrate <= 0){
      return '0 H/s';
    } else {
      hashrate = (hashrate * 1000000);
      if(hashrate < 1000000){
        hashrate = hashrate * 100000;
      }
      var byteUnits = [' H/s', ' KH/s', ' MH/s', ' GH/s', ' TH/s', ' PH/s'];
      var i = Math.floor((Math.log(hashrate/1000) / Math.log(1000)) - 1);
      hashrate = (hashrate/1000) / Math.pow(1000, i + 1);
      return hashrate.toFixed(2) + byteUnits[i];
    }
  };
};
