#!/usr/bin/env node
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
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { NetworkingCidr } from "../lib/interfaces";
import { GenericAccount } from "../lib/control-tower/GenericAccount";
import { SharedResourcesAccount } from "../lib/control-tower/SharedResourcesAccount";
import { NetworkingAccount } from "../lib/control-tower/NetworkingAccount";
import { domainForwarder } from "../lib/interfaces";

//**************************************************************//
//******* High Level Guide for deploying the solution **********//
//**************************************************************//
// * Step 1: Configure accounts and IP segmentation           **//
// * Step 2: Deploy the NetworkingAccount Stack               **//
// * Step 3: Manually edit the `tgw` and the `resolverID`     **//
// * Step 4: Deploy the SharedAccount Stack                   **//
// * Step 5: Manually edit the `DomainForwarder`, `secretArn` **//
// *         and the `kmsArn`                                 **//
// * Step 6: Deploy the GenericAccount Stack                  **//
// * Step 7: Manually edit the  `machineInstanceRoleArn`      **//
// * Step 8: Launch machine using the launchMachine() method  **//
//**************************************************************//

const app = new cdk.App();

// Account configuration
const SharedResourcesAccountEnv = {
  env: { account: "117923233529", region: "us-east-1" },
};

const NetworkingAccountEnv = {
  env: { account: "527610730990", region: "us-east-1" },
};

const POCAccount = {
  env: { account: "656988738169", region: "us-east-1" },
};

// Account segmentation
const networkingCidr: NetworkingCidr = {
  sharedAccount: "10.0.1.0/24",
  networkingAccount: "10.0.2.0/24",
  pocAccount: "10.0.3.0/24",
};

// Start by deploying the network stack, to the network Account.
const tgw = "tgw-07e121a2b8c0f8f22"; // Update the tgw ID after launching the Networking Account Stack
const resolverID = "rslvr-rr-38014310b86f4ad0a"; // Update the resolver ID after launching the Networking Account Stack

// Now deploy the Shared Account stack.

const DomainForwarder: domainForwarder = {
  // Update the value after launching the Shared Account stack (redeploy the NetworkStack after update)
  domainName: "test.aws",
  ipAddresses: ["10.0.1.162", "10.0.1.228"],
};

const secretArn = // Update the value after launching the Shared Account stack
  "arn:aws:secretsmanager:us-east-1:117923233529:secret:test.aws-secret-lEO8rL";

const kmsArn = // Update the value after launching the Shared Account stack
  "arn:aws:kms:us-east-1:117923233529:key/be764501-5293-4b44-bb13-fcb5e613a3e9";

// Now deploy the Generic Account Stack

const machineInstanceRoleArn = // Update the value after launching the Generic Account stack, then redeploy the SharedAccount, then redeploy the EC2 Instance
  "arn:aws:iam::656988738169:role/GenericAccount-WindowsWorkerRoleC6758138-Z56Y3IDGQ28O";

//*************************************************//

const networkingAccount = new NetworkingAccount(
  app,
  "NetworkingAccount",
  [SharedResourcesAccountEnv.env.account, POCAccount.env.account],
  networkingCidr,
  NetworkingAccountEnv
);

const sharedAccount = new SharedResourcesAccount(
  app,
  "SharedAccount",
  tgw,
  networkingCidr,
  SharedResourcesAccountEnv
);

const genericAccount = new GenericAccount(
  app,
  "GenericAccount",
  tgw,
  networkingCidr,
  secretArn,
  kmsArn,
  POCAccount
);

networkingAccount.updateRouting(networkingCidr.pocAccount, tgw); // Resolver -> POC
networkingAccount.updateRouting(networkingCidr.sharedAccount, tgw); // Resolver -> DC
networkingAccount.addResolverRule(DomainForwarder);

sharedAccount.updateRouting(networkingCidr.pocAccount, tgw); // DC -> POC
sharedAccount.updateRouting(networkingCidr.networkingAccount, tgw); // DC -> Resolver
sharedAccount.assignResolverRule(resolverID);

genericAccount.updateRouting(networkingCidr.sharedAccount, tgw); // POC -> DC
genericAccount.updateRouting(networkingCidr.networkingAccount, tgw); // POC -> Resolver
genericAccount.assignResolverRule(resolverID);

// Add permission before launching the machine
sharedAccount.mainVPC.addPermissionsToSecret(machineInstanceRoleArn);

// Launch the machine only after confirming that the instance role Arn has permissions (using the addPermissionsToSecret() )
genericAccount.launchMachine(secretArn);
