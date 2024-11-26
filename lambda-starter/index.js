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

  // find az by spot price
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

  // find cheapest az
  const az = priceHistory.SpotPriceHistory.reduce((acc, cur) => {
    return acc.SpotPrice < cur.SpotPrice ? acc : cur;
  }).AvailabilityZone;

  // get ebs from snapshot, or if snapshot not exists, create new one

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

  // create spot instance with volume

  const instance = await ec2.send(
    new RunInstancesCommand({
      ImageId:
        "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
      InstanceType: instanceType,
      InstanceMarketOptions: {
        MarketType: "spot",
        SpotOptions: {
          SpotInstanceType: "persistent",
          InstanceInterruptionBehavior: "hibernate",
        },
      },
      KeyName: "namse", // Make sure you have the key pair
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
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Instance created", instance }),
  };
};
