# Model identity instruction

By default, OpenClaw includes an instruction telling the model how to answer
questions about its current model identity. To omit that instruction, set:

```json
{
  "agents": {
    "defaults": {
      "systemPrompt": { "modelIdentity": false }
    }
  }
}
```

Set the value to `true` or omit it to retain the default behavior. The option
applies to OpenClaw's full and minimal prompts, the `none` prompt mode, and the
embedded and CLI runners. It does not change model routing or redact the
runtime `model=` field. It does not guarantee how a model answers questions
about its identity.
