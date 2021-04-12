var poolWorkerChart;
var poolHashrateChart;
var poolBlockChart;

function displayCharts() {
	var stats = getPoolStats(poolName);
	var maxScale = getReadableHashRatePair(Math.max.apply(null, stats.hashrate.map(x => x[1])));
	poolHashrateChart = createDefaultLineChart(document.getElementById("poolHashChart").getContext('2d'),
		[{
			label: 'Actual',
			fill: false,
			data: stats.hashrate.map(x => {
				return {
					t: x[0],
					y: getScaledHashrate(x[1], maxScale[2])
				}
			}),
			borderWidth: 2,
			backgroundColor: '#348EA9',
			borderColor: '#348EA9'
		},
		{
			label: 'Averaged',
			fill: false,
			data: stats.averagedHashrate.map(x => {
				return {
					t: x[0],
					y: getScaledHashrate(x[1], maxScale[2])
				}
			}),
			borderWidth: 2,
			backgroundColor: '#E81D62',
			borderColor: '#E81D62'
		}],
		'Time',
		maxScale[1]
	);
	poolWorkerChart = createLineChart(document.getElementById("poolWorkerChart").getContext('2d'),
		[{
			label: 'Actual',
			fill: false,
			data: stats.workers.map(x => {
				return {
					t: x[0],
					y: x[1]
				}
			}),
			borderWidth: 2,
			backgroundColor: '#0061B5',
			borderColor: '#0061B5'
		},
		{
			label: 'Averaged',
			fill: false,
			data: stats.averagedWorkers.map(x => {
				return {
					t: x[0],
					y: x[1]
				}
			}),
			borderWidth: 2,
			backgroundColor: '#FF9400',
			borderColor: '#FF9400'
		}],
		'Time',
		'Workers',
		{
			beginAtZero: true,
			fixedStepSize: 1
		}
	);
	poolBlockChart = createLineChart(document.getElementById("blockChart").getContext('2d'),
		[{
			label: 'Currently Pending',
			fill: true,
			steppedLine: true,
			data: stats.blocks.map(x => {
				return {
					t: x[0],
					y: x[1]
				}
			}),
			borderWidth: 1,
			backgroundColor: '#FBA41F',
			borderColor: '#FBA41F'
		}],
		'Time',
		'Blocks',
		{
			beginAtZero: true,
			fixedStepSize: 1
		}
	);
}
$.getJSON('/api/pool_stats', function(data) {
	if (document.hidden) return;
	addPoolToTracker(data, poolName, function() {
		displayCharts();
	});
});
statsSource.addEventListener('message', function(e) {
	var stats = JSON.parse(e.data);
	updatePoolData(stats, poolName, function(pool) {
		var max = Math.max.apply(null, pool.hashrate.map(x => x[1]));
		var pair = getReadableHashRatePair(max);
		var hash = getScaledHashrate(poolName in stats.pools ? stats.pools[poolName].hashrate : 0, pair[2]);
		$("#validShares").text(poolName in stats.pools ? stats.pools[poolName].poolStats.validShares : 0);
		$("#poolHashRate").text((!isNaN(hash) ? hash : 0) + ' ' + (pair[1] ? pair[1] : 'H/s'));
		$("#poolMiners").text(poolName in stats.pools ? stats.pools[poolName].minerCount : 0);
		$("#poolWorkers").text(poolName in stats.pools ? stats.pools[poolName].workerCount : 0);
		$("#pendingBlocks").text(poolName in stats.pools ? stats.pools[poolName].blocks.pending : 0);
		$("#confirmedBlocks").text(poolName in stats.pools ? stats.pools[poolName].blocks.confirmed : 0);
		$("#currentRoundShares").text(poolName in stats.pools ? stats.pools[poolName].currentRoundTimeString : 0);
		$("#timeToFind").text(poolName in stats.pools ? stats.pools[poolName].timeToFind : 0);
		$("#currentEffort").text(poolName in stats.pools ? Number(stats.pools[poolName].currEffort * 100).toFixed(2) + ' %' : 0);
		$("#netHash").text(poolName in stats.pools ? stats.pools[poolName].poolStats.networkSolsString : 0);
		$("#netdiff").text(poolName in stats.pools ? Number(Math.round(stats.pools[poolName].poolStats.networkDiff + 'e' + 4) + 'e-' + 4) : 0);
		$("#luckHour").text(poolName in stats.pools ? stats.pools[poolName].luckHours + ' Hours': 0);
		$("#lastBlockTime").text(poolName in stats.pools ? stats.pools[poolName].lastBlockDate : 0);
		$("#totalPaid").text(poolName in stats.pools ? Number(stats.pools[poolName].poolStats.totalPaid).toFixed(3) + ' ' + stats.pools[poolName].symbol : 0);
		var time = stats.time * 1000;
		var avg = pool.averagedHashrate;
		addChartData(poolHashrateChart, poolHashrateChart.data.datasets[0], {t: time, y: hash}, false);
		addChartData(poolHashrateChart, poolHashrateChart.data.datasets[1], {t: time, y: getScaledHashrate(avg[avg.length - 1][1], pair[2])}, true);
		addChartData(poolBlockChart, poolBlockChart.data.datasets[0], {t: time, y: poolName in stats.pools ? stats.pools[poolName].blocks.pending : 0}, true);
	});
}, false);
