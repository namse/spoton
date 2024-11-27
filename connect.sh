#!/bin/bash

set -e

instance_id=$(aws ec2 describe-instances \
    --region ap-northeast-2 \
    --filters "Name=tag:Name,Values=spoton" "Name=instance-state-name,Values=running" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text)

if [ -z "$instance_id" ]; then
    echo "No instance found"
    exit 1
fi

ssh-keygen -t rsa -f /tmp/spoton_key -N "" <<<y >/dev/null 2>&1

aws ec2-instance-connect send-ssh-public-key \
    --region ap-northeast-2 \
    --instance-id $instance_id \
    --instance-os-user ubuntu \
    --ssh-public-key file:///tmp/spoton_key.pub

ssh_config_file=~/.ssh/config

# Ensure the SSH config file exists
if [ ! -f "$ssh_config_file" ]; then
    touch "$ssh_config_file"
fi

# Remove existing 'Host spoton' entry and its properties
sed -i '/^Host spoton$/,/^$/d' "$ssh_config_file"

# here
cat <<EOL >>"$ssh_config_file"
Host spoton
    HostName $instance_id
    User ubuntu
    IdentityFile /tmp/spoton_key
    ProxyCommand aws ec2-instance-connect open-tunnel --region ap-northeast-2 --instance-id $instance_id
EOL

code --folder-uri vscode-remote://ssh-remote%2Bspoton/home/ubuntu
