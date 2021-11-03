import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import { CfnAssociation, CfnDocument } from "@aws-cdk/aws-ssm";
import { IManagedPolicy } from "@aws-cdk/aws-iam";
import * as iam from "@aws-cdk/aws-iam";
import * as mad from "@aws-cdk/aws-directoryservice";
import { SecurityGroup } from "@aws-cdk/aws-ec2";

export class WindowsWorker extends cdk.Construct {
  readonly worker: ec2.Instance;
  constructor(
    scope: cdk.Construct,
    id = "WindowsWorker",
    props: WindowsWorkerProps
  ) {
    super(scope, id);

    if (props.joinUsingMad) {
      props.madObject = props.madObject!;
    }

    props.usePrivateSubnet = props.usePrivateSubnet ?? false;

    const ami_id = new ec2.WindowsImage(
      ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE
    );

    const securityGroup = new SecurityGroup(this, "instanceWorkerSG", {
      vpc: props.vpc,
    });

    this.worker = new ec2.Instance(this, "Workernode", {
      instanceType: props.InstanceType ?? new ec2.InstanceType("t3.medium"),
      machineImage: ami_id,
      vpc: props.vpc,
      role: props.instanceRole,
      securityGroup: securityGroup,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: props.usePrivateSubnet
          ? ec2.SubnetType.PRIVATE
          : ec2.SubnetType.PUBLIC,
        onePerAz: true,
      }),
    });

    if (props.joinUsingMad) {
      new CfnAssociation(this, "JoinADAssociation", {
        name: "AWS-JoinDirectoryServiceDomain",
        parameters: {
          directoryId: [props.madObject!.ref],
          directoryName: [props.madObject!.name],
        },
        targets: [{ key: "InstanceIds", values: [this.worker.instanceId] }],
      });

      new cdk.CfnOutput(this, "CfnOutputWindowsWorker", {
        value: this.worker.instancePublicDnsName,
      });
    } else {
      this.worker.addUserData(`

      #domain join with secret from secret manager cross account using full ARN
      [string]$SecretAD  = "${props.secretArn!}"
      $SecretObj = Get-SECSecretValue -SecretId $SecretAD
      [PSCustomObject]$Secret = ($SecretObj.SecretString  | ConvertFrom-Json)
      $password   = $Secret.Password | ConvertTo-SecureString -asPlainText -Force
      $username   = $Secret.UserID + "@" + $Secret.Domain
      $credential = New-Object System.Management.Automation.PSCredential($username,$password)
      Add-Computer -DomainName $Secret.Domain -Credential $credential
  
      Restart-Computer -Force
      `);
    }
  }

  runPsCommands(psCommands: string[], id: string) {
    new CfnAssociation(this, id, {
      name: "AWS-RunPowerShellScript",
      parameters: {
        commands: psCommands,
      },
      targets: [{ key: "InstanceIds", values: [this.worker.instanceId] }],
    });
  }

  openRDP(ipaddress: string) {
    this.worker.connections.allowFrom(
      ec2.Peer.ipv4(ipaddress),
      ec2.Port.tcp(3389),
      "Allow RDP"
    );
  }
}

export interface WindowsWorkerProps {
  /**
   * The VPC to use <required>
   * @default - 'No default'.
   */
  vpc: ec2.IVpc;
  /**
   * Instance Role
   * @default - 'No default'.
   */
  instanceRole: iam.Role;
  /**
   * The EC2 Instance type to use
   *
   * @default - 'm5.2xlarge'.
   */
  InstanceType?: ec2.InstanceType;
  /**
   * Choose if to launch the instance in Private or in Public subnet
   * Private = Subnet that routes to the internet, but not vice versa.
   * Public = Subnet that routes to the internet and vice versa.
   * @default - Private.
   */
  usePrivateSubnet?: boolean;
  /**
   * Join the domain using MAD or manually? if manually need to provide secret name from SecretManager, if MAD need to provide madObject
   */
  joinUsingMad: boolean;
  /**
   * secretArn stored in Secret manager
   */
  secretArn?: string;
  /**
   * KMSArn
   */
  madObject?: mad.CfnMicrosoftAD;
}
