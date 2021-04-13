#!/bin/bash

echo ""
echo "KawPoW Pool Starting..."
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

~/.nvm/versions/node/v8.17.0/bin/pm2 del pool

~/.nvm/versions/node/v8.17.0/bin/pm2 start --name pool node -- --optimize_for_size --max-old-space-size=8192 "${BASEDIR}/init.js"

renice -n -18 -p $(pidof node)
renice -n -18 -p $(pidof nodejs)

echo ""
echo "KawPoW Pool Started!"
echo ""

exit 0
