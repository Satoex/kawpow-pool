var poolWorkerData;
var poolHashrateData;
var poolBlockData;

var poolWorkerChart;
var poolHashrateChart;
var poolBlockChart;

var statData;
var poolKeys;

function buildChartData() {

  var pools = {};

  poolKeys = [];
  for (var i = 0; i < statData.length; i++) {
    for (var pool in statData[i].pools) {
      if (poolKeys.indexOf(pool) === -1)
        poolKeys.push(pool);
    }
  }


  for (var i = 0; i < statData.length; i++) {
    var time = statData[i].time * 1000;
    for (var f = 0; f < poolKeys.length; f++) {
      var pName = poolKeys[f];
      var a = pools[pName] = (pools[pName] || {
        hashrate: [],
        workers: [],
        blocks: []
      });
      if (pName in statData[i].pools) {
        a.hashrate.push([time, statData[i].pools[pName].hashrate]);
        a.workers.push([time, statData[i].pools[pName].workerCount]);
        a.blocks.push({ t: new Date(time), y: statData[i].pools[pName].blocks.pending})
      } else {
        a.hashrate.push([time, 0]);
        a.workers.push([time, 0]);
        a.blocks.push({x: time, y: 0})
      }
    }
  }

  poolWorkerData = [];
  poolHashrateData = [];
  poolBlockData = [];

  for (var pool in pools) {
    poolWorkerData.push({
      label: pool,
      value: pools[pool].workers[pools[pool].workers.length - 1][1]
    });
    poolHashrateData.push({
      label: pool,
      value: parseInt(pools[pool].hashrate[pools[pool].hashrate.length - 1][1] / 2048)
    });
    poolBlockData.push({
      label: pool,
      value: pools[pool].blocks
    });
  }
}

function getReadableHashRateString(hashrate) {
  var i = -1;
  var byteUnits = [' KH', ' MH', ' GH', ' TH', ' PH'];
  do {
    hashrate = hashrate / 1024;
    i++;
  } while (hashrate > 1024);
  return Math.round(hashrate) + byteUnits[i];
}

function timeOfDayFormat(timestamp) {
  var dStr = d3.time.format('%I:%M %p')(new Date(timestamp));
  if (dStr.indexOf('0') === 0) dStr = dStr.slice(1);
  return dStr;
}

function displayCharts() {
  var chartColors = [
    '#1976D2',
    '#388E3C',
    '#FBC02D',
    '#512DA8',
    '#C2185B'
  ];
  poolWorkerChart = new Chart($("#workerChart"), {
    type: 'pie',
    data: {
      labels: poolWorkerData.slice(0, 5).map(x => x.label),
      datasets: [{
        data: poolWorkerData.slice(0, 5).map(x => x.value),
        backgroundColor: chartColors
      }],
    },
    options: {
      responsive: true
    }
  });

  poolHashrateChart = new Chart($("#hashChart"), {
    type: 'pie',
    data: {
      labels: poolHashrateData.slice(0, 5).map(x => x.label),
      datasets: [{
        data: poolHashrateData.slice(0, 5).map(x => x.value),
        backgroundColor: chartColors
      }]
    },
    options: {
      responsive: true
    }
  });

  var blockData = [];
  var labels = poolBlockData.slice(0, 5).map(x => x.label);
  var values = poolBlockData.slice(0, 5).map(x => x.value);
  for(var i = 0; i < poolBlockData.length; i++) {
    blockData.push(
      {
        label: labels[i],
        data: values[i],
        backgroundColor: chartColors[i],
        borderColor: chartColors[i]
      }
    );
  }
  $("#blockChart").height = 200;
  poolBlockChart = new Chart($("#blockChart"), {
    type: 'line',
    data: {
      datasets: blockData
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        xAxes: [{
          time: {
            unit: 'minute'
          }
        }]
      }
    }
  });

}

function pastelColors() {
  var r = (Math.round(Math.random() * 127) + 127).toString(16);
  var g = (Math.round(Math.random() * 127) + 127).toString(16);
  var b = (Math.round(Math.random() * 127) + 127).toString(16);
  return '#' + r + g + b;
}

function TriggerChartUpdates() {
  poolWorkerChart.update();
  poolHashrateChart.update();
  poolBlockChart.update();
}

$.getJSON('/api/pool_stats', function(data) {
  statData = data;
  buildChartData();
  displayCharts();
});



statsSource.addEventListener('message', function(e) {
  var stats = JSON.parse(e.data);
  statData.push(stats);

  var newPoolAdded = (function() {
    for (var p in stats.pools) {
      if (poolKeys.indexOf(p) === -1)
        return true;
    }
    return false;
  })();

  if (newPoolAdded || Object.keys(stats.pools).length > poolKeys.length) {
    buildChartData();
    displayCharts();
  } else {
    var time = stats.time * 1000;
    for (var f = 0; f < poolKeys.length; f++) {
      var pool = poolKeys[f];
      for (var i = 0; i < poolWorkerData.length; i++) {
        if (poolWorkerData[i].key === pool) {
          poolWorkerData[i].values.shift();
          poolWorkerData[i].values.push([time, pool in stats.pools ? stats.pools[pool].workerCount : 0]);
          break;
        }
      }
      for (var i = 0; i < poolHashrateData.length; i++) {
        if (poolHashrateData[i].key === pool) {
          poolHashrateData[i].values.shift();
          poolHashrateData[i].values.push([time, pool in stats.pools ? stats.pools[pool].hashrate : 0]);
          break;
        }
      }
      for (var i = 0; i < poolBlockData.length; i++) {
        if (poolBlockData[i].key === pool) {
          poolBlockData[i].values.shift();
          poolBlockData[i].values.push([time, pool in stats.pools ? stats.pools[pool].blocks.pending : 0]);
          break;
        }
      }
    }
    TriggerChartUpdates();
  }

});
