/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

// Imports
import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as r53resolver from "@aws-cdk/aws-route53resolver";
import { WindowsWorker } from "../constructs/WindowsWorker";
import { CfnRoute } from "@aws-cdk/aws-ec2";
import { NetworkingCidr } from "../interfaces";

export class GenericAccount extends cdk.Stack {
  readonly mainVPC: ec2.Vpc;
  readonly vpcAttach: ec2.CfnTransitGatewayVpcAttachment;
  readonly instanceRole: iam.Role;
  constructor(
    scope: cdk.Construct,
    id: string,
    transitGatewayId: string,
    networkingCidr: NetworkingCidr,
    secretArn: string,
    kmsArn: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    this.mainVPC = new ec2.Vpc(this, "POC-VPC", {
      maxAzs: 2,
      cidr: networkingCidr.pocAccount,
    });

    const decryptKMS = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [kmsArn],
          actions: ["kms:Decrypt"],
        }),
      ],
    });

    const secretAccess = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [secretArn],
          actions: ["secretsmanager:GetSecretValue"],
        }),
      ],
    });

    this.instanceRole = new iam.Role(this, "WindowsWorkerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
      inlinePolicies: { DecryptKMS: decryptKMS, SecretAccess: secretAccess },
    });

    new cdk.CfnOutput(this, "worker-role-arn", {
      value: this.instanceRole.roleArn,
      exportName: "worker-role-arn",
    });

    const subnets = this.mainVPC.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });
    this.vpcAttach = new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
      vpcId: this.mainVPC.vpcId,
      subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
      transitGatewayId: transitGatewayId,
    });
  }

  launchMachine(secretArn: string) {
    const worker = new WindowsWorker(this, "WindowsWorker", {
      vpc: this.mainVPC,
      joinUsingMad: false,
      instanceRole: this.instanceRole,
      secretArn: secretArn,
    });
  }

  assignResolverRule(resolverRule: string) {
    new r53resolver.CfnResolverRuleAssociation(
      this,
      "assoc-to-vpc-" + resolverRule,
      {
        resolverRuleId: resolverRule,
        vpcId: this.mainVPC.vpcId,
      }
    );
  }
  updateRouting(networkingCidr: string, transitGatewayId: string) {
    this.mainVPC.publicSubnets.forEach((subnet) => {
      new CfnRoute(this, "route-" + subnet.node.id + "->" + networkingCidr, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr,
        transitGatewayId: transitGatewayId,
      }).addDependsOn(this.vpcAttach);
    });
    this.mainVPC.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "route-" + subnet.node.id + "->" + networkingCidr, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr,
        transitGatewayId: transitGatewayId,
      }).addDependsOn(this.vpcAttach);
    });
  }
}
