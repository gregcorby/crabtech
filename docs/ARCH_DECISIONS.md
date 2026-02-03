# Architecture Decisions (Locked for v1)

## 1. One Bot Per User

Each user account is limited to exactly one bot instance. This simplifies billing, resource management, and the mental model for end users. Multi-bot support may be added in a future version.

## 2. One VM Per Bot (Single-Tenant Isolation)

Every bot runs on its own dedicated virtual machine. There is no shared compute between users. This provides strong isolation guarantees for security, performance, and data privacy.

## 3. All Bot Data on Attached Persistent Disk

Bot state, workspace files, and configuration are stored on a persistent volume attached to the VM. This volume survives VM rebuilds and restarts, ensuring data durability independent of compute lifecycle.

## 4. Users Never Access VM Directly

End users interact exclusively through the platform dashboard. All access to the bot's gateway UI is mediated by an authenticated reverse proxy. Users never see IP addresses, SSH credentials, or any infrastructure details.

## 5. BYO (Bring Your Own) Model Keys and Integration Tokens

Users supply their own API keys for model providers (OpenAI, Anthropic, etc.) and integration tokens (GitHub, Slack, etc.). The platform encrypts these at rest and injects them into the bot runtime. The platform never uses or bills for model usage directly.
