#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from "@aws-cdk/core";
import {SharedResourcesAccount, GenericAccount, NetworkingAccount} from "../lib/control-tower" 

const app = new cdk.App();

const SharedResourcesAccountEnv = { env : { account: '117923233529', region: 'us-east-1' }}
const NetworkingAccountEnv = { env : { account: '527610730990', region: 'us-east-1' }}
const POCAccountEnv = { env : { account: '656988738169', region: 'us-east-1' }}

const sharedAccount = new SharedResourcesAccount(app, "SharedAccount", SharedResourcesAccountEnv)
const networkingAccount = new NetworkingAccount(app, "NetworkingAccount", sharedAccount, SharedResourcesAccountEnv)
const pocAccount = new GenericAccount(app, "POC-Account", networkingAccount, SharedResourcesAccountEnv)