import {
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";

// @ts-check

export const handler = async (_event, _context) => {
  const ec2 = new EC2Client();

  await removeUnusedEbs(ec2);
  await keepOneSnapshot(ec2);
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
