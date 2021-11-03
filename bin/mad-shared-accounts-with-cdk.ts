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
  env: { account: "<account-id-1>", region: "us-east-1" },
};

const NetworkingAccountEnv = {
  env: { account: "<account-id-2>", region: "us-east-1" },
};

const POCAccount = {
  env: { account: "<account-id-3>", region: "us-east-1" },
};

// Account segmentation
const networkingCidr: NetworkingCidr = {
  sharedAccount: "10.0.1.0/24",
  networkingAccount: "10.0.2.0/24",
  pocAccount: "10.0.3.0/24",
};

// Set the domain name you want that the Managed AD to be
const ManagedAD_Domain_name = "test.aws";

// Start by deploying the network stack, to the network Account.
const tgw = "tgw-<id-of-the-tg>"; // Update the tgw ID after launching the Networking Account Stack
const resolverID = "rslvr-<resolver-id>"; // Update the resolver ID after launching the Networking Account Stack

// Now deploy the Shared Account stack.

const DomainForwarder: domainForwarder = {
  // Update the value after launching the Shared Account stack (redeploy the NetworkStack after update)
  domainName: ManagedAD_Domain_name,
  ipAddresses: ["<ip-address-1>", "<-ip-address-2>"],
};

const secretArn = // Update the value after launching the Shared Account stack
  "arn:aws:secretsmanager:us-east-1:<account-id>:secret:<secret-name>";

const kmsArn = "arn:aws:kms:us-east-1:<account-id>:key/<key-id>"; // Update the value after launching the Shared Account stack

// Now deploy the Generic Account Stack

const machineInstanceRoleArn = "arn:aws:iam::<account-id>:role/<role-id>"; // Update the value after launching the Generic Account stack, then redeploy the SharedAccount, then redeploy the EC2 Instance

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
