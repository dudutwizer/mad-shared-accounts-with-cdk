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
import * as r53resolver from "@aws-cdk/aws-route53resolver";
import { VpcMad } from "../constructs/VpcMad";
import { CfnRoute } from "@aws-cdk/aws-ec2";
import { NetworkingCidr } from "../interfaces";

export class SharedResourcesAccount extends cdk.Stack {
  readonly mainVPC: VpcMad;
  readonly vpcAttach: ec2.CfnTransitGatewayVpcAttachment;
  constructor(
    scope: cdk.Construct,
    id: string,
    transitGatewayId: string,
    networkingCidr: NetworkingCidr,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    // Creates separate VPC just for the Managed AD and generates password for the MAD.
    this.mainVPC = new VpcMad(this, "Main-Directory", {
      domainName: "test.aws",
      edition: "Enterprise",
      cidr: networkingCidr.sharedAccount,
    });

    const subnets = this.mainVPC.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });
    this.vpcAttach = new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
      vpcId: this.mainVPC.vpc.vpcId,
      subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
      transitGatewayId: transitGatewayId,
    });
  }
  assignResolverRule(resolverRule: string) {
    new r53resolver.CfnResolverRuleAssociation(
      this,
      "assoc-to-vpc-" + resolverRule,
      {
        resolverRuleId: resolverRule,
        vpcId: this.mainVPC.vpc.vpcId,
      }
    );
  }
  updateRouting(networkingCidr: string, transitGatewayId: string) {
    this.mainVPC.vpc.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "route-" + subnet.node.id + "->" + networkingCidr, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr,
        transitGatewayId: transitGatewayId,
      }).addDependsOn(this.vpcAttach);
    });
  }
}
