const {
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeInstancesCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  EC2Client,
  TerminateInstancesCommand,
} = require("@aws-sdk/client-ec2");

// @ts-check

exports.handler = async (_event, _context) => {
  const ec2 = new EC2Client();

  await removeUnusedEbs(ec2);
  await keepOneSnapshot(ec2);
  await killZombieInstances(ec2);
};

/**
 * @param {EC2Client} ec2
 * @returns {Promise<void>}
 */
async function removeUnusedEbs(ec2) {
  const { Volumes } = await ec2.send(
    new DescribeVolumesCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
        {
          Name: "status",
          Values: ["available"],
        },
      ],
    })
  );

  const unattachedVolumes = Volumes.filter(
    (volume) => !volume.Attachments.length
  );

  for (const volume of unattachedVolumes) {
    await ec2.send(
      new CreateSnapshotCommand({
        VolumeId: volume.VolumeId,
        TagSpecifications: [
          {
            ResourceType: "snapshot",
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
  }

  for (const volume of unattachedVolumes) {
    await ec2.send(
      new DeleteVolumeCommand({
        VolumeId: volume.VolumeId,
      })
    );
  }
}

/**
 * @param {EC2Client} ec2
 * @returns {Promise<void>}
 **/
async function keepOneSnapshot(ec2) {
  const { Snapshots } = await ec2.send(
    new DescribeSnapshotsCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
      ],
    })
  );

  const snapshots = Snapshots.sort((a, b) => {
    return new Date(a.StartTime) - new Date(b.StartTime);
  });

  for (const snapshot of snapshots.slice(0, -1)) {
    await ec2.send(
      new DeleteSnapshotCommand({
        SnapshotId: snapshot.SnapshotId,
      })
    );
  }
}

/**
 * @param {EC2Client} ec2
 * @returns {Promise<void>}
 **/
async function killZombieInstances(ec2) {
  const { Reservations } = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:Name",
          Values: ["spoton"],
        },
      ],
    })
  );

  const instanceIds = [];

  for (const reservation of Reservations || []) {
    for (const instance of reservation.Instances || []) {
      if (instance.State !== "running") {
        continue;
      }
      const uptime = new Date() - new Date(instance.LaunchTime);
      const hours8 = 8 * 3600 * 1000;
      if (uptime > hours8) {
        console.log("WARNING: Found zombie instance", instance);
        instanceIds.push(instance.InstanceId);
      }
    }
  }

  if (!instanceIds.length) {
    return;
  }

  await ec2.send(
    new TerminateInstancesCommand({
      InstanceIds: instanceIds,
    })
  );
}
