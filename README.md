# Spoton

Spoton is EC2 Spot instance manage service to use sport instance as development environment.

# Components

## Starter

Starts Spot Instance triggered by Lambda function url.

## Janitor

Remove unused resources like Dangling EBS Volumes, Old Snapshots, etc which are not free charged.
Janitor also create snapshot of EBS volumes before removing them. Also only latest snapshot is kept.
Janitor is triggered by CloudWatch Event Rule, created by cdk.

## Connect

Find and connect to the spot instance using vscode on client.
