const fs = require('fs');
var path = require('path');
const http = require('http');
const https = require('https');
var async = require('async');
var redis = require('redis');
var watch = require('node-watch');
var dot = require('dot');
var express = require('express');
var bodyParser = require('body-parser');
var compress = require('compression');
var Stratum = require('stratum-pool');
var util = require('stratum-pool/lib/util.js');
var api = require('./api.js');
const loggerFactory = require('./logger.js');
const logger = loggerFactory.getLogger('Website', 'system');

if (fs.existsSync('lzCode.conf')) { var lzCode = fs.readFileSync('lzCode.conf','utf8'); } else { var lzCode = ""; }
if (fs.existsSync('matomoCode.conf')) { var matomoCode = fs.readFileSync('matomoCode.conf','utf8'); } else { var matomoCode = ""; }

module.exports = function () {
	logger.info("Starting Website module");
	dot.templateSettings.strip = false;
	var portalConfig = JSON.parse(process.env.portalConfig);
	var poolConfigs = JSON.parse(process.env.pools);
	var websiteConfig = portalConfig.website;
	var portalApi = new api(portalConfig, poolConfigs);
	var portalStats = portalApi.stats;
	var logSystem = 'Website';
	var pageFiles = {
		'index.html': 'index',				// index page
		'home.html': '',				// home page
		'getting_started.html': 'getting_started',	// getting started page
		'dashboard.html': 'dashboard',                  // dashboard page
		'pools.html': 'pools',                          // all pool stats page
		'stats.html': 'stats',                          // pool stats pages
		'workers.html': 'workers',                      // all worker stats pages
		'blocks.html': 'blocks',                        // payment history
		'blocks_found.html': 'blocks_found',            // blocks history
		'learn_more.html': 'learn_more',                // help
		'miner_stats.html': 'miner_stats',              // miner stats page
		'pool_stats.html': 'pool_stats'                 // pool page
	};
	var mainScriptPath = require('path').dirname(require.main.filename)    
	if ((fs.existsSync(mainScriptPath + '/website/pages/news.html'))) {
		pageFiles['news.html'] = "news";
		logger.debug("Loaded CUSTOM news.html"); 
	} else {
		pageFiles['news_example.html'] = "news";
		logger.debug("Loaded EXAMPLE news_example.html");
	}    
	var pageTemplates = {};
	var pageProcessed = {};
	var indexesProcessed = {};
	var keyScriptTemplate = '';
	var keyScriptProcessed = '';
	var processTemplates = function () {
		for (var pageName in pageTemplates) {
			if (pageName === 'index') continue;
			pageProcessed[pageName] = pageTemplates[pageName]({
				poolsConfigs: poolConfigs,
				stats: portalStats.stats,
				portalConfig: portalConfig,
				matomoCode: matomoCode,
				livezillaCode: lzCode
			});
			indexesProcessed[pageName] = pageTemplates.index({
				page: pageProcessed[pageName],
				selected: pageName,
				stats: portalStats.stats,
				poolConfigs: poolConfigs,
				portalConfig: portalConfig,
				matomoCode: matomoCode,
				livezillaCode: lzCode
			});
		}
	};
	var readPageFiles = function(files) {
		async.each(files, function(fileName, callback) {
			var filePath = 'website/' + (fileName === 'index.html' ? '' : 'pages/') + fileName;
				fs.readFile(filePath, 'utf8', function(err, data) {
					var pTemp = dot.template(data);
					pageTemplates[pageFiles[fileName]] = pTemp
					callback();
				});
			}, function(err) {
				if (err) {
					console.log('WEBSITE> error reading files for creating dot templates: '+ JSON.stringify(err));
					return;
				}
				processTemplates();
			});
		};
		watch(['./website', './website/pages'], function(evt, filename) {
			var basename;
			if (!filename && evt)
			basename = path.basename(evt);
			else
			basename = path.basename(filename);
			if (basename in pageFiles) {
				readPageFiles([basename]);
				logger.debug('WEBSITE> Reloaded file %s', basename);
			}
		});
		portalStats.getGlobalStats(function () {
			readPageFiles(Object.keys(pageFiles));
		});
		var buildUpdatedWebsite = function () {
			portalStats.getGlobalStats(function () {
				processTemplates();
				var statData = 'data: ' + JSON.stringify(portalStats.stats) + '\n\n';
				for (var uid in portalApi.liveStatConnections) {
					var res = portalApi.liveStatConnections[uid];
					res.write(statData);
				}
			});
		};
		setInterval(buildUpdatedWebsite, websiteConfig.stats.updateInterval * 1000);
		var buildKeyScriptPage = function () {
			async.waterfall([
			function (callback) {
				var client = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
				client.hgetall('coinVersionBytes', function (err, coinBytes) {
					if (err) {
						client.quit();
						return callback('Failed grabbing coin version bytes from redis ' + JSON.stringify(err));
					}
					callback(null, client, coinBytes || {});
				});
			},
			function (client, coinBytes, callback) {
				var enabledCoins = Object.keys(poolConfigs).map(function (c) {
					return c.toLowerCase()
				});
				var missingCoins = [];
				enabledCoins.forEach(function (c) {
					if (!(c in coinBytes))
					missingCoins.push(c);
				});
				callback(null, client, coinBytes, missingCoins);
			},
			function (client, coinBytes, missingCoins, callback) {
				var coinsForRedis = {};
				async.each(missingCoins, function (c, cback) {
					var coinInfo = (function () {
						for (var pName in poolConfigs) {
							if (pName.toLowerCase() === c)
							return {
								daemon: poolConfigs[pName].paymentProcessing.daemon,
								address: poolConfigs[pName].address
							}
						}
					})();
					var daemon = new Stratum.daemon.interface([coinInfo.daemon], logger);
					daemon.cmd('dumpprivkey', [coinInfo.address], function (result) {
						if (result[0].error) {
							logger.error('WEBSITE> Could not dumpprivkey for %s , err = %s', c, JSON.stringify(result[0].error));
							cback();
							return;
						}
						var vBytePub = util.getVersionByte(coinInfo.address)[0];
						var vBytePriv = util.getVersionByte(result[0].response)[0];
						coinBytes[c] = vBytePub.toString() + ',' + vBytePriv.toString();
						coinsForRedis[c] = coinBytes[c];
						cback();
					});
				}, function (err) {
					callback(null, client, coinBytes, coinsForRedis);
				});
			},
			function (client, coinBytes, coinsForRedis, callback) {
				if (Object.keys(coinsForRedis).length > 0) {
					client.hmset('coinVersionBytes', coinsForRedis, function (err) {
						if (err) {
							logger.error('WEBSITE> Failed inserting coin byte version into redis, err = %s', JSON.stringify(err));
						}
						client.quit();
					});
				} else {
					client.quit();
				}
				callback(null, coinBytes);
			}
		], function (err, coinBytes) {
			if (err) {
				logger.error('WEBSITE> Error, err = %s', err);
				return;
			} try {
				keyScriptTemplate = dot.template(fs.readFileSync('website/key.html', {encoding: 'utf8'}));
				keyScriptProcessed = keyScriptTemplate({coins: coinBytes});
			} catch (e) {
				logger.error('WEBSITE> Failed to read key.html file');
			}
		});
	};
	buildKeyScriptPage();
	var getPage = function (pageId) {
		if (pageId in pageProcessed) {
			var requestedPage = pageProcessed[pageId];
			return requestedPage;
		}
	};
	var poolStatPage = function(req, res, next) {
		var coin = req.params.coin || null;
		if (coin != null) {
			portalStats.getPoolStats(coin, function() {
				processTemplates();
				res.end(indexesProcessed['pool_stats']);
			});
		} else {
			next();
		}
	};
	var minerpage = function(req, res, next) {
		var address = req.params.address || null;
		if (address != null) {
			address = address.split(".")[0];
			portalStats.getBalanceByAddress(address, function() {
				processTemplates();
				res.header('Content-Type', 'text/html');
				res.end(indexesProcessed['miner_stats']);
			});
		} else {
			next();
		}
	};
	var route = function (req, res, next) {
		var pageId = req.params.page || '';
		if (pageId in indexesProcessed) {
			res.header('Content-Type', 'text/html');
			res.end(indexesProcessed[pageId]);
		}
		else
		next();
	};
	var app = express();
	app.use(bodyParser.json());
	app.get('/get_page', function (req, res, next) {
		var requestedPage = getPage(req.query.id);
		if (requestedPage) {
			res.end(requestedPage);
			return;
		}
		next();
	});
	app.get('/key.html', function (req, res, next) {
		res.end(keyScriptProcessed);
	});
	app.get('/workers/:address', minerpage);
	app.get('/stats/:coin', poolStatPage);
	app.get('/:page', route);
	app.get('/', route);
	app.get('/api/:method', function (req, res, next) {
		portalApi.handleApiRequest(req, res, next);
	});
	app.post('/api/admin/:method', function (req, res, next) {
		if (portalConfig.website
		&& portalConfig.website.adminCenter
		&& portalConfig.website.adminCenter.enabled) {
			if (portalConfig.website.adminCenter.password === req.body.password)
			portalApi.handleAdminApiRequest(req, res, next);
			else
			res.send(401, JSON.stringify({error: 'Incorrect Password'}));
		}
		else
		next();
	});
	app.use(compress());
	app.use('/static', express.static('website/static'));
	app.use(function (err, req, res, next) {
		console.error(err.stack);
		res.status(500).send('Something broke!');
	});
	try {
		logger.info('WEBSITE> Attempting to start Website on %s:%s', portalConfig.website.host,portalConfig.website.port);
		http.createServer(app).listen(portalConfig.website.port, portalConfig.website.host, function () {
			logger.info('WEBSITE> Website started on %s:%s', portalConfig.website.host,portalConfig.website.port);
		});
	} catch (e) {
	logger.error('WEBSITE> e = %s', JSON.stringify(e));
	logger.error('WEBSITE> Could not start website on %s:%s - its either in use or you do not have permission', portalConfig.website.host,portalConfig.website.port);
	}
	if (portalConfig.website.sslenabled) {
		try {
			logger.info('WEBSITE> Attempting to start SSL Website on %s:%s', portalConfig.website.host,portalConfig.website.sslport);	
			var privateKey = fs.readFileSync( portalConfig.website.sslkey );
			var certificate = fs.readFileSync( portalConfig.website.sslcert );
			var credentials = {key: privateKey, cert: certificate};			
			https.createServer(credentials, app).listen(portalConfig.website.sslport, portalConfig.website.host, function () {
				logger.info('WEBSITE> SSL Website started on %s:%s', portalConfig.website.host,portalConfig.website.sslport);
			});
		} catch (e) {        	
			logger.error('WEBSITE> e = %s', JSON.stringify(e));
			logger.error('WEBSITE> Could not start SSL website on %s:%s - its either in use or you do not have permission', portalConfig.website.host,portalConfig.website.sslport);
		}	
	}
};
