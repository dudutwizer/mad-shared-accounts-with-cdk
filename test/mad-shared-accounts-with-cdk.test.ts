import * as cdk from 'aws-cdk-lib';
import * as MadSharedAccountsWithCdk from '../lib/mad-shared-accounts-with-cdk-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new MadSharedAccountsWithCdk.MadSharedAccountsWithCdkStack(app, 'MyTestStack');
    // THEN
    const actual = app.synth().getStackArtifact(stack.artifactId).template;
    expect(actual.Resources ?? {}).toEqual({});
});
