# AWS scoreboard deployment

This directory contains the locally built AWS/IoT delivery architecture. No AWS
resources are created by the build commands.

## Runtime structure

- CloudFront serves the static scoreboard and controller from a private S3 bucket.
- `/api/*` is routed through CloudFront to an IAM-protected Lambda Function URL.
- Lambda applies revision-safe scoring actions, writes immutable S3 revisions and
  publishes the current state as a retained AWS IoT MQTT message.
- The Raspberry Pi subscribes to that one topic and applies newer revisions to its
  existing local scoreboard server.

The Pi display remains local and keeps its last score if internet access fails.

## Local build

Run:

```bash
pnpm run build:aws
```

This creates ignored deployment artifacts under `build/`:

- `build/score-writer.zip`
- `build/site/`

Run all local validation with:

```bash
pnpm test
```

## One-time AWS inputs

The CloudFormation template requires:

- an existing private S3 artifact bucket containing `score-writer.zip`;
- the object key used for that zip; and
- the SHA-256 hash of a randomly generated, high-entropy controller token.

The token itself belongs only in the scorer's private link fragment. It must not
be committed to this repository. Certificate and private-key files are excluded
by `.gitignore` and must also remain outside the repository.

## CloudFormation

`scoreboard.yml` creates the private state bucket, CloudFront distribution,
write Lambda, three-day log retention, IoT Thing and least-privilege IoT policy.
The Lambda is capped at one concurrent 128 MB execution.

After the stack is created:

1. Associate the distribution with CloudFront's Free flat-rate plan if the AWS
   account is eligible.
2. Upload `build/site/` without deleting the `state/` prefix.
3. Create and activate one AWS IoT certificate for the Thing.
4. Attach the stack-created IoT policy to that certificate.
5. Install the certificate, private key and Amazon Root CA on the Pi.
6. Configure and start `inch-park-scoreboard-sync.service`.

The stack deliberately does not create a device private key. AWS should generate
that credential once, and it should be transferred directly to the Pi.

## Production control link

The production build reads the controller token from the URL fragment:

```text
https://CLOUDFRONT_HOST/scoring/#PRIVATE_TOKEN
```

The browser stores it only for the current tab and removes it from the visible
address after capture. The fragment is not sent to CloudFront or S3.
