# Managed Active Directory with Transit Gateway in Multi-Account deployment 

## Intro

This is an example solution of three account setup with Managed AD and domain join using UserData script (Password stored in Secrets Manager) and traffic connected with Transit Gateway between the VPCs.

## The solution high-level architecture:

![](/static/images/MultiAccount.png?classes=border,shadow)

## How to use

```
git clone <repo>
npm install
```

Open and customize the following file [mad-shared-accounts-with-cdk.ts](/bin/mad-shared-accounts-with-cdk.ts)

## High Level Guide for deploying the solution 

1. Configure accounts and IP segmentation
1. Deploy the NetworkingAccount Stack with `cdk deploy NetworkingAccount`
1. Use the CDK Output from `NetworkingAccount` and manually edit the `tgw` object and the `resolverID` object
1. Deploy the SharedAccount Stack with `cdk deploy SharedAccount`
1. Use the CDK Output from `SharedAccount` and manually edit the `DomainForwarder`, `secretArn` and the `kmsArn`
1. Deploy the GenericAccount Stack with `cdk deploy GenericAccount`
1. Use the CDK Output from `GenericAccount` and manually edit the  `machineInstanceRoleArn`
1. Launch machine using the launchMachine() method