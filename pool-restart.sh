#!/bin/bash

echo ""
echo "KawPoW Pool Restarting..."
echo ""

source ~/.bashrc
source /etc/os-release

## who am i? ##
SCRIPTNAME="$(readlink -f ${BASH_SOURCE[0]})"
BASEDIR="$(dirname $SCRIPTNAME)"

## Okay, print it ##
echo "Script name : $SCRIPTNAME"
echo "Current working dir : $PWD"
echo "Script location path (dir) : $BASEDIR"
echo ""

~/.nvm/versions/node/v8.17.0/bin/pm2 restart pool

renice -n -18 -p $(pidof node)
renice -n -18 -p $(pidof nodejs)

echo ""
echo "KawPoW Pool Restarted!"
echo ""

exit 0
