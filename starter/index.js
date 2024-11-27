const {
  DescribeInstancesCommand,
  DescribeSnapshotsCommand,
  EC2Client,
  RunInstancesCommand,
} = require("@aws-sdk/client-ec2");

// @ts-check

/**
 * @type {import('aws-lambda').LambdaFunctionURLHandler}
 */
exports.handler = async (event, _context) => {
  if (event.headers.passcode !== process.env.PASSCODE) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const ec2 = new EC2Client();

  const runningInstances = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
        {
          Name: "instance-state-name",
          Values: ["running"],
        },
      ],
    })
  );
  if (runningInstances.Reservations.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Instance already exists" }),
    };
  }

  const snapshotData = await ec2.send(
    new DescribeSnapshotsCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
      ],
    })
  );

  const latestSnapshotId =
    snapshotData.Snapshots.length > 0
      ? snapshotData.Snapshots.reduce((acc, cur) => {
          return acc.StartTime > cur.StartTime ? acc : cur;
        }).SnapshotId
      : undefined;

  const subnetIds = process.env.VPC_SUBNET_IDS.split(",");
  const instanceTypes = ["c7i-flex.2xlarge", "c7i.2xlarge"];
  const securityGroupId = process.env.SECURITY_GROUP_ID;

  let lastError;
  for (const instanceType of instanceTypes) {
    for (const subnetId of subnetIds) {
      try {
        const instance = await ec2.send(
          new RunInstancesCommand({
            ImageId:
              "resolve:ssm:/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
            InstanceType: instanceType,
            InstanceMarketOptions: {
              MarketType: "spot",
              SpotOptions: {
                SpotInstanceType: "one-time",
              },
            },
            SubnetId: subnetId,
            SecurityGroupIds: [securityGroupId],
            MaxCount: 1,
            MinCount: 1,
            BlockDeviceMappings: [
              {
                DeviceName: "/dev/xvda",
                Ebs: {
                  DeleteOnTermination: false,
                  SnapshotId: latestSnapshotId,
                  VolumeType: "gp3",
                  VolumeSize: 64,
                },
              },
            ],
            TagSpecifications: [
              {
                ResourceType: "instance",
                Tags: [
                  {
                    Key: "Name",
                    Value: "spoton",
                  },
                ],
              },
              {
                ResourceType: "volume",
                Tags: [
                  {
                    Key: "Name",
                    Value: "spoton",
                  },
                ],
              },
            ],
            UserData: btoa(userData),
          })
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "Instance created", instance }),
        };
      } catch (error) {
        console.log(error);
        lastError = error;
      }
    }
  }

  return {
    statusCode: 500,
    body: JSON.stringify({
      message: "Instance creation failed",
      error: lastError,
    }),
  };
};

const sshIdleShutdownScript = `
#!/bin/bash

STATE_FILE="/tmp/ssh_idle_count"

if [ ! -f "$STATE_FILE" ]; then
    echo 0 >"$STATE_FILE"
fi

IDLE_COUNT=$(cat "$STATE_FILE")

SSH_CONNECTED=$(netstat -tn | grep ':22' | grep -c 'ESTABLISHED')

if [ "$SSH_CONNECTED" -eq 0 ]; then
    IDLE_COUNT=$((IDLE_COUNT + 1))
    echo "$IDLE_COUNT" >"$STATE_FILE"

    if [ "$IDLE_COUNT" -ge 3 ]; then
        echo "No SSH connection. Shutting down..."
        shutdown -h now
    fi
else
    echo 0 >"$STATE_FILE"
fi
`;
const userData = `#!/bin/bash
apt install net-tools -y
echo "${btoa(sshIdleShutdownScript)}" | base64 -d >/tmp/ssh_idle_shutdown.sh
chmod +x /tmp/ssh_idle_shutdown.sh
(crontab -l 2>/dev/null; echo "*/3 * * * * /tmp/ssh_idle_shutdown.sh") | crontab -
`;
