# UniVault

### A Privacy-Preserving Self-Sovereign Identity Wallet for Sri Lanka

UniVault is a privacy-preserving digital identity wallet designed to enable secure, portable and selective sharing of verified digital credentials in Sri Lanka.

The system follows a Self-Sovereign Identity (SSI) approach, allowing individuals to securely store their digital credentials and share only the information required by a verifier. It aims to reduce unnecessary disclosure of personal information during identity verification processes.

## Project Overview

UniVault implements a digital identity ecosystem based on three main participants:

- **Issuer:** An organisation that verifies identity information and issues digitally signed credentials.
- **Holder:** An individual who receives and securely stores credentials in the UniVault mobile wallet.
- **Verifier:** An organisation that requests and verifies selected credential attributes.

The system focuses on two primary use cases:

1. Employee Identity Verification
2. Financial Institution Customer Due Diligence (KYC)

## Key Features

- Secure digital credential issuance.
- Self-sovereign identity wallet.
- SD-JWT-based selective disclosure.
- RS256 digital signatures.
- QR-based credential issuance and verification.
- Encrypted credential storage using AES-256.
- PIN and biometric authentication.
- Credential revocation and status checking.
- Verification history and audit events.
- AI-based anomaly detection for suspicious verification activities.
- English and Sinhala language support.

## Technology Stack

| Component                   | Technology                  |
| --------------------------- | --------------------------- |
| Mobile Wallet               | React Native (Expo)         |
| Issuer Portal               | React.js                    |
| Verifier Portal             | React.js                    |
| Backend API                 | Node.js, Express.js         |
| Cryptographic Core          | TypeScript / JavaScript     |
| AI Anomaly Detection        | Python, Flask, Scikit-learn |
| Machine Learning Algorithm  | Isolation Forest            |
| Credential Format           | SD-JWT                      |
| Digital Signature           | RS256                       |
| Local Credential Encryption | AES-256                     |

## System Architecture

UniVault follows an Issuer–Holder–Verifier architecture.

1. The issuer creates and digitally signs a credential.
2. The holder receives the credential through the mobile wallet using a QR-based issuance process.
3. The holder securely stores the credential on their device.
4. A verifier requests specific identity attributes.
5. The holder reviews the request, provides consent and shares selected attributes.
6. The verifier validates the credential, signature, disclosures and credential status.
7. Verification events are recorded and analysed by the AI anomaly detection service.

## Repository Structure

```text
UniVault/
│
├── crypto-core/       # Shared SD-JWT cryptographic library
│
├── backend/           # Node.js / Express backend API
│
├── issuer-portal/     # React.js issuer application
│
├── wallet/            # React Native Expo mobile wallet
│
├── verifier-portal/   # React.js verifier application
│
├── ai-service/        # Python / Flask AI anomaly service
│
├── docs/              # Project documentation
│
├── README.md          # Project overview and documentation
│
└── .gitignore         # Files excluded from Git tracking
```

## Development Setup

See [docs/development-setup.md](docs/development-setup.md) for prerequisites, ports,
environment variables and the shared lint/format/secrets scripts.

## Development Roadmap

The development follows an Agile methodology adapted for a solo developer, organised into five sprints.

| Sprint   | Focus                                             |
| -------- | ------------------------------------------------- |
| Sprint 1 | Foundations, cryptographic core and issuer portal |
| Sprint 2 | Mobile wallet and credential issuance             |
| Sprint 3 | Verifier portal and selective disclosure          |
| Sprint 4 | AI anomaly detection and additional features      |
| Sprint 5 | Testing, security hardening and release           |

## Security and Privacy

UniVault is designed with privacy and security as core principles.

- Selective disclosure to minimise unnecessary information sharing.
- Cryptographic verification of issued credentials.
- Encrypted local credential storage.
- Secure private key handling.
- PIN and biometric authentication.
- Credential status and revocation checking.
- Data minimisation aligned with Sri Lanka's Personal Data Protection Act, No. 9 of 2022.

## Project Status

**Development in progress.**

This repository is maintained as part of the COMP60011 Final Year Project.

## License

This project is currently developed for academic purposes. Licensing details will be added where applicable.
