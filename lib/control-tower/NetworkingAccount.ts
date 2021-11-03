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
import * as ram from "@aws-cdk/aws-ram";
import * as ec2 from "@aws-cdk/aws-ec2";
import { domainForwarder, NetworkingCidr } from "../interfaces";
import { r53ResolverMad } from "../constructs/r53ResolverMad";
import { CfnRoute } from "@aws-cdk/aws-ec2";

export class NetworkingAccount extends cdk.Stack {
  readonly networkingVPC: ec2.Vpc;
  readonly tgw: ec2.CfnTransitGateway;
  readonly principals: string[];
  readonly vpcAttach: ec2.CfnTransitGatewayVpcAttachment;
  constructor(
    scope: cdk.Construct,
    id: string,
    principals: string[],
    networkingCidr: NetworkingCidr,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    this.networkingVPC = new ec2.Vpc(this, "Networking-VPC", {
      maxAzs: 2,
      cidr: networkingCidr.networkingAccount,
    });

    this.principals = principals;

    this.tgw = new ec2.CfnTransitGateway(this, "tgw", {
      autoAcceptSharedAttachments: "enable",
    });

    const subnets = this.networkingVPC.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });

    this.vpcAttach = new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
      vpcId: this.networkingVPC.vpcId,
      subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
      transitGatewayId: this.tgw.attrId,
    });

    new cdk.CfnOutput(this, "tgw-id", {
      value: this.tgw.attrId,
      exportName: "twg-attrId",
    });

    const arn = `arn:aws:ec2:${this.tgw.stack.region}:${this.tgw.stack.account}:transit-gateway/${this.tgw.attrId}`;
    const ramObject = new ram.CfnResourceShare(this, "tgw-share", {
      name: "tgw-share",
      resourceArns: [arn],
      principals: this.principals,
    });
  }

  updateRouting(networkingCidr: string, transitGatewayId: string) {
    this.networkingVPC.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "route-" + subnet.node.id + "->" + networkingCidr, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr,
        transitGatewayId: transitGatewayId,
      }).addDependsOn(this.vpcAttach);
    });
  }

  addResolverRule(DomainForwarder: domainForwarder) {
    const resolver = new r53ResolverMad(this, "r53resolver-networking", {
      vpc: this.networkingVPC,
      DomainForwarder: DomainForwarder,
    });
    resolver.r53resolverRule.addDependsOn(this.tgw);
    const arn = `arn:aws:route53resolver:${this.tgw.stack.region}:${this.tgw.stack.account}:resolver-rule/${resolver.r53resolverRule.resolverRuleId}`;
    const ramObject = new ram.CfnResourceShare(this, "resolver-share", {
      name: "resolver-share",
      resourceArns: [arn],
      principals: this.principals,
    });
    new cdk.CfnOutput(this, "resolverRuleId", {
      value: resolver.r53resolverRule.resolverRuleId,
      exportName: "r53-resolverRuleId",
    });
  }
}
