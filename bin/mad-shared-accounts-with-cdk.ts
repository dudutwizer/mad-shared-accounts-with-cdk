#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from "@aws-cdk/core";
import { VpcMad } from '../lib/aws-vpc-mad';

const app = new cdk.App();

const accountA = { account: '123456789012', region: 'us-east-1' }
const accountB = { account: '123456789012', region: 'us-east-1' }

class MadSharedAccountsWithCdkStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
  
      new VpcMad(this, "Main-Directory", {domainName: "test.aws", edition: "Enterprise"})
    }
  }