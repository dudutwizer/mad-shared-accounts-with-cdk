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
import { domainForwarder } from "../interfaces";

/**
 * The properties for the r53ResolverMad class.
 */
export interface r53ResolverMadProps {
  /**
   * The VPC to create the R53 Resolvers in, must have private subnets.
   * @default - 'Randomly generated'.
   */
  vpc: ec2.IVpc;

  /**
   * The domain rule to forward the request to
   */
  DomainForwarder: domainForwarder;
}

export class r53ResolverMad extends cdk.Construct {
  readonly vpc: ec2.IVpc;
  readonly domainParams: domainForwarder;
  readonly r53resolverRule: r53resolver.CfnResolverRuleAssociation;
  readonly resolverEndpointId: string;
  constructor(
    scope: cdk.Construct,
    id = "r53-resolver-mad",
    props: r53ResolverMadProps
  ) {
    super(scope, id);
    this.vpc = props.vpc;
    this.domainParams = props.DomainForwarder;

    const subnets = this.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });

    const sg = new ec2.SecurityGroup(this, id + "OutboundResolverSG", {
      vpc: this.vpc,
    });
    sg.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.udp(53));

    const outBoundResolver = new r53resolver.CfnResolverEndpoint(
      this,
      "endpoint",
      {
        direction: "OUTBOUND",
        ipAddresses: subnets.subnetIds.map((s) => {
          return { subnetId: s };
        }),
        securityGroupIds: [sg.securityGroupId],
      }
    );

    this.resolverEndpointId = outBoundResolver.ref;

    const resolverRules = new r53resolver.CfnResolverRule(this, "rules", {
      domainName: this.domainParams.domainName,
      resolverEndpointId: this.resolverEndpointId,
      ruleType: "FORWARD",
      targetIps: [
        { ip: this.domainParams.ipAddresses[0] },
        { ip: this.domainParams.ipAddresses[1] },
      ],
    });

    this.r53resolverRule = new r53resolver.CfnResolverRuleAssociation(
      this,
      "assoc-to-vpc",
      {
        resolverRuleId: resolverRules.attrResolverRuleId,
        vpcId: this.vpc.vpcId,
      }
    );
  }
}
