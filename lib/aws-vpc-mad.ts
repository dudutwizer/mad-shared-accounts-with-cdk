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
import * as secretsmanager from "@aws-cdk/aws-secretsmanager";
import * as mad from "@aws-cdk/aws-directoryservice";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as kms from "@aws-cdk/aws-kms";
import * as r53resolver from "@aws-cdk/aws-route53resolver";
import { CfnResolverRuleProps } from "@aws-cdk/aws-route53resolver";

export interface domainForwarder {
  /**
   * The domain name for the Active Directory Domain.
   *
   */
  domainName: string;
  /**
   * The IP Addresses to resolve the domainName
   *
   */
  ipAddresses: [string, string];
}

/**
 * The properties for the VpcMad class.
 */
export interface VpcMadProps {
  /**
   * The domain name for the Active Directory Domain.
   *
   * @default - 'domain.aws'.
   */
  domainName?: string;
  /**
   * The edition to use for the Active Directory Domain.
   * Allowed values: Enterprise | Standard
   * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-directoryservice-microsoftad.html#cfn-directoryservice-microsoftad-edition
   * @default - 'Standard'.
   */
  edition?: string;
  /**
   * The secrets manager secret to use must be in format:
   * '{Domain: <domain.name>, UserID: 'Admin', Password: '<password>'}'
   * @default - 'Randomly generated and stored in Secret Manager'.
   */
  secret?: secretsmanager.ISecret;
  /**
   * The VPC to use, must have private subnets.
   * @default - 'Randomly generated'.
   */
  vpc?: ec2.IVpc;

  /**
   * The CIDR To use
   * @default - '10.0.0.0/16'.
   */
  cidr?: string;
}
export class VpcMad extends cdk.Construct {
  readonly secret: secretsmanager.ISecret;
  readonly ad: mad.CfnMicrosoftAD;
  readonly CfnDHCPOptions: ec2.CfnDHCPOptions;
  readonly vpc: ec2.IVpc;
  readonly domainName: string;
  readonly key: kms.Key;

  constructor(scope: cdk.Construct, id = "aws-vpc-mad", props: VpcMadProps) {
    super(scope, id);
    this.domainName = props.domainName ?? "domain.aws";
    props.edition = props.edition ?? "Standard";
    this.vpc =
      props.vpc ??
      new ec2.Vpc(this, id + "-VPC", {
        maxAzs: 2,
        cidr: props.cidr ?? "10.0.0.0/16",
      });

    this.key = new kms.Key(this, "KMS", { description: "KMS for AD" });
    const secretName = this.domainName + "-secret";
    this.secret =
      props.secret ??
      new secretsmanager.Secret(this, id + "-Secret", {
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            Domain: this.domainName,
            UserID: "Admin",
          }),
          generateStringKey: "Password",
          excludePunctuation: true,
        },
        secretName: secretName,
        encryptionKey: this.key,
      });

    const subnets = this.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE,
    });

    this.ad = new mad.CfnMicrosoftAD(this, id + "-Mad", {
      password: this.secret.secretValueFromJson("Password").toString(),
      edition: props.edition,
      name: this.domainName,
      vpcSettings: {
        subnetIds: [subnets.subnetIds[0], subnets.subnetIds[1]],
        vpcId: this.vpc.vpcId,
      },
    });

    new cdk.CfnOutput(this, "mad-secret-name", {
      value: secretName,
      exportName: "mad-secret-name",
    });

    new cdk.CfnOutput(this, "mad-secret-arn", {
      value: this.secret.secretArn,
      exportName: "mad-secret-arn",
    });

    new cdk.CfnOutput(this, "mad-kms-arn", {
      value: this.key.keyArn,
      exportName: "mad-kms-arn",
    });

    new cdk.CfnOutput(this, "mad-dns", {
      value: cdk.Fn.join(",", this.ad.attrDnsIpAddresses),
      exportName: "mad-dns",
    });

    new cdk.CfnOutput(this, "mad-domain-name", {
      value: this.domainName,
      exportName: "mad-domain-name",
    });
  }
  addPermissionsToSecret(arn: string) {
    this.secret.grantRead(new iam.ArnPrincipal(arn));
    this.key.grantDecrypt(new iam.ArnPrincipal(arn));
  }
}

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
