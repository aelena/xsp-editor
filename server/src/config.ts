export interface AppConfig {
  port: number;
  apiAuthToken?: string;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || "5999", 10),
    apiAuthToken: process.env.API_AUTH_TOKEN,
  };
}
