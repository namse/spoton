#!/bin/bash

set -e

cp ./ssh_idle_shutdown.sh /usr/local/bin/ssh_idle_shutdown.sh
chmod +x /usr/local/bin/ssh_idle_shutdown.sh
echo "*/3 * * * * /usr/local/bin/ssh_idle_shutdown.sh" | crontab -
