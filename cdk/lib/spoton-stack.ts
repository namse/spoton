import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";

export class SpotonStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new cdk.aws_ec2.Vpc(this, "Vpc", {
      availabilityZones: ["a", "b", "c", "d"].map(
        (az) => `${cdk.Stack.of(this).region}${az}`
      ),
      ipProtocol: cdk.aws_ec2.IpProtocol.DUAL_STACK,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          ipv6AssignAddressOnCreation: true,
          mapPublicIpOnLaunch: false,
        },
      ],
    });

    const securityGroup = new cdk.aws_ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllIpv6Outbound: true,
    });
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.prefixList(
        // `com.amazonaws.${cdk.Stack.of(this).region}.ipv6.ec2-instance-connect`
        // https://github.com/aws/aws-cdk/issues/15115
        // Fuck you AWS CDK
        "pl-075e2b43f16f625b8"
      ),
      cdk.aws_ec2.Port.tcp(22),
      "Allow SSH access for EC2 Instance Connect IPv6"
    );
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.prefixList(
        // `com.amazonaws.${cdk.Stack.of(this).region}.ec2-instance-connect`
        "pl-00ec8fd779e5b4175"
      ),
      cdk.aws_ec2.Port.tcp(22),
      "Allow SSH access for EC2 Instance Connect IPv4"
    );

    const janitorLambda = new cdk.aws_lambda.Function(this, "JanitorLambda", {
      handler: "index.handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      code: cdk.aws_lambda.Code.fromInline(
        fs
          .readFileSync(path.join(__dirname, "../../janitor/index.js"))
          .toString()
      ),
      // NOTE: Maybe you need this doc: https://docs.aws.amazon.com/ko_kr/service-authorization/latest/reference/list_amazonec2.html
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: [
            "ec2:DescribeInstances",
            "ec2:DescribeSnapshots",
            "ec2:DescribeVolumes",
          ],
          resources: ["*"],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: [
            "ec2:DeleteSnapshot",
            "ec2:DeleteVolume",
            "ec2:TerminateInstances",
          ],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "aws:ResourceTag/Name": "spoton",
            },
          },
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["ec2:CreateSnapshot"],
          resources: ["*"],
        }),
      ],
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(3),
    });

    const janitorEventsRule = new cdk.aws_events.Rule(
      this,
      "JanitorEventsRule",
      {
        schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(1)),
      }
    );

    janitorEventsRule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(janitorLambda)
    );

    const starterPasscode = process.env.STARTER_PASSCODE;
    if (!starterPasscode) {
      throw new Error("STARTER_PASSCODE environment variable is required");
    }

    const starterLambda = new cdk.aws_lambda.Function(this, "StarterLambda", {
      handler: "index.handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      code: cdk.aws_lambda.Code.fromInline(
        fs
          .readFileSync(path.join(__dirname, "../../starter/index.js"))
          .toString()
      ),
      environment: {
        PASSCODE: starterPasscode,
        VPC_SUBNET_IDS: vpc.publicSubnets
          .map((subnet) => subnet.subnetId)
          .join(","),
        SECURITY_GROUP_ID: securityGroup.securityGroupId,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: [
            "ec2:DescribeInstances",
            "ec2:DescribeSnapshots",
            "ec2:RunInstances",
          ],
          resources: ["*"],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["ec2:CreateTags", "ec2:CreateVolume"],
          resources: [
            `arn:aws:ec2:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:*/*`,
          ],
          conditions: {
            StringEquals: {
              "ec2:CreateAction": ["RunInstances"],
            },
          },
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["ssm:GetParameters"],
          resources: [
            `arn:aws:ssm:${
              cdk.Stack.of(this).region
            }::parameter/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id`,
          ],
        }),
      ],
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(3),
    });

    const starterLambdaFunctionUrl = starterLambda.addFunctionUrl({
      authType: cdk.aws_lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, "StarterLambdaFunctionUrl", {
      value: starterLambdaFunctionUrl.url,
    });
  }
}
