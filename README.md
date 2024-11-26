# Spoton

Spoton is EC2 Spot instance manage service to use sport instance as development environment.

# Components

## Lambda-Starter

Starts Spot Instance triggered by Lambda function url.

## Janitor

Remove unused resources like Dangling EBS Volumes, Old Snapshots, etc which are not free charged.

## Connect

Find and connect to the spot instance using vscode on client.

## Spoton Setup

First-time setup for spoton instance, recording to ebs volume.

Setup contains disconnection detection and snapshot creation, self-termination.
