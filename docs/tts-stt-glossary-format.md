# Reviewed TTS/STT glossary specification

This glossary is presentation and speech metadata only. It must never rewrite
canonical `content_blocks.text_content`, printed source identifiers, or source
provenance.

Each entry supports:

```json
{
  "id": "stable UUID",
  "sourceText": "exact displayed/source expression",
  "ttsExpansion": "reviewed spoken expansion or null",
  "sttSearchAliases": ["reviewed aliases"],
  "sourceLanguage": "language tag",
  "expansionLanguage": "language tag or null",
  "reviewStatus": "draft | awaiting_review | approved | rejected",
  "adminNotes": "review context",
  "readerVisible": false
}
```

Rules:

- Source/display text remains unchanged.
- A TTS expansion is used only after explicit review and approval.
- A null expansion records a recurring candidate without inventing a meaning.
- STT/search aliases are additive lookup metadata and never replace source text.
- Honorific and religious-language expansions require knowledgeable review.
- Reader TTS substitution is intentionally outside this preparation stage.

The accompanying Salaat fixture identifies recurring expressions from printed
pages 10–40. Only `Sallallaho alaihe wasallam` has the requested initial draft
expansion; other recurring expressions remain unresolved candidates.
