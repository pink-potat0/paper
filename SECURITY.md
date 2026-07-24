# Security Policy

## Supported version

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Do not open a public issue containing credentials, exploit steps, wallet data, or personal information.

Report vulnerabilities privately through GitHub Security Advisories:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Choose **Report a vulnerability**.

Include the affected route or component, reproduction steps, impact, and any suggested mitigation. You should receive an initial response within seven days.

## Secrets

- Never commit `.env` files or API keys.
- Production secrets belong in Vercel Environment Variables.
- Browser code must use scoped server endpoints instead of receiving provider API keys.
- Rotate any credential that is accidentally exposed.
