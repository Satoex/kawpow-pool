function calculateExpMovingAvg(mArray, mRange) {
  var k = 2/ (mRange + 1);
  // first item is just the same as the first item in the input
  emaArray = [[mArray[0][0], mArray[0][1]]];
  // for the rest of the items, they are computed with the previous one
  for (var i = 1; i < mArray.length; i++) {
    var height = mArray[i][1] * k + emaArray[i - 1][1] * (1 - k);
    emaArray.push([mArray[i][0], height]);
  }
  return emaArray;
}

function capFirst(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function getRandomInt(min, max) {
  	return Math.floor(Math.random() * (max - min)) + min;
}

function generateName(){
	var name1 = ['raging', 'mad', 'hashing', 'cool', 'rich', 'honorable', 'king',
    'fast', 'killer', 'sweet'];

	var name2 = ['cromulon', 'computer', 'hasher', 'PC', 'rig', 'miner', 'otter',
   'cronenberg', 'gazorpazorp'];

	var name = name1[Math.floor(Math.random() * name1.length)].toLowerCase() + name2[Math.floor(Math.random() * name2.length)].toLowerCase();
	return name;

}

function getRandomColor() {
    var letters = '0123456789ABCDEF'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function getRandomPastelColor() {
  var r = (Math.round(Math.random() * 127) + 127).toString(16);
  var g = (Math.round(Math.random() * 127) + 127).toString(16);
  var b = (Math.round(Math.random() * 127) + 127).toString(16);
  return '#' + r + g + b;
}

function addChartData(chart, dataset, data, update) {
  dataset.data.shift();
  dataset.data.push(data);
  if(update){
    chart.update();
  }
}

this.getReadableHashRate = function(hashrate) {
  hashrate = (hashrate * 1000000);
  if(hashrate < 1000000){
    hashrate = hashrate * 100000;
  }
  var i = Math.max(0, Math.floor((Math.log(hashrate/1000) / Math.log(1000)) - 1));
  hashrate = (hashrate/1000) / Math.pow(1000, i + 1);
  return hashrate.toFixed(2);
};

this.getScaledHashrate = function(hashrate, i) {
  hashrate = (hashrate * 1000000);
  if(hashrate < 1000000){
    hashrate = hashrate * 100000;
  }
  hashrate = (hashrate/1000) / Math.pow(1000, i + 1);
  return hashrate.toFixed(2);
};

this.getReadableHashRateString = function(hashrate) {
  hashrate = (hashrate * 1000000);
  if(hashrate < 1000000){
    hashrate = hashrate * 100000;
  }
  var byteUnits = [' H/s', ' KH/s', ' MH/s', ' GH/s', ' TH/s', ' PH/s'];
  var i = Math.max(0, Math.floor((Math.log(hashrate/1000) / Math.log(1000)) - 1));
  hashrate = (hashrate/1000) / Math.pow(1000, i + 1);

  return hashrate.toFixed(2) + ' ' + byteUnits[i];
};

this.getReadableHashRatePair = function(hashrate) {
  hashrate = (hashrate * 1000000);
  if(hashrate < 1000000){
    hashrate = hashrate * 100000;
  }
  var byteUnits = [' H/s', ' KH/s', ' MH/s', ' GH/s', ' TH/s', ' PH/s'];
  var i = Math.max(0, Math.floor((Math.log(hashrate/1000) / Math.log(1000)) - 1));
  hashrate = (hashrate/1000) / Math.pow(1000, i + 1);

  return [hashrate.toFixed(2), byteUnits[i], i];
};

function createDefaultLineChart(ctx, datasets, xLabel, yLabel) {
  return createLineChart(ctx, datasets, xLabel, yLabel, { beginAtZero: true });
}

function createLineChart(ctx, datasets, xLabel, yLabel, ticks) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: datasets
    },
    options: {
      spanGaps: true,
      animation: {
          easing: 'easeInExpo',
          duration: 1000,
          xAxis: true,
          yAxis: true,
      },
      responsive: true,
      maintainAspectRatio: false,
      elements: {
        point: { radius: 0 }
      },
      scales: {
        xAxes: [{
          gridLines : {
            display : false,
          },
          type: 'time'
        }],
        yAxes: [{
          ticks: ticks,
          display: true,
          gridLines : {
            display : false,
          },
          scaleLabel: {
            display: true,
            labelString: yLabel
          }
        }]
      }
    }
  });
}
