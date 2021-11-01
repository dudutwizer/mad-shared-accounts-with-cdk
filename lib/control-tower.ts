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
import * as iam from "@aws-cdk/aws-iam";
import * as r53resolver from "@aws-cdk/aws-route53resolver";
import { domainForwarder, r53ResolverMad, VpcMad } from "./aws-vpc-mad";
import { WindowsWorker } from "./windows_worker";
import { CfnRoute } from "@aws-cdk/aws-ec2";

export class NetworkingAccount extends cdk.Stack {
  readonly networkingVPC: ec2.Vpc;
  readonly tgw: ec2.CfnTransitGateway;
  readonly principals: string[];
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

    new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
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

    this.networkingVPC.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "vpc-route-all-tgw-" + subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr.sharedAccount,
        transitGatewayId: this.tgw.attrId,
      });
    });
  }

  addResolverRule(DomainForwarder: domainForwarder) {
    const resolver = new r53ResolverMad(this, "r53resolver-networking", {
      vpc: this.networkingVPC,
      DomainForwarder: DomainForwarder,
      newResolverEndpoint: true,
    });
    const arn = `arn:aws:route53resolver:${this.tgw.stack.region}:${this.tgw.stack.account}:resolver-rule/${resolver.r53resolverRule.resolverRuleId}`;
    const ramObject = new ram.CfnResourceShare(this, "resolver-share", {
      name: "resolver-share",
      resourceArns: [arn],
      principals: this.principals,
    });
  }
}

export class SharedResourcesAccount extends cdk.Stack {
  readonly mainVPC: VpcMad;
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
    const vpcAttach = new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
      vpcId: this.mainVPC.vpc.vpcId,
      subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
      transitGatewayId: transitGatewayId,
    });

    this.mainVPC.vpc.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "vpc-route-networking-tgw-" + subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr.networkingAccount,
        transitGatewayId: transitGatewayId,
      });
    });
  }
}

export class GenericAccount extends cdk.Stack {
  readonly mainVPC: ec2.Vpc;
  constructor(
    scope: cdk.Construct,
    id: string,
    transitGatewayId: string,
    networkingCidr: NetworkingCidr,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    this.mainVPC = new ec2.Vpc(this, "POC-VPC", {
      maxAzs: 2,
      cidr: networkingCidr.pocAccount,
    });
    const subnets = this.mainVPC.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });
    const vpcAttach = new ec2.CfnTransitGatewayVpcAttachment(this, "net-tgw", {
      vpcId: this.mainVPC.vpcId,
      subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
      transitGatewayId: transitGatewayId,
    });

    this.mainVPC.privateSubnets.forEach((subnet) => {
      new CfnRoute(this, "vpc-route-to-shared-via-tgw-" + subnet.node.id, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: networkingCidr.sharedAccount,
        transitGatewayId: transitGatewayId,
      });
    });

    const worker = new WindowsWorker(this, "WindowsWorker", {
      vpc: this.mainVPC,
      joinUsingMad: false,
      secretName: "test.aws-secret",
      iamManagedPoliciesList: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
      ],
    });

    worker.openRDP("83.130.43.233/32");
  }

  addResolver(resolverEndpointId: string, domainForwarder: domainForwarder) {
    const resolver = new r53ResolverMad(this, "r53resolver-domain", {
      vpc: this.mainVPC,
      DomainForwarder: domainForwarder,
      newResolverEndpoint: false,
      resolverEndpointId: resolverEndpointId,
    });
  }
}

export interface NetworkingCidr {
  sharedAccount: string;
  networkingAccount: string;
  pocAccount: string;
}
