/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring Jira integration
  |----------------------------------------------------------
  */
  JIRA_WEBHOOK_SECRET: Env.schema.string.optional(),
  JIRA_BASE_URL: Env.schema.string.optional(),
  JIRA_API_TOKEN: Env.schema.string.optional(),
  JIRA_EMAIL: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring GitHub integration
  |----------------------------------------------------------
  */
  GITHUB_WEBHOOK_SECRET: Env.schema.string.optional(),
  GITHUB_TOKEN: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for anonymisation (HMAC key for hashing identifiers)
  |----------------------------------------------------------
  */
  HMAC_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for authentication method
  |----------------------------------------------------------
  */
  AUTH_METHOD: Env.schema.enum.optional(['database', 'oidc'] as const),

  /*
  |----------------------------------------------------------
  | Variables for OIDC / Microsoft Entra ID
  |----------------------------------------------------------
  */
  OIDC_CLIENT_ID: Env.schema.string.optional(),
  OIDC_CLIENT_SECRET: Env.schema.string.optional(),
  OIDC_REDIRECT_URI: Env.schema.string.optional(),
  OIDC_TENANT_ID: Env.schema.string.optional(),
  OIDC_GROUP_CLAIM: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring event archive
  |----------------------------------------------------------
  */
  ARCHIVE_PATH: Env.schema.string.optional(),
})
