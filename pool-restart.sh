#!/bin/bash

echo ""
echo "RavenNOMP Restarting..."
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

#~/.nvm/versions/node/v8.1.4/bin/pm2 del pool

#~/.nvm/versions/node/v8.1.4/bin/pm2 start --name pool node -- --optimize_for_size --max-old-space-size=4096  "${BASEDIR}/init.js"

~/.nvm/versions/node/v8.1.4/bin/pm2 restart pool

renice -n -18 -p $(pidof node)
renice -n -18 -p $(pidof nodejs)

echo ""
echo "Done!"
echo ""

exit 0