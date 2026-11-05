# TODO

## Deferred: Linux ChatGPT tunnel integration verification

Optional integration work, not a blocker for local Sidkick/OpenCode game queries.
Sidkick already runs on Linux; this item concerns the separate ChatGPT tunnel
bridge, not Linux support generally or specifically a ChatGPT desktop app.

### Current evidence

- Linux bridge wrapper tests use a fake tunnel client; the official-client
  end-to-end start/status/stop lifecycle remains unverified.
- The official full Linux client was absent at the configured path,
  `tools/tunnel-client/bin/tunnel-client`, when last checked.
- OpenCode uses its own direct stdio connection and does not need this tunnel.

### Pending checks

- [ ] Obtain and verify the official full Linux client and its companion files;
  the narrower runtime-only binary is insufficient for these wrappers.
- [ ] Configure or reuse an authorized tunnel with a restricted runtime key.
  Never put credentials in this document, chat, command arguments or Git.
- [ ] Verify start/status report `process_running`, `healthy` and `ready`.
- [ ] Verify an actual read-only ChatGPT tool call with a Civ VII save loaded;
  tunnel readiness alone does not establish game connectivity.
- [ ] Verify managed stop/start, terminal-close survival, and recovery after a
  normal reboot. No boot/login service is currently installed by the wrappers.
- [ ] Confirm stop affects only this repository's managed `sidkick` runtime,
  not OpenCode or other tunnel runtimes. Do not run Windows and Linux bridges
  simultaneously against the same tunnel ID.
- [ ] Record results and remaining failures without credentials or private data.

Obtain explicit approval for each installation, credential/configuration change
or runtime operation before executing it. This checklist is not authorization
to perform those actions. Nothing was installed, configured or started to create
this TODO.

See [Linux ChatGPT setup](../README.md#linux) and the
[coverage audit](civ7-coverage-audit.md) for existing setup and verification limits.
