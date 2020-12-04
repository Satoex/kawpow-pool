# nomp-kawpow-pool
Highly Efficient mining pool for Raven Coin Kawpow algo!

-------
### Screenshots
#### Home<br />
![Home](https://raw.githubusercontent.com/EasyX-Community/EasyNOMP/master/docs/screenshots/home.png)

#### Pool Stats<br />
![Pool Stats](https://raw.githubusercontent.com/EasyX-Community/EasyNOMP/master/docs/screenshots/poolstats.png)<br /><br />

#### Miner Stats<br />
![Miner Stats](https://raw.githubusercontent.com/EasyX-Community/EasyNOMP/master/docs/screenshots/minerstats.png)<br /><br />

#### Block Explorer<br />
![Block Explorer](https://raw.githubusercontent.com/EasyX-Community/EasyNOMP/master/docs/screenshots/blockexplorer.png)<br /><br />

-------
### Node Open Mining Portal consists of 3 main modules:
| Project | Link |
| ------------- | ------------- |
| [EasyNOMP](https://github.com/EasyX-Community/EasyNOMP) | https://github.com/EasyX-Community/EasyNOMP |
| [Stratum Pool](https://github.com/RavenCommunity/kawpow-stratum-pool) | https://github.com/RavenCommunity/kawpow-stratum-pool |
| [Node Multihashing](https://github.com/EasyX-Community/node-multi-hashing) | https://github.com/EasyX-Community/node-multi-hashing |

### Watch setup guide video on YouTube channel

https://www.youtube.com/watch?v=NOjPFZk4sp0

-------
### Requirements
***NOTE:*** _These requirements will be installed in the install section!_<br />
* Ubuntu Server 18.04.* LTS
* Coin daemon
* Node Version Manager
* Node 8.1.4
* Process Manager 2 / pm2
* Redis Server
* ntp

-------

### Install Coin Daemon

    adduser pool
    usermod -aG sudo pool
    su - pool
    sudo apt install wget
    wget https://github.com/RavenProject/Ravencoin/releases/download/v4.3.1/raven-4.3.1.0-x86_64-linux-gnu.tar.gz
    tar -xf raven-4.3.1.0-x86_64-linux-gnu.tar.gz
    rm raven*gz
    cd raven-4.3.1.0/bin
    mkdir -p ~/.raven/
    touch ~/.raven/raven.conf
    echo "rpcuser=user1" > ~/.raven/raven.conf
    echo "rpcpassword=pass1" >> ~/.raven/raven.conf
    echo "prune=550" >> ~/.raven/raven.conf
    echo "daemon=1" >> ~/.raven/raven.conf
    ./ravend
    ./raven-cli getnewaddress

Example output: RKopFydExeQXSZZiSTtg66sRAWvMzFReUj - it is the address of your pool, you need to remember it and specify it in the configuration file pool_configs/ravencoin.json.
    
    ./raven-cli getaddressesbyaccount ""
    
Information about pool wallet address.
    
    ./raven-cli getwalletinfo
    
Get more information.

    ./raven-cli getblockcount
    
Information about synchronization of blocks in the main chain.

    ./raven-cli help
Other helpfull commands.

-------

### Install Pool

    sudo apt install git -y
    cd ~
    git config --global http.https://gopkg.in.followRedirects true
    git clone https://github.com/DirtyHarryDev/nomp-kawpow-pool.git
    cd nomp-kawpow-pool/
    ./install.sh

-------
### Configure Pool

Change "stratumHost": "192.168.0.200", to your IP or DNS in file config.json:

    cd ~/nomp-kawpow-pool
    nano config.json

```javascript
{
    
    "poolname": "Raven Coin Pool",
    
    "devmode": false,
    "devmodePayMinimim": 0.25,
    "devmodePayInterval": 120,
    
    "logips": true,       
    "anonymizeips": true,
    "ipv4bits": 16,
    "ipv6bits": 16,
    
     "defaultCoin": "ravencoin",
    
    "poollogo": "https://zelcash.github.io/zeltrez.io/images/logos/Ravencoin.svg",
    
    "discordtwitterfacebook": "Join our #mining channel on Discord: <a href='https://discord.gg/vzcbVNW' target='_blank'>https://discord.gg/vzcbVNW</a>",
    
    "pagetitle": "Raven Coin Pool - 1% Fees Promo - Run by professionals",
    "pageauthor": "My Name Is...",
    "pagedesc": "A reliable, low fee, easy to use mining pool for cryptocurrency! No matter your experience with mining cryptocurrency, we make it easy! Get started mining today!",
    "pagekeywds": "GPU,CPU,Hash,Hashrate,Cryptocurrency,Crypto,Mining,Pool,Bitcoin,Raven,Ravencoin,Wavi,Wavicoin,Dixicoin,Dixi,QBic,QBicCoin,Easy,Simple,How,To",

    "btcdonations": "1NRXddRwZSXVQ8NBdgiwv5DsJn2bmHenu6",
    "ltcdonations": "LcghtmAVSi94FHrn4xbbSd4nFChWy6QUng",
    "ethdonations": "0x85c5e7db222705da939174cf435d8836423a03e8",

    "logger" : {
        "level" : "debug",
        "file" : "~/nomp-kawpow-pool/logs/nomp_debug.log"
    },

    "cliHost": "127.0.0.1",
    "cliPort": 17117,

    "clustering": {
        "enabled": false,
        "forks": "auto"
    },

    "defaultPoolConfigs": {
        "blockRefreshInterval": 1000,
        "jobRebroadcastTimeout": 55,
        "connectionTimeout": 600,
        "emitInvalidBlockHashes": false,
        "validateWorkerUsername": true,
        "tcpProxyProtocol": false,
        "banning": {
            "enabled": true,
            "time": 600,
            "invalidPercent": 50,
            "checkThreshold": 500,
            "purgeInterval": 300
        },
        "redis": {
            "host": "127.0.0.1",
            "port": 6379
        }
    },

    "website": {
        "enabled": true,
        "sslenabled": false,
        "sslforced": false,
        "host": "0.0.0.0",
        "port": 80,
        "sslport": 443,
        "sslkey": "~/nomp-kawpow-pool/certs/privkey.pem",
        "sslcert": "~/nomp-kawpow-pool/certs/fullchain.pem",
        "stratumHost": "192.168.0.200",
        "stats": {
            "updateInterval": 5,
            "historicalRetention": 43200,
            "hashrateWindow": 600
        },
        "adminCenter": {
            "enabled": false,
            "password": "NOT_WORKING_YET_:P_LESHACAT_CAN_DO_ADMIN_PANEL_FUNCTIONALITY_TOO"
        }
    },

    "redis": {
        "host": "127.0.0.1",
        "port": 6379
    },

    "switching": {
        "switch1": {
            "enabled": false,
            "algorithm": "sha256",
            "ports": {
                "3333": {
                    "diff": 10,
                    "varDiff": {
                        "minDiff": 16,
                        "maxDiff": 512,
                        "targetTime": 15,
                        "retargetTime": 90,
                        "variancePercent": 30
                    }
                }
            }
        },
        "switch2": {
            "enabled": false,
            "algorithm": "scrypt",
            "ports": {
                "4444": {
                    "diff": 10,
                    "varDiff": {
                        "minDiff": 16,
                        "maxDiff": 512,
                        "targetTime": 15,
                        "retargetTime": 90,
                        "variancePercent": 30
                    }
                }
            }
        },
        "switch3": {
            "enabled": false,
            "algorithm": "x11",
            "ports": {
                "5555": {
                    "diff": 0.001,
                    "varDiff": {
                        "minDiff": 0.001,
                        "maxDiff": 1, 
                        "targetTime": 15, 
                        "retargetTime": 60, 
                        "variancePercent": 30 
                    }
                }
            }
        }
    },

    "profitSwitch": {
        "enabled": false,
        "updateInterval": 600,
        "depth": 0.90,
        "usePoloniex": true,
        "useCryptsy": true,
        "useMintpal": true,
        "useBittrex": true
    }

}

```

Change "address": "RKopFydExeQXSZZiSTtg66sRAWvMzFReUj", to your pool created wallet address in file ravencoin.json:

    cd ~/nomp-kawpow-pool/pool_configs
    nano ravencoin.json

```javascript
{
    "enabled": true,
    "coin": "ravencoin.json",

    "address": "RKopFydExeQXSZZiSTtg66sRAWvMzFReUj",
    
    "donateaddress": "RL5SUNMHmjXtN1AzCRFQrFEhjnf7QQY7Tz",

    "rewardRecipients": {
        "RL5SUNMHmjXtN1AzCRFQrFEhjnf7QQY7Tz": 0.5,
        "Ta26x9axaDQWaV2bt2z8Dk3R3dN7gHw9b6": 0
    },

    "paymentProcessing": {
        "enabled": true,
        "schema": "PROP",
        "paymentInterval": 300,
        "minimumPayment": 0.25,
        "maxBlocksPerPayment": 10,
        "minConf": 30,
        "coinPrecision": 8,
        "daemon": {
            "host": "127.0.0.1",
            "port": 17117,
            "user": "user1",
            "password": "pass1"
        }
    },

    "ports": {
	"10008": {
            "diff": 2,
    	    "varDiff": {
    	        "minDiff": 1,
    	        "maxDiff": 16,
    	        "targetTime": 10,
    	        "retargetTime": 60,
    	        "variancePercent": 30,
    		    "maxJump": 25
    	    }
        },
        "10032": {
            "varDiff": {
                "minDiff": 0.04,
                "maxDiff": 16,
    	        "targetTime": 10,
    	        "retargetTime": 60,
    	        "variancePercent": 30,
		        "maxJump": 25
            }
        },
        "10256": {
		    "varDiff": {
    			"minDiff": 1000,
    			"maxDiff": 9000,
    	        "targetTime": 10,
    	        "retargetTime": 60,
    	        "variancePercent": 30,
    			"maxJump": 50
    		}
        }
    },

    "daemons": [
        {
            "host": "127.0.0.1",
            "port": 8766,
            "user": "user1",
            "password": "pass1"
        }
    ],

    "p2p": {
        "enabled": false,
        "host": "127.0.0.1",
        "port": 19333,
        "disableTransactions": true
    },

    "mposMode": {
        "enabled": false,
        "host": "127.0.0.1",
        "port": 3306,
        "user": "me",
        "password": "mypass",
        "database": "ltc",
        "checkPassword": true,
        "autoCreateWorker": false
    },

    "mongoMode": {
        "enabled": false,
        "host": "127.0.0.1",
        "user": "",
        "pass": "",
        "database": "ltc",
        "authMechanism": "DEFAULT"
    }

}

```

### Run Pool
    
    cd ~/nomp-kawpow-pool
    ./pool-start.sh

### Donates for developers easyNOMP


BTC: 18TmiWzbMLyf7MvQMcNWh3hUBVrxBgzrWi

LTC: LX1fUwLVcAaRXvP67ZcqUvjjteaKx1nAvL

ETH/ERC20: 0x52fD0B6847E1D3cEc5600359f24d671FdE2Bc65B
    
-------
