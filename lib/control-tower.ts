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
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { r53ResolverMad, VpcMad } from './aws-vpc-mad';

export class SharedResourcesAccount extends cdk.Stack {
    readonly mainVPC : VpcMad
      constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        
        // Creates separate VPC just for the Managed AD and generates password for the MAD.
        this.mainVPC = new VpcMad(this, "Main-Directory", {domainName: "test.aws", edition: "Enterprise"})
      }
    }
  
export class NetworkingAccount extends cdk.Stack {
      readonly r53resolver: r53ResolverMad 
      constructor(scope: cdk.Construct, id: string, sharedResources: SharedResourcesAccount, props?: cdk.StackProps) {
        super(scope, id, props);
        this.r53resolver = new r53ResolverMad(this, "Another-VPC", {mad: sharedResources.mainVPC, vpc: new ec2.Vpc(this, 'networkingVPC')})
      }
  }
  
export class GenericAccount extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, networkingAccount: NetworkingAccount, props?: cdk.StackProps) {
      super(scope, id, props);
  
      const myNewVPC = new ec2.Vpc(this, 'POC-VPC')
      new r53ResolverMad(this, "baseline-account-poc", {mad: networkingAccount.r53resolver.vpcMad, vpc: myNewVPC, r53resolver: networkingAccount.r53resolver.r53resolver})
    }
  }