# External Integration Certification Gate

No external adapter may be enabled for institutional production traffic until its certification evidence is recorded and approved by the responsible university owner.

| Integration class | Required evidence | Fail-closed requirement |
| --- | --- | --- |
| Paystack and Remita | Sandbox payment, duplicate webhook, delayed webhook, reversal, timeout, and reconciliation evidence | Webhook signature verification and idempotency must pass before live keys are enabled. |
| SMTP and SMS | Delivery, failure, retry, opt-out, and audit evidence using non-production recipients | Credentials, sender identity, and rate limits must be approved. |
| Object storage | Upload, access-control, malware scanning, retention, and signed-download evidence | No public bucket policy; uploads must use scoped access. |
| IPPIS and PenCom exports | Written field-layout confirmation from the institution's approved provider, sample-file acceptance, and operator sign-off | The export remains disabled until the provider-specific layout is certified. |
| JAMB, identity, and academic verification | Approved adapter contract, sandbox or controlled pilot evidence, retry/error mapping, and data-minimisation review | The core academic workflow must retain a safe manual fallback. |

Certification evidence must include environment, configuration version, timestamp, test inputs, results, approver, and any exceptions. Retest after provider-contract or credential changes.
