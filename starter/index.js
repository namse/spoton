import {
  DescribeInstancesCommand,
  DescribeSnapshotsCommand,
  DescribeSpotPriceHistoryCommand,
  EC2Client,
  RunInstancesCommand,
} from "@aws-sdk/client-ec2";

// @ts-check

/**
 * @type {import('aws-lambda').LambdaFunctionURLHandler}
 */
export const handler = async (event, _context) => {
  if (event.headers.passcode !== process.env.PASSCODE) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  const ec2 = new EC2Client();

  const data = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
      ],
    })
  );
  if (data.Reservations.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Instance already exists" }),
    };
  }

  const region = "ap-northeast-2";
  const instanceType = "c7i.2xlarge";

  const priceHistory = await ec2.send(
    new DescribeSpotPriceHistoryCommand({
      Filters: [
        {
          Name: "availability-zone",
          Values: ["a", "b", "c", "d"].map((az) => `${region}${az}`),
        },
      ],
      InstanceTypes: [instanceType],
      ProductDescriptions: ["Linux/UNIX"],
      StartTime: new Date(),
    })
  );

  const az = priceHistory.SpotPriceHistory.reduce((acc, cur) => {
    return acc.SpotPrice < cur.SpotPrice ? acc : cur;
  }).AvailabilityZone;

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
echo "${btoa(sshIdleShutdownScript)}" | base64 -d >/tmp/ssh_idle_shutdown.sh
chmod +x /tmp/ssh_idle_shutdown.sh
(crontab -l 2>/dev/null; echo "*/3 * * * * /tmp/ssh_idle_shutdown.sh") | crontab -
`;

  const instance = await ec2.send(
    new RunInstancesCommand({
      ImageId:
        "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
      InstanceType: instanceType,
      InstanceMarketOptions: {
        MarketType: "spot",
        SpotOptions: {
          SpotInstanceType: "one-time",
        },
      },
      MaxCount: 1,
      MinCount: 1,
      Placement: {
        AvailabilityZone: az,
      },
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
      UserData: userData,
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Instance created", instance }),
  };
};
