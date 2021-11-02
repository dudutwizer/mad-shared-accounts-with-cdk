#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import {
  SharedResourcesAccount,
  NetworkingAccount,
  GenericAccount,
  NetworkingCidr,
} from "../lib/control-tower";
import { domainForwarder } from "../lib/aws-vpc-mad";

const app = new cdk.App();

const SharedResourcesAccountEnv = {
  env: { account: "117923233529", region: "us-east-1" },
};

const NetworkingAccountEnv = {
  env: { account: "527610730990", region: "us-east-1" },
};

const POCAccount = {
  env: { account: "656988738169", region: "us-east-1" },
};

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

// Now deploy the Generic Account Stack

const machineArn = // Update the value after launching the Generic Account stack, then redeploy the EC2 Instance
  "arn:aws:iam::656988738169:role/GenericAccount-WindowsWorkerWindowsWorkerRole24AE3-4Y6GHJU8Z0Q4";
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
  POCAccount
);

networkingAccount.addResolverRule(DomainForwarder);
networkingAccount.updateRouting(networkingCidr.pocAccount, tgw); // Resolver -> POC
networkingAccount.updateRouting(networkingCidr.sharedAccount, tgw); // Resolver -> DC

sharedAccount.updateRouting(networkingCidr.pocAccount, tgw); // DC -> POC
sharedAccount.updateRouting(networkingCidr.networkingAccount, tgw); // DC -> Resolver

sharedAccount.assignResolverRule(resolverID);
genericAccount.updateRouting(networkingCidr.sharedAccount, tgw); // POC -> DC
genericAccount.updateRouting(networkingCidr.networkingAccount, tgw); // POC -> Resolver
genericAccount.assignResolverRule(resolverID);

// Add permission before launching the machine

sharedAccount.mainVPC.addPermissionsToSecret(machineArn);

genericAccount.launchMachine(
  secretArn,
  "arn:aws:kms:us-east-1:117923233529:key/be764501-5293-4b44-bb13-fcb5e613a3e9"
);
