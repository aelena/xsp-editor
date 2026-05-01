export interface AppConfig {
  port: number;
  storageProvider: "azure" | "memory";
  azureStorageConnectionString?: string;
  apiAuthToken?: string;
  llmApiKeyAnthropic?: string;
  llmApiKeyOpenai?: string;
  llmDefaultProvider?: string;
  llmDefaultModel?: string;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || "3001", 10),
    storageProvider:
      (process.env.STORAGE_PROVIDER as "azure" | "memory") || "memory",
    azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    apiAuthToken: process.env.API_AUTH_TOKEN,
    llmApiKeyAnthropic: process.env.LLM_API_KEY_ANTHROPIC,
    llmApiKeyOpenai: process.env.LLM_API_KEY_OPENAI,
    llmDefaultProvider: process.env.LLM_DEFAULT_PROVIDER,
    llmDefaultModel: process.env.LLM_DEFAULT_MODEL,
  };
}
