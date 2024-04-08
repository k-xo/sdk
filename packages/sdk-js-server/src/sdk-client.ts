import { ApiKeyStamper } from "@turnkey/api-key-stamper";

import type {
  TurnkeySDKClientConfig,
  TurnkeySDKServerConfig,
  TurnkeyProxyHandlerConfig,
} from "./__types__/base";

import { TurnkeySDKClientBase } from "./__generated__/sdk-client-base";

import type { Request, Response, RequestHandler } from "express";
import type {
  NextApiRequest,
  NextApiResponse,
  NextApiHandler,
} from "./__types__/base";

const API_PROXY_ALLOWED_METHODS = [
  "getActivity",
  "getApiKey",
  "getApiKeys",
  "getAuthenticator",
  "getAuthenticators",
  "getOrganization",
  "getPolicy",
  "getPrivateKey",
  "getUser",
  "getWallet",
  "getActivities",
  "getPolicies",
  "listPrivateKeyTags",
  "getPrivateKeys",
  "getSubOrgIds",
  "listUserTags",
  "getUsers",
  "getWalletAccounts",
  "getWallets",
  "getWhoami",
  "createSubOrganization",
  "emailAuth",
  "initUserEmailRecovery",
];

export class TurnkeyServerSDK {
  config: TurnkeySDKServerConfig;

  constructor(config: TurnkeySDKServerConfig) {
    this.config = config;
  }

  api = (): TurnkeySDKServerClient => {
    const apiKeyStamper = new ApiKeyStamper({
      apiPublicKey: this.config.apiPublicKey,
      apiPrivateKey: this.config.apiPrivateKey,
    });

    return new TurnkeySDKServerClient({
      stamper: apiKeyStamper,
      apiBaseUrl: this.config.apiBaseUrl,
      organizationId: this.config.rootOrganizationId,
    });
  };

  apiProxy = async (methodName: string, params: any[]): Promise<any> => {
    const apiClient = this.api();
    const method = apiClient[methodName];
    if (typeof method === "function") {
      return await method(...params);
    } else {
      throw new Error(
        `Method: ${methodName} does not exist on TurnkeySDKClient`
      );
    }
  };

  expressProxyHandler = (config: TurnkeyProxyHandlerConfig): RequestHandler => {
    const allowedMethods = config.allowedMethods ?? API_PROXY_ALLOWED_METHODS;

    return async (request: Request, response: Response): Promise<void> => {
      const { methodName, params } = request.body;
      if (!methodName || !params) {
        response.status(400).send("methodName and params are required.");
      }

      try {
        if (allowedMethods.includes(methodName)) {
          const result = await this.apiProxy(methodName, params);
          response.json(result);
        } else {
          response.status(401).send("Unauthorized proxy method");
        }
        return;
      } catch (error) {
        if (error instanceof Error) {
          response.status(500).send(error.message);
        } else {
          response.status(500).send("An unexpected error occurred");
        }
        return;
      }
    };
  };

  nextProxyHandler = (config: TurnkeyProxyHandlerConfig): NextApiHandler => {
    const allowedMethods = config.allowedMethods ?? API_PROXY_ALLOWED_METHODS;

    return async (
      request: NextApiRequest,
      response: NextApiResponse
    ): Promise<void> => {
      const { methodName, params } = request.body;
      if (!methodName || !params) {
        response.status(400).send("methodName and params are required.");
      }

      try {
        if (allowedMethods.includes(methodName)) {
          const result = await this.apiProxy(methodName, params);
          response.json(result);
        } else {
          response.status(401).send("Unauthorized proxy method");
        }
        return;
      } catch (error) {
        if (error instanceof Error) {
          response.status(500).send(error.message);
        } else {
          response.status(500).send("An unexpected error occurred");
        }
        return;
      }
    };
  };
}

export class TurnkeySDKServerClient extends TurnkeySDKClientBase {
  constructor(config: TurnkeySDKClientConfig) {
    super(config);
  }

  [methodName: string]: any;
}
