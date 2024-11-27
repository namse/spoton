import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export class SpotonStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const janitorLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "JanitorLambda",
      {
        entry: path.join(__dirname, "../../janitor/index.js"),
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              "ec2:CreateSnapshot",
              "ec2:DeleteSnapshot",
              "ec2:DeleteVolume",
              "ec2:DescribeSnapshots",
              "ec2:DescribeVolumes",
            ],
            resources: ["*"],
          }),
        ],
        architecture: cdk.aws_lambda.Architecture.ARM_64,
      }
    );

    const janitorEventsRule = new cdk.aws_events.Rule(
      this,
      "JanitorEventsRule",
      {
        schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(5)),
      }
    );

    janitorEventsRule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(janitorLambda)
    );

    const starterLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "StarterLambda",
      {
        entry: path.join(__dirname, "../../starter/index.js"),
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              "ec2:DescribeInstances",
              "ec2:DescribeSnapshots",
              "ec2:DescribeSpotPriceHistory",
              "ec2:RunInstances",
            ],
            resources: ["*"],
          }),
        ],
        architecture: cdk.aws_lambda.Architecture.ARM_64,
      }
    );

    const starterLambdaFunctionUrl = starterLambda.addFunctionUrl({
      authType: cdk.aws_lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, "StarterLambdaFunctionUrl", {
      value: starterLambdaFunctionUrl.url,
    });
  }
}
