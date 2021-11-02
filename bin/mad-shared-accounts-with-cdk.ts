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

const networkingAccount = new NetworkingAccount(
  app,
  "NetworkingAccount",
  [SharedResourcesAccountEnv.env.account, POCAccount.env.account],
  networkingCidr,
  NetworkingAccountEnv
);

const tgw = "tgw-07e121a2b8c0f8f22"; // Update the tgw ID after launching the Networking Account Stack

const sharedAccount = new SharedResourcesAccount(
  app,
  "SharedAccount",
  tgw,
  networkingCidr,
  SharedResourcesAccountEnv
);

const DomainForwarder: domainForwarder = {
  domainName: "test.aws",
  ipAddresses: ["10.0.1.186", "10.0.1.241"],
};

const genericAccount = new GenericAccount(
  app,
  "GenericAccount",
  tgw,
  networkingCidr,
  POCAccount
);

// Run it after deploying Networking Stack
networkingAccount.addResolverRule(DomainForwarder);

// Run it after deploying SharedAccount Stack and Networking stack
sharedAccount.updateRouting(networkingCidr.pocAccount, tgw); // Active Directory --> Poc Account
sharedAccount.assignResolverRule("rslvr-rr-38014310b86f4ad0a");

// Run it after deploying SharedAccount, Networking and Generic stacks
genericAccount.updateRouting(networkingCidr.sharedAccount, tgw); // Poc Account --> Active Directory
genericAccount.assignResolverRule("rslvr-rr-38014310b86f4ad0a");

// last step
genericAccount.launchMachine("test.aws-secret");
