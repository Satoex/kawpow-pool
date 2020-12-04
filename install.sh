#!/bin/sh

# This is the Pool install script.
echo "Pool install script."
echo "Please do NOT run as root, run as the pool user!"

echo "Installing... Please wait!"

sleep 3

sudo rm -rf /usr/lib/node_modules
sudo apt remove --purge -y nodejs node
sudo rm /etc/apt/sources.list.d/nodesource.list*
sudo apt update
sudo apt upgrade -y
sudo apt install -y software-properties-common build-essential autoconf pkg-config make gcc g++ screen nano wget curl ntp fail2ban 

sudo add-apt-repository -y ppa:chris-lea/redis-server
sudo add-apt-repository -y ppa:bitcoin/bitcoin

sudo apt update
sudo apt install -y libdb4.8-dev libdb4.8++-dev libssl-dev libboost-all-dev libminiupnpc-dev libtool autotools-dev redis-server

sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo systemctl enable redis-server
sudo systemctl start redis-server
sudo systemctl enable ntp
sudo systemctl start ntp

sudo rm -rf ~/.nvm
sudo rm -rf ~/.npm
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | sudo bash
source ~/.bashrc
sudo chown -R $USER:$GROUP ~/.nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
nvm install v8.1.4
nvm use v8.1.4
npm update -g

npm install -g webpack@4.29.3
npm install -g pm2@4.2.1
npm install -g npm@latest

npm install
npm update
npm audit fix
npm install sha3
npm install logger

#./start-pool.sh

echo "Installation completed!"

exit 0
