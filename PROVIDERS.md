# Nova provider and connection configuration

Nova keeps provider credentials server-side and never exposes them to the browser. Each provider accepts a comma-, semicolon-, or newline-separated key list through an `*_API_KEYS` variable. Indexed variables such as `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, and so on are also supported.

| Service | Key variables | Optional model/base variables |
| --- | --- | --- |
| Gemini | `GEMINI_API_KEYS` or `GEMINI_API_KEY_1`… | `GEMINI_MODEL` |
| Groq | `GROQ_API_KEYS` or `GROQ_API_KEY_1`… | `GROQ_MODEL` |
| Ollama Cloud | `OLLAMA_CLOUD_API_KEYS` or `OLLAMA_CLOUD_API_KEY_1`… | `OLLAMA_CLOUD_MODEL`, `OLLAMA_CLOUD_BASE_URL` |
| OpenRouter | `OPENROUTER_API_KEYS` or `OPENROUTER_API_KEY_1`… | `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` |
| Kaggle | `KAGGLE_API_KEYS` or `KAGGLE_API_KEY_1`… | — |
| Firecrawl | `FIRECRAWL_API_KEYS` or `FIRECRAWL_API_KEY_1`… | — |
| E2B | `E2B_API_KEYS` or `E2B_API_KEY_1`… | — |

Set `NOVA_PROVIDER_ORDER` to override the default AI order. The default is `gemini,groq,ollama-cloud,openrouter`.

For every AI request, Nova starts at the next healthy key for the selected provider. Retryable upstream failures, authentication failures, rate limits, network errors, and server errors temporarily quarantine the failing key and continue with the next key. When no provider is explicitly selected, the gateway walks through the configured provider order. The same rotation logic applies to Kaggle, Firecrawl, and E2B requests.

The backend exposes provider and connection status through the protected `ai.providers` and `ai.connections` procedures. The chat composer presents the provider selection and indicates how many keys are configured; the UI does not display the key values.

Example server configuration:

```dotenv
NOVA_PROVIDER_ORDER=gemini,groq,ollama-cloud,openrouter
GEMINI_API_KEYS=key-one,key-two
GROQ_API_KEYS=groq-key-one,groq-key-two
OLLAMA_CLOUD_API_KEY_1=ollama-key-one
OPENROUTER_API_KEY_1=openrouter-key-one
KAGGLE_API_KEYS=kaggle-key-one,kaggle-key-two
FIRECRAWL_API_KEYS=firecrawl-key-one
E2B_API_KEYS=e2b-key-one,e2b-key-two
```

Do not commit real credentials or `.env` files. Configure these variables in the deployment environment.
