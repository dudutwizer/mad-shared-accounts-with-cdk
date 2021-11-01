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
import { CfnRoute } from "@aws-cdk/aws-ec2";

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

// Deploy first
const networkingAccount = new NetworkingAccount(
  app,
  "NetworkingAccount",
  [SharedResourcesAccountEnv.env.account, POCAccount.env.account],
  networkingCidr,
  NetworkingAccountEnv
);

// Update the tgw ID
const sharedAccount = new SharedResourcesAccount(
  app,
  "SharedAccount",
  "tgw-09cbe7f958a49340e",
  networkingCidr,
  SharedResourcesAccountEnv
);

const DomainForwarder: domainForwarder = {
  domainName: "test.aws",
  ipAddresses: ["10.0.122.230", "10.0.152.56"],
};

networkingAccount.addResolverRule(DomainForwarder);

const genericAccount = new GenericAccount(
  app,
  "GenericAccount",
  "tgw-09cbe7f958a49340e",
  networkingCidr,
  POCAccount
);

// Run it only after sharing!
genericAccount.addResolver("", DomainForwarder);
